const inappRuntimeService = require("../services/inapp/inappRuntimeService");

/**
 * Controller for public unauthenticated runtime endpoints (/api/v1/public/x/:slug)
 */

async function getExperience(req, res) {
  try {
    const { slug } = req.params;
    const data = inappRuntimeService.getPublicExperience(slug);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const statusCode = err.statusCode || (err.message.includes("not found") ? 404 : 500);
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      status: err.status || undefined
    });
  }
}

async function handleSession(req, res) {
  try {
    const { slug } = req.params;
    const { sessionToken, contactPhone, contactName, initialData } = req.body || {};
    const data = inappRuntimeService.startOrResumeSession(slug, {
      sessionToken,
      contactPhone,
      contactName,
      initialData
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
}

async function getCatalog(req, res) {
  try {
    const { slug } = req.params;
    const result = inappRuntimeService.getCatalogItems(slug, req.query);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
}

async function handleNavigate(req, res) {
  try {
    const { slug } = req.params;
    const {
      sessionToken,
      fromScreenKey,
      action,
      targetScreenKey,
      formValues,
      selectedItemId,
      expectedLockVersion
    } = req.body || {};

    const data = inappRuntimeService.navigateSession(slug, {
      sessionToken,
      fromScreenKey,
      action,
      targetScreenKey,
      formValues,
      selectedItemId,
      expectedLockVersion
    });

    if (data && data.goalStatus === "COMPLETED") {
      try {
        const waConf = await inappRuntimeService.dispatchWhatsappConfirmation(
          sessionToken,
          data,
          { isSimulation: Boolean(req.body?.isSimulation) }
        );
        data.whatsappConfirmation = waConf;
        if (waConf?.success && data.stateData) {
          data.stateData.whatsapp_confirmation_sent = true;
          if (waConf.body) data.stateData.whatsapp_confirmation_text = waConf.body;
        }
      } catch (_) {}
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: err.code || undefined,
      message: err.message,
      fieldErrors: err.fieldErrors || undefined
    });
  }
}

async function redeemContinuation(req, res) {
  try {
    const { slug } = req.params;
    const { ct, token, continuationToken } = req.body || {};
    const rawToken = ct || token || continuationToken || req.query?.ct;
    const data = inappRuntimeService.redeemContinuation(slug, rawToken);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: err.code || undefined,
      message: err.message
    });
  }
}

async function switchChannel(req, res) {
  try {
    const { slug } = req.params;
    const { sessionToken, targetChannel, note } = req.body || {};
    const data = inappRuntimeService.switchChannelOwner(slug, {
      sessionToken,
      targetChannel,
      note
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message
    });
  }
}

module.exports = {
  getExperience,
  handleSession,
  getCatalog,
  handleNavigate,
  redeemContinuation,
  switchChannel
};

