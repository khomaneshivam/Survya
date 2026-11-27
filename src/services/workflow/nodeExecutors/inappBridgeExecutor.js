const inappRuntimeService = require("../../inapp/inappRuntimeService");

/**
 * Universal WhatsApp <-> In-App Interactive Experience Bridge Node (OPEN_INAPP_EXPERIENCE)
 * Generates personalized signed link to /x/:slug with pre-populated session variables,
 * pauses WhatsApp flow until completion, and automatically resumes along 'completed' handle.
 */
module.exports = {
  type: "OPEN_INAPP_EXPERIENCE",

  async execute(node, context) {
    const { session = {}, userInput = "", userPayload = null, tenantId = 1, isWaitingForThisNode } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };

    const flowSessionId = session.id || session.session_id || context.flowSessionId || null;
    const customerPhone = context.recipientPhone || session.sender_phone || session.customerPhone || null;
    const customerName = session.guest_name || session.customerName || "Valued Customer";

    // 1. Resumption check: If we were waiting for this node to finish in-app
    if (isWaitingForThisNode) {
      const cleanInput = String(userPayload?.action || userPayload?.id || userInput || "").toLowerCase().trim();

      // Check if user clicked cancel or return
      if (cleanInput === "cancel" || cleanInput === "stop" || cleanInput === "exit") {
        return {
          action: "CONTINUE",
          nextHandle: "cancelled",
          replyMessages: ["No problem! Exited the interactive experience. How else may we assist you?"],
          updatedData: { waiting_for_inapp: false, inapp_cancelled: true },
          traceNote: "Customer cancelled In-App interactive flow."
        };
      }

      // Default: In-App action completed or user acknowledged
      const hasCompletedRef = session.transaction_ref || session.inapp_completed;
      const refMsg = hasCompletedRef
        ? `✅ *Your In-App Selection is Confirmed!* (Ref: *${session.transaction_ref || "SAVED"}*)\nOur team has received your submission.`
        : "✅ *Your Interactive Selection is Saved!*\nContinuing with your request...";

      return {
        action: "CONTINUE",
        nextHandle: "completed",
        replyMessages: [refMsg],
        updatedData: {
          waiting_for_inapp: false,
          inapp_completed: true
        },
        traceNote: `In-App experience completed. Advanced along 'completed' handle.`
      };
    }

    // 2. Initial Execution: Create Linked In-App Session
    const carryVars = Array.isArray(cfg.carrySessionVars) && cfg.carrySessionVars.length > 0
      ? cfg.carrySessionVars
      : ["selected_location_id", "selected_category_id", "guest_name", "check_in", "check_out", "phone", "email"];

    const initialData = {};
    for (const vKey of carryVars) {
      if (session[vKey] !== undefined) {
        initialData[vKey] = session[vKey];
      }
    }

    if (context.dryRun || context.isSimulation) {
      const slug = cfg.experienceSlug || cfg.slug || 'interactive-experience';
      const simUrl = `https://survya.example/x/${slug}?sim=1`;
      return {
        action: cfg.waitForCompletion !== false ? "WAIT_FOR_INPUT" : "CONTINUE",
        nextHandle: "default",
        replyMessages: [`${cfg.messageText || "Tap the button below:"}\n\n👉 *${cfg.buttonLabel || "Open Interactive App 📱"}:*\n${simUrl}`],
        updatedData: { waiting_for_inapp: cfg.waitForCompletion !== false, inapp_session_token: "SIM-TOKEN" },
        traceNote: "[Simulated] Generated In-App experience preview link without DB write."
      };
    }

    let linkRes;
    try {
      linkRes = inappRuntimeService.createLinkedSession({
        tenantId,
        experienceId: cfg.experienceId || null,
        slug: cfg.experienceSlug || cfg.slug || null,
        flowSessionId,
        customerPhone,
        customerName,
        carrySessionVars: carryVars,
        initialData: {
          ...initialData,
          guest_name: customerName,
          phone: customerPhone
        },
        entryScreenKey: cfg.entryScreenKey || null
      });
    } catch (err) {
      console.warn(`[OPEN_INAPP_EXPERIENCE] Failed to create linked session: ${err.message}`);
      return {
        action: "CONTINUE",
        nextHandle: "default",
        replyMessages: ["We're preparing your interactive catalog. In the meantime, how can we assist you?"],
        traceNote: `In-App session creation fallback: ${err.message}`
      };
    }

    const ctaText = cfg.messageText || "Tap the button below to view all photos, compare features & customize add-ons:";
    const buttonLabel = cfg.buttonLabel || "Open Interactive App 📱";
    const fullMsg = `${ctaText}\n\n👉 *${buttonLabel}:*\n${linkRes.inappUrl}\n\n_(Your preferences and details are already pre-loaded!)_`;

    const waitForCompletion = cfg.waitForCompletion !== false;

    if (waitForCompletion) {
      return {
        action: "WAIT_FOR_INPUT",
        replyMessages: [fullMsg],
        updatedData: {
          inapp_session_token: linkRes.sessionToken,
          inapp_url: linkRes.inappUrl,
          continuation_token_prefix: linkRes.continuationTokenPrefix || null,
          waiting_for_inapp: true
        },
        traceNote: `Generated linked In-App session (token ${linkRes.continuationTokenPrefix || "ct_***"}). Waiting for completion.`
      };
    }

    return {
      action: "CONTINUE",
      nextHandle: "default",
      replyMessages: [fullMsg],
      updatedData: {
        inapp_session_token: linkRes.sessionToken,
        inapp_url: linkRes.inappUrl,
        continuation_token_prefix: linkRes.continuationTokenPrefix || null
      },
      traceNote: `Dispatched In-App link (prefix ${linkRes.continuationTokenPrefix || "ct_***"}). Continued without waiting.`
    };
  }
};

