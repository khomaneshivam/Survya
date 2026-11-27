const { db } = require('../../../config/database');

/**
 * 8. Wait & Delay Timer Node Executor (WAIT_DELAY, DELAY)
 */
async function execute(node, context) {
  const { session = {}, dryRun = false, fastForward = false, tenantId = 1, flowId = '1' } = context;
  const config = node.config || node.data || {};
  const data = node.data || {};

  const durationValue = Number(config.durationValue || data.delayAmount || data.durationValue || config.delayAmount || 1);
  const durationUnit = String(config.durationUnit || data.delayUnit || data.durationUnit || config.delayUnit || 'HOURS').toUpperCase();
  const cancelOnReply = (config.cancelOnUserReply !== false && data.cancelOnReply !== false) ? 1 : 0;

  // Compute target run_at date
  const now = new Date();
  let runAt = new Date(now.getTime());

  if (config.delayType === 'UNTIL_TIME' && config.untilTime) {
    const [h, m] = config.untilTime.split(':').map(Number);
    runAt.setHours(h || 10, m || 0, 0, 0);
    if (runAt.getTime() <= now.getTime()) {
      runAt.setDate(runAt.getDate() + 1); // Move to tomorrow if target time today has already passed
    }
  } else {
    // Relative duration
    let ms = 0;
    if (durationUnit === 'MINUTES') ms = durationValue * 60 * 1000;
    else if (durationUnit === 'DAYS') ms = durationValue * 24 * 60 * 60 * 1000;
    else ms = durationValue * 60 * 60 * 1000; // Default HOURS
    runAt = new Date(now.getTime() + ms);
  }

  const durationLabel = `${durationValue} ${durationUnit.toLowerCase()}`;

  // In Simulator / Dry Run Mode:
  if (dryRun || context.isSimulation) {
    if (fastForward) {
      return {
        success: true,
        action: 'CONTINUE',
        nextHandle: 'after_delay',
        traceNote: `[Simulated] Fast-forwarded timer (${durationLabel}). Resumed immediately on handle [after_delay].`
      };
    }

    return {
      success: true,
      delayScheduled: true,
      action: 'WAIT_UNTIL',
      pendingDelay: {
        amount: durationValue,
        unit: durationUnit,
        resumeNodeId: node.id,
        durationLabel,
        runAtIso: runAt.toISOString()
      },
      traceNote: `[Simulated] Paused for delay of ${durationLabel}. Use 'Fast-Forward Delay ⏩' to advance or reply to test early response branch.`
    };
  }

  // In Live Mode: Insert scheduled job into workflow_scheduled_jobs
  const sessionId = session.id ? String(session.id) : (session.sessionKey || `ses_${Date.now()}`);
  const runAtSql = runAt.toISOString().slice(0, 19).replace('T', ' ');

  try {
    db.prepare(`
      INSERT INTO workflow_scheduled_jobs (
        tenant_id, session_id, flow_id, resume_node_id, resume_handle,
        job_type, cancel_on_reply, run_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'after_delay', 'DELAY_RESUME', ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(tenantId, sessionId, flowId, node.id, cancelOnReply, runAtSql);
  } catch (err) {
    console.warn('[Workflow Engine] Error scheduling delay job:', err.message);
  }

  return {
    action: 'WAIT_UNTIL',
    waitConfig: {
      runAt: runAtSql,
      resumeNodeId: node.id,
      cancelOnReply: Boolean(cancelOnReply)
    },
    traceNote: `Scheduled delay job for ${runAtSql} (${durationLabel}). Cancel on reply: ${Boolean(cancelOnReply)}.`
  };
}

module.exports = { execute };
