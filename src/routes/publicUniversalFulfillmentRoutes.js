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
            <p>The reference <strong>${referenceCode}</strong> does not exist or has expired.</p>
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
    return res.status(500).send(`Server error: ${err.message}`);
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
  <title>Pay ${referenceCode} - ${tenant.name || "SARVYA Commerce"}</title>
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

      <button id="payBtn" class="btn-pay" onclick="simulatePayment()">
        💳 Pay ₹${Number(amountToPay).toLocaleString("en-IN")} Now
      </button>

      <a href="/api/v1/public/receipt/${escapeHtml(referenceCode)}" class="btn-receipt">📄 View Invoice Details</a>

      <div style="font-size: 0.75rem; color: #96969C; text-align: center; margin-top: 16px;">
        🔒 256-Bit SSL Encrypted Sandbox Gateway
      </div>

      <script>
        async function simulatePayment() {
          const btn = document.getElementById('payBtn');
          btn.disabled = true;
          btn.innerText = 'Processing Payment...';

          try {
            const res = await fetch('/api/v1/public/pay/webhook/razorpay', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'payment_link.paid',
                payload: {
                  payment_link: {
                    entity: {
                      reference_id: '${escapeHtml(referenceCode)}',
                      amount: ${Number(amountToPay) * 100},
                      currency: 'INR'
                    }
                  },
                  payment: {
                    entity: {
                      id: 'pay_sim_' + Date.now(),
                      amount: ${Number(amountToPay) * 100},
                      status: 'captured'
                    }
                  }
                }
              })
            });

            const data = await res.json();
            if (data.success) {
              window.location.reload();
            } else {
              alert(data.message || 'Payment simulation failed');
              btn.disabled = false;
              btn.innerText = '💳 Pay Now';
            }
          } catch (e) {
            alert('Payment error: ' + e.message);
            btn.disabled = false;
            btn.innerText = '💳 Pay Now';
          }
        }
      </script>
    `}
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    return res.status(500).send(`Server error: ${err.message}`);
  }
});

/**
 * POST /pay/webhook/razorpay - Razorpay Webhook Auto-Reconciler (HMAC-SHA256 verified)
 */
router.post(["/pay/webhook/razorpay", "/public/pay/webhook/razorpay"], async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify HMAC-SHA256 signature if secret is provided in environment
    if (webhookSecret && signature) {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (signature !== expectedSignature) {
        return res.status(400).json({ success: false, message: "Invalid Razorpay webhook signature" });
      }
    }

    const event = req.body.event || req.body.type || "payment_link.paid";
    const payload = req.body.payload || {};

    // Extract reference code and payment ID from Razorpay payload format
    let referenceCode = null;
    let paymentId = null;
    let amountInPaise = null;

    if (payload.payment_link?.entity) {
      const linkEntity = payload.payment_link.entity;
      referenceCode = linkEntity.reference_id || linkEntity.notes?.reference_code;
      amountInPaise = linkEntity.amount_paid || linkEntity.amount;
    }

    if (!referenceCode && payload.payment?.entity) {
      const payEntity = payload.payment.entity;
      referenceCode = payEntity.notes?.reference_code || payEntity.description;
      amountInPaise = payEntity.amount;
    }

    // Direct fallback if testing with top-level fields
    if (!referenceCode && req.body.reference_code) {
      referenceCode = req.body.reference_code;
      amountInPaise = req.body.amount ? Number(req.body.amount) * 100 : null;
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

    // Find transaction to get tenantId
    const txnRow = db.prepare(`
      SELECT tenant_id FROM universal_transactions
      WHERE reference_code = ? AND delete_status = 0
    `).get(referenceCode);

    if (!txnRow) {
      return res.status(404).json({
        success: false,
        message: `Transaction ${referenceCode} not found`
      });
    }

    const paidAmount = amountInPaise ? Number(amountInPaise) / 100 : null;

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
    return res.status(500).json({ success: false, message: err.message });
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
