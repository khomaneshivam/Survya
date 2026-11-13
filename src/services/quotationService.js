const { db } = require("../config/database");
const metaWhatsAppService = require("./metaWhatsAppService");

/**
 * Generate sequential Quote Number: Q-YYYY-XXXX
 */
function generateQuoteNumber(tenantId = 1) {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const countRow = db.prepare(`
    SELECT COUNT(*) as c FROM quotes WHERE tenant_id = ? AND quote_number LIKE ?
  `).get(tenantId, `${prefix}%`);
  const seq = (countRow?.c || 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/**
 * Audit log helper
 */
function logAudit(tenantId, userId, action, targetId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenantId || 1, userId || null, action, String(targetId || ""), details ? JSON.stringify(details) : null);
  } catch (e) {}
}

/**
 * Create a new quotation for an enquiry (PRD Section 8: POST /api/v1/enquiries/{id}/quotes)
 */
function createQuote(tenantId = 1, enquiryId, quoteData = {}, userId = "system") {
  const enquiry = db.prepare(`
    SELECT e.*, c.phone_e164, c.name as contact_name
    FROM booking_enquiries e
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.tenant_id = ? AND e.id = ?
  `).get(tenantId, enquiryId);

  if (!enquiry) {
    throw new Error("Enquiry not found.");
  }

  const {
    items = [],
    currency = "INR",
    tax_rate = 0.12, // Default 12% GST for budget/mid hotels (<7500)
    valid_until = null,
    notes = "Includes complimentary welcome beverage, breakfast buffet & beach access."
  } = quoteData;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one quotation line item is required.");
  }

  // Calculate default validity if missing: 3 days from now
  let validDate = valid_until;
  if (!validDate) {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    validDate = d.toISOString().split("T")[0];
  }

  // Calculate subtotal
  let subtotal = 0;
  const processedItems = [];

  for (const item of items) {
    const desc = String(item.description || "Room Stay").trim();
    const qty = Math.max(1, Number(item.quantity) || 1);
    const nights = Math.max(1, Number(item.nights) || 1);
    const rate = Math.max(0, Number(item.unit_rate) || 0);
    const amount = Number((qty * nights * rate).toFixed(2));
    subtotal += amount;

    processedItems.push({
      room_type_id: item.room_type_id ? Number(item.room_type_id) : null,
      description: desc,
      quantity: qty,
      nights: nights,
      unit_rate: rate,
      amount: amount
    });
  }

  const taxTotal = quoteData.tax_total !== undefined 
    ? Number(Number(quoteData.tax_total).toFixed(2))
    : Number((subtotal * Number(tax_rate)).toFixed(2));
  const total = Number((subtotal + taxTotal).toFixed(2));
  const quoteNumber = generateQuoteNumber(tenantId);

  db.exec("BEGIN TRANSACTION;");
  let quoteId = null;
  try {
    const res = db.prepare(`
      INSERT INTO quotes (
        tenant_id, enquiry_id, quote_number, currency, subtotal, tax_total, total,
        valid_until, status, created_by, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      enquiryId,
      quoteNumber,
      currency.toUpperCase(),
      subtotal,
      taxTotal,
      total,
      validDate,
      userId,
      notes
    );

    quoteId = res.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO quote_items (tenant_id, quote_id, room_type_id, description, quantity, nights, unit_rate, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of processedItems) {
      insertItem.run(
        tenantId,
        quoteId,
        item.room_type_id,
        item.description,
        item.quantity,
        item.nights,
        item.unit_rate,
        item.amount
      );
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  logAudit(tenantId, userId, "QUOTE_CREATED", quoteId, {
    enquiry_id: enquiryId,
    quote_number: quoteNumber,
    total
  });

  return getQuoteById(tenantId, quoteId);
}

/**
 * Get Quote by ID (PRD Section 8)
 */
function getQuoteById(tenantId = 1, id) {
  const quote = db.prepare(`
    SELECT q.*, 
           e.guest_name, e.phone_e164 as guest_phone, e.check_in, e.check_out, e.adults, e.children,
           u.name as created_by_name
    FROM quotes q
    JOIN booking_enquiries e ON q.enquiry_id = e.id
    LEFT JOIN users u ON q.created_by = u.id
    WHERE q.tenant_id = ? AND q.id = ?
  `).get(tenantId, id);

  if (!quote) return null;

  quote.items = db.prepare(`
    SELECT * FROM quote_items WHERE tenant_id = ? AND quote_id = ? ORDER BY id ASC
  `).all(tenantId, id);

  return quote;
}

/**
 * Format quotation text message for WhatsApp
 */
function formatWhatsAppQuotationMessage(quote) {
  const currencySymbol = quote.currency === "INR" ? "₹" : quote.currency;

  let linesSummary = quote.items.map(it => {
    return `• ${it.description} (Qty: ${it.quantity}, ${it.nights} night${it.nights > 1 ? "s" : ""}) @ ${currencySymbol}${it.unit_rate.toLocaleString("en-IN")}/night = ${currencySymbol}${it.amount.toLocaleString("en-IN")}`;
  }).join("\n");

  return `📋 *KonkanTrip Beach Resort & Spa*
*Booking Quotation #${quote.quote_number}*
────────────────────────
Dear *${quote.guest_name}*,

Thank you for your booking enquiry! Below is your personalized stay quotation:

📅 *Stay Dates:* ${quote.check_in} to ${quote.check_out}
👥 *Guests:* ${quote.adults} Adults${quote.children > 0 ? `, ${quote.children} Children` : ""}

🏨 *Itemized Breakdown:*
${linesSummary}

────────────────────────
*Subtotal:* ${currencySymbol}${quote.subtotal.toLocaleString("en-IN")}
*GST & Taxes:* ${currencySymbol}${quote.tax_total.toLocaleString("en-IN")}
*Total Estimated Amount: ${currencySymbol}${quote.total.toLocaleString("en-IN")}*
────────────────────────
⏳ *Valid Until:* ${quote.valid_until}
📝 *Inclusions & Notes:* ${quote.notes || "Breakfast buffet, swimming pool access & high-speed Wi-Fi included."}

⚠️ _Note: Room availability is indicative and held only upon advance booking confirmation. To confirm this stay or request adjustments, simply reply directly to this message._`;
}

/**
 * Send Quotation via WhatsApp (PRD Section 8: POST /api/v1/quotes/{id}/send)
 */
async function sendQuoteViaWhatsApp(tenantId = 1, quoteId, userId = "system") {
  const quote = getQuoteById(tenantId, quoteId);
  if (!quote) {
    throw new Error("Quotation not found.");
  }

  const messageText = formatWhatsAppQuotationMessage(quote);
  const recipientPhone = quote.guest_phone;

  // Send message through metaWhatsAppService
  const sendResult = await metaWhatsAppService.sendTextMessage({ to: recipientPhone, body: messageText });

  // Update Quote status to SENT
  db.prepare(`
    UPDATE quotes 
    SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND id = ?
  `).run(tenantId, quoteId);

  // Update Enquiry status to QUOTED if still NEW or QUALIFIED
  db.prepare(`
    UPDATE booking_enquiries
    SET status = 'QUOTED', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND id = ? AND status IN ('NEW', 'QUALIFIED')
  `).run(tenantId, quote.enquiry_id);

  // Record outbound message in customer_replies for 2-Way Inbox traceability
  try {
    db.prepare(`
      INSERT INTO customer_replies (
        from_phone, customer_name, message_type, message_body, reply_text, reply_sent_at, reply_status, user_id
      ) VALUES (?, ?, 'text', '[System Quotation Sent]', ?, CURRENT_TIMESTAMP, 'SENT', ?)
    `).run(recipientPhone, quote.guest_name, messageText, userId);
  } catch (e) {}

  logAudit(tenantId, userId, "QUOTE_SENT_WHATSAPP", quoteId, {
    recipient: recipientPhone,
    quote_number: quote.quote_number,
    total: quote.total,
    meta_response: sendResult
  });

  return {
    success: true,
    quote: getQuoteById(tenantId, quoteId),
    meta_result: sendResult
  };
}

module.exports = {
  createQuote,
  getQuoteById,
  formatWhatsAppQuotationMessage,
  sendQuoteViaWhatsApp
};
