const { db } = require("../../config/database");

/**
 * Universal Multi-Sector Dynamic Pricing & Quotation Engine
 * Evaluates variants, bulk tiers, weekend/seasonal surges, promo codes,
 * add-ons by price mode, and GST itemization.
 */

function formatCurrency(amount, currency = "INR") {
  const num = Number(amount) || 0;
  if (currency === "INR") {
    return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${num.toFixed(2)}`;
}

/**
 * Calculates a complete deterministic quotation for cart items and add-ons
 */
function calculateCartQuote(tenantId = 1, options = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const rawItems = Array.isArray(options.items) ? options.items : (options.itemId ? [{ itemId: options.itemId, quantity: options.quantity || 1 }] : []);
  const rawAddons = Array.isArray(options.addOns) ? options.addOns : (options.addonId ? [{ addonId: options.addonId, quantity: 1 }] : []);
  const promoCode = options.promoCode ? String(options.promoCode).trim().toUpperCase() : null;

  // Calculate nights if date range
  let nights = 1;
  if (options.checkIn && options.checkOut) {
    const d1 = new Date(options.checkIn);
    const d2 = new Date(options.checkOut);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    nights = Math.max(1, diff || 1);
  }

  // Active pricing rules
  const activeRules = db.prepare(`
    SELECT * FROM catalog_pricing_rules
    WHERE tenant_id = ? AND is_active = 1 AND delete_status = 0
    ORDER BY priority DESC, id ASC
  `).all(numericTenantId);

  // 1. Process Items
  let itemsSubtotal = 0;
  let itemsGstTotal = 0;
  const processedItems = [];

  for (const raw of rawItems) {
    const item = db.prepare(`
      SELECT * FROM catalog_items WHERE tenant_id = ? AND id = ? AND delete_status = 0
    `).get(numericTenantId, raw.itemId);

    if (!item) continue;

    const qty = Math.max(1, Number(raw.quantity) || 1);
    let unitBasePrice = Number(raw.customPrice || item.base_price) || 0;
    let variantName = null;

    // Check variant override if sku passed
    if (raw.variantSku) {
      let variants = [];
      try {
        variants = typeof item.variants_json === "string" ? JSON.parse(item.variants_json || "[]") : (item.variants_json || []);
      } catch (_) {}
      const matchedVariant = variants.find(v => v.sku === raw.variantSku);
      if (matchedVariant) {
        if (matchedVariant.price !== undefined) unitBasePrice = Number(matchedVariant.price);
        variantName = matchedVariant.name || matchedVariant.sku;
      }
    }

    // Multiply by nights if inventory_mode is DATE_RANGE
    const lineNights = item.inventory_mode === "DATE_RANGE" ? nights : 1;
    let lineRawSubtotal = unitBasePrice * qty * lineNights;

    // Apply item-specific dynamic rules (e.g. bulk tier or surge)
    let itemDiscountAmount = 0;
    let ruleAppliedTitle = null;

    for (const rule of activeRules) {
      if (rule.catalog_item_id && rule.catalog_item_id !== item.id) continue;

      let criteria = {};
      try {
        criteria = typeof rule.criteria_json === "string" ? JSON.parse(rule.criteria_json || "{}") : (rule.criteria_json || {});
      } catch (_) {}

      // Bulk tier check
      if (rule.rule_type === "BULK_TIER") {
        const minQty = Number(criteria.minQuantity || criteria.min_quantity) || 0;
        if (minQty > 0 && qty >= minQty) {
          if (rule.discount_mode === "PERCENTAGE") {
            const disc = (lineRawSubtotal * Number(rule.discount_value)) / 100;
            itemDiscountAmount = Math.max(itemDiscountAmount, disc);
            ruleAppliedTitle = rule.title;
          } else if (rule.discount_mode === "FIXED_AMOUNT") {
            itemDiscountAmount = Math.max(itemDiscountAmount, Number(rule.discount_value));
            ruleAppliedTitle = rule.title;
          }
        }
      }

      // Weekend surge check
      if (rule.rule_type === "WEEKEND_SURGE") {
        const checkDate = options.date || options.checkIn || new Date().toISOString();
        const dayName = new Date(checkDate).toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
        const targetDays = Array.isArray(criteria.days) ? criteria.days.map(d => String(d).toUpperCase()) : ["FRIDAY", "SATURDAY", "SUNDAY"];
        if (targetDays.includes(dayName)) {
          // Surge value can be negative discount (e.g. -15 means +15% surge)
          const factor = Number(rule.discount_value);
          const surgeAmount = (lineRawSubtotal * factor) / 100;
          lineRawSubtotal -= surgeAmount; // If factor is -15, minus -15 adds 15%
          ruleAppliedTitle = rule.title;
        }
      }
    }

    const lineFinalSubtotal = Math.max(0, lineRawSubtotal - itemDiscountAmount);
    const gstPercent = Number(item.gst_percent) || 0;
    const lineGst = (lineFinalSubtotal * gstPercent) / 100;

    itemsSubtotal += lineFinalSubtotal;
    itemsGstTotal += lineGst;

    processedItems.push({
      itemId: item.id,
      title: item.title,
      variantSku: raw.variantSku || null,
      variantName,
      unitPrice: unitBasePrice,
      quantity: qty,
      nights: lineNights,
      gstPercent,
      gstAmount: lineGst,
      ruleApplied: ruleAppliedTitle,
      lineSubtotal: lineFinalSubtotal
    });
  }

  // 2. Process Add-Ons
  let addonsSubtotal = 0;
  let addonsGstTotal = 0;
  const processedAddons = [];

  for (const raw of rawAddons) {
    const addon = db.prepare(`
      SELECT a.*, g.title as group_title
      FROM catalog_addons a
      JOIN catalog_addon_groups g ON g.id = a.group_id
      WHERE a.tenant_id = ? AND a.id = ? AND a.delete_status = 0 AND a.active_status = 1
    `).get(numericTenantId, raw.addonId);

    if (!addon) continue;

    const qty = Math.max(1, Number(raw.quantity) || 1);
    let addonPrice = Number(addon.price) || 0;
    let lineCost = 0;

    // Price mode
    if (addon.price_mode === "FIXED") {
      lineCost = addonPrice * qty;
    } else if (addon.price_mode === "PER_UNIT") {
      // Multiply by total item quantity
      const totalItemQty = processedItems.reduce((acc, i) => acc + i.quantity, 0) || 1;
      lineCost = addonPrice * qty * totalItemQty;
    } else if (addon.price_mode === "PER_NIGHT_OR_SLOT") {
      lineCost = addonPrice * qty * nights;
    } else if (addon.price_mode === "PERCENTAGE") {
      lineCost = (itemsSubtotal * addonPrice) / 100;
    }

    const gstPercent = Number(addon.gst_percent) || 0;
    const lineGst = (lineCost * gstPercent) / 100;

    addonsSubtotal += lineCost;
    addonsGstTotal += lineGst;

    processedAddons.push({
      addonId: addon.id,
      name: addon.name,
      groupTitle: addon.group_title,
      priceMode: addon.price_mode,
      price: addonPrice,
      quantity: qty,
      gstPercent,
      gstAmount: lineGst,
      lineSubtotal: lineCost
    });
  }

  // 3. Process Cart-Level Promo Code
  let promoDiscount = 0;
  let promoRuleTitle = null;

  if (promoCode) {
    const matchedPromo = activeRules.find(r => r.rule_type === "PROMO_CODE" && String(r.promo_code).toUpperCase() === promoCode);
    if (matchedPromo) {
      let criteria = {};
      try {
        criteria = typeof matchedPromo.criteria_json === "string" ? JSON.parse(matchedPromo.criteria_json || "{}") : (matchedPromo.criteria_json || {});
      } catch (_) {}

      const minTotal = Number(criteria.minTotal || criteria.min_total) || 0;
      const preDiscountSubtotal = itemsSubtotal + addonsSubtotal;

      if (preDiscountSubtotal >= minTotal) {
        if (matchedPromo.discount_mode === "PERCENTAGE") {
          promoDiscount = (preDiscountSubtotal * Number(matchedPromo.discount_value)) / 100;
        } else if (matchedPromo.discount_mode === "FIXED_AMOUNT") {
          promoDiscount = Math.min(preDiscountSubtotal, Number(matchedPromo.discount_value));
        }
        promoRuleTitle = matchedPromo.title;
      }
    }
  }

  // 4. Totals
  const netSubtotal = Math.max(0, itemsSubtotal + addonsSubtotal - promoDiscount);
  const totalGst = itemsGstTotal + addonsGstTotal;
  const grandTotal = Math.round(netSubtotal + totalGst);

  return {
    items: processedItems,
    addOns: processedAddons,
    promoCode: promoCode || null,
    promoRuleTitle,
    promoDiscount,
    itemsSubtotal,
    addonsSubtotal,
    netSubtotal,
    totalGst,
    grandTotal,
    nights: options.checkIn && options.checkOut ? nights : null,
    currency: options.currency || "INR",
    receiptText: formatWhatsAppReceipt({
      items: processedItems,
      addOns: processedAddons,
      promoDiscount,
      promoCode,
      netSubtotal,
      totalGst,
      grandTotal,
      currency: options.currency || "INR"
    })
  };
}

/**
 * Formats a clean, high-conversion WhatsApp receipt string
 */
function formatWhatsAppReceipt(quote = {}) {
  const cur = quote.currency || "INR";
  const lines = ["📋 *Order & Booking Summary*"];
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Items
  for (const item of (quote.items || [])) {
    const qtyStr = item.quantity > 1 ? ` (x${item.quantity})` : "";
    const nightStr = item.nights > 1 ? ` for ${item.nights} nights` : "";
    const variantStr = item.variantName ? ` [${item.variantName}]` : "";
    lines.push(`• *${item.title}*${variantStr}${qtyStr}${nightStr}: ${formatCurrency(item.lineSubtotal, cur)}`);
  }

  // Add-Ons
  if (Array.isArray(quote.addOns) && quote.addOns.length > 0) {
    lines.push("\n*Selected Add-Ons:*");
    for (const addon of quote.addOns) {
      lines.push(`  + ${addon.name}: ${formatCurrency(addon.lineSubtotal, cur)}`);
    }
  }

  // Promo
  if (quote.promoDiscount > 0) {
    lines.push(`\n🎟️ Promo (${quote.promoCode}): -${formatCurrency(quote.promoDiscount, cur)}`);
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push(`Subtotal: ${formatCurrency(quote.netSubtotal, cur)}`);
  lines.push(`Taxes & GST: ${formatCurrency(quote.totalGst, cur)}`);
  lines.push(`*Grand Total: ${formatCurrency(quote.grandTotal, cur)}*`);

  return lines.join("\n");
}

module.exports = {
  calculateCartQuote,
  formatWhatsAppReceipt,
  formatCurrency
};
