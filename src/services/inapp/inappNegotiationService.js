const { db } = require("../../config/database");
const inappRuntimeService = require("./inappRuntimeService");
const inappSseManager = require("./inappSseManager");
const crmPipelineService = require("../crmPipelineService");

/**
 * Interactive Rate Discussion & Negotiation Engine
 */

/**
 * Customer submits a rate offer
 */
function submitOffer(slug, {
  sessionToken,
  catalogItemId,
  quantity = 1,
  customerOfferPrice,
  notes
} = {}) {
  const { experience, screens } = inappRuntimeService.getPublicExperience(slug);

  if (!sessionToken) {
    const err = new Error("sessionToken is required");
    err.statusCode = 400;
    throw err;
  }

  const session = db.prepare(`
    SELECT * FROM inapp_sessions
    WHERE session_token = ? AND experience_id = ? AND delete_status = 0
  `).get(sessionToken.trim(), experience.id);

  if (!session) {
    const err = new Error("Session expired or invalid. Please refresh.");
    err.statusCode = 401;
    throw err;
  }

  const offer = Number(customerOfferPrice);
  if (isNaN(offer) || offer <= 0) {
    const err = new Error("Valid customer offer price is required");
    err.statusCode = 400;
    throw err;
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  // 1. Resolve Item Base Price & Title
  let itemTitle = "Custom Item";
  let baseUnitPrice = 0;
  let taxRate = 18;

  if (experience.domainType === "HOSPITALITY") {
    const room = db.prepare("SELECT * FROM room_types WHERE id = ?").get(catalogItemId);
    if (room) {
      itemTitle = room.name;
      baseUnitPrice = Number(room.base_rate) || 0;
      taxRate = 18;
    } else {
      const catItem = db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(catalogItemId);
      if (catItem) {
        itemTitle = catItem.title;
        baseUnitPrice = Number(catItem.base_price) || 0;
        taxRate = Number(catItem.tax_rate) || 18;
      }
    }
  } else {
    const catItem = db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(catalogItemId);
    if (catItem) {
      itemTitle = catItem.title;
      baseUnitPrice = Number(catItem.base_price) || 0;
      taxRate = Number(catItem.tax_rate) || 18;
    }
  }

  if (baseUnitPrice <= 0) {
    baseUnitPrice = offer; // fallback if dynamic or custom item
  }

  // 2. Resolve Negotiation Thresholds from Screen Config
  const negScreen = screens.find(s => s.screenType === "RATE_NEGOTIATION");
  const config = negScreen?.config || experience.features?.negotiationConfig || {};

  const autoApprovePercent = Number(config.autoApprovePercent) || 90; // >= 90% is auto-approved
  const floorPricePercent = Number(config.floorPricePercent) || 75;   // < 75% is rejected
  const quoteValidityHours = Number(config.quoteValidityHours) || 24;

  const autoApprovePrice = Math.round(baseUnitPrice * (autoApprovePercent / 100));
  const floorPrice = Math.round(baseUnitPrice * (floorPricePercent / 100));

  // 3. Evaluate 3 Deterministic Outcomes
  // OUTCOME 3: Below Floor Price Rejection
  if (offer < floorPrice) {
    return {
      success: true,
      status: "OFFER_TOO_LOW",
      itemTitle,
      baseUnitPrice,
      customerOfferPrice: offer,
      suggestedMinPrice: floorPrice,
      message: `We cannot accept offers below ₹${floorPrice.toLocaleString("en-IN")}. Please adjust your offer or request a manager callback.`
    };
  }

  // Calculate quote amounts
  const subtotal = offer * qty;
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const grandTotal = subtotal + taxAmount;

  // OUTCOME 1: Auto-Approve (offer >= autoApprovePrice)
  if (offer >= autoApprovePrice) {
    const validUntil = new Date(Date.now() + quoteValidityHours * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

    const res = db.prepare(`
      INSERT INTO inapp_rate_negotiations (
        tenant_id, experience_id, session_id, catalog_item_id, item_title,
        quantity, base_unit_price, customer_offer_price, approved_final_price,
        notes, status, valid_until, active_status, delete_status,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, 'AUTO_APPROVED', ?, 1, 0,
        'SYSTEM_AUTO_APPROVE', 'SYSTEM_AUTO_APPROVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      experience.tenant_id || 1,
      experience.id,
      session.id,
      catalogItemId || null,
      itemTitle,
      qty,
      baseUnitPrice,
      offer,
      offer,
      notes || "Auto-approved by system threshold",
      validUntil
    );

    const negotiationId = res.lastInsertRowid;

    // Update session stateData with negotiation info
    updateSessionNegotiationState(session.id, {
      negotiationId,
      negotiationStatus: "AUTO_APPROVED",
      negotiatedItemTitle: itemTitle,
      approvedFinalPrice: offer,
      quantity: qty,
      subtotal,
      taxAmount,
      grandTotal
    });

    // Notify Staff
    inappSseManager.notifyStaff("inapp:negotiation", {
      negotiationId,
      experienceId: experience.id,
      experienceName: experience.name,
      visitorName: session.visitor_name,
      visitorPhone: session.visitor_phone,
      itemTitle,
      status: "AUTO_APPROVED",
      finalPrice: offer,
      grandTotal
    });

    return {
      success: true,
      status: "AUTO_APPROVED",
      negotiationId,
      itemTitle,
      baseUnitPrice,
      customerOfferPrice: offer,
      approvedFinalPrice: offer,
      quantity: qty,
      subtotal,
      taxRate,
      taxAmount,
      gstAmount: taxAmount,
      grandTotal,
      validUntil,
      message: "Congratulations! Your offer has been auto-approved."
    };
  }

  // OUTCOME 2: Pending Agent Review (floorPrice <= offer < autoApprovePrice)
  const res = db.prepare(`
    INSERT INTO inapp_rate_negotiations (
      tenant_id, experience_id, session_id, catalog_item_id, item_title,
      quantity, base_unit_price, customer_offer_price, approved_final_price,
      notes, status, active_status, delete_status,
      created_by, updated_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, NULL,
      ?, 'PENDING_AGENT', 1, 0,
      'VISITOR', 'VISITOR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    experience.tenant_id || 1,
    experience.id,
    session.id,
    catalogItemId || null,
    itemTitle,
    qty,
    baseUnitPrice,
    offer,
    notes || null
  );

  const negotiationId = res.lastInsertRowid;

  // Update session stateData
  updateSessionNegotiationState(session.id, {
    negotiationId,
    negotiationStatus: "PENDING_AGENT",
    negotiatedItemTitle: itemTitle,
    customerOfferPrice: offer,
    quantity: qty,
    subtotal,
    taxAmount,
    grandTotal
  });

  // Broadcast alert to Staff Inbox
  inappSseManager.notifyStaff("inapp:negotiation", {
    negotiationId,
    experienceId: experience.id,
    experienceName: experience.name,
    visitorName: session.visitor_name,
    visitorPhone: session.visitor_phone,
    itemTitle,
    baseUnitPrice,
    customerOfferPrice: offer,
    discountPercent: Math.round(((baseUnitPrice - offer) / baseUnitPrice) * 100),
    status: "PENDING_AGENT",
    grandTotal
  });

  return {
    success: true,
    status: "PENDING_AGENT",
    negotiationId,
    itemTitle,
    baseUnitPrice,
    customerOfferPrice: offer,
    quantity: qty,
    subtotal,
    taxRate,
    taxAmount,
    gstAmount: taxAmount,
    grandTotal,
    message: "Your offer has been submitted and is currently being reviewed by our manager."
  };
}

/**
 * Retrieve current negotiation state for visitor
 */
function getNegotiation(slug, negotiationId, sessionToken) {
  const { experience } = inappRuntimeService.getPublicExperience(slug);

  const row = db.prepare(`
    SELECT n.*, s.session_token
    FROM inapp_rate_negotiations n
    JOIN inapp_sessions s ON s.id = n.session_id
    WHERE n.id = ? AND n.experience_id = ? AND n.delete_status = 0
  `).get(negotiationId, experience.id);

  if (!row) {
    const err = new Error("Negotiation not found");
    err.statusCode = 404;
    throw err;
  }

  if (sessionToken && row.session_token !== sessionToken.trim()) {
    const err = new Error("Unauthorized to access this negotiation");
    err.statusCode = 403;
    throw err;
  }

  const effectivePrice = Number(row.approved_final_price || row.agent_counter_price || row.customer_offer_price || 0);
  const qty = Number(row.quantity) || 1;
  const subtotal = effectivePrice * qty;
  const taxRate = 18;
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const grandTotal = subtotal + taxAmount;

  return {
    id: row.id,
    status: row.status,
    itemTitle: row.item_title,
    baseUnitPrice: Number(row.base_unit_price),
    customerOfferPrice: Number(row.customer_offer_price),
    agentCounterPrice: row.agent_counter_price ? Number(row.agent_counter_price) : null,
    approvedFinalPrice: row.approved_final_price ? Number(row.approved_final_price) : null,
    quantity: qty,
    subtotal,
    taxRate,
    taxAmount,
    gstAmount: taxAmount,
    grandTotal,
    notes: row.notes,
    validUntil: row.valid_until,
    updatedAt: row.updated_at
  };
}

/**
 * Customer responds to negotiation (ACCEPT or COUNTER)
 */
function respondToNegotiation(slug, negotiationId, {
  sessionToken,
  response = "ACCEPT",
  counterPrice,
  notes
} = {}) {
  const current = getNegotiation(slug, negotiationId, sessionToken);
  const { experience } = inappRuntimeService.getPublicExperience(slug);

  if (response === "ACCEPT") {
    const finalPrice = current.agentCounterPrice || current.customerOfferPrice;
    const finalGrandTotal = current.grandTotal;

    db.prepare(`
      UPDATE inapp_rate_negotiations
      SET status = 'ACCEPTED',
          approved_final_price = ?,
          notes = COALESCE(?, notes),
          updated_by = 'VISITOR_ACCEPT',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalPrice, notes || "Offer accepted by customer", negotiationId);

    // If session has linked CRM record, update deal value and mark WON/QUALIFIED
    const session = db.prepare(`
      SELECT s.* FROM inapp_sessions s
      JOIN inapp_rate_negotiations n ON n.session_id = s.id
      WHERE n.id = ?
    `).get(negotiationId);

    if (session?.crm_record_id) {
      try {
        crmPipelineService.updateRecord(session.crm_record_id, {
          dealValue: finalGrandTotal,
          stageKey: "WON"
        }, experience.tenant_id || 1);
      } catch (crmErr) {
        console.warn("[inappNegotiationService] CRM update error:", crmErr.message);
      }
    }

    inappSseManager.notifyStaff("inapp:negotiation", {
      negotiationId,
      status: "ACCEPTED",
      approvedFinalPrice: finalPrice,
      grandTotal: finalGrandTotal
    });

    return {
      success: true,
      status: "ACCEPTED",
      negotiationId,
      approvedFinalPrice: finalPrice,
      grandTotal: finalGrandTotal,
      message: "Rate confirmed and locked! Our team has been notified."
    };
  }

  if (response === "COUNTER") {
    const counterOffer = Number(counterPrice);
    if (isNaN(counterOffer) || counterOffer <= 0) {
      const err = new Error("Valid counter price required");
      err.statusCode = 400;
      throw err;
    }

    db.prepare(`
      UPDATE inapp_rate_negotiations
      SET customer_offer_price = ?,
          status = 'PENDING_AGENT',
          notes = COALESCE(?, notes),
          updated_by = 'VISITOR_COUNTER',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(counterOffer, notes || null, negotiationId);

    inappSseManager.notifyStaff("inapp:negotiation", {
      negotiationId,
      status: "PENDING_AGENT",
      customerOfferPrice: counterOffer
    });

    return {
      success: true,
      status: "PENDING_AGENT",
      negotiationId,
      customerOfferPrice: counterOffer,
      message: "Your new counter-offer has been sent to our manager."
    };
  }

  const err = new Error("Invalid response type. Must be ACCEPT or COUNTER.");
  err.statusCode = 400;
  throw err;
}

/**
 * AGENT API: List active negotiations for tenant
 */
function listNegotiations(tenantId = 1, { status, experienceId, phone, limit = 50 } = {}) {
  let query = `
    SELECT n.*, e.name as experience_name, e.slug as experience_slug,
           s.session_token, s.visitor_phone, s.visitor_name, s.visitor_email
    FROM inapp_rate_negotiations n
    JOIN inapp_experiences e ON e.id = n.experience_id
    LEFT JOIN inapp_sessions s ON s.id = n.session_id
    WHERE n.tenant_id = ? AND n.delete_status = 0
  `;
  const params = [tenantId];

  if (phone) {
    const cleanPhone = String(phone).replace(/\D/g, "");
    query += " AND (s.visitor_phone LIKE ? OR s.visitor_phone = ?)";
    params.push(`%${cleanPhone}%`, cleanPhone);
  }

  if (status && status !== "ALL") {
    query += " AND n.status = ?";
    params.push(status);
  }

  if (experienceId) {
    query += " AND n.experience_id = ?";
    params.push(experienceId);
  }

  query += " ORDER BY n.updated_at DESC LIMIT ?";
  params.push(Number(limit));

  return db.prepare(query).all(...params);
}

/**
 * AGENT API: Agent takes action (APPROVE, COUNTER, REJECT)
 */
function agentAction(tenantId = 1, negotiationId, {
  action = "APPROVE",
  counterPrice,
  agentNote,
  userId = "agent"
} = {}) {
  const row = db.prepare(`
    SELECT n.*, s.session_token, e.slug as experience_slug
    FROM inapp_rate_negotiations n
    JOIN inapp_experiences e ON e.id = n.experience_id
    LEFT JOIN inapp_sessions s ON s.id = n.session_id
    WHERE n.id = ? AND n.tenant_id = ? AND n.delete_status = 0
  `).get(negotiationId, tenantId);

  if (!row) {
    const err = new Error("Negotiation not found");
    err.statusCode = 404;
    throw err;
  }

  let newStatus = "AGENT_APPROVED";
  let approvedFinalPrice = row.approved_final_price;
  let agentCounterPrice = row.agent_counter_price;

  if (action === "APPROVE") {
    newStatus = "AGENT_APPROVED";
    approvedFinalPrice = row.customer_offer_price;
  } else if (action === "COUNTER") {
    newStatus = "AGENT_COUNTERED";
    agentCounterPrice = Number(counterPrice);
    if (isNaN(agentCounterPrice) || agentCounterPrice <= 0) {
      const err = new Error("Valid counterPrice is required for COUNTER action");
      err.statusCode = 400;
      throw err;
    }
  } else if (action === "REJECT") {
    newStatus = "AGENT_REJECTED";
  }

  db.prepare(`
    UPDATE inapp_rate_negotiations
    SET status = ?,
        approved_final_price = ?,
        agent_counter_price = ?,
        notes = COALESCE(?, notes),
        assigned_user_id = COALESCE(?, assigned_user_id),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    newStatus,
    approvedFinalPrice || null,
    agentCounterPrice || null,
    agentNote || null,
    userId,
    userId,
    negotiationId
  );

  const updated = db.prepare("SELECT * FROM inapp_rate_negotiations WHERE id = ?").get(negotiationId);

  // Push real-time SSE update directly to customer browser!
  if (row.session_token) {
    inappSseManager.sendToVisitor(row.session_token, "negotiation_updated", {
      negotiationId,
      status: newStatus,
      approvedFinalPrice,
      agentCounterPrice,
      agentNote,
      updatedAt: updated.updated_at
    });
  }

  return {
    success: true,
    data: updated
  };
}

function updateSessionNegotiationState(sessionId, stateUpdate) {
  try {
    const session = db.prepare("SELECT state_data_json FROM inapp_sessions WHERE id = ?").get(sessionId);
    if (!session) return;
    const curState = JSON.parse(session.state_data_json || "{}");
    const merged = { ...curState, ...stateUpdate };
    db.prepare(`
      UPDATE inapp_sessions
      SET state_data_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(merged), sessionId);
  } catch (err) {
    console.warn("[inappNegotiationService] updateSessionNegotiationState warning:", err.message);
  }
}

module.exports = {
  submitOffer,
  getNegotiation,
  respondToNegotiation,
  listNegotiations,
  agentAction
};
