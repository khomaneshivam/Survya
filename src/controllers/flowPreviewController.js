const flowPreviewService = require("../services/flowPreviewService");

function tenantIdFor(req) {
  return Number(req.user?.tenant_id || 1);
}

function sendAdminError(res, error) {
  const statusCode = Number(error?.statusCode) || 400;
  return res.status(statusCode).json({
    success: false,
    error: error?.message || "Could not complete the browser preview request.",
    code: error?.code || "FLOW_PREVIEW_ERROR"
  });
}

function setPublicPreviewHeaders(res) {
  // A preview token grants temporary access to a frozen draft. Keep both the
  // response and token-bearing route out of shared browser/proxy caches.
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function createPreviewLink(req, res) {
  try {
    const previewLink = flowPreviewService.createPreviewLink({
      flowId: req.params.flowId,
      tenantId: tenantIdFor(req),
      user: req.user,
      title: req.body?.title,
      expiresInHours: req.body?.expiresInHours
    });
    return res.status(201).json({
      success: true,
      previewLink,
      message: "Browser-only preview link created. It never sends WhatsApp messages."
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
}

function listPreviewLinks(req, res) {
  try {
    const data = flowPreviewService.listPreviewLinks(req.params.flowId, tenantIdFor(req));
    return res.json({ success: true, ...data });
  } catch (error) {
    return sendAdminError(res, error);
  }
}

function revokePreviewLink(req, res) {
  try {
    const previewLink = flowPreviewService.revokePreviewLink({
      previewLinkId: req.params.previewLinkId,
      tenantId: tenantIdFor(req),
      user: req.user
    });
    return res.json({
      success: true,
      previewLink,
      message: "Browser preview link revoked."
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
}

function sendPublicUnavailable(res, error) {
  setPublicPreviewHeaders(res);
  const statusCode = Number(error?.statusCode) === 400 ? 404 : (Number(error?.statusCode) || 404);
  return res.status(statusCode).json({
    success: false,
    error: error?.publicMessage || "Preview is unavailable.",
    code: "PREVIEW_UNAVAILABLE"
  });
}

function getPublicPreview(req, res) {
  try {
    setPublicPreviewHeaders(res);
    return res.json({ success: true, ...flowPreviewService.getPublicPreview(req.params.token) });
  } catch (error) {
    return sendPublicUnavailable(res, error);
  }
}

function simulatePublicPreview(req, res) {
  try {
    const body = req.body || {};
    const input = String(body.input || "");
    const selectedOptionId = String(body.selectedOptionId || "");
    const stateSize = body.state === undefined ? 0 : Buffer.byteLength(JSON.stringify(body.state || {}), "utf8");
    if (input.length > 2000 || selectedOptionId.length > 128 || stateSize > 20000) {
      const invalid = new Error("Preview is unavailable.");
      invalid.statusCode = 404;
      invalid.publicMessage = "Preview is unavailable.";
      throw invalid;
    }

    setPublicPreviewHeaders(res);
    return res.json({
      success: true,
      ...flowPreviewService.simulatePublicPreview({
        token: req.params.token,
        input,
        selectedOptionId,
        state: body.state
      })
    });
  } catch (error) {
    return sendPublicUnavailable(res, error);
  }
}

module.exports = {
  createPreviewLink,
  listPreviewLinks,
  revokePreviewLink,
  getPublicPreview,
  simulatePublicPreview
};
