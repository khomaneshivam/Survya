const express = require("express");
const router = express.Router();
const runtimeController = require("../controllers/inappRuntimeController");
const { apiLimiter } = require("../middleware/rateLimiter");

// Rate limit public runtime endpoints
router.use(apiLimiter);

// Experience Discovery & Meta
router.get("/:slug", runtimeController.getExperience);

// Session Lifecycle
router.post("/:slug/session", runtimeController.handleSession);

// Live Dynamic Catalog Query & Price Range Filter
router.get("/:slug/catalog", runtimeController.getCatalog);

// Multi-Screen Navigation & Validated Actions
router.post("/:slug/navigate", runtimeController.handleNavigate);

module.exports = router;
