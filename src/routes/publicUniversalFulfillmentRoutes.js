const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const universalFulfillmentService = require("../services/universal/universalFulfillmentService");
const { db } = require("../config/database");

/**
 * Public Fulfillment Routes
 * - Printable GST Invoices & Receipts
 * - Hosted Sandbox Payment Gateway UI
 * - Razorpay Webhook Auto-Reconciler
 */

/**
 * GET /receipt/:referenceCode - Clean Printable GST Tax Invoice / Booking Voucher
 */
router.get(["/receipt/:referenceCode", "/public/receipt/:referenceCode"], async (req, res) => {
  try {
    const referenceCode = req.params.referenceCode;

    // Lookup transaction across all tenants by unique referenceCode
    const txnRow = db.prepare(`
      SELECT tenant_id FROM universal_transactions
      WHERE reference_code = ? AND delete_status = 0
    `).get(referenceCode);

    if (!txnRow) {
      return res.status(404).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px; color: #444;">
            <h2>Invoice / Voucher Not Found</h2>
            <p>The reference <strong>${escapeHtml(referenceCode)}</strong> does not exist or has expired.</p>
          </body>
        </html>
      `);
    }

    const txn = universalFulfillmentService.getTransactionByRef(txnRow.tenant_id, referenceCode);
    const tenant = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(txnRow.tenant_id) || {};

    const html = universalFulfillmentService.generatePrintableReceiptHtml(txn, txn.items || [], tenant);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    return res.status(500).send(`Server error: ${escapeHtml(err.message)}`);
  }
});

/**
 * GET /pay/:referenceCode - Hosted Interactive Payment & Sandbox Gateway Page
 */
router.get(["/pay/:referenceCode", "/public/pay/:referenceCode"], async (req, res) => {
  try {
    const referenceCode = req.params.referenceCode;
    const txnRow = db.prepare(`
      SELECT tenant_id FROM universal_transactions
      WHERE reference_code = ? AND delete_status = 0
    `).get(referenceCode);

    if (!txnRow) {
      return res.status(404).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px; color: #444;">
            <h2>Payment Link Expired or Not Found</h2>
            <p>This payment link is invalid or has expired.</p>
          </body>
        </html>
      `);
    }

    const txn = universalFulfillmentService.getTransactionByRef(txnRow.tenant_id, referenceCode);
    const tenant = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(txnRow.tenant_id) || {};

    const isAlreadyPaid = txn.payment_status === "PAID";
    const amountToPay = txn.deposit_due > 0 ? txn.deposit_due : txn.grand_total;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay ${escapeHtml(referenceCode)} - ${escapeHtml(tenant.name || "SARVYA Commerce")}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8F9FA; color: #171719; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; box-sizing: border-box; }
    .checkout-box { background: #FFFFFF; border-radius: 16px; border: 1px solid #E5E5E8; box-shadow: 0 10px 25px rgba(0,0,0,0.08); width: 100%; maxWidth: 440px; padding: 28px; }
    .brand-title { font-size: 1.25rem; font-weight: 800; color: #2F5219; }
    .ref-badge { font-size: 0.78rem; font-family: monospace; background: #EDF4E6; color: #2F5219; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 4px; }
    .amount-display { margin: 24px 0; background: #F8FAF5; border: 1px solid #C3D1AC; border-radius: 12px; padding: 18px; text-align: center; }
    .amount-num { font-size: 2rem; font-weight: 800; color: #2F5219; }
    .btn-pay { width: 100%; background: #2F5219; color: #FFFFFF; border: none; padding: 14px; border-radius: 10px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: background 0.15s; }
    .btn-pay:hover { background: #233e13; }
    .btn-receipt { width: 100%; background: #FFFFFF; color: #2F5219; border: 1.5px solid #2F5219; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 700; cursor: pointer; text-decoration: none; display: block; text-align: center; box-sizing: border-box; margin-top: 10px; }
    .paid-banner { background: #EDF4E6; color: #2F5219; padding: 14px; border-radius: 10px; text-align: center; font-weight: 700; margin-bottom: 16px; border: 1px solid #C3D1AC; }
  </style>
</head>
<body>
  <div class="checkout-box">
    <div style="text-align: center; margin-bottom: 20px;">
      <div class="brand-title">${escapeHtml(tenant.name || "SARVYA Commerce")}</div>
      <div class="ref-badge">Invoice: ${escapeHtml(referenceCode)}</div>
    </div>

    ${isAlreadyPaid ? `
      <div class="paid-banner">
        ✅ Payment Complete!
        <div style="font-size: 0.8rem; font-weight: 500; margin-top: 4px;">Thank you. Your reservation & order is confirmed.</div>
      </div>
      <a href="/api/v1/public/receipt/${escapeHtml(referenceCode)}" class="btn-receipt">📄 View GST Tax Invoice</a>
    ` : `
      <div class="amount-display">
        <div style="font-size: 0.85rem; color: #67676B;">Amount Payable</div>
        <div class="amount-num">₹${Number(amountToPay).toLocaleString("en-IN")}</div>
        <div style="font-size: 0.78rem; color: #67676B; margin-top: 4px;">Grand Total: ₹${Number(txn.grand_total).toLocaleString("en-IN")}</div>
      </div>

      <div style="margin-bottom: 20px; font-size: 0.85rem; color: #3A3A3E;">
        <div>Customer: <strong>${escapeHtml(txn.customer_name || "Valued Customer")}</strong></div>
        <div>Phone: <strong>+${escapeHtml(txn.customer_phone)}</strong></div>
        ${txn.service_date ? `<div>Date: <strong>${escapeHtml(txn.service_date)}</strong></div>` : ""}
      </div>

      <a href="/api/v1/public/receipt/${escapeHtml(referenceCode)}" class="btn-receipt">📄 View Invoice Details</a>

      <div style="font-size: 0.78rem; color: #52525B; text-align: center; margin-top: 16px; background: #F4F4F5; padding: 12px; border-radius: 10px;">
        Payment confirmation is updated automatically once verified by your payment provider webhook.
      </div>
    `}
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    return res.status(500).send(`Server error: ${escapeHtml(err.message)}`);
  }
});

/**
 * POST /pay/webhook/razorpay - Razorpay Webhook Auto-Reconciler (Fail-Closed HMAC-SHA256 verified)
 */
const ALLOWED_RAZORPAY_CAPTURE_EVENTS = new Set(["payment.captured", "payment_link.paid", "order.paid"]);

function resolveRazorpayWebhookSecrets(txnRow = null) {
  const secrets = [];
  if (txnRow?.tenant_id) {
    try {
      let rows = [];
      if (txnRow.master_location_id) {
        rows = db.prepare(`
          SELECT webhook_secret FROM merchant_payment_configs
          WHERE tenant_id = ? AND entity_id = ? AND webhook_secret IS NOT NULL AND webhook_secret != ''
        `).all(txnRow.tenant_id, txnRow.master_location_id);
      }
      if (rows.length === 0) {
        rows = db.prepare(`
          SELECT webhook_secret FROM merchant_payment_configs
          WHERE tenant_id = ? AND webhook_secret IS NOT NULL AND webhook_secret != ''
        `).all(txnRow.tenant_id);
      }
      for (const r of rows) {
        if (r?.webhook_secret) secrets.push(String(r.webhook_secret).trim());
      }
    } catch (_) {}
  }
  if (process.env.RAZORPAY_WEBHOOK_SECRET) {
    secrets.push(String(process.env.RAZORPAY_WEBHOOK_SECRET).trim());
  }
  return [...new Set(secrets.filter(Boolean))];
}

function verifySignatureAgainstAnySecret(rawBody, signature, secrets) {
  if (!signature || !Array.isArray(secrets) || secrets.length === 0) return false;
  const sigBuf = Buffer.from(String(signature), "utf8");
  for (const secret of secrets) {
    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const expBuf = Buffer.from(expectedSignature, "utf8");
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      return true;
    }
  }
  return false;
}

router.post(["/pay/webhook/razorpay", "/public/pay/webhook/razorpay"], async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const event = String(req.body?.event || req.body?.type || "payment_link.paid").trim().toLowerCase();
    const payload = req.body?.payload || {};

    let referenceCode = null;
    let paymentId = null;
    let amountInPaise = null;
    let webhookCurrency = null;

    if (payload.payment_link?.entity) {
      const linkEntity = payload.payment_link.entity;
      referenceCode = linkEntity.reference_id || linkEntity.notes?.reference_code;
      amountInPaise = linkEntity.amount_paid || linkEntity.amount;
      webhookCurrency = linkEntity.currency || webhookCurrency;
    }

    if (payload.payment?.entity) {
      const payEntity = payload.payment.entity;
      if (!referenceCode) {
        referenceCode = payEntity.notes?.reference_code || payEntity.description;
      }
      if (amountInPaise == null) {
        amountInPaise = payEntity.amount;
      }
      webhookCurrency = payEntity.currency || webhookCurrency;
    }

    if (!referenceCode && req.body?.reference_code) {
      referenceCode = req.body.reference_code;
      amountInPaise = req.body.amount != null ? Number(req.body.amount) * 100 : null;
      webhookCurrency = req.body.currency || webhookCurrency;
    }

    const txnRow = referenceCode
      ? db.prepare(`
          SELECT id, tenant_id, master_location_id, deposit_due, grand_total, currency
          FROM universal_transactions
          WHERE reference_code = ? AND delete_status = 0
        `).get(referenceCode)
      : null;

    const candidateSecrets = resolveRazorpayWebhookSecrets(txnRow);
    if (!signature || candidateSecrets.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Webhook signature verification required"
      });
    }

    const rawBody = req.rawBody ? Buffer.from(req.rawBody) : Buffer.from(JSON.stringify(req.body));
    if (!verifySignatureAgainstAnySecret(rawBody, signature, candidateSecrets)) {
      return res.status(401).json({ success: false, message: "Invalid Razorpay webhook signature" });
    }

    if (!ALLOWED_RAZORPAY_CAPTURE_EVENTS.has(event)) {
      return res.json({
        success: true,
        ignored: true,
        event,
        message: `Webhook event '${event}' does not represent a captured payment`
      });
    }

    if (payload.payment?.entity?.id) {
      paymentId = payload.payment.entity.id;
    } else {
      paymentId = `rzp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }

    if (!referenceCode) {
      return res.status(400).json({
        success: false,
        message: "No reference_code found in webhook payload"
      });
    }

    if (!txnRow) {
      return res.status(404).json({
        success: false,
        message: `Transaction ${referenceCode} not found`
      });
    }

    const expectedCurrency = String(txnRow.currency || "INR").toUpperCase();
    const receivedCurrency = String(webhookCurrency || expectedCurrency).toUpperCase();
    if (receivedCurrency !== expectedCurrency) {
      return res.status(400).json({
        success: false,
        message: `Currency mismatch: expected ${expectedCurrency}, got ${receivedCurrency}`
      });
    }

    const paidAmount = amountInPaise != null ? Number(amountInPaise) / 100 : null;
    const expectedMinAmount = Number(txnRow.deposit_due) > 0 ? Number(txnRow.deposit_due) : Number(txnRow.grand_total);
    if (paidAmount !== null) {
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid payment amount in webhook payload" });
      }
      if (paidAmount + 0.01 < expectedMinAmount) {
        return res.status(400).json({
          success: false,
          message: `Underpayment rejected: paid ${paidAmount} is less than required ${expectedMinAmount}`
        });
      }
    }

    // Reconcile idempotently
    const reconcileResult = await universalFulfillmentService.reconcilePaymentSuccess({
      tenantId: txnRow.tenant_id,
      referenceCode,
      gatewayRef: paymentId,
      paidAmount,
      source: "RAZORPAY_WEBHOOK"
    });

    return res.json({
      success: true,
      event,
      ...reconcileResult
    });
  } catch (err) {
    return res.status(Number(err.statusCode) || 500).json({ success: false, message: err.message });
  }
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = router;

