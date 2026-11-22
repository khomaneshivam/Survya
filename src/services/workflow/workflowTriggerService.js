const crypto = require("crypto");
const database = require("../../config/database");
const { invalidateTriggers } = require("./runtimeCache");

const db = new Proxy({}, {
  get(target, prop) {
    const liveDb = database.db || require("../../config/database").db;
    const val = liveDb[prop];
    return typeof val === "function" ? val.bind(liveDb) : val;
  }
});

/**
 * Workflow Trigger Service
 * Manages trigger indexing on flow publish, inbound trigger matching, and external webhook execution.
 */
class WorkflowTriggerService {
  /**
   * Syncs and indexes triggers for a published flow.
   * Scans nodes for TRIGGER_WHATSAPP, TRIGGER_EVENT, and START nodes.
   */
  syncFlowTriggers(tenantId = 1, flowId, nodes = [], phoneNumberId = undefined) {
    if (!flowId || !Array.isArray(nodes)) return;
    invalidateTriggers(tenantId);

    let targetPhoneId = phoneNumberId;
    if (targetPhoneId === undefined) {
      try {
        const flowRow = db.prepare("SELECT phone_number_id FROM conversation_flows WHERE id = ?").get(flowId);
        targetPhoneId = flowRow?.phone_number_id || null;
      } catch (e) {
        targetPhoneId = null;
      }
    }
    targetPhoneId = (!targetPhoneId || targetPhoneId === "ALL" || targetPhoneId === "null") ? null : String(targetPhoneId).trim();

    // Remove existing triggers for this flow
    db.prepare(`
      DELETE FROM workflow_triggers
      WHERE tenant_id = ? AND flow_id = ?
    `).run(Number(tenantId) || 1, String(flowId));

    const insertStmt = db.prepare(`
      INSERT INTO workflow_triggers (
        tenant_id, phone_number_id, flow_id, trigger_key, trigger_type, match_config_json,
        secret_token, priority, active_status, delete_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())
    `);

    for (const node of nodes) {
      const type = node.type;
      const data = { ...(node.config || {}), ...(node.data || {}) };

      if (type === "TRIGGER_WHATSAPP" || type === "START") {
        const rawTriggerType = String(data.triggerType || "KEYWORD").toUpperCase();
        let triggerType = "KEYWORD";
        let isCatchAll = false;
        let isCtwa = false;

        if (["INBOUND_ANY", "FIRST_MESSAGE", "CATCH_ALL"].includes(rawTriggerType)) {
          triggerType = "CATCH_ALL";
          isCatchAll = true;
        } else if (rawTriggerType === "CTWA_AD" || rawTriggerType === "AD_REFERRAL") {
          triggerType = "CTWA_AD";
          isCtwa = true;
        } else {
          triggerType = "KEYWORD";
        }

        const rawKeywords = data.keywords || data.triggerKeywords || (data.keyword ? [data.keyword] : []);
        const keywords = Array.isArray(rawKeywords)
          ? rawKeywords.map(k => String(k).trim()).filter(Boolean)
          : String(rawKeywords || "").split(",").map(k => k.trim()).filter(Boolean);

        const matchType = data.matchType || "CONTAINS"; // EXACT, CONTAINS, REGEX
        const triggerKey = data.triggerKey || `trg_${flowId}_${node.id}`.replace(/[^a-zA-Z0-9_]/g, "_");

        const priorityVal = data.priority || (isCatchAll ? 999 : 100);

        const configJson = JSON.stringify({
          nodeId: node.id,
          nodeType: type,
          keywords,
          matchType,
          ignoreCase: data.ignoreCase !== false,
          isCatchAll,
          isCtwa,
          priority: priorityVal
        });

        insertStmt.run(
          Number(tenantId) || 1,
          targetPhoneId,
          String(flowId),
          triggerKey,
          triggerType,
          configJson,
          null,
          priorityVal
        );
      } else if (type === "TRIGGER_EVENT") {
        const eventType = data.eventType || "WEBHOOK";
        const triggerKey = data.triggerKey || `hook_${flowId}_${node.id}`.replace(/[^a-zA-Z0-9_]/g, "_");
        const secret = data.secretToken || data.webhookSecret || crypto.randomBytes(16).toString("hex");

        const configJson = JSON.stringify({
          nodeId: node.id,
          nodeType: type,
          eventType,
          eventName: data.eventName || "incoming_event",
          payloadMapping: data.payloadMapping || {},
          fieldMappings: data.fieldMappings || {}
        });

        insertStmt.run(
          Number(tenantId) || 1,
          targetPhoneId,
          String(flowId),
          triggerKey,
          eventType,
          configJson,
          secret,
          data.priority || 50
        );
      }
    }
  }

  /**
   * Deactivates all triggers for an unpublished/paused/archived flow.
   */
  deactivateFlowTriggers(tenantId = 1, flowId) {
    if (!flowId) return;
    invalidateTriggers(tenantId);
    db.prepare(`
      UPDATE workflow_triggers
      SET active_status = 0, updated_at = NOW()
      WHERE tenant_id = ? AND flow_id = ?
    `).run(Number(tenantId) || 1, String(flowId));
  }

