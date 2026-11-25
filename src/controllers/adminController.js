const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { db, getSetting, setSetting } = require("../config/database");
const webhookService = require("../services/webhookService");
const metaWhatsAppService = require("../services/metaWhatsAppService");
const recycleBinService = require("../services/recycleBinService");
const complianceService = require("../services/complianceService");
const billingService = require("../services/billingService");
const { isPlatformAdmin } = require("../middleware/authMiddleware");

/**
 * List all registered users with summary statistics (Admin Only)
 */
async function listUsers(req, res) {
  try {
    const users = db.prepare(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.role, u.status, u.assigned_phone_id, 
        u.created_at, u.last_login_at,
        p.display_name as assigned_phone_name,
        p.phone_number as assigned_phone_number,
        (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) as campaign_count,
        (SELECT COALESCE(SUM(c.sent_count), 0) FROM campaigns c WHERE c.user_id = u.id) as total_messages_sent,
        (SELECT COUNT(*) FROM automated_booking_dispatches b WHERE b.user_id = u.id) as automation_dispatches_count
      FROM users u
      LEFT JOIN waba_phone_numbers p ON u.assigned_phone_id = p.id
      WHERE COALESCE(u.delete_status, 0) = 0
      ORDER BY 
        CASE WHEN u.role = 'ADMIN' THEN 1 ELSE 2 END,
        u.created_at DESC
    `).all();

    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error("Admin listUsers error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get detailed stats and recent activity for a specific user (Admin Only)
 */
async function getUserDetails(req, res) {
  try {
    const { userId } = req.params;
    const user = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, created_at, last_login_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const campaigns = db.prepare(`
      SELECT id, name, status, total_contacts, sent_count, failed_count, created_at
      FROM campaigns WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(userId);

    const dispatches = db.prepare(`
      SELECT id, guest_name, clean_phone, trigger_type, template_name, status, dispatched_at
      FROM automated_booking_dispatches WHERE user_id = ?
      ORDER BY dispatched_at DESC LIMIT 10
    `).all(userId);

    return res.status(200).json({
      success: true,
      data: {
        user,
        recentCampaigns: campaigns,
        recentDispatches: dispatches
      }
    });
  } catch (error) {
    console.error("Admin getUserDetails error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Toggle user status: ACTIVE or SUSPENDED (Admin Only)
 */
async function updateUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const { status } = req.body || {};

    if (!["ACTIVE", "SUSPENDED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'ACTIVE' or 'SUSPENDED'." });
    }

    // Prevent admin from suspending themselves
    if (req.user.id === userId && status === "SUSPENDED") {
      return res.status(400).json({ success: false, message: "You cannot suspend your own Master Admin account." });
    }

    db.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, userId);

    return res.status(200).json({
      success: true,
      message: `User status changed to ${status}.`
    });
  } catch (error) {
    console.error("Admin updateUserStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Change user role: ADMIN or USER (Admin Only)
 */
async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};

    if (!["ADMIN", "USER"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be 'ADMIN' or 'USER'." });
    }

    // Prevent demoting self if only admin
    if (req.user.id === userId && role === "USER") {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: "Cannot demote the only remaining Master Admin." });
      }
    }

    db.prepare("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(role, userId);

    return res.status(200).json({
      success: true,
      message: `User role updated to ${role}.`
    });
  } catch (error) {
    console.error("Admin updateUserRole error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Assign a registered WABA phone number to a user (Admin Only)
 */
async function assignPhoneNumber(req, res) {
  try {
    const { userId } = req.params;
    const { phoneId } = req.body || {};

    if (phoneId) {
      const phoneExists = db.prepare("SELECT id FROM waba_phone_numbers WHERE id = ?").get(phoneId);
      if (!phoneExists) {
        return res.status(404).json({ success: false, message: "Selected phone number not found." });
      }
    }

    db.prepare("UPDATE users SET assigned_phone_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(phoneId || null, userId);

    return res.status(200).json({
      success: true,
      message: phoneId ? "Phone number assigned to user successfully." : "Phone number assignment cleared."
    });
  } catch (error) {
    console.error("Admin assignPhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Generate an Impersonation Token to view and manage the system as another user (Admin Only)
 */
async function impersonateUser(req, res) {
  try {
    const { userId } = req.params;
    const targetUser = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id
      FROM users WHERE id = ?
    `).get(userId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Target user not found." });
    }

    // Generate impersonation token with original admin ID stored
    const impersonationToken = jwt.sign(
      {
        userId: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        isImpersonating: true,
        originalAdminId: req.user.id
      },
      config.JWT_SECRET,
      { expiresIn: "4h" }
    );

    return res.status(200).json({
      success: true,
      message: `Switched into ${targetUser.name}'s account view.`,
      token: impersonationToken,
      user: targetUser,
      originalAdmin: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error("Admin impersonateUser error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * =========================================================================
 * ADMIN-ONLY WABA PHONE NUMBERS MANAGEMENT
 * "admin only can register the new numbers in the platform"
 * =========================================================================
 */

/**
 * List all registered WhatsApp numbers (Admin & Authenticated Users)
 */
async function listPhoneNumbers(req, res) {
  try {
    // Ensure at least one default line exists if registered numbers exist
    const defaultCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers WHERE is_default = 1").get()?.count || 0;
    const totalCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers").get()?.count || 0;
    if (totalCount > 0 && defaultCount === 0) {
      const activeSettingId = getSetting("WHATSAPP_PHONE_NUMBER_ID") || config.WHATSAPP_PHONE_NUMBER_ID;
      if (activeSettingId) {
        db.prepare("UPDATE waba_phone_numbers SET is_default = 1 WHERE phone_number_id = ?").run(activeSettingId);
      }
      const recheck = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers WHERE is_default = 1").get()?.count || 0;
      if (recheck === 0) {
        const first = db.prepare("SELECT id FROM waba_phone_numbers ORDER BY created_at ASC LIMIT 1").get();
        if (first?.id) {
          db.prepare("UPDATE waba_phone_numbers SET is_default = 1 WHERE id = ?").run(first.id);
        }
      }
    }

    const numbers = db.prepare(`
      SELECT 
        p.*,
        u.name as registered_by_name,
        (SELECT COUNT(*) FROM users u2 WHERE u2.assigned_phone_id = p.id) as assigned_users_count,
        (SELECT COUNT(*) FROM campaigns c WHERE c.phone_number_id = p.id) as campaigns_count
      FROM waba_phone_numbers p
      LEFT JOIN users u ON p.registered_by = u.id
      ORDER BY p.is_default DESC, p.created_at DESC
    `).all().map(n => {
      const rawToken = n.access_token ? String(n.access_token).trim() : null;
      return {
        ...n,
        has_token: !!rawToken,
        access_token_preview: rawToken ? rawToken.substring(0, 8) + "••••••••" + rawToken.slice(-6) : null,
        token_type: n.token_type || "PERMANENT",
        // Do not leak raw token in listing
        access_token: undefined
      };
    });

    return res.status(200).json({
      success: true,
      data: numbers
    });
  } catch (error) {
    console.error("Admin listPhoneNumbers error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Register or update a WhatsApp Phone Number in the platform (Admin Only)
 * Supports UPSERT, auto-fetch from Meta, optional token update, and optional PIN registration.
 */
async function registerPhoneNumber(req, res) {
  try {
    const displayName = req.body?.displayName || req.body?.display_name;
    const phoneNumber = req.body?.phoneNumber || req.body?.phone_number;
    const phoneNumberId = req.body?.phoneNumberId || req.body?.phone_number_id;
    const wabaId = req.body?.wabaId || req.body?.waba_id;
    const isDefault = req.body?.isDefault ?? req.body?.is_default;
    const customToken = req.body?.token || req.body?.accessToken || req.body?.access_token;
    const pin = req.body?.pin || req.body?.pinCode || req.body?.pin_code;

    if (!phoneNumberId || !String(phoneNumberId).trim()) {
      return res.status(400).json({ success: false, message: "Meta WhatsApp Phone Number ID is required." });
    }

    const cleanPhoneId = String(phoneNumberId).trim();
    let cleanDisplay = displayName ? String(displayName).trim() : "";
    let cleanPhone = phoneNumber ? String(phoneNumber).trim() : "";
    const cleanWabaId = wabaId ? String(wabaId).trim() : null;

    // If custom token is provided and non-dummy, save it to platform settings
    if (customToken && String(customToken).trim() && !customToken.startsWith("EAAX_") && !customToken.includes("placeholder")) {
      try {
        setSetting("WHATSAPP_API_TOKEN", String(customToken).trim());
      } catch (e) {
        console.warn("[Admin Phone Register] Save token note:", e.message);
      }
    }

    // Determine active token to query Meta
    const activeToken = (customToken && String(customToken).trim()) || getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN;

    // Verify against Meta Graph API or auto-detect missing details
    let qualityRating = "GREEN";
    let metaStatus = "VERIFIED";

    if (activeToken && !activeToken.startsWith("EAAX_") && !activeToken.includes("placeholder")) {
      try {
        const verifyRes = await fetch(`${metaWhatsAppService.getMetaBaseUrl()}/${cleanPhoneId}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status,status`, {
          headers: { "Authorization": `Bearer ${activeToken}` },
          signal: AbortSignal.timeout(12000)
        });
        const metaData = await verifyRes.json();
        if (verifyRes.ok && metaData.id) {
          qualityRating = metaData.quality_rating || qualityRating;
          metaStatus = metaData.code_verification_status || metaData.status || metaStatus;
          if (!cleanDisplay && metaData.verified_name) {
            cleanDisplay = metaData.verified_name;
          }
          if (!cleanPhone && metaData.display_phone_number) {
            cleanPhone = metaData.display_phone_number;
          }
        }
      } catch (e) {
        console.warn("[Admin Phone Register] Live Meta test check note:", e.message);
      }
    }

    // If still missing display name or phone number, provide sensible defaults
    if (!cleanDisplay) {
      cleanDisplay = `WhatsApp Line ${cleanPhoneId.slice(-4)}`;
    }
    if (!cleanPhone) {
      cleanPhone = cleanPhoneId;
    }

    const targetTenantId = Number(req.body?.tenantId || req.user?.tenant_id || 1);
    try {
      billingService.assertCanConnectWabaLine(targetTenantId, cleanPhoneId);
    } catch (quotaErr) {
      return res.status(quotaErr.statusCode || 402).json({
        success: false,
        code: quotaErr.code || "WABA_LINE_QUOTA_EXCEEDED",
        message: quotaErr.message
      });
    }

    // If PIN is provided, execute direct Meta Cloud API registration
    if (pin && String(pin).trim()) {
      const cleanPin = String(pin).trim();
      if (!/^\d{6}$/.test(cleanPin)) {
        return res.status(400).json({
          success: false,
          message: "Meta two-step verification PIN must be a 6-digit numeric string (e.g. '123456')."
        });
      }
      try {
        const { registerPhoneNumberWithMeta } = require("../services/metaWhatsAppService");
        await registerPhoneNumberWithMeta({
          phoneNumberId: cleanPhoneId,
          pin: cleanPin,
          token: activeToken
        });
        metaStatus = "CONNECTED";
      } catch (pinErr) {
        return res.status(pinErr.statusCode || 400).json({
          success: false,
          message: `Failed to register PIN with Meta: ${pinErr.message}`,
          metaCode: pinErr.metaCode,
          hint: pinErr.hint
        });
      }
    }

    // Check if Phone Number ID already exists (UPSERT instead of 409)
    const existing = db.prepare("SELECT * FROM waba_phone_numbers WHERE phone_number_id = ?").get(cleanPhoneId);
    const phoneCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers WHERE COALESCE(tenant_id, 1) = ? AND COALESCE(delete_status, 0) = 0").get(targetTenantId).count;
    const shouldBeDefault = isDefault !== undefined ? Boolean(isDefault) : (existing ? existing.is_default === 1 : phoneCount === 0);

    if (shouldBeDefault) {
      db.prepare("UPDATE waba_phone_numbers SET is_default = 0 WHERE COALESCE(tenant_id, 1) = ?").run(targetTenantId);
      if (targetTenantId === 1) {
        setSetting("WHATSAPP_PHONE_NUMBER_ID", cleanPhoneId);
      }
    }

    const tokenToSave = (customToken && String(customToken).trim() && !customToken.startsWith("EAAX_") && !customToken.includes("placeholder"))
      ? String(customToken).trim()
      : null;

    if (existing) {
      // Update existing record
      db.prepare(`
        UPDATE waba_phone_numbers
        SET display_name = ?,
            phone_number = ?,
            waba_id = COALESCE(?, waba_id),
            quality_rating = ?,
            status = ?,
            is_default = ?,
            access_token = COALESCE(?, access_token),
            token_type = 'PERMANENT',
            last_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        cleanDisplay,
        cleanPhone,
        cleanWabaId,
        qualityRating,
        metaStatus,
        shouldBeDefault ? 1 : 0,
        tokenToSave,
        existing.id
      );

      const updated = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(existing.id);

      return res.status(200).json({
        success: true,
        message: `WhatsApp Phone Number '${cleanDisplay}' (${cleanPhone}) updated and synced successfully!`,
        data: {
          ...updated,
          access_token: undefined,
          has_token: !!(updated.access_token && updated.access_token.trim()),
          access_token_preview: updated.access_token ? updated.access_token.substring(0, 8) + "••••••••" + updated.access_token.slice(-6) : null
        }
      });
    }

    // Insert new record
    const newId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO waba_phone_numbers (
        id, tenant_id, display_name, phone_number, phone_number_id, waba_id,
        quality_rating, status, is_default, registered_by, access_token, token_type, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PERMANENT', CURRENT_TIMESTAMP)
    `).run(
      newId, targetTenantId, cleanDisplay, cleanPhone, cleanPhoneId, cleanWabaId,
      qualityRating, metaStatus, shouldBeDefault ? 1 : 0, req.user ? req.user.id : null, tokenToSave || activeToken
    );

    const saved = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(newId);

    return res.status(201).json({
      success: true,
      message: `WhatsApp Phone Number '${cleanDisplay}' (${cleanPhone}) registered successfully!`,
      data: {
        ...saved,
        access_token: undefined,
        has_token: !!(saved.access_token && saved.access_token.trim()),
        access_token_preview: saved.access_token ? saved.access_token.substring(0, 8) + "••••••••" + saved.access_token.slice(-6) : null
      }
    });
  } catch (error) {
    console.error("Admin registerPhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Delete a registered phone number (Admin Only)
 */
async function deletePhoneNumber(req, res) {
  try {
    const { id } = req.params;

    const phone = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(id);
    if (!phone) {
      return res.status(404).json({ success: false, message: "Phone number not found." });
    }

    if (phone.is_default) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the default active WhatsApp number. Set another number as default first."
      });
    }

    db.prepare("DELETE FROM waba_phone_numbers WHERE id = ?").run(id);

    return res.status(200).json({
      success: true,
      message: `Phone number '${phone.display_name}' removed from platform.`
    });
  } catch (error) {
    console.error("Admin deletePhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Set a phone number as default active (Admin Only)
 */
async function setDefaultPhoneNumber(req, res) {
  try {
    const { id } = req.params;
    const phone = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(id);
    if (!phone) {
      return res.status(404).json({ success: false, message: "Phone number not found." });
    }

    db.prepare("UPDATE waba_phone_numbers SET is_default = 0").run();
    db.prepare("UPDATE waba_phone_numbers SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    setSetting("WHATSAPP_PHONE_NUMBER_ID", phone.phone_number_id);

    return res.status(200).json({
      success: true,
      message: `'${phone.display_name}' set as default active WhatsApp sender.`
    });
  } catch (error) {
    console.error("Admin setDefaultPhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Test / Verify a specific phone line against Meta Cloud API (Admin Only)
 */
async function testPhoneNumber(req, res) {
  try {
    const { id } = req.params;
    const customToken = req.body?.token;

    const phone = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ? OR phone_number_id = ?").get(id, id);
    if (!phone) {
      return res.status(404).json({ success: false, message: "Phone number not found in registry." });
    }

    const activeToken = (customToken && String(customToken).trim()) || phone.access_token || getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN;
    if (!activeToken) {
      return res.status(400).json({ success: false, message: "No WhatsApp Cloud API token configured or provided." });
    }

    const resp = await fetch(`${metaWhatsAppService.getMetaBaseUrl()}/${phone.phone_number_id}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status,status`, {
      headers: { Authorization: `Bearer ${activeToken}` },
      signal: AbortSignal.timeout(12000)
    });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      return res.status(resp.status || 400).json({
        success: false,
        message: data.error?.message || "Failed to verify phone number with Meta.",
        error: data.error
      });
    }

    const qualityRating = data.quality_rating || phone.quality_rating || "GREEN";
    const status = data.code_verification_status || data.status || phone.status || "VERIFIED";
    const verifiedName = data.verified_name || phone.display_name;
    const displayPhone = data.display_phone_number || phone.phone_number;

    db.prepare(`
      UPDATE waba_phone_numbers
      SET quality_rating = ?,
          status = ?,
          display_name = COALESCE(?, display_name),
          phone_number = COALESCE(?, phone_number),
          last_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(qualityRating, status, verifiedName, displayPhone, phone.id);

    const updated = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(phone.id);

    return res.status(200).json({
      success: true,
      message: `Verified with Meta: ${verifiedName} (${displayPhone}) is ${status}.`,
      data: {
        ...updated,
        access_token: undefined,
        has_token: !!(updated.access_token && updated.access_token.trim()),
        access_token_preview: updated.access_token ? updated.access_token.substring(0, 8) + "••••••••" + updated.access_token.slice(-6) : null
      },
      meta: data
    });
  } catch (err) {
    console.error("testPhoneNumber error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Update and verify permanent access token dedicated to a specific phone line (Admin Only)
 */
async function updatePhoneNumberToken(req, res) {
  try {
    const { id } = req.params;
    const { token, tokenType = "PERMANENT" } = req.body || {};
    if (!token || !String(token).trim()) {
      return res.status(400).json({ success: false, message: "A valid Meta access token is required." });
    }
    const cleanToken = String(token).trim();
    const phone = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ? OR phone_number_id = ?").get(id, id);
    if (!phone) {
      return res.status(404).json({ success: false, message: "Phone number not found in registry." });
    }

    // Live verification with Meta Graph API
    const resp = await fetch(`${metaWhatsAppService.getMetaBaseUrl()}/${phone.phone_number_id}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status,status`, {
      headers: { Authorization: `Bearer ${cleanToken}` },
      signal: AbortSignal.timeout(12000)
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      return res.status(resp.status || 400).json({
        success: false,
        message: data.error?.message || "Invalid token: Meta rejected authentication.",
        error: data.error
      });
    }

    const qualityRating = data.quality_rating || phone.quality_rating || "GREEN";
    const status = data.code_verification_status || data.status || "VERIFIED";
    const verifiedName = data.verified_name || phone.display_name;
    const displayPhone = data.display_phone_number || phone.phone_number;

    db.prepare(`
      UPDATE waba_phone_numbers
      SET access_token = ?,
          token_type = ?,
          quality_rating = ?,
          status = ?,
          display_name = COALESCE(?, display_name),
          phone_number = COALESCE(?, phone_number),
          last_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cleanToken, tokenType, qualityRating, status, verifiedName, displayPhone, phone.id);

    // If this line is designated default, update settings WHATSAPP_API_TOKEN as well
    if (phone.is_default === 1) {
      try {
        setSetting("WHATSAPP_API_TOKEN", cleanToken);
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      message: `Permanent token verified and saved for '${verifiedName}' (${displayPhone})!`,
      data: {
        id: phone.id,
        phone_number_id: phone.phone_number_id,
        display_name: verifiedName,
        phone_number: displayPhone,
        status,
        quality_rating: qualityRating,
        token_type: tokenType,
        has_token: true,
        access_token_preview: cleanToken.substring(0, 8) + "••••••••" + cleanToken.slice(-6),
        last_verified_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("updatePhoneNumberToken error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Global System Health & Overview Statistics (Admin Only)
 */
async function getSystemOverview(req, res) {
  try {
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'ACTIVE'").get().count;
    const totalCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns").get().count;
    const messageTotals = db.prepare(`
      SELECT 
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(failed_count), 0) as total_failed,
        COALESCE(SUM(valid_contacts), 0) as total_recipients
      FROM campaigns
    `).get();

    const totalReplies = db.prepare("SELECT COUNT(*) as count FROM customer_replies").get().count;
    const unreadReplies = db.prepare("SELECT COUNT(*) as count FROM customer_replies WHERE is_read = 0").get().count;
    const totalDispatches = db.prepare("SELECT COUNT(*) as count FROM automated_booking_dispatches").get().count;
    const registeredPhones = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers").get().count;

    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'").get().count;
    const completedCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE status = 'COMPLETED'").get().count;

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        adminUsers: adminCount,
        totalCampaigns,
        completedCampaigns,
        totalSent: messageTotals.total_sent,
        totalFailed: messageTotals.total_failed,
        totalRecipients: messageTotals.total_recipients,
        totalReplies,
        unreadReplies,
        totalBookingDispatches: totalDispatches,
        registeredPhonesCount: registeredPhones,

        // Structured objects for compatibility with various consumers
        users: {
          total: totalUsers,
          active: activeUsers,
          admins: adminCount
        },
        campaigns: {
          total: totalCampaigns,
          completed: completedCampaigns
        },
        messages: {
          sent: messageTotals.total_sent,
          delivered: messageTotals.total_sent,
          failed: messageTotals.total_failed
        },
        automation: {
          totalAutomatedDispatches: totalDispatches
        }
      }
    });
  } catch (error) {
    console.error("Admin getSystemOverview error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Directly reset a user's password (Admin Only)
 */
async function resetUserPassword(req, res) {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body || {};

    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }

    const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, userId);

    // Audit log
    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address)
        VALUES (?, 'ADMIN_PASSWORD_RESET', ?, ?, ?)
      `).run(req.user.id, userId, `Admin reset password for ${user.email}`, req.ip || null);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: `Password for ${user.name} (${user.email}) has been reset successfully.`
    });
  } catch (error) {
    console.error("Admin resetUserPassword error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Assign all unassigned legacy history (campaigns, replies, dispatches) to a user (Admin Only)
 */
async function claimLegacyHistory(req, res) {
  try {
    const { userId } = req.params;
    const targetUser = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    let campaignsCount = 0;
    let repliesCount = 0;
    let dispatchesCount = 0;
    let contactsCount = 0;

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const campRes = db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(userId);
      campaignsCount = campRes.changes;

      const replyRes = db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(userId);
      repliesCount = replyRes.changes;

      const dispRes = db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(userId);
      dispatchesCount = dispRes.changes;

      const contRes = db.prepare("UPDATE automated_booking_contacts SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(userId);
      contactsCount = contRes.changes;

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address)
        VALUES (?, 'CLAIM_LEGACY_HISTORY', ?, ?, ?)
      `).run(req.user.id, userId, `Assigned ${campaignsCount} campaigns, ${repliesCount} replies, ${dispatchesCount} dispatches to ${targetUser.email}`, req.ip || null);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    return res.status(200).json({
      success: true,
      message: `Successfully linked ${campaignsCount} campaigns, ${repliesCount} customer replies, and ${dispatchesCount} booking dispatches to ${targetUser.name}!`,
      data: {
        claimedCampaigns: campaignsCount,
        claimedReplies: repliesCount,
        claimedDispatches: dispatchesCount,
        claimedContacts: contactsCount
      }
    });
  } catch (error) {
    console.error("Admin claimLegacyHistory error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Returns summary of unassigned legacy records in the platform (Admin Only)
 */
async function getUnassignedSummary(req, res) {
  try {
    const unassignedCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").get().count;
    const unassignedReplies = db.prepare("SELECT COUNT(*) as count FROM customer_replies WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").get().count;
    const unassignedDispatches = db.prepare("SELECT COUNT(*) as count FROM automated_booking_dispatches WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").get().count;

    return res.status(200).json({
      success: true,
      data: {
        unassignedCampaigns,
        unassignedReplies,
        unassignedDispatches,
        hasUnassigned: (unassignedCampaigns + unassignedReplies + unassignedDispatches) > 0
      }
    });
  } catch (error) {
    console.error("Admin getUnassignedSummary error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Retrieve system audit logs with pagination (Admin Only)
 */
async function getAuditLogs(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

    const logs = db.prepare(`
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare("SELECT COUNT(*) as count FROM audit_logs").get()?.count || 0;

    return res.status(200).json({
      success: true,
      data: logs,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error("Admin getAuditLogs error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Export system configuration & entity overview (Admin Only)
 */
async function exportBackup(req, res) {
  try {
    const usersCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
    const campaignsCount = db.prepare("SELECT COUNT(*) as count FROM campaigns").get()?.count || 0;
    const contactsCount = db.prepare("SELECT COUNT(*) as count FROM contacts").get()?.count || 0;
    const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get()?.count || 0;
    const wabaCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers").get()?.count || 0;

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        usersCount,
        campaignsCount,
        contactsCount,
        settingsCount,
        wabaCount
      }
    });
  } catch (error) {
    console.error("Admin exportBackup error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get comprehensive Meta Webhook configuration, URLs, and status (Admin Only)
 */
async function getWebhookConfig(req, res) {
  try {
    const urls = webhookService.resolveWebhookUrls(req);
    const verifyToken = webhookService.getVerifyToken();
    const appSecret = config.META_APP_SECRET || getSetting("META_APP_SECRET") || process.env.META_APP_SECRET;

    // Get telemetry stats
    let totalReplies = 0;
    let lastEventAt = null;
    try {
      totalReplies = db.prepare("SELECT COUNT(*) as count FROM replies").get()?.count || 0;
      const lastReply = db.prepare("SELECT created_at FROM replies ORDER BY created_at DESC LIMIT 1").get();
      if (lastReply?.created_at) {
        lastEventAt = lastReply.created_at;
      }
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: {
        verifyToken,
        primaryUrl: urls.primaryUrl,
        altUrl: urls.altUrl,
        baseUrl: urls.baseUrl,
        isCustomOverride: urls.isCustomOverride,
        isHttps: urls.isHttps,
        metaAppSecretConfigured: Boolean(appSecret),
        subscriptionFields: [
          "messages",
          "message_deliveries",
          "messaging_postbacks",
          "message_reactions"
        ],
        stats: {
          totalReplies,
          lastEventAt
        }
      }
    });
  } catch (error) {
    console.error("Admin getWebhookConfig error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Generate a new cryptographically secure Meta Webhook verify token (Admin Only)
 */
async function generateNewVerifyToken(req, res) {
  try {
    const newToken = webhookService.generateVerifyToken();
    const adminId = req.user?.id || req.user?.userId;
    const ip = req.ip || req.connection?.remoteAddress;

    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address)
        VALUES (?, 'WEBHOOK_TOKEN_ROTATED', 'WEBHOOK_VERIFY_TOKEN', ?, ?)
      `).run(adminId || null, `Generated new token: ${newToken.substring(0, 10)}••••`, ip || null);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: "New Meta Webhook Verify Token generated successfully.",
      data: {
        verifyToken: newToken
      }
    });
  } catch (error) {
    console.error("Admin generateNewVerifyToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Save custom Meta Webhook verify token (Admin Only)
 */
async function saveWebhookToken(req, res) {
  try {
    const { verifyToken } = req.body || {};
    if (!verifyToken || typeof verifyToken !== "string" || !verifyToken.trim()) {
      return res.status(400).json({ success: false, message: "Verify token cannot be empty." });
    }
    const cleanToken = verifyToken.trim();
    if (cleanToken.length < 8) {
      return res.status(400).json({ success: false, message: "Verify token must be at least 8 characters long." });
    }

    webhookService.saveVerifyToken(cleanToken);
    const adminId = req.user?.id || req.user?.userId;
    const ip = req.ip || req.connection?.remoteAddress;

    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address)
        VALUES (?, 'WEBHOOK_TOKEN_UPDATED', 'WEBHOOK_VERIFY_TOKEN', ?, ?)
      `).run(adminId || null, `Updated custom token: ${cleanToken.substring(0, 8)}••••`, ip || null);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: "Webhook verify token updated successfully.",
      data: {
        verifyToken: cleanToken
      }
    });
  } catch (error) {
    console.error("Admin saveWebhookToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Test Meta Webhook handshake challenge verification (Admin Only)
 */
async function testWebhookHandshake(req, res) {
  try {
    const { token, challenge } = req.body || {};
    const result = webhookService.testHandshake(token, challenge);

    return res.status(200).json({
      success: true,
      message: result.success
        ? "Meta Webhook handshake verified successfully!"
        : "Handshake verification failed: Token mismatch.",
      data: result
    });
  } catch (error) {
    console.error("Admin testWebhookHandshake error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update public Webhook URL override (Admin Only)
 */
async function updateWebhookUrlOverride(req, res) {
  try {
    const { publicUrl } = req.body || {};
    let cleanUrl = null;

    if (publicUrl && String(publicUrl).trim()) {
      cleanUrl = String(publicUrl).trim().replace(/\/+$/, "");
      if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
        return res.status(400).json({
          success: false,
          message: "Public Webhook URL must start with http:// or https://"
        });
      }
    }

    setSetting("PUBLIC_WEBHOOK_URL", cleanUrl || "");
    const adminId = req.user?.id || req.user?.userId;
    const ip = req.ip || req.connection?.remoteAddress;

    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address)
        VALUES (?, 'WEBHOOK_URL_OVERRIDE_UPDATED', 'PUBLIC_WEBHOOK_URL', ?, ?)
      `).run(adminId || null, cleanUrl ? `Set URL override to ${cleanUrl}` : "Cleared URL override", ip || null);
    } catch (e) {}

    const resolved = webhookService.resolveWebhookUrls(req);
    return res.status(200).json({
      success: true,
      message: cleanUrl ? "Public Webhook URL override updated." : "Public Webhook URL reset to default host.",
      data: resolved
    });
  } catch (error) {
    console.error("Admin updateWebhookUrlOverride error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * =========================================================================
 * USER CRUD EXTENSIONS (ADMIN ONLY)
 * =========================================================================
 */

async function createUser(req, res) {
  try {
    const { name, email, phone, role = "USER", password, assigned_phone_id } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const existing = db.prepare("SELECT id, delete_status FROM users WHERE LOWER(email) = LOWER(?)").get(cleanEmail);
    if (existing) {
      if (existing.delete_status === 1) {
        return res.status(400).json({ success: false, message: "A user with this email exists in the Recycle Bin. Restore them from the Recycle Bin." });
      }
      return res.status(400).json({ success: false, message: "Email is already registered." });
    }
    const newId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, role, status, password_hash, assigned_phone_id, active_status, delete_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(newId, String(name).trim(), cleanEmail, phone ? String(phone).trim() : null, role === "ADMIN" ? "ADMIN" : "USER", passwordHash, assigned_phone_id || null);

    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address, created_at)
        VALUES (?, 'ADMIN_CREATE_USER', ?, ?, ?, UTC_TIMESTAMP())
      `).run(req.user?.id || null, newId, `Admin created user ${cleanEmail} (${role})`, req.ip || null);
    } catch (e) {}

    const created = db.prepare("SELECT id, name, email, phone, role, status, assigned_phone_id, created_at FROM users WHERE id = ?").get(newId);
    return res.status(201).json({ success: true, message: `User ${name} created successfully.`, data: created });
  } catch (error) {
    console.error("Admin createUser error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function updateUser(req, res) {
  try {
    const { userId } = req.params;
    const { name, email, phone, role, status, assigned_phone_id } = req.body || {};
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND COALESCE(delete_status, 0) = 0").get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (role && !["ADMIN", "USER"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be 'ADMIN' or 'USER'." });
    }
    if (status && !["ACTIVE", "SUSPENDED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'ACTIVE' or 'SUSPENDED'." });
    }

    if (req.user?.id === userId) {
      if (status === "SUSPENDED") {
        return res.status(400).json({ success: false, message: "You cannot suspend your own account." });
      }
      if (role === "USER") {
        const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND COALESCE(delete_status, 0) = 0").get().count;
        if (adminCount <= 1) {
          return res.status(400).json({ success: false, message: "Cannot demote the only remaining Master Admin." });
        }
      }
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : user.email;
    if (cleanEmail !== user.email) {
      const emailConflict = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?").get(cleanEmail, userId);
      if (emailConflict) {
        return res.status(400).json({ success: false, message: "Email is already taken by another account." });
      }
    }

    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          role = COALESCE(?, role),
          status = COALESCE(?, status),
          assigned_phone_id = ?,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(
      name ? String(name).trim() : null,
      cleanEmail,
      phone !== undefined ? (phone ? String(phone).trim() : null) : user.phone,
      role || null,
      status || null,
      assigned_phone_id !== undefined ? (assigned_phone_id || null) : user.assigned_phone_id,
      userId
    );

    const updated = db.prepare("SELECT id, name, email, phone, role, status, assigned_phone_id, updated_at FROM users WHERE id = ?").get(userId);
    return res.status(200).json({ success: true, message: "User updated successfully.", data: updated });
  } catch (error) {
    console.error("Admin updateUser error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteUser(req, res) {
  try {
    const { userId } = req.params;
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND COALESCE(delete_status, 0) = 0").get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (req.user?.id === userId) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account." });
    }
    if (user.role === "ADMIN") {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND COALESCE(delete_status, 0) = 0").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: "Cannot delete the only remaining Master Admin." });
      }
    }

    db.prepare(`
      UPDATE users 
      SET active_status = 0,
          delete_status = 1,
          deleted_at = UTC_TIMESTAMP(),
          deleted_by = ?,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(req.user?.id || "admin", userId);

    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_id, details, ip_address, created_at)
        VALUES (?, 'ADMIN_SOFT_DELETE_USER', ?, ?, ?, UTC_TIMESTAMP())
      `).run(req.user?.id || null, userId, `Soft-deleted user ${user.email} into Recycle Bin`, req.ip || null);
    } catch (e) {}

    return res.status(200).json({ success: true, message: `User '${user.name}' moved to Recycle Bin.` });
  } catch (error) {
    console.error("Admin deleteUser error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * =========================================================================
 * RECYCLE BIN (UNIVERSAL SOFT/HARD DELETE RECOVERY)
 * =========================================================================
 */

async function listRecycleBin(req, res) {
  try {
    const { entityType = "ALL", limit = 100, offset = 0 } = req.query;
    const isPlatform = isPlatformAdmin(req.user);
    const reqTenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
    const items = await recycleBinService.listDeletedItems({
      entityType,
      tenantId: isPlatform ? reqTenantId : (req.user?.tenant_id || 1),
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0
    });
    return res.status(200).json({ success: true, data: { items, total: items.length }, items });
  } catch (error) {
    console.error("Admin listRecycleBin error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function restoreRecycleBinItem(req, res) {
  try {
    const { entityType, id } = req.params;
    const result = await recycleBinService.restoreItem({
      entityType,
      id,
      tenantId: req.user?.tenant_id || 1,
      restoredBy: req.user?.id || "admin"
    });
    return res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) {
    console.error("Admin restoreRecycleBinItem error:", error);
    return res.status(error.message && error.message.includes("not found") ? 404 : 400).json({ success: false, message: error.message });
  }
}

async function hardDeleteRecycleBinItem(req, res) {
  try {
    const { entityType, id } = req.params;
    const { confirmHardDelete } = req.body || {};
    const result = await recycleBinService.hardDeleteItem({
      entityType,
      id,
      tenantId: req.user?.tenant_id || 1,
      hardDeletedBy: req.user?.id || "admin",
      confirmHardDelete: Boolean(confirmHardDelete)
    });
    return res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) {
    console.error("Admin hardDeleteRecycleBinItem error:", error);
    return res.status(error.message && error.message.includes("not found") ? 404 : 400).json({ success: false, message: error.message });
  }
}

/**
 * =========================================================================
 * DPDP ACT 2023 COMPLIANCE & PRIVACY DESK
 * =========================================================================
 */

async function recordComplianceConsent(req, res) {
  try {
    const { phoneE164, waBsuid, purpose, status, source, noticeVersion } = req.body || {};
    const result = await complianceService.recordConsent({
      tenantId: req.user?.tenant_id || 1,
      phoneE164,
      waBsuid,
      purpose,
      status,
      source,
      noticeVersion,
      ipAddress: req.ip || null
    });
    return res.status(201).json({ success: true, message: `DPDP Consent recorded (${status}).`, data: result });
  } catch (error) {
    console.error("Admin recordComplianceConsent error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function exportCompliancePii(req, res) {
  try {
    const { phone } = req.params;
    const exportData = await complianceService.exportDataSubjectPii(phone, req.user?.tenant_id || 1);
    return res.status(200).json({ success: true, data: exportData });
  } catch (error) {
    console.error("Admin exportCompliancePii error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function executeComplianceErasure(req, res) {
  try {
    const { phone } = req.params;
    const { scheduleNoticeHours, immediate, reason } = req.body || {};
    const result = await complianceService.executeErasureOrAnonymization({
      phoneE164: phone,
      tenantId: req.user?.tenant_id || 1,
      requestedBy: req.user?.id || "admin",
      scheduleNoticeHours,
      immediate,
      reason
    });
    return res.status(200).json({ success: true, message: result.message || "Erasure processed.", data: result });
  } catch (error) {
    console.error("Admin executeComplianceErasure error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function listComplianceRequests(req, res) {
  try {
    const { status, requestType, limit, offset } = req.query;
    const requests = await complianceService.listComplianceRequests({
      tenantId: req.user?.tenant_id || 1,
      status,
      requestType,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("Admin listComplianceRequests error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function createComplianceRequest(req, res) {
  try {
    const { phoneE164, requestType, details } = req.body || {};
    const result = await complianceService.createComplianceRequest({
      tenantId: req.user?.tenant_id || 1,
      phoneE164,
      requestType,
      details,
      createdBy: req.user?.id || "admin"
    });
    return res.status(201).json({ success: true, message: "Compliance request registered.", data: result });
  } catch (error) {
    console.error("Admin createComplianceRequest error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function updateComplianceRequest(req, res) {
  try {
    const { id } = req.params;
    const { status, details } = req.body || {};
    const result = await complianceService.updateComplianceRequest({
      requestId: id,
      tenantId: req.user?.tenant_id || 1,
      status,
      details,
      resolvedBy: req.user?.id || "admin"
    });
    return res.status(200).json({ success: true, message: "Compliance request updated.", data: result });
  } catch (error) {
    console.error("Admin updateComplianceRequest error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function listConsentLedger(req, res) {
  try {
    const { phone, limit, offset } = req.query;
    const entries = await complianceService.listConsentLedger({
      tenantId: req.user?.tenant_id || 1,
      phoneE164: phone,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0
    });
    return res.status(200).json({ success: true, data: entries });
  } catch (error) {
    console.error("Admin listConsentLedger error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserDetails,
  updateUserStatus,
  updateUserRole,
  assignPhoneNumber,
  impersonateUser,
  listPhoneNumbers,
  registerPhoneNumber,
  deletePhoneNumber,
  setDefaultPhoneNumber,
  testPhoneNumber,
  updatePhoneNumberToken,
  getSystemOverview,
  resetUserPassword,
  claimLegacyHistory,
  getUnassignedSummary,
  getAuditLogs,
  exportBackup,
  registerMetaPhoneNumber: (req, res) => require("./settingsController").registerMetaPhone(req, res),
  deregisterMetaPhoneNumber: (req, res) => require("./settingsController").deregisterMetaPhone(req, res),
  getWebhookConfig,
  generateNewVerifyToken,
  saveWebhookToken,
  testWebhookHandshake,
  updateWebhookUrlOverride,
  listRecycleBin,
  restoreRecycleBinItem,
  hardDeleteRecycleBinItem,
  recordComplianceConsent,
  exportCompliancePii,
  executeComplianceErasure,
  listComplianceRequests,
  createComplianceRequest,
  updateComplianceRequest,
  listConsentLedger
};
