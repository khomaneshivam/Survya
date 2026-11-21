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
      selectedItemId
    } = req.body || {};

    const data = inappRuntimeService.navigateSession(slug, {
      sessionToken,
      fromScreenKey,
      action,
      targetScreenKey,
      formValues,
      selectedItemId
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      fieldErrors: err.fieldErrors || undefined
    });
  }
}

module.exports = {
  getExperience,
  handleSession,
  getCatalog,
  handleNavigate
};
