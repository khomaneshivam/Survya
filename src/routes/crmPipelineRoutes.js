const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmPipelineController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Pipelines
router.get('/pipelines', crmController.listPipelines);
router.post('/pipelines', crmController.createPipeline);
router.get('/pipelines/:id', crmController.getPipeline);
router.put('/pipelines/:id', crmController.updatePipeline);

// Records
router.get('/records', crmController.listRecords);
router.post('/records', crmController.createRecord);
router.get('/records/:id', crmController.getRecord);
router.patch('/records/:id', crmController.updateRecord);
router.post('/records/:id/stage', crmController.updateStage);
router.delete('/records/:id', crmController.deleteRecord);

module.exports = router;
