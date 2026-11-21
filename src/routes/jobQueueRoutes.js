const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware");
const jobQueueService = require("../services/queue/jobQueueService");

// All admin queue routes require authenticated token and tenant context
router.use(authenticateToken);

// 1. Queue Statistics & Telemetry
router.get("/stats", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const stats = jobQueueService.getQueueStats(tenantId);
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. List Jobs with Filter and Pagination
router.get("/jobs", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const { queueName, jobType, status, page, limit } = req.query;
    const result = jobQueueService.listJobs({
      tenantId,
      queueName,
      jobType,
      status,
      page,
      limit
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Get Single Job Detail
router.get("/jobs/:id", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const job = jobQueueService.getJobById(req.params.id, tenantId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    return res.status(200).json({ success: true, data: job });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Retry Failed or Dead Letter Job
router.post("/jobs/:id/retry", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = jobQueueService.retryJob(req.params.id, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 5. Cancel Pending Job
router.post("/jobs/:id/cancel", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = jobQueueService.cancelJob(req.params.id, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6. Delete Job Permanently
router.delete("/jobs/:id", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = jobQueueService.deleteJob(req.params.id, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 7. List Recurring Schedules
router.get("/schedules", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const schedules = jobQueueService.listSchedules(tenantId);
    return res.status(200).json({ success: true, data: schedules });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Toggle Recurring Schedule
router.patch("/schedules/:id/toggle", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = jobQueueService.toggleSchedule(req.params.id, req.body.isEnabled, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 9. Manual Enqueue Job
router.post("/enqueue", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = jobQueueService.enqueueJob({
      ...req.body,
      tenantId
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 10. Purge Old Completed Jobs
router.post("/purge", (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const result = jobQueueService.purgeOldJobs(req.body.olderThanDays || 7, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
