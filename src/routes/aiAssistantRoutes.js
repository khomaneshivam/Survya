const express = require('express');
const router = express.Router();
const aiAssistantController = require('../controllers/aiAssistantController');
const { authenticateToken, requireWorkspaceAdmin } = require('../middleware/authMiddleware');

// All AI Assistant routes require standard authentication
router.use(authenticateToken);

// 1. Agent Configuration
router.get('/config', aiAssistantController.getConfig);
router.put('/config', requireWorkspaceAdmin, aiAssistantController.updateConfig);

// 2. Grounded Knowledge Sources
router.get('/knowledge', aiAssistantController.listKnowledge);
router.post('/knowledge', requireWorkspaceAdmin, aiAssistantController.createKnowledge);
router.put('/knowledge/:id', requireWorkspaceAdmin, aiAssistantController.updateKnowledge);
router.delete('/knowledge/:id', requireWorkspaceAdmin, aiAssistantController.deleteKnowledge);

// 3. Interactive Sandbox Test Query
router.post('/test-query', aiAssistantController.testQuery);

// 4. Interaction Audit Logs & Per-Tenant Token/Cost Metering
router.get('/logs', aiAssistantController.getLogs);
router.get('/usage', aiAssistantController.getUsage);

// 5. Inbox AI Copilot Actions
router.post('/copilot/draft-reply', aiAssistantController.copilotDraftReply);
router.post('/copilot/translate', aiAssistantController.copilotTranslate);
router.post('/copilot/summarize', aiAssistantController.copilotSummarize);

module.exports = router;
