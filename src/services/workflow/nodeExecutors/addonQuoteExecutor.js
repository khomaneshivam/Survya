const universalCatalogService = require("../../universal/universalCatalogService");
const universalPricingService = require("../../universal/universalPricingService");

/**
 * Universal Add-On Upsell & Quotation Node Executor (ADDON_UPSELL_AND_QUOTE)
 * Displays available add-ons/upgrades for the cart, applies promo codes,
 * and produces itemized GST quotation & receipt text.
 */
module.exports = {
  type: "ADDON_UPSELL_AND_QUOTE",

  async execute(node, context) {
    const { session = {}, userInput = "", userPayload = null, tenantId = 1, isWaitingForThisNode } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };

    const selectedItemId = session.selectedItemId || cfg.defaultItemId || null;
    const entityId = cfg.entityId || null;
    const allowPromoCode = cfg.allowPromoCode !== false;

    // Available add-on groups for this item/entity
    const addonGroups = universalCatalogService.listAddonGroups(tenantId, {
      itemId: selectedItemId,
      entityId
    });

    const allAddons = addonGroups.flatMap(g => g.addons || []);

    // Handle user action during turn resumption
    if (isWaitingForThisNode) {
      const actionId = userPayload?.id || userInput;
      const cleanAction = String(actionId || "").trim();

      // Check if user selected an add-on
      if (cleanAction.startsWith("addon_")) {
        const addonId = parseInt(cleanAction.replace("addon_", ""), 10);
        const currentAddonIds = Array.isArray(session.selectedAddonIds) ? [...session.selectedAddonIds] : [];
        if (!currentAddonIds.includes(addonId)) {
          currentAddonIds.push(addonId);
        }
        session.selectedAddonIds = currentAddonIds;

        // Recalculate quote with newly selected add-on
        const quote = universalPricingService.calculateCartQuote(tenantId, {
          items: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
          addOns: currentAddonIds.map(id => ({ addonId: id, quantity: 1 })),
          promoCode: session.promoCode || null,
          checkIn: session.check_in || session.checkIn,
          checkOut: session.check_out || session.checkOut
        });

        return {
          action: "CONTINUE",
          nextHandle: "confirmed",
          replyMessages: [
            "✅ *Add-On Added!*\n\n" + quote.receiptText
          ],
          updatedData: {
            selectedAddonIds: currentAddonIds,
            quote
          },
          traceNote: `Customer selected add-on #${addonId}. Revised grand total: ₹${quote.grandTotal}`
        };
      }

      // Check skip / confirm
      if (cleanAction === "skip_addons" || cleanAction === "confirm_quote" || cleanAction.toLowerCase() === "skip" || cleanAction.toLowerCase() === "done") {
        const quote = universalPricingService.calculateCartQuote(tenantId, {
          items: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
          addOns: (session.selectedAddonIds || []).map(id => ({ addonId: id, quantity: 1 })),
          promoCode: session.promoCode || null,
          checkIn: session.check_in || session.checkIn,
          checkOut: session.check_out || session.checkOut
        });

        return {
          action: "CONTINUE",
          nextHandle: "confirmed",
          replyMessages: [
            quote.receiptText
          ],
          updatedData: { quote },
          traceNote: `Customer confirmed quote with grand total: ₹${quote.grandTotal}`
        };
      }

      // Check promo code typed by customer
      if (cleanAction.startsWith("PROMO:") || (allowPromoCode && /^[A-Z0-9]{4,15}$/i.test(cleanAction) && !cleanAction.startsWith("opt_"))) {
        const promo = cleanAction.replace("PROMO:", "").trim().toUpperCase();
        const quote = universalPricingService.calculateCartQuote(tenantId, {
          items: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
          addOns: (session.selectedAddonIds || []).map(id => ({ addonId: id, quantity: 1 })),
          promoCode: promo,
          checkIn: session.check_in || session.checkIn,
          checkOut: session.check_out || session.checkOut
        });

        if (quote.promoDiscount > 0) {
          session.promoCode = promo;
          return {
            action: "CONTINUE",
            nextHandle: "confirmed",
            replyMessages: [
              `🎉 Promo code *${promo}* applied successfully!\n\n` + quote.receiptText
            ],
            updatedData: { promoCode: promo, quote },
            traceNote: `Promo code ${promo} applied. Discount: ₹${quote.promoDiscount}`
          };
        }
      }
    }

    // Initial presentation of quote & add-ons
    const initialQuote = universalPricingService.calculateCartQuote(tenantId, {
      items: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
      addOns: (session.selectedAddonIds || []).map(id => ({ addonId: id, quantity: 1 })),
      promoCode: session.promoCode || null,
      checkIn: session.check_in || session.checkIn,
      checkOut: session.check_out || session.checkOut
    });

    // If there are no add-ons configured, advance immediately
    if (allAddons.length === 0) {
      return {
        action: "CONTINUE",
        nextHandle: "default",
        replyMessages: [
          initialQuote.receiptText
        ],
        updatedData: { quote: initialQuote },
        traceNote: "No add-on groups configured. Directly presented quote receipt."
      };
    }

    // Build interactive options for add-ons
    const buttons = [];
    for (let i = 0; i < Math.min(2, allAddons.length); i++) {
      const a = allAddons[i];
      buttons.push({
        id: `addon_${a.id}`,
        title: `+ ${a.name}`.substring(0, 20)
      });
    }
    buttons.push({ id: "skip_addons", title: "No Thanks / Continue" });

    const promptText = cfg.promptText || "✨ *Recommended Add-Ons & Upgrades*\n\nWould you like to enhance your booking with any of our signature extras?";

    return {
      action: "WAIT_FOR_INPUT",
      replyMessages: [
        `${initialQuote.receiptText}\n\n${promptText}`
      ],
      replyInteractive: {
        type: "BUTTONS",
        options: buttons
      },
      updatedData: { quote: initialQuote },
      traceNote: `Presented quote (₹${initialQuote.grandTotal}) and ${allAddons.length} add-on options.`
    };
  }
};
