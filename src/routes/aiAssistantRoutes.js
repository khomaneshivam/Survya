const express = require('express');
const router = express.Router();
const aiAssistantController = require('../controllers/aiAssistantController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All AI Assistant routes require standard authentication
router.use(authenticateToken);

// 1. Agent Configuration
router.get('/config', aiAssistantController.getConfig);
router.put('/config', aiAssistantController.updateConfig);

// 2. Grounded Knowledge Sources
router.get('/knowledge', aiAssistantController.listKnowledge);
router.post('/knowledge', aiAssistantController.createKnowledge);
router.put('/knowledge/:id', aiAssistantController.updateKnowledge);
router.delete('/knowledge/:id', aiAssistantController.deleteKnowledge);

// 3. Interactive Sandbox Test Query
router.post('/test-query', aiAssistantController.testQuery);

// 4. Interaction Audit Logs
router.get('/logs', aiAssistantController.getLogs);

// 5. Inbox AI Copilot Actions
router.post('/copilot/draft-reply', aiAssistantController.copilotDraftReply);
router.post('/copilot/translate', aiAssistantController.copilotTranslate);
router.post('/copilot/summarize', aiAssistantController.copilotSummarize);

module.exports = router;
