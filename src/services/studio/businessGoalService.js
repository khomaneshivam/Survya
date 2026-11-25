const crypto = require("crypto");
const { db } = require("../../config/database");
const universalPricingService = require("../universal/universalPricingService");
const emailNotificationService = require("./emailNotificationService");

const GOAL_EVENT_MAP = Object.freeze({
  LEAD_QUALIFICATION: "LeadQualified",
  BOOKING_REQUESTED: "BookingRequested",
  BOOKING_CONFIRMED: "BookingConfirmed",
  APPOINTMENT_CONFIRMED: "AppointmentConfirmed",
  ORDER_PLACED: "OrderPlaced",
  QUOTATION_REQUESTED: "QuotationRequested",
  QUOTATION_ACCEPTED: "QuotationAccepted",
  PROPERTY_ENQUIRY: "LeadQualified",
  REGISTRATION_COMPLETED: "RegistrationCompleted",
  PAYMENT_VERIFIED: "PaymentVerified",
  DEAL_CLOSED: "DealClosed"
});

function resolveAuthoritativeTotal(tenantId, experience, stateData = {}) {
  // Never trust client-submitted price/total fields — compute server-side!
  const itemId = Number(stateData.selectedItemId || stateData.catalog_item_id || 0);
  const qty = Math.max(1, Number(stateData.quantity || 1));

  if (itemId > 0) {
    try {
      const quote = universalPricingService.calculateCartQuote(tenantId, {
        items: [{
          itemId,
          quantity: qty
        }],
        addOns: Array.isArray(stateData.selectedAddons) ? stateData.selectedAddons : [],
        checkIn: stateData.check_in || null,
        checkOut: stateData.check_out || null,
        promoCode: stateData.promo_code || null
      });
      if (quote && Number(quote.grandTotal) > 0) {
        return {
          grandTotal: Number(quote.grandTotal) || 0,
          currency: quote.currency || "INR",
          breakdown: quote
        };
      }
    } catch (_) {
      // Fallback to direct DB lookup below if universal catalog item isn't matched
    }

    if (experience?.domain_type === "HOSPITALITY") {
      const room = db.prepare("SELECT base_rate FROM room_types WHERE id = ? AND tenant_id = ?").get(itemId, tenantId);
      if (room) {
        return { grandTotal: Number(room.base_rate || 0) * qty, currency: "INR", breakdown: null };
      }
    } else {
      const item = db.prepare("SELECT base_price, tax_rate FROM catalog_items WHERE id = ? AND tenant_id = ?").get(itemId, tenantId);
      if (item) {
        const sub = Number(item.base_price || 0) * qty;
        const tax = Number(((sub * Number(item.tax_rate || 0)) / 100).toFixed(2));
        return { grandTotal: sub + tax, currency: "INR", breakdown: { subtotal: sub, taxAmount: tax, grandTotal: sub + tax } };
      }
    }
  }

  return { grandTotal: 0, currency: "INR", breakdown: null };
}

/**
 * Completes an experience Business Goal idempotently, records domain outcome,
 * updates session goal status, and enqueues durable business email notifications.
 */
