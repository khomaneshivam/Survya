/**
 * Sub-Flow Invocation Node Executor (CALL_SUBFLOW)
 * Modular workflow delegator that transitions session control to an isolated sub-flow
 * while tracking return execution on a call stack (max recursion depth 5).
 */

const { db } = require("../../../config/database");

module.exports = {
  execute(node, context = {}) {
    const config = { ...(node.data || {}), ...(node.config || {}) };
    const targetFlowId = config.targetFlowId || config.subflowId || config.flowId;

    if (!targetFlowId) {
      return {
        action: "CONTINUE",
        nextHandle: "error",
        traceNote: `Subflow execution failed: No targetFlowId configured on node '${node.id}'.`
      };
    }

    // Call stack recursion guard
    const callStack = Array.isArray(context.callStack) ? context.callStack : [];
    if (callStack.length >= 5) {
      return {
        action: "CONTINUE",
        nextHandle: "error",
        traceNote: `Subflow execution failed: Maximum call stack recursion depth (5) exceeded on node '${node.id}'.`
      };
    }

    // Cycle detection: prevent a flow from calling a flow already in its ancestry
    const currentFlowId = Number(context.flowId || 0);
    const targetIdNum = Number(targetFlowId);

    if (currentFlowId === targetIdNum || callStack.some(frame => Number(frame.parentFlowId) === targetIdNum)) {
      return {
        action: "CONTINUE",
        nextHandle: "error",
        traceNote: `Subflow execution failed: Circular subflow invocation detected for flow ${targetFlowId}.`
      };
    }

    // Verify target flow exists and has a published version
    const tenantId = context.tenantId || 1;
    let targetFlow = null;
    try {
      targetFlow = db.prepare(`
        SELECT f.*, v.id as version_id, v.nodes_json, v.transitions_json
        FROM conversation_flows f
        JOIN conversation_flow_versions v ON v.id = f.published_version_id
        WHERE f.id = ? AND f.tenant_id = ? AND f.status = 'PUBLISHED'
        LIMIT 1
      `).get(targetIdNum, tenantId);
    } catch (_) {}

    if (!targetFlow) {
      return {
        action: "CONTINUE",
        nextHandle: "error",
        traceNote: `Subflow execution failed: Target flow ${targetFlowId} is not published or does not exist.`
      };
    }

    return {
      action: "SUBFLOW_CALL",
      targetFlowId: targetIdNum,
      targetVersionId: targetFlow.version_id,
      targetNodesJson: targetFlow.nodes_json,
      targetTransitionsJson: targetFlow.transitions_json,
      returnNodeId: node.id,
      returnHandle: config.returnHandle || "completed",
      traceNote: `Calling sub-flow '${targetFlow.name}' (ID: ${targetIdNum}, Version: ${targetFlow.version_id}) from node '${node.id}'.`
    };
  }
};
