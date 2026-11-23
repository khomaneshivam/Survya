/**
 * Conversation Flow & Automation Studio API Routes
 * Endpoints for visual flows, versions, publication, templates, simulation, and analytics.
 */

const express = require("express");
const router = express.Router();
const flowController = require("../controllers/conversationFlowController");
const flowApprovalController = require("../controllers/flowApprovalController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// =========================================================================
// AI FLOW ARCHITECT (PROMPT-TO-WORKFLOW & ITERATIVE REFINER)
// =========================================================================

// Live system capabilities introspector (rooms, catalog, CRM pipelines, templates, lines, AI status)
router.get(["/flows/ai/capabilities", "/ai/capabilities"], authenticateToken, requireAdmin, flowController.getAiCapabilities);

// 1-Click Prompt-to-Workflow Generator Grounded in Live System APIs
router.post(["/flows/ai-generate", "/flows/ai/generate", "/ai-generate", "/ai/generate"], authenticateToken, requireAdmin, flowController.generateFlowWithAi);

// Prompt-based conversational refiner
router.post(["/flows/:id(\\d+)/ai-refine", "/flows/ai/refine", "/flows/conversation-flows/:id(\\d+)/refine", "/:id(\\d+)/ai-refine", "/ai/refine"], authenticateToken, requireAdmin, flowController.refineFlowWithAi);

// Linear-time trigger conflict detection across lines & flows
router.get(["/flows/conflicts", "/flows/trigger-conflicts", "/conflicts", "/trigger-conflicts"], authenticateToken, requireAdmin, flowController.getTriggerConflicts);

// Direct WhatsApp Business Phone Line Assignment
router.patch(["/flows/conversation-flows/:id(\\d+)/assign-line", "/:id(\\d+)/assign-line"], authenticateToken, requireAdmin, flowController.assignFlowToLine);
router.post(["/flows/conversation-flows/:id(\\d+)/assign-line", "/:id(\\d+)/assign-line"], authenticateToken, requireAdmin, flowController.assignFlowToLine);

// Set Default Active Flow
router.post(["/flows/conversation-flows/:id(\\d+)/set-default", "/:id(\\d+)/set-default"], authenticateToken, requireAdmin, flowController.setDefaultFlow);
router.patch(["/flows/conversation-flows/:id(\\d+)/set-default", "/:id(\\d+)/set-default"], authenticateToken, requireAdmin, flowController.setDefaultFlow);

// =========================================================================
// CONVERSATION FLOWS (STUDIO BUILDER & LIFECYCLE)
// =========================================================================

// List flows (Tenant-scoped)
router.get(["/flows/conversation-flows", "/conversation-flows"], authenticateToken, flowController.listFlows);

// Create flow (Tenant-scoped)
router.post(["/flows/conversation-flows", "/conversation-flows"], authenticateToken, flowController.createFlow);

// In-Memory Test Simulator (zero dispatch, zero live charges)
router.post(["/flows/conversation-flows/simulate", "/simulate"], authenticateToken, flowController.simulateTurn);

// Reusable Message Templates
router.get(["/flows/message-templates", "/message-templates"], authenticateToken, flowController.listMessageTemplates);
router.post(["/flows/message-templates", "/message-templates"], authenticateToken, flowController.saveMessageTemplate);
router.delete(["/flows/message-templates/:id", "/message-templates/:id"], authenticateToken, flowController.deleteMessageTemplate);

// Starter Journey Templates
router.get(["/flows/conversation-templates", "/conversation-templates"], authenticateToken, flowController.listTemplates);
router.post(["/flows/conversation-templates", "/conversation-templates"], authenticateToken, flowController.createTemplate);
router.post(["/flows/conversation-templates/:slug/clone", "/conversation-templates/:slug/clone"], authenticateToken, flowController.cloneTemplate);

// Single Flow Operations
// Approval checkpoints are administrative, auditable gates for AI-generated flows.
router.get(["/flows/conversation-flows/:id(\\d+)/approvals", "/:id(\\d+)/approvals"], authenticateToken, flowApprovalController.getFlowApprovals);
router.post(["/flows/conversation-flows/:id(\\d+)/approvals/request", "/:id(\\d+)/approvals/request"], authenticateToken, flowApprovalController.requestFlowApproval);
router.post(["/flows/conversation-flows/:id(\\d+)/approvals/decision", "/:id(\\d+)/approvals/decision"], authenticateToken, flowApprovalController.decideFlowApproval);
router.get(["/flows/conversation-flows/:id(\\d+)", "/:id(\\d+)"], authenticateToken, flowController.getFlowById);
router.put(["/flows/conversation-flows/:id(\\d+)", "/:id(\\d+)"], authenticateToken, flowController.updateFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/duplicate", "/:id(\\d+)/duplicate"], authenticateToken, flowController.duplicateFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/draft", "/:id(\\d+)/draft"], authenticateToken, flowController.saveFlowDraft);
router.post(["/flows/conversation-flows/:id(\\d+)/validate", "/:id(\\d+)/validate"], authenticateToken, flowController.validateFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/publish", "/:id(\\d+)/publish"], authenticateToken, flowController.publishFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/pause", "/:id(\\d+)/pause"], authenticateToken, flowController.pauseFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/archive", "/:id(\\d+)/archive"], authenticateToken, flowController.archiveFlow);
router.delete(["/flows/conversation-flows/:id(\\d+)", "/:id(\\d+)"], authenticateToken, flowController.deleteFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/delete", "/:id(\\d+)/delete"], authenticateToken, flowController.deleteFlow);
router.post(["/flows/conversation-flows/:id(\\d+)/rollback", "/:id(\\d+)/rollback"], authenticateToken, flowController.rollbackFlow);
router.get(["/flows/conversation-flows/:id(\\d+)/versions", "/:id(\\d+)/versions"], authenticateToken, flowController.listVersions);
router.get(["/flows/conversation-flows/:id(\\d+)/analytics", "/:id(\\d+)/analytics"], authenticateToken, flowController.getFlowAnalytics);
router.get(["/flows/conversation-flows/:id(\\d+)/ai-optimize", "/:id(\\d+)/ai-optimize"], authenticateToken, requireAdmin, flowController.getAiOptimizationRecommendations);
router.post(["/flows/conversation-flows/:id(\\d+)/ai-optimize", "/:id(\\d+)/ai-optimize"], authenticateToken, requireAdmin, flowController.getAiOptimizationRecommendations);
router.post(["/flows/conversation-flows/:id(\\d+)/ai-optimize/apply", "/:id(\\d+)/ai-optimize/apply"], authenticateToken, requireAdmin, flowController.applyAiOptimization);
router.get(["/flows/conversation-flows/:id(\\d+)/executions", "/:id(\\d+)/executions"], authenticateToken, flowController.listFlowExecutions);

// Global Executions & Audit Trace
router.get("/flows/executions", authenticateToken, flowController.listFlowExecutions);
router.get("/flows/executions/:sessionId", authenticateToken, flowController.getExecutionDetails);

module.exports = router;