function recordGoalCompletion({
  tenantId = 1,
  experience,
  session = null,
  stateData = {},
  goalTypeOverride = null,
  eventNameOverride = null,
  referenceCode = null,
  idempotencyKey = null
} = {}) {
  const numericTenantId = Number(tenantId) || Number(experience?.tenant_id) || 1;
  if (!experience || !experience.id) {
    throw new Error("experience is required for goal completion");
  }

  // Strictly block side effects in isolated demo mode
  if (session?.demo_mode || stateData?.demoMode) {
    return {
      completed: true,
      demoMode: true,
      eventName: GOAL_EVENT_MAP[experience.goal_type || "LEAD_QUALIFICATION"] || "LeadQualified",
      referenceCode: `DEMO-${crypto.randomBytes(3).toString("hex").toUpperCase()}`
    };
  }

  const goalType = String(goalTypeOverride || experience.goal_type || "LEAD_QUALIFICATION").toUpperCase();
  const eventName = eventNameOverride || GOAL_EVENT_MAP[goalType] || "LeadQualified";
  const cleanIdempotency = String(
    idempotencyKey
    || (session?.id ? `goal_sess_${session.id}_${eventName}` : `goal_exp_${experience.id}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`)
  );

  const existing = db.prepare("SELECT * FROM business_goal_outcomes WHERE idempotency_key = ?").get(cleanIdempotency);
  if (existing) {
    return {
      completed: true,
      deduplicated: true,
      outcomeId: existing.id,
      eventName: existing.event_name,
      referenceCode: existing.reference_code,
      monetaryValue: Number(existing.monetary_value || 0)
    };
  }

  const pricing = resolveAuthoritativeTotal(numericTenantId, experience, stateData);
  const finalRef = referenceCode
    || stateData.referenceCode
    || stateData.transaction_ref
    || `SRV-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const customerPhone = session?.visitor_phone || stateData.phone || stateData.contact_phone || null;
  const customerName = session?.visitor_name || stateData.name || stateData.contact_name || "Customer";
  const customerEmail = session?.visitor_email || stateData.email || stateData.contact_email || null;

  const summary = {
    selectedItemTitle: stateData.selectedItemTitle || null,
    quantity: Number(stateData.quantity || 1),
    checkIn: stateData.check_in || null,
    checkOut: stateData.check_out || null,
    selectedSlot: stateData.selected_slot || null,
    selectedDate: stateData.selected_date || null,
    breakdown: pricing.breakdown || null
  };

  const ins = db.prepare(`
    INSERT INTO business_goal_outcomes (
      tenant_id, experience_id, session_id, flow_session_id,
      goal_type, event_name, idempotency_key,
      customer_phone, customer_name, customer_email,
      summary_json, reference_code, monetary_value, currency, status, achieved_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, 'COMPLETED', UTC_TIMESTAMP()
    )
  `).run(
    numericTenantId,
    experience.id,
    session?.id || null,
    session?.flow_session_id || null,
    goalType,
    eventName,
    cleanIdempotency,
    customerPhone,
    customerName,
    customerEmail,
    JSON.stringify(summary),
    finalRef,
    pricing.grandTotal,
    pricing.currency
  );

  const outcomeId = ins.lastInsertRowid;

  if (session?.id) {
    db.prepare(`
      UPDATE inapp_sessions
      SET goal_status = 'COMPLETED',
          status = 'COMPLETED',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(session.id);
  }

  // Enqueue durable email notification (respects tenant settings & experience goal_config_json)
  let expRecipients = [];
  try {
    const gCfg = typeof experience.goal_config_json === "string"
      ? JSON.parse(experience.goal_config_json || "{}")
      : (experience.goal_config_json || {});
    if (Array.isArray(gCfg.notifyEmails)) expRecipients = gCfg.notifyEmails;
  } catch (_) {}

  const emailRes = emailNotificationService.enqueueGoalEmailNotification({
    tenantId: numericTenantId,
    experienceId: experience.id,
    goalOutcomeId: outcomeId,
    eventName,
    idempotencyKey: `email_${cleanIdempotency}`,
    explicitRecipients: expRecipients,
    payload: {
      experienceName: experience.name,
      referenceCode: finalRef,
      customerName,
      customerPhone,
      customerEmail,
      selectedItemTitle: stateData.selectedItemTitle || null,
      datesSummary: stateData.check_in ? `${stateData.check_in} to ${stateData.check_out || ""}` : (stateData.selected_date || null),
      monetaryValue: pricing.grandTotal,
      currency: pricing.currency
    }
  });

  return {
    completed: true,
    outcomeId,
    goalType,
    eventName,
    referenceCode: finalRef,
    monetaryValue: pricing.grandTotal,
    currency: pricing.currency,
    emailNotification: emailRes
  };
}

function listGoalOutcomes(tenantId = 1, { experienceId = null, limit = 50 } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT b.*, e.name as experience_name, e.slug as experience_slug
    FROM business_goal_outcomes b
    JOIN inapp_experiences e ON e.id = b.experience_id
    WHERE b.tenant_id = ?
  `;
  const params = [numericTenantId];
  const numericExpId = Number(experienceId);
  if (experienceId && Number.isFinite(numericExpId) && numericExpId > 0) {
    sql += " AND b.experience_id = ?";
    params.push(numericExpId);
  }
  sql += " ORDER BY b.id DESC LIMIT ?";
  params.push(Math.max(1, Math.min(200, Number(limit) || 50)));
  return db.prepare(sql).all(...params);
}

module.exports = {
  GOAL_EVENT_MAP,
  resolveAuthoritativeTotal,
  recordGoalCompletion,
  listGoalOutcomes
};
