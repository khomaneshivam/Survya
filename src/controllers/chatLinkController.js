const chatLinkService = require("../services/chatLinkService");
const hospitalityConfigService = require("../services/hospitalityConfigService");
const { generateQrSvg } = require("../utils/qrCodeUtil");
const config = require("../config/env");
const { isWorkspaceAdmin } = require("../middleware/authMiddleware");

function getBaseUrl(req) {
  if (config.PUBLIC_APP_URL) {
    return config.PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  const forwardedHost = req.headers["x-forwarded-host"];
  if (forwardedHost) {
    const forwardedProto = req.headers["x-forwarded-proto"] || "http";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }
  const origin = req.headers["origin"];
  if (origin && !origin.includes("null")) {
    return origin.replace(/\/+$/, "");
  }
  const referer = req.headers["referer"];
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch (e) {}
  }
  const host = req.get("host") || `localhost:${config.PORT || 5000}`;
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return `${protocol}://${host}`;
}

/**
 * GET /api/v1/chat-links
 * Lists all chat links for the current workspace with search, filters & KPIs.
 * Scoped strictly to the user's account for regular users; administrators see all accounts.
 */
async function listLinks(req, res) {
  try {
    const { status, category, search, limit, offset, userId } = req.query || {};
    const tenantId = req.user?.tenant_id || 1;
    const reqUserId = req.user?.id;
    const isAdmin = isWorkspaceAdmin(req.user);
    const baseUrl = getBaseUrl(req);

    // If admin requested filter by userId, use that. If regular user, strictly scope to own account.
    const scopedUserId = isAdmin ? (userId || null) : reqUserId;

    const result = chatLinkService.listLinks({
      tenantId,
      userId: scopedUserId,
      isAdmin,
      status: status || "ALL",
      category: category || "ALL",
      search: search || "",
      limit,
      offset,
      baseUrl
    });

    return res.status(200).json({
      success: true,
      summary: result.summary,
      links: result.links,
      data: result.links
    });
  } catch (error) {
    console.error("[ChatLinkController] listLinks error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/chat-links
 * Creates a new shareable Click-to-Chat link
 */
async function createLink(req, res) {
  try {
    const {
      title,
      slug,
      phoneNumber,
      phone_number,
      phoneNumberId,
      phone_number_id,
      defaultMessage,
      default_message,
      welcomeTitle,
      welcome_title,
      welcomeDescription,
      welcome_description,
      autoReplyEnabled,
      auto_reply_enabled,
      autoReplyMessage,
      auto_reply_message,
      flowId,
      flow_id,
      category
    } = req.body || {};

    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const baseUrl = getBaseUrl(req);

    const link = chatLinkService.createLink({
      tenantId,
      userId,
      title,
      slug,
      phoneNumber: phoneNumber || phone_number,
      phoneNumberId: phoneNumberId || phone_number_id,
      defaultMessage: defaultMessage !== undefined ? defaultMessage : default_message,
      welcomeTitle: welcomeTitle !== undefined ? welcomeTitle : welcome_title,
      welcomeDescription: welcomeDescription !== undefined ? welcomeDescription : welcome_description,
      autoReplyEnabled: autoReplyEnabled !== undefined ? autoReplyEnabled : auto_reply_enabled,
      autoReplyMessage: autoReplyMessage !== undefined ? autoReplyMessage : auto_reply_message,
      flowId: flowId !== undefined ? flowId : flow_id,
      category,
      customFields: req.body.customFields || req.body.custom_fields,
      custom_fields: req.body.custom_fields || req.body.customFields,
      baseUrl
    });

    return res.status(201).json({
      success: true,
      message: `Chat link '${link.title}' created successfully.`,
      link,
      data: link
    });
  } catch (error) {
    console.error("[ChatLinkController] createLink error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * POST /api/v1/chat-links/bulk-generate
 * Bulk automated generator: programmatically generates links for rooms, campaigns, etc.
 */
async function bulkGenerateLinks(req, res) {
  try {
    let items = req.body?.links || req.body?.items;
    if (Array.isArray(req.body)) {
      items = req.body;
    }

    if (Array.isArray(items) && req.body?.title_template) {
      const titleTpl = String(req.body.title_template);
      const msgTpl = req.body.default_message_template ? String(req.body.default_message_template) : null;
      items = items.map(item => {
        const val = typeof item === "object" ? (item.title || item.name || item.item) : String(item);
        return {
          title: titleTpl.replace(/\{\{item\}\}/gi, val),
          defaultMessage: msgTpl ? msgTpl.replace(/\{\{item\}\}/gi, val) : req.body.default_message,
          category: req.body.category || "HOSPITALITY",
          autoReplyEnabled: req.body.auto_reply_enabled !== undefined ? req.body.auto_reply_enabled : req.body.autoReplyEnabled,
          autoReplyMessage: req.body.auto_reply_message || req.body.autoReplyMessage,
          phoneNumber: req.body.phone_number || req.body.phoneNumber || req.body.defaultPhone,
          phoneNumberId: req.body.phone_number_id || req.body.phoneNumberId || req.body.defaultPhoneId
        };
      });
    }

    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const baseUrl = getBaseUrl(req);
    const defaultPhone = req.body?.defaultPhone || req.body?.phone_number;
    const defaultPhoneId = req.body?.defaultPhoneId || req.body?.phone_number_id;

    const createdList = chatLinkService.bulkGenerateLinks(items, {
      tenantId,
      userId,
      defaultPhone,
      defaultPhoneId,
      baseUrl
    });

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${createdList.length} chat link(s).`,
      count: createdList.length,
      links: createdList,
      data: createdList
    });
  } catch (error) {
    console.error("[ChatLinkController] bulkGenerateLinks error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/chat-links/:id
 */
async function getLink(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id;
    const isAdmin = isWorkspaceAdmin(req.user);
    const baseUrl = getBaseUrl(req);

    const link = chatLinkService.getLinkByIdOrSlug(id, {
      tenantId,
      userId,
      isAdmin,
      baseUrl
    });
    if (!link) {
      return res.status(404).json({ success: false, message: "Chat link not found." });
    }

    return res.status(200).json({
      success: true,
      link,
      data: link
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * PUT /api/v1/chat-links/:id
 */
async function updateLink(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id;
    const isAdmin = isWorkspaceAdmin(req.user);
    const baseUrl = getBaseUrl(req);

    const updated = chatLinkService.updateLink(id, req.body || {}, {
      tenantId,
      userId,
      isAdmin,
      baseUrl
    });
    return res.status(200).json({
      success: true,
      message: `Chat link '${updated.title}' updated.`,
      link: updated,
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /api/v1/chat-links/:id/status
 */
async function toggleLinkStatus(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id;
    const isAdmin = isWorkspaceAdmin(req.user);
    const baseUrl = getBaseUrl(req);

    const existing = chatLinkService.getLinkByIdOrSlug(id, {
      tenantId,
      userId,
      isAdmin,
      baseUrl
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Chat link not found." });
    }

    const nextStatus = existing.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const updated = chatLinkService.updateLink(id, { status: nextStatus }, {
      tenantId,
      userId,
      isAdmin,
      baseUrl
    });

    return res.status(200).json({
      success: true,
      message: `Link is now ${nextStatus}.`,
      status: nextStatus,
      link: updated,
      data: updated
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/v1/chat-links/:id
 */
async function deleteLink(req, res) {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id;
    const isAdmin = isWorkspaceAdmin(req.user);

    const ok = chatLinkService.deleteLink(id, {
      tenantId,
      userId,
      isAdmin
    });
    if (!ok) {
      return res.status(404).json({ success: false, message: "Chat link not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Chat link deleted successfully."
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/chat-links/:id/qr
 * Returns pure SVG QR code for the link
 */
async function getQrCode(req, res) {
  try {
    const identifier = req.params.id || req.params.slug;
    const { format = "svg", size = 300 } = req.query;
    const tenantId = req.user?.tenant_id || 1;
    const baseUrl = getBaseUrl(req);

    const link = chatLinkService.getLinkByIdOrSlug(identifier, { tenantId, baseUrl });
    if (!link) {
      return res.status(404).json({ success: false, message: "Chat link not found." });
    }

    // Generate QR code for the short link or direct wa.me
    const targetUrl = link.urls?.shortUrl || `${baseUrl}/c/${link.slug}`;
    const svg = generateQrSvg(targetUrl, { size: Math.min(Math.max(parseInt(size, 10) || 300, 100), 1000) });

    if (String(format).toLowerCase() === "svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Content-Disposition", `inline; filename="qr_${link.slug}.svg"`);
      return res.send(svg);
    }

    return res.status(200).json({
      success: true,
      targetUrl,
      svg,
      slug: link.slug
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// =========================================================================
// PUBLIC IN-APP CUSTOMER ENDPOINTS (Unauthenticated)
// =========================================================================

/**
 * GET /api/v1/public/chat-links/:slug
 * Resolves public link metadata, applies query parameter replacements, increments clicks
 */
async function getPublicLinkBySlug(req, res) {
  try {
    const { slug } = req.params;
    const baseUrl = getBaseUrl(req);
    const queryParams = { ...req.query };

    const link = chatLinkService.getLinkByIdOrSlug(slug, {
      incrementClicks: true,
      queryParams,
      baseUrl
    });

    if (!link) {
      return res.status(404).json({ success: false, message: "Conversation link not found." });
    }

    const qrSvg = generateQrSvg(link.urls?.waMeUrl || link.urls?.shortUrl, { size: 280 });

    let galleryData = null;
    try {
      const linkTenantId = Number(link.tenant_id || 0);
      const linkPropertyId = Number(link.property_id || 0);
      if (linkTenantId > 0 && linkPropertyId > 0) {
        galleryData = hospitalityConfigService.getPropertyGallery(linkPropertyId, linkTenantId);
      } else if (linkTenantId > 0 && String(link.category || "").toUpperCase() === "HOSPITALITY") {
        const defaultProp = db.prepare(`
          SELECT id FROM properties
          WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0
          ORDER BY id ASC LIMIT 1
        `).get(linkTenantId);
        if (defaultProp?.id) {
          galleryData = hospitalityConfigService.getPropertyGallery(defaultProp.id, linkTenantId);
        }
      }
    } catch (e) {}

    const publicLink = {
      id: link.id,
      title: link.title,
      slug: link.slug,
      status: link.status,
      phoneNumber: link.phone_number,
      phone_number: link.phone_number,
      defaultMessage: link.default_message,
      default_message: link.default_message,
      welcomeTitle: link.welcome_title || link.title,
      welcome_title: link.welcome_title || link.title,
      welcomeDescription: link.welcome_description,
      welcome_description: link.welcome_description,
      autoReplyEnabled: link.auto_reply_enabled,
      auto_reply_enabled: link.auto_reply_enabled,
      custom_fields: link.custom_fields || [],
      customFields: link.custom_fields || [],
      urls: link.urls,
      shortUrl: link.shortUrl || link.urls?.shortUrl,
      waMeUrl: link.waMeUrl || link.urls?.waMeUrl,
      embedHtml: link.embedHtml || link.urls?.embedHtml,
      qrSvg,
      gallery: galleryData?.all_photos || [],
      galleryData
    };

    return res.status(200).json({
      success: true,
      link: publicLink,
      data: publicLink
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/public/chat-links/:slug/gallery
 * Returns the property and villa photo gallery for this chat link
 */
async function getPublicChatLinkGallery(req, res) {
  try {
    const { slug } = req.params;
    const link = chatLinkService.getLinkByIdOrSlug(slug);
    if (!link) {
      return res.status(404).json({ success: false, message: "Conversation link not found." });
    }
    const linkTenantId = Number(link.tenant_id || 0);
    const linkPropertyId = Number(link.property_id || 0);
    let galleryData = { all_photos: [] };
    if (linkTenantId > 0) {
      const targetPropId = linkPropertyId > 0
        ? linkPropertyId
        : (db.prepare("SELECT id FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0 ORDER BY id ASC LIMIT 1").get(linkTenantId)?.id || null);
      if (targetPropId) {
        galleryData = hospitalityConfigService.getPropertyGallery(targetPropId, linkTenantId);
      }
    }
    return res.status(200).json({
      success: true,
      photos: galleryData.all_photos || [],
      ...galleryData
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/public/chat-links/:slug/start-chat
 * Public customer starts a conversation in the system from the landing page
 */
async function startPublicChat(req, res) {
  try {
    const { slug } = req.params;
    const {
      customerName,
      customer_name,
      customerPhone,
      customer_phone,
      phone,
      name,
      message,
      queryParams,
      intakeData,
      intake_data
    } = req.body || {};

    const result = chatLinkService.startConversationFromLink({
      slug,
      customerName: customerName || customer_name || name,
      customerPhone: customerPhone || customer_phone || phone,
      message,
      queryParams,
      intakeData: intakeData || intake_data || null
    });

    return res.status(201).json({
      success: true,
      message: "Conversation started successfully.",
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * GET /api/v1/public/chat-links/:slug/messages
 * Retrieves live message thread for web customer session
 */
async function getPublicChatMessages(req, res) {
  try {
    const { slug } = req.params;
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, message: "phone query parameter is required." });
    }

    const link = chatLinkService.getLinkByIdOrSlug(slug);
    const messages = chatLinkService.getWebConversationMessages(phone, link?.id);
    return res.status(200).json({
      success: true,
      messages,
      data: messages
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/public/chat-links/:slug/send-message
 * Ongoing customer reply in web chat
 */
async function sendPublicChatMessage(req, res) {
  try {
    const { slug } = req.params;
    const { phone, message, flowSubmission, flow_submission, intakeData, intake_data } = req.body || {};

    const link = chatLinkService.getLinkByIdOrSlug(slug);
    const linkId = link ? link.id : null;

    const saved = chatLinkService.sendWebCustomerMessage(phone, message, linkId, {
      flowSubmission: flowSubmission || flow_submission,
      intakeData: intakeData || intake_data
    });
    return res.status(201).json({
      success: true,
      message: saved,
      data: saved,
      autoReply: saved.autoReply || null
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listLinks,
  createLink,
  bulkGenerateLinks,
  getLink,
  updateLink,
  toggleLinkStatus,
  deleteLink,
  getQrCode,
  getPublicLinkBySlug,
  getPublicChatLinkGallery,
  startPublicChat,
  getPublicChatMessages,
  sendPublicChatMessage
};
