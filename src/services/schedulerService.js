const { db } = require("../config/database");
const broadcastEngine = require("./broadcastEngine");
const bookingAutomationService = require("./bookingAutomationService");
const timeUtil = require("../utils/timeUtil");

class SchedulerService {
  constructor() {
    this.intervalTimer = null;
    this.bookingIntervalTimer = null;
    this.workflowJobsTimer = null;
    this.checkIntervalMs = 5000; // Check every 5 seconds
    this.isChecking = false;
    this.isCheckingWorkflowJobs = false;
  }

  /**
   * Initializes background scheduler timer
   */
  initScheduler() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    if (this.bookingIntervalTimer) {
      clearInterval(this.bookingIntervalTimer);
    }
    if (this.workflowJobsTimer) {
      clearInterval(this.workflowJobsTimer);
    }

    console.log("[Scheduler] Background campaign scheduler started (polling every 5s)");

    // Run immediate check for any overdue scheduled campaigns on startup
    this.checkScheduledCampaigns().catch(err => {
      console.error("[Scheduler] Initial check error:", err);
    });

    this.intervalTimer = setInterval(() => {
      this.checkScheduledCampaigns().catch(err => {
        console.error("[Scheduler] Polling check error:", err);
      });
    }, this.checkIntervalMs);

    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }

    // 15-second loop for workflow delay scheduled jobs (WAIT_DELAY resumes)
    this.checkWorkflowScheduledJobs().catch(err => {
      console.error("[Scheduler] Initial workflow jobs check error:", err);
    });
    this.workflowJobsTimer = setInterval(() => {
      this.checkWorkflowScheduledJobs().catch(err => {
        console.error("[Scheduler] Workflow jobs polling check error:", err);
      });
    }, 15000);
    if (this.workflowJobsTimer.unref) {
      this.workflowJobsTimer.unref();
    }

    // Initialize and sync Evergreen Booking Lifecycle Campaign
    try {
      bookingAutomationService.syncEvergreenCampaign();
    } catch (e) {
      console.warn("[Scheduler] Initial evergreen campaign sync notice:", e.message);
    }

    // Note: Automatic 30s background booking runner removed per user send structure policy.
    // Booking lifecycle triggers are strictly manual or scheduled via explicit campaign broadcasts.
  }

  /**
   * Scans database for scheduled campaigns whose scheduled_at time has arrived
   */
  async checkScheduledCampaigns() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      // 0. Silent Inactive Session Expiration Sweep (Strict Mode: Zero Outbound Messages)
      this.silentExpireInactiveSessions();

      const now = new Date();
      // Fetch all campaigns currently in SCHEDULED state
      const scheduledCampaigns = db.prepare(`
        SELECT id, name, scheduled_at, status, valid_contacts 
        FROM campaigns 
        WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL
      `).all();

      for (const campaign of scheduledCampaigns) {
        const schedDate = timeUtil.parseDateSmart(campaign.scheduled_at);
        if (!schedDate || isNaN(schedDate.getTime())) {
          console.warn(`[Scheduler] Invalid scheduled_at for campaign ${campaign.id}:`, campaign.scheduled_at);
          continue;
        }

        // If scheduled time has arrived or passed (within current time)
        if (schedDate.getTime() <= Date.now()) {
          console.log(`[Scheduler] 🚀 Triggering scheduled broadcast: '${campaign.name}' (${campaign.id}) scheduled for ${timeUtil.formatIndianDateTime(schedDate)} IST`);
          
          try {
            await broadcastEngine.startCampaign(campaign.id);
            broadcastEngine.emit("campaign:status", {
              campaignId: campaign.id,
              status: "RUNNING",
              message: `Scheduled broadcast '${campaign.name}' has automatically launched at ${timeUtil.formatIndianDateTime(new Date())} (IST).`
            });
          } catch (launchErr) {
            console.error(`[Scheduler] Failed to auto-launch campaign ${campaign.id}:`, launchErr.message);
            db.prepare("UPDATE campaigns SET status = 'FAILED' WHERE id = ?").run(campaign.id);
            broadcastEngine.emit("campaign:status", {
              campaignId: campaign.id,
              status: "FAILED",
              message: `Scheduled launch failed: ${launchErr.message}`
            });
          }
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error in checkScheduledCampaigns:", err);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Silent session expiration sweep (Strict Inbound Mode)
   * Sweeps expired inactive conversation flow sessions in DB without dispatching any messages.
   * Zero API spend, zero unsolicited auto-messages.
   */
  silentExpireInactiveSessions() {
    try {
      db.prepare(`
        UPDATE conversation_flow_sessions
        SET session_status = 'EXPIRED', updated_at = UTC_TIMESTAMP()
        WHERE session_status = 'ACTIVE'
          AND expires_at IS NOT NULL
          AND expires_at <= UTC_TIMESTAMP()
      `).run();
    } catch (e) {
      // Non-fatal silent sweep
    }
  }

  /**
   * Reschedules an existing scheduled campaign
   */
  rescheduleCampaign(campaignId, newScheduledAt) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (campaign.status === "RUNNING") {
      throw new Error("Cannot reschedule a campaign that is currently running.");
    }

    const newDate = timeUtil.parseDateSmart(newScheduledAt);
    if (!newDate || isNaN(newDate.getTime())) {
      throw new Error("Invalid date/time provided for scheduling.");
    }

    if (newDate.getTime() <= Date.now()) {
      throw new Error("Scheduled time must be in the future (Indian Standard Time).");
    }

    const isoTime = newDate.toISOString();
    db.prepare(`
      UPDATE campaigns 
      SET status = 'SCHEDULED', scheduled_at = ? 
      WHERE id = ?
    `).run(isoTime, campaignId);

    const formattedIst = timeUtil.formatIndianDateTime(newDate);

    broadcastEngine.emit("campaign:status", {
      campaignId,
      status: "SCHEDULED",
      scheduledAt: isoTime,
      message: `Campaign '${campaign.name}' rescheduled for ${formattedIst} (IST).`
    });

    return {
      success: true,
      message: `Campaign rescheduled for ${formattedIst} (IST).`,
      scheduledAt: isoTime
    };
  }

  /**
   * Cancels a scheduled campaign before it runs
   */
  cancelSchedule(campaignId) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (campaign.status !== "SCHEDULED") {
      throw new Error(`Campaign is in status '${campaign.status}', cannot cancel schedule.`);
    }

    db.prepare("UPDATE campaigns SET status = 'CANCELLED' WHERE id = ?").run(campaignId);

    broadcastEngine.emit("campaign:status", {
      campaignId,
      status: "CANCELLED",
      message: `Scheduled broadcast for '${campaign.name}' was cancelled.`
    });

    return {
      success: true,
      message: `Scheduled campaign '${campaign.name}' cancelled successfully.`
    };
  }

  /**
   * Runs a scheduled campaign immediately without waiting
   */
  async runScheduledNow(campaignId) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (campaign.status === "RUNNING") {
      throw new Error("Campaign is already running.");
    }

    return broadcastEngine.startCampaign(campaignId);
  }

  /**
   * Stop background schedulers cleanly
   */
  stopScheduler() {
    this.stopSchedulers();
  }

  stopSchedulers() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.bookingIntervalTimer) {
      clearInterval(this.bookingIntervalTimer);
      this.bookingIntervalTimer = null;
    }
    if (this.workflowJobsTimer) {
      clearInterval(this.workflowJobsTimer);
      this.workflowJobsTimer = null;
    }
    console.log("[Scheduler] Background campaign and workflow timers stopped.");
  }

  /**
   * Scans and processes pending workflow delay jobs (WAIT_DELAY execution resumes)
   */
  async checkWorkflowScheduledJobs() {
    if (this.isCheckingWorkflowJobs) return;
    this.isCheckingWorkflowJobs = true;

    try {
      const pendingJobs = db.prepare(`
        SELECT j.*, s.sender_phone, s.tenant_id, s.property_id, s.session_status, s.last_interaction_at
        FROM workflow_scheduled_jobs j
        JOIN conversation_flow_sessions s ON j.session_id = s.id
        WHERE j.status = 'PENDING' AND j.run_at <= UTC_TIMESTAMP()
        ORDER BY j.run_at ASC
        LIMIT 20
      `).all();

      if (!pendingJobs || pendingJobs.length === 0) return;

      for (const job of pendingJobs) {
        // Atomic claim
        const claimRes = db.prepare(`
          UPDATE workflow_scheduled_jobs
          SET status = 'PROCESSING', attempts = attempts + 1, updated_at = UTC_TIMESTAMP()
          WHERE id = ? AND status = 'PENDING'
        `).run(job.id);

        if (!claimRes || claimRes.changes === 0) {
          continue; // Claimed by another worker
        }

        const cleanPhone = String(job.sender_phone || "").replace(/\D/g, "");

        // 1. Session status check
        if (job.session_status !== "ACTIVE") {
          db.prepare(`
            UPDATE workflow_scheduled_jobs
            SET status = 'CANCELLED', last_error = 'Session no longer active', updated_at = UTC_TIMESTAMP()
            WHERE id = ?
          `).run(job.id);
          continue;
        }

        // 2. Opt-out suppression & revoked DPDP consent check
        const suppression = db.prepare(`
          SELECT id FROM contact_suppressions
          WHERE clean_phone = ?
          LIMIT 1
        `).get(cleanPhone);

        if (suppression) {
          db.prepare(`
            UPDATE workflow_scheduled_jobs
            SET status = 'CANCELLED', last_error = 'Recipient phone is in contact_suppressions (opt-out)', updated_at = UTC_TIMESTAMP()
            WHERE id = ?
          `).run(job.id);
          continue;
        }

        const revokedConsent = db.prepare(`
          SELECT cc.id
          FROM contact_consents cc
          JOIN contacts c ON cc.contact_id = c.id
          WHERE COALESCE(cc.tenant_id, 1) = COALESCE(?, 1)
            AND REPLACE(REPLACE(REPLACE(c.phone_e164, '+', ''), '-', ''), ' ', '') = ?
            AND UPPER(cc.status) IN ('REVOKED', 'OPTED_OUT', 'UNSUBSCRIBED', 'DENIED')
          LIMIT 1
        `).get(job.tenant_id || 1, cleanPhone);

        if (revokedConsent) {
          db.prepare(`
            UPDATE workflow_scheduled_jobs
            SET status = 'CANCELLED', last_error = 'Recipient revoked consent (DPDP / opt-out)', updated_at = UTC_TIMESTAMP()
            WHERE id = ?
          `).run(job.id);
          continue;
        }

        // 3. Meta 24-hour Customer Service Window Enforcement
        let targetNodeType = "SEND_MESSAGE";
        try {
          const flow = db.prepare(`
            SELECT v.nodes_json, v.transitions_json
            FROM conversation_flows f
            JOIN conversation_flow_versions v ON f.published_version_id = v.id
            WHERE f.id = ?
          `).get(job.flow_id);
          if (flow?.nodes_json) {
            const nodes = JSON.parse(flow.nodes_json || "[]");
            const transitions = JSON.parse(flow.transitions_json || "[]");
            const resumeHandle = job.resume_handle || "default";
            const outgoing = transitions.find(t =>
              t.source === job.resume_node_id && ((t.handle || "default") === resumeHandle || t.handle === "default")
            ) || transitions.find(t => t.source === job.resume_node_id);
            const targetNode = outgoing
              ? nodes.find(n => n.id === outgoing.target)
              : nodes.find(n => n.id === job.resume_node_id);
            if (targetNode) {
              targetNodeType = targetNode.type;
            }
          }
        } catch (e) {}

        const lastDate = timeUtil.parseMysqlUtcTimestamp(job.last_interaction_at);
        const lastInteractionMs = lastDate ? lastDate.getTime() : 0;
        const isWithin24h = (Date.now() - lastInteractionMs) <= 24 * 60 * 60 * 1000;

        // If target node is a free-form message and 24h window has passed, block free-form send
        const isFreeformMessage = (targetNodeType === "SEND_MESSAGE" || targetNodeType === "MESSAGE" || targetNodeType === "BUTTON_MENU");
        if (isFreeformMessage && !isWithin24h) {
          console.log(`[Scheduler] Delay Job #${job.id}: 24-hour Meta messaging window closed for ${cleanPhone}. Free-form message blocked.`);
          db.prepare(`
            UPDATE workflow_scheduled_jobs
            SET status = 'FAILED', last_error = 'WINDOW_CLOSED_24H: Meta 24-hour customer service window expired. Freeform message blocked.', updated_at = UTC_TIMESTAMP()
            WHERE id = ?
          `).run(job.id);
          continue;
        }

        // 4. Resume the scheduled node via conversationFlowEngine
        try {
          const flowEngine = require("./conversationFlowEngine");
          const resumeResult = await flowEngine.resumeScheduledNode({
            sessionId: job.session_id,
            resumeNodeId: job.resume_node_id,
            resumeHandle: job.resume_handle || "default"
          });

          db.prepare(`
            UPDATE workflow_scheduled_jobs
            SET status = 'COMPLETED', updated_at = UTC_TIMESTAMP()
            WHERE id = ?
          `).run(job.id);

          console.log(`[Scheduler] Successfully resumed delay job #${job.id} for session ${job.session_id} to node ${job.resume_node_id}. Handled: ${resumeResult?.handled}`);
        } catch (execErr) {
          console.error(`[Scheduler] Error resuming delay job #${job.id}:`, execErr.message);
          db.prepare(`
            UPDATE workflow_scheduled_jobs
            SET status = 'FAILED', last_error = ?, updated_at = UTC_TIMESTAMP()
            WHERE id = ?
          `).run(execErr.message, job.id);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error in checkWorkflowScheduledJobs:", err);
    } finally {
      this.isCheckingWorkflowJobs = false;
    }
  }
}

const schedulerService = new SchedulerService();
schedulerService.stopSchedulers = schedulerService.stopSchedulers.bind(schedulerService);
schedulerService.stopScheduler = schedulerService.stopScheduler.bind(schedulerService);

module.exports = schedulerService;
module.exports.stopSchedulers = schedulerService.stopSchedulers;
module.exports.stopScheduler = schedulerService.stopScheduler;
