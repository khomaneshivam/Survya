const universalCatalogService = require("../../universal/universalCatalogService");
const universalPricingService = require("../../universal/universalPricingService");
const universalAvailabilityService = require("../../universal/universalAvailabilityService");

/**
 * Universal Add-On Upsell & Quotation Node Executor (ADDON_UPSELL_AND_QUOTE)
 * Displays available add-ons/upgrades for the cart, applies promo codes,
 * creates atomic 15-minute inventory hold, and produces itemized GST quotation & receipt text.
 */
module.exports = {
  type: "ADDON_UPSELL_AND_QUOTE",

  async execute(node, context) {
    const { session = {}, userInput = "", userPayload = null, tenantId = 1, isWaitingForThisNode, dryRun = false, isSandbox = false, isSimulation = false } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };
    const isSim = Boolean(dryRun || isSandbox || isSimulation);

    const selectedItemId = session.selectedItemId || session.selected_item_id || cfg.defaultItemId || null;
    const entityId = cfg.entityId || session.entityId || null;
    const allowPromoCode = cfg.allowPromoCode !== false;

    // Helper to acquire a 15-minute atomic inventory hold
    const acquireAtomicHold = () => {
      if (isSim) return `SIM-HOLD-${Date.now()}`;
      if (!selectedItemId) return null;
      try {
        const holdRes = universalAvailabilityService.createInventoryHold(tenantId, {
          itemId: selectedItemId,
          quantity: session.quantity || 1,
          holdMinutes: 15,
          customerPhone: context.recipientPhone || session.sender_phone
        });
        return holdRes.success ? holdRes.holdToken : null;
      } catch (_) {
        return null;
      }
    };

    // Check inventory availability if item is tracked
    if (selectedItemId) {
      const item = universalCatalogService.getItemById(tenantId, selectedItemId);
      if (item && item.track_inventory && (item.stock_qty - item.reserved_qty) <= 0 && item.is_sold_out) {
        return {
          action: "CONTINUE",
          nextHandle: "unavailable",
          replyMessages: ["We're sorry, this item is currently sold out or unavailable."],
          traceNote: `Item #${selectedItemId} is out of stock. Routed to unavailable handle.`
        };
      }
    }

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
      const lowerAction = cleanAction.toLowerCase();

      // Check confirm & pay
      if (cleanAction === "confirm_pay" || cleanAction === "confirm_quote" || lowerAction === "confirm" || lowerAction === "pay" || lowerAction === "done") {
        const quote = universalPricingService.calculateCartQuote(tenantId, {
          items: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
          addOns: (session.selectedAddonIds || []).map(id => ({ addonId: id, quantity: 1 })),
          promoCode: session.promoCode || null,
          checkIn: session.check_in || session.checkIn,
          checkOut: session.check_out || session.checkOut
        });

        const holdToken = acquireAtomicHold();

        let txnRes = null;
        if (!isSim) {
          try {
            const universalFulfillmentService = require("../../universal/universalFulfillmentService");
            txnRes = await universalFulfillmentService.createTransactionFromQuote({
              tenantId,
              sourceChannel: "WHATSAPP_FLOW",
              customer: {
                phone: context.recipientPhone || session.sender_phone || session.customerPhone || "919999999999",
                name: session.guest_name || session.customerName || "Valued Customer"
              },
              cartItems: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
              addOns: (session.selectedAddonIds || []).map(id => ({ addonId: id, quantity: 1 })),
              promoCode: session.promoCode || null,
              holdId: holdToken || session.holdToken || null,
              serviceDate: session.check_in || session.checkIn || null,
              serviceEndDate: session.check_out || session.checkOut || null,
              serviceSlotTime: session.slot_time || session.slotTime || null,
              flowSessionId: session.id || null
            });
          } catch (txnErr) {
            console.warn("[ADDON_UPSELL_AND_QUOTE] Transaction creation warning:", txnErr.message);
          }
        } else {
          txnRes = {
            referenceCode: `SIM-REF-${Date.now().toString().slice(-4)}`,
            isPayLater: false,
            paymentLinkUrl: null
          };
        }

        const refText = txnRes?.referenceCode ? ` (Ref: *${txnRes.referenceCode}*)` : "";
        const paymentMsg = txnRes?.isPayLater
          ? "\n\n💵 *Payment Mode: Pay on Arrival / Cash on Delivery*\nYour order & reservation is confirmed!"
          : (txnRes?.paymentLinkUrl
            ? `\n\n💳 *Payment Link:* ${txnRes.paymentLinkUrl}\n_Please complete payment within 30 minutes to lock your inventory._`
            : "\n\n💳 Please proceed with payment or our team will connect with you.");

        return {
          action: "CONTINUE",
          nextHandle: "confirmed",
          replyMessages: [
            `✅ *Order & Booking Confirmed!*${refText}\n\n` + quote.receiptText + paymentMsg
          ],
          updatedData: {
            confirmed: true,
            quote,
            referenceCode: txnRes?.referenceCode || null,
            paymentLinkUrl: txnRes?.paymentLinkUrl || null,
            holdToken: holdToken || session.holdToken,
            cart: [{
              itemId: selectedItemId,
              variantId: session.selectedVariantId || null,
              addonIds: session.selectedAddonIds || [],
              qty: session.quantity || 1,
              slotDate: session.slotDate || null,
              checkIn: session.check_in || session.checkIn || null,
              checkOut: session.check_out || session.checkOut || null
            }]
          },
          traceNote: `Customer confirmed quote with grand total: ₹${quote.grandTotal} (Ref: ${txnRes?.referenceCode || "N/A"})`
        };
      }

      // Check add more items
      if (cleanAction === "add_more" || lowerAction === "add more" || lowerAction === "browse" || lowerAction === "catalog") {
        return {
          action: "CONTINUE",
          nextHandle: "add_more",
          replyMessages: ["Great, let's explore more items from our catalog!"],
          traceNote: "Customer chose to add more items."
        };
      }

      // Check talk to desk / human handoff
      if (cleanAction === "talk_desk" || cleanAction === "handoff" || lowerAction === "talk to desk" || lowerAction === "agent" || lowerAction === "human" || lowerAction === "help") {
        return {
          action: "CONTINUE",
          nextHandle: "handoff",
          replyMessages: ["Connecting you with our support team..."],
          traceNote: "Customer requested desk handoff."
        };
      }

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

        const holdToken = acquireAtomicHold();

        // Present updated quote with 3 final action buttons
        return {
          action: "WAIT_FOR_INPUT",
          replyMessages: [
            "✅ *Add-On Added!*\n\n" + quote.receiptText + "\n\nWould you like to confirm and pay, add another item, or talk to our desk?"
          ],
          replyInteractive: {
            type: "BUTTONS",
            options: [
              { id: "confirm_pay", title: "Confirm & Pay 💳" },
              { id: "add_more", title: "Add More ➕" },
              { id: "talk_desk", title: "Talk to Desk 💬" }
            ]
          },
          updatedData: {
            selectedAddonIds: currentAddonIds,
            holdToken: holdToken || session.holdToken,
            quote
          },
          traceNote: `Customer selected add-on #${addonId}. Revised grand total: ₹${quote.grandTotal}`
        };
      }

      // Check skip add-ons
      if (cleanAction === "skip_addons" || lowerAction === "skip" || lowerAction === "no thanks") {
        const quote = universalPricingService.calculateCartQuote(tenantId, {
          items: selectedItemId ? [{ itemId: selectedItemId, quantity: session.quantity || 1 }] : [],
          addOns: (session.selectedAddonIds || []).map(id => ({ addonId: id, quantity: 1 })),
          promoCode: session.promoCode || null,
          checkIn: session.check_in || session.checkIn,
          checkOut: session.check_out || session.checkOut
        });

        const holdToken = acquireAtomicHold();

        return {
          action: "WAIT_FOR_INPUT",
          replyMessages: [
            quote.receiptText + "\n\nWould you like to confirm and pay, add another item, or talk to our desk?"
          ],
          replyInteractive: {
            type: "BUTTONS",
            options: [
              { id: "confirm_pay", title: "Confirm & Pay 💳" },
              { id: "add_more", title: "Add More ➕" },
              { id: "talk_desk", title: "Talk to Desk 💬" }
            ]
          },
          updatedData: {
            quote,
            holdToken: holdToken || session.holdToken
          },
          traceNote: `Customer skipped add-ons. Presented final quote (₹${quote.grandTotal}).`
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
          const holdToken = acquireAtomicHold();
          return {
            action: "WAIT_FOR_INPUT",
            replyMessages: [
              `🎉 Promo code *${promo}* applied successfully!\n\n` + quote.receiptText + "\n\nWould you like to confirm and pay?"
            ],
            replyInteractive: {
              type: "BUTTONS",
              options: [
                { id: "confirm_pay", title: "Confirm & Pay 💳" },
                { id: "add_more", title: "Add More ➕" },
                { id: "talk_desk", title: "Talk to Desk 💬" }
              ]
            },
            updatedData: {
              promoCode: promo,
              quote,
              holdToken: holdToken || session.holdToken
            },
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

    const holdToken = acquireAtomicHold();

    // If there are no add-ons configured, directly present quote with action buttons
    if (allAddons.length === 0) {
      return {
        action: "WAIT_FOR_INPUT",
        replyMessages: [
          initialQuote.receiptText + "\n\nWould you like to confirm and pay, add another item, or talk to our desk?"
        ],
        replyInteractive: {
          type: "BUTTONS",
          options: [
            { id: "confirm_pay", title: "Confirm & Pay 💳" },
            { id: "add_more", title: "Add More ➕" },
            { id: "talk_desk", title: "Talk to Desk 💬" }
          ]
        },
        updatedData: {
          quote: initialQuote,
          holdToken: holdToken || session.holdToken
        },
        traceNote: "No add-on groups configured. Presented quote receipt with action buttons."
      };
    }

    // Build interactive options for add-ons (up to 2-3 add-ons + Skip button)
    const buttons = [];
    for (let i = 0; i < Math.min(2, allAddons.length); i++) {
      const a = allAddons[i];
      buttons.push({
        id: `addon_${a.id}`,
        title: `+ ${a.name}`.substring(0, 20)
      });
    }
    buttons.push({ id: "skip_addons", title: "Skip / Continue" });

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
      updatedData: {
        quote: initialQuote,
        holdToken: holdToken || session.holdToken
      },
      traceNote: `Presented quote (₹${initialQuote.grandTotal}) and ${allAddons.length} add-on options.`
    };
  }
};