  /**
   * Linear-time trigger conflict detection O(sum K_i).
   * Identifies overlapping keywords across multiple published flows on identical or global phone lines.
   */
  detectTriggerConflicts(tenantId = 1) {
    const numericTenantId = Number(tenantId) || 1;
    const triggers = db.prepare(`
      SELECT t.id, t.flow_id, t.phone_number_id, t.trigger_key, t.trigger_type,
             t.match_config_json, t.priority, f.name as flow_name, f.status as flow_status, f.is_default
      FROM workflow_triggers t
      JOIN conversation_flows f ON f.id = t.flow_id
      WHERE t.tenant_id = ? AND t.active_status = 1 AND t.delete_status = 0
        AND f.status = 'PUBLISHED'
      ORDER BY f.is_default DESC, t.priority DESC, t.id ASC
    `).all(numericTenantId);

    const keywordIndex = new Map();

    for (const trg of triggers) {
      let config = {};
      try {
        config = JSON.parse(trg.match_config_json || "{}");
      } catch (e) {
        continue;
      }

      const keywords = Array.isArray(config.keywords) ? config.keywords : [];
      const lineKey = trg.phone_number_id ? String(trg.phone_number_id) : "GLOBAL";

      for (const kw of keywords) {
        const cleanKw = String(kw || "").trim().toLowerCase();
        if (!cleanKw) continue;

        if (!keywordIndex.has(cleanKw)) {
          keywordIndex.set(cleanKw, []);
        }

        keywordIndex.get(cleanKw).push({
          triggerId: trg.id,
          flowId: trg.flow_id,
          flowName: trg.flow_name,
          nodeId: config.nodeId,
          phoneNumberId: trg.phone_number_id,
          lineKey,
          priority: trg.priority
        });
      }
    }

    const conflicts = [];
    for (const [kw, entries] of keywordIndex.entries()) {
      const flowIds = new Set(entries.map(e => e.flowId));
      if (flowIds.size > 1) {
        const hasGlobal = entries.some(e => e.lineKey === "GLOBAL");
        const lines = new Set(entries.map(e => e.lineKey));

        if (hasGlobal || lines.size < entries.length) {
          conflicts.push({
            keyword: kw,
            competingFlowCount: flowIds.size,
            flows: entries.map(e => ({
              flowId: e.flowId,
              flowName: e.flowName,
              nodeId: e.nodeId,
              phoneNumberId: e.phoneNumberId,
              priority: e.priority
            }))
          });
        }
      }
    }

    return {
      conflicts,
      totalConflicts: conflicts.length,
      evaluatedTriggersCount: triggers.length,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Matches inbound message text against registered active triggers.
   * Prioritizes triggers specifically assigned to the receiving phone_number_id,
   * falling back to global unassigned triggers (phone_number_id IS NULL).
   * Returns { flowId, nodeId, triggerKey, triggerType } or null.
   */
  matchInboundTrigger(tenantId = 1, { text = "", phone = "", phoneNumberId = null, event = null, referral = null } = {}) {
    const targetPhoneId = (!phoneNumberId || phoneNumberId === "ALL" || phoneNumberId === "null") ? null : String(phoneNumberId).trim();

    const rawTriggers = db.prepare(`
      SELECT t.*, f.status as flow_status
      FROM workflow_triggers t
      JOIN conversation_flows f ON t.flow_id = f.id
      JOIN conversation_flow_versions v ON v.id = f.published_version_id
      WHERE t.tenant_id = ? 
        AND t.active_status = 1 
        AND t.delete_status = 0
        AND f.status = 'PUBLISHED'
        AND (? IS NULL OR t.phone_number_id = ? OR t.phone_number_id IS NULL)
      ORDER BY 
        CASE 
          WHEN ? IS NOT NULL AND t.phone_number_id = ? THEN 0
          WHEN t.phone_number_id IS NULL THEN 1
          ELSE 2
        END ASC,
        f.is_default DESC,
        t.priority DESC, t.id ASC
    `).all(Number(tenantId) || 1, targetPhoneId, targetPhoneId, targetPhoneId, targetPhoneId);

    if (!rawTriggers || rawTriggers.length === 0) return null;

    const normalizedText = String(text || "").trim();
    let catchAllTrigger = null;

    for (const trg of rawTriggers) {
      let config = {};
      try {
        config = JSON.parse(trg.match_config_json || "{}");
      } catch (e) {
        continue;
      }

      // 1. CTWA (Click-to-WhatsApp Ad) Referral Trigger
      if (trg.trigger_type === "CTWA_AD" && referral) {
        return {
          flowId: trg.flow_id,
          nodeId: config.nodeId,
          triggerKey: trg.trigger_key,
          triggerType: trg.trigger_type,
          referral
        };
      }

      // 2. Catch-All Trigger (save for fallback if no keyword matches)
      if (trg.trigger_type === "CATCH_ALL" || config.isCatchAll) {
        if (!catchAllTrigger) {
          catchAllTrigger = {
            flowId: trg.flow_id,
            nodeId: config.nodeId,
            triggerKey: trg.trigger_key,
            triggerType: trg.trigger_type
          };
        }
        // If it also defines keywords, let it check keywords below for direct match
        if (!config.keywords || config.keywords.length === 0) {
          continue;
        }
      }

      // 3. Keyword Match
      if (trg.trigger_type === "KEYWORD" || trg.trigger_type === "INBOUND_MESSAGE" || (config.keywords && config.keywords.length > 0)) {
        const keywords = config.keywords || [];
        if (!keywords || keywords.length === 0) {
          // A keyword trigger with no keywords defined does not match any inbound message
          continue;
        }

        const matchType = config.matchType || "CONTAINS";
        const ignoreCase = config.ignoreCase !== false;
        const testStr = ignoreCase ? normalizedText.toLowerCase() : normalizedText;

        for (const kw of keywords) {
          const targetKw = ignoreCase ? String(kw).toLowerCase().trim() : String(kw).trim();
          if (!targetKw) continue;

          let isMatch = false;
          if (matchType === "EXACT") {
            isMatch = (testStr === targetKw);
          } else if (matchType === "REGEX") {
            try {
              const regex = new RegExp(targetKw, ignoreCase ? "i" : "");
              isMatch = regex.test(normalizedText);
            } catch (e) {
              isMatch = false;
            }
          } else {
            // Default: CONTAINS
            isMatch = testStr.includes(targetKw);
          }

          if (isMatch) {
            return {
              flowId: trg.flow_id,
              nodeId: config.nodeId,
              triggerKey: trg.trigger_key,
              triggerType: trg.trigger_type,
              matchedKeyword: kw
            };
          }
        }
      } else if (trg.trigger_type === "EVENT" && event) {
        if (config.eventName && config.eventName === event) {
          return {
            flowId: trg.flow_id,
            nodeId: config.nodeId,
            triggerKey: trg.trigger_key,
            triggerType: trg.trigger_type
          };
        }
      }
    }

    // Return catch-all trigger if text is present but didn't match specific keyword
    if (catchAllTrigger && normalizedText.length > 0) {
      return catchAllTrigger;
    }

    return null;
  }

  /**
   * Executes an external webhook trigger by triggerKey.
   * POST /api/v1/workflows/hooks/:triggerKey
   */
  async executeWebhookTrigger(triggerKey, payload = {}, headers = {}) {
    if (!triggerKey) {
      return { success: false, statusCode: 400, message: "Missing triggerKey parameter" };
    }

    const trg = db.prepare(`
      SELECT t.*, f.status as flow_status
      FROM workflow_triggers t
      LEFT JOIN conversation_flows f ON t.flow_id = f.id
      WHERE t.trigger_key = ? 
        AND t.active_status = 1 
        AND t.delete_status = 0
      LIMIT 1
    `).get(String(triggerKey));

    if (!trg || (trg.flow_status && trg.flow_status !== 'PUBLISHED')) {
      return {
        success: false,
        statusCode: 404,
        message: "Trigger key not found, inactive, or flow is not published"
      };
    }

    // Verify secret token if configured
    if (trg.secret_token) {
      const providedSecret = headers["x-webhook-secret"] ||
                             headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
                             payload.secret ||
                             payload.secret_token;
      if (!providedSecret || providedSecret !== trg.secret_token) {
        return {
          success: false,
          statusCode: 401,
          message: "Unauthorized: Invalid or missing webhook secret"
        };
      }
    }

    let config = {};
    try {
      config = JSON.parse(trg.match_config_json || "{}");
    } catch (e) {
      config = {};
    }

    // Extract recipient phone number
    const rawPhone = payload.phone ||
                     payload.to ||
                     payload.recipient ||
                     payload.customer_phone ||
                     payload.contact?.phone ||
                     payload.data?.phone;

    if (!rawPhone) {
      return {
        success: false,
        statusCode: 400,
        message: "Missing recipient phone in payload (expected 'phone', 'to', or 'customer_phone')"
      };
    }

    const cleanPhone = String(rawPhone).replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 8) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid recipient phone number format"
      };
    }

    const conversationFlowEngine = require("../conversationFlowEngine");

    // Process turn starting at target trigger node
    const result = await conversationFlowEngine.processTurn({
      senderPhone: cleanPhone,
      userInput: payload.text || payload.message || "[Trigger Event: Inbound Webhook]",
      userPayload: payload,
      startFlowId: trg.flow_id,
      startNodeId: config.nodeId,
      context: {
        tenantId: trg.tenant_id,
        channel: "WEBHOOK",
        triggerKey: trg.trigger_key,
        externalPayload: payload,
        isSimulation: Boolean(payload.isSimulation)
      }
    });

    return {
      success: true,
      statusCode: 200,
      flowId: trg.flow_id,
      nodeId: config.nodeId,
      recipientPhone: cleanPhone,
      sessionId: result?.sessionId || null,
      replyText: result?.replyText || null,
      replyInteractive: result?.replyInteractive || null
    };
  }
}

module.exports = new WorkflowTriggerService();
