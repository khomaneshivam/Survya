const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");

router.get("/domains", authController.listPublicDomains);
router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/forgot-password", authLimiter, authController.forgotPassword);
router.post("/verify-reset-token", authLimiter, authController.verifyResetToken);
router.post("/reset-password", authLimiter, authController.resetPassword);
router.post("/change-password", authenticateToken, authLimiter, authController.changePassword);
router.get("/me", authenticateToken, authController.getMe);
router.post("/profile", authenticateToken, authController.updateProfile);

module.exports = router;

