const { db, getSetting } = require("../../config/database");

const OCT_2026_DEFAULT_RATES = {
  MARKETING: 0.8631,
  UTILITY: 0.1150,
  AUTHENTICATION: 0.1150,
  SERVICE_STANDARD: 0.1150,
  SERVICE_FREE_TIER_LIMIT: 1000,
  GST_PERCENT: 18.0
};

/**
 * Returns the configured base rates for India (INR).
 */
function getBaseRates() {
  return {
    MARKETING: parseFloat(getSetting("META_MARKETING_RATE_INR") || OCT_2026_DEFAULT_RATES.MARKETING),
    UTILITY: parseFloat(getSetting("META_UTILITY_RATE_INR") || OCT_2026_DEFAULT_RATES.UTILITY),
    AUTHENTICATION: parseFloat(getSetting("META_AUTH_RATE_INR") || OCT_2026_DEFAULT_RATES.AUTHENTICATION),
    SERVICE: 0.0, // Free tier default
    SERVICE_OVERAGE: parseFloat(getSetting("META_SERVICE_RATE_INR") || OCT_2026_DEFAULT_RATES.SERVICE_STANDARD),
    FREE_SERVICE_LIMIT: parseInt(getSetting("META_FREE_SERVICE_MESSAGES_MONTHLY") || OCT_2026_DEFAULT_RATES.SERVICE_FREE_TIER_LIMIT, 10),
    GST_PERCENT: parseFloat(getSetting("GST_PERCENT") || OCT_2026_DEFAULT_RATES.GST_PERCENT)
  };
}

/**
 * Counts total billable service messages in the current calendar month for a given phone_number_id.
 * Excludes waived messages.
 */
function getMonthlyServiceMessageCount(phoneNumberId = null, tenantId = 1) {
  try {
    let sql = `
      SELECT COUNT(*) as cnt
      FROM whatsapp_usage_ledger
      WHERE UPPER(category) = 'SERVICE'
        AND billing_status != 'WAIVED'
        AND created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01 00:00:00')
    `;
    const params = [];
    if (phoneNumberId) {
      sql += " AND phone_number_id = ?";
      params.push(String(phoneNumberId));
    }
    const row = db.prepare(sql).get(...params);
    return row ? Number(row.cnt || 0) : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Calculates per-message unit cost based on Meta category and phone_number_id.
 * Applies first 1,000 service replies free per calendar month per phone_number_id.
 */
function calculateUnitRate(category = "MARKETING", phoneNumberId = null, tenantId = 1) {
  const cat = String(category || "MARKETING").toUpperCase();
  const rates = getBaseRates();

  if (cat === "UTILITY") return rates.UTILITY;
  if (cat === "AUTHENTICATION" || cat === "AUTH") return rates.AUTHENTICATION;
  if (cat === "SERVICE" || cat === "TEXT" || cat === "CONVERSATION") {
    const currentCount = getMonthlyServiceMessageCount(phoneNumberId, tenantId);
    if (currentCount < rates.FREE_SERVICE_LIMIT) {
      return 0.0;
    }
    return rates.SERVICE_OVERAGE;
  }
  return rates.MARKETING;
}

/**
 * Calculates 18% GST breakdown on subtotal.
 */
function calculateGst(subtotalInr, customGstPercent = null) {
  const subtotal = Math.max(0, Number(subtotalInr || 0));
  const rates = getBaseRates();
  const gstPercent = customGstPercent !== null ? Number(customGstPercent) : rates.GST_PERCENT;
  const gstInr = parseFloat(((subtotal * gstPercent) / 100).toFixed(4));
  const totalInr = parseFloat((subtotal + gstInr).toFixed(4));

  return {
    subtotalInr: parseFloat(subtotal.toFixed(4)),
    gstPercent,
    gstInr,
    totalInr
  };
}

module.exports = {
  OCT_2026_DEFAULT_RATES,
  getBaseRates,
  getMonthlyServiceMessageCount,
  calculateUnitRate,
  calculateGst
};
