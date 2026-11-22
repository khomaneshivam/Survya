/**
 * Conversation Flow & Automation Studio API Routes
 * Endpoints for visual flows, versions, publication, templates, simulation, and analytics.
 */

const express = require("express");
const router = express.Router();
const flowController = require("../controllers/conversationFlowController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// =========================================================================
// AI FLOW ARCHITECT (PROMPT-TO-WORKFLOW & ITERATIVE REFINER)
// =========================================================================

// Live system capabilities introspector (rooms, catalog, CRM pipelines, templates, lines, AI status)
router.get(["/flows/ai/capabilities", "/ai/capabilities"], authenticateToken, flowController.getAiCapabilities);

// 1-Click Prompt-to-Workflow Generator Grounded in Live System APIs
router.post(["/flows/ai-generate", "/flows/ai/generate", "/ai-generate", "/ai/generate"], authenticateToken, flowController.generateFlowWithAi);

// Prompt-based conversational refiner
router.post(["/flows/:id/ai-refine", "/flows/ai/refine", "/flows/conversation-flows/:id/refine", "/:id/ai-refine", "/ai/refine"], authenticateToken, flowController.refineFlowWithAi);

// Linear-time trigger conflict detection across lines & flows
router.get(["/flows/conflicts", "/flows/trigger-conflicts", "/conflicts", "/trigger-conflicts"], authenticateToken, flowController.getTriggerConflicts);

// Direct WhatsApp Business Phone Line Assignment
router.patch(["/flows/conversation-flows/:id/assign-line", "/:id/assign-line"], authenticateToken, flowController.assignFlowToLine);
router.post(["/flows/conversation-flows/:id/assign-line", "/:id/assign-line"], authenticateToken, flowController.assignFlowToLine);

// Set Default Active Flow
router.post(["/flows/conversation-flows/:id/set-default", "/:id/set-default"], authenticateToken, flowController.setDefaultFlow);
router.patch(["/flows/conversation-flows/:id/set-default", "/:id/set-default"], authenticateToken, flowController.setDefaultFlow);

// =========================================================================
// CONVERSATION FLOWS (STUDIO BUILDER & LIFECYCLE)
// =========================================================================

// List flows
router.get(["/flows", "/flows/conversation-flows", "/conversation-flows"], authenticateToken, flowController.listFlows);

// Create flow
router.post(["/flows", "/flows/conversation-flows", "/conversation-flows"], authenticateToken, flowController.createFlow);

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
router.get(["/flows/conversation-flows/:id", "/:id"], authenticateToken, flowController.getFlowById);
router.put(["/flows/conversation-flows/:id", "/:id"], authenticateToken, flowController.updateFlow);
router.post(["/flows/conversation-flows/:id/duplicate", "/:id/duplicate"], authenticateToken, flowController.duplicateFlow);
router.post(["/flows/conversation-flows/:id/draft", "/:id/draft"], authenticateToken, flowController.saveFlowDraft);
router.post(["/flows/conversation-flows/:id/validate", "/:id/validate"], authenticateToken, flowController.validateFlow);
router.post(["/flows/conversation-flows/:id/publish", "/:id/publish"], authenticateToken, flowController.publishFlow);
router.post(["/flows/conversation-flows/:id/pause", "/:id/pause"], authenticateToken, flowController.pauseFlow);
router.post(["/flows/conversation-flows/:id/archive", "/:id/archive"], authenticateToken, flowController.archiveFlow);
router.delete(["/flows/conversation-flows/:id", "/:id"], authenticateToken, flowController.deleteFlow);
router.post(["/flows/conversation-flows/:id/delete", "/:id/delete"], authenticateToken, flowController.deleteFlow);
router.post(["/flows/conversation-flows/:id/rollback", "/:id/rollback"], authenticateToken, flowController.rollbackFlow);
router.get(["/flows/conversation-flows/:id/versions", "/:id/versions"], authenticateToken, flowController.listVersions);
router.get(["/flows/conversation-flows/:id/analytics", "/:id/analytics"], authenticateToken, flowController.getFlowAnalytics);
router.get(["/flows/conversation-flows/:id/ai-optimize", "/:id/ai-optimize"], authenticateToken, flowController.getAiOptimizationRecommendations);
router.post(["/flows/conversation-flows/:id/ai-optimize", "/:id/ai-optimize"], authenticateToken, flowController.getAiOptimizationRecommendations);
router.post(["/flows/conversation-flows/:id/ai-optimize/apply", "/:id/ai-optimize/apply"], authenticateToken, flowController.applyAiOptimization);
router.get(["/flows/conversation-flows/:id/executions", "/:id/executions"], authenticateToken, flowController.listFlowExecutions);

// Global Executions & Audit Trace
router.get("/flows/executions", authenticateToken, flowController.listFlowExecutions);
router.get("/flows/executions/:sessionId", authenticateToken, flowController.getExecutionDetails);

module.exports = router;
