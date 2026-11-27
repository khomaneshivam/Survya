const masterDataService = require("../../masters/masterDataService");

/**
 * Universal Master-Bound Dynamic Flow Node Executor (MASTER_PICKER)
 * Dynamically resolves master data options (categories, locations, resources, payment modes, etc.)
 * Renders WhatsApp Quick-Reply buttons (2-3) or Interactive List Menu (4-10),
 * supports auto-advance on single option, pagination, and robust answer validation.
 */
module.exports = {
  type: "MASTER_PICKER",

  async execute(node, context) {
    const { session = {}, userInput = "", userPayload = null, tenantId = 1, isWaitingForThisNode } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };

    const masterType = cfg.masterType || cfg.master_type || "master_categories";
    const promptText = cfg.promptText || cfg.prompt || cfg.message || "Please choose an option:";
    const outputVar = cfg.outputVariable || cfg.output_variable || "selected_master_value";
    const labelVar = cfg.labelVariable || cfg.label_variable || `${outputVar}_label`;
    const filterCriteria = cfg.filterCriteria || cfg.filters || {};
    const autoAdvanceOnSingle = cfg.autoAdvanceOnSingle !== false;
    const maxButtons = Math.min(3, Math.max(1, Number(cfg.maxButtons || 3)));
    const listButtonTitle = (cfg.listButtonTitle || "Choose Option").slice(0, 20);

    // 1. Resolve live dynamic master options
    let resolved;
    try {
      resolved = masterDataService.resolveDynamicMasterOptions(tenantId, masterType, filterCriteria);
    } catch (err) {
      console.warn(`[MasterPickerExecutor] Error resolving master options for '${masterType}':`, err.message);
      resolved = { options: [] };
    }

    const options = resolved.options || [];

    // 2. Handle incoming user answer if already waiting
    if (isWaitingForThisNode) {
      const rawInput = String(userPayload?.id || userInput || "").trim();
      const lowerInput = rawInput.toLowerCase();

      // Find match by ID, code, button id (mst_<val>), label, or numeric index (1, 2, 3...)
      let matched = null;

      // Check button / list ID prefix
      if (rawInput.startsWith("mst_")) {
        const val = rawInput.slice(4);
        matched = options.find(o => String(o.value) === val || String(o.code) === val || String(o.id) === val);
      }

      // Check exact value / code / id
      if (!matched) {
        matched = options.find(o => String(o.value).toLowerCase() === lowerInput || String(o.code).toLowerCase() === lowerInput || String(o.id) === lowerInput);
      }

      // Check exact or partial label match
      if (!matched) {
        matched = options.find(o => o.label.toLowerCase() === lowerInput);
      }

      // Check numeric 1-based index
      if (!matched && /^\d+$/.test(rawInput)) {
        const idx = parseInt(rawInput, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          matched = options[idx];
        }
      }

      // Substring match on label as fallback
      if (!matched && lowerInput.length >= 3) {
        matched = options.find(o => o.label.toLowerCase().includes(lowerInput));
      }

      if (matched) {
        const updatedData = {
          [outputVar]: matched.value,
          [labelVar]: matched.label,
          [`${outputVar}_code`]: matched.code,
          [`${outputVar}_id`]: matched.id,
          [`${outputVar}_metadata`]: matched.metadata
        };

        // Determine next handle: check for branch matching option value or 'default'
        const nextHandle = `opt_${matched.value}`;

        return {
          action: "CONTINUE",
          nextHandle,
          updatedData,
          traceNote: `Customer selected master option '${matched.label}' (${matched.value}) from ${masterType}`
        };
      }

      // Invalid response -> Re-prompt with error
      const errorMessage = cfg.errorMessage || `Sorry, please select one of the available options from the list below.`;
      const rePromptMsg = `${errorMessage}\n\n${promptText}`;

      return this._renderOptionsPrompt(node, options, rePromptMsg, maxButtons, listButtonTitle);
    }

    // 3. First execution of node

    // Case A: No options found -> continue or branch to 'empty'
    if (options.length === 0) {
      return {
        action: "CONTINUE",
        nextHandle: "empty",
        traceNote: `No master options found for ${masterType} under filter: ${JSON.stringify(filterCriteria)}`
      };
    }

    // Case B: Exactly 1 option and autoAdvanceOnSingle is enabled -> skip prompt & advance!
    if (options.length === 1 && autoAdvanceOnSingle) {
      const single = options[0];
      const updatedData = {
        [outputVar]: single.value,
        [labelVar]: single.label,
        [`${outputVar}_code`]: single.code,
        [`${outputVar}_id`]: single.id,
        [`${outputVar}_metadata`]: single.metadata
      };

      return {
        action: "CONTINUE",
        nextHandle: `opt_${single.value}`,
        updatedData,
        traceNote: `Auto-advanced on single master option: '${single.label}' (${single.value})`
      };
    }

    // Case C: 2 or more options -> render interactive message and pause for user input
    return this._renderOptionsPrompt(node, options, promptText, maxButtons, listButtonTitle);
  },

  _renderOptionsPrompt(node, options, bodyText, maxButtons, listButtonTitle) {
    const isButtons = options.length <= maxButtons;

    if (isButtons) {
      const btnOptions = options.slice(0, 3).map((opt) => ({
        id: `mst_${opt.value}`,
        title: String(opt.label || opt.value).slice(0, 20)
      }));

      return {
        action: "WAIT_FOR_INPUT",
        nodeWaiting: node.id,
        replyMessages: [bodyText],
        replyInteractive: {
          type: "BUTTONS",
          options: btnOptions
        },
        traceNote: `Rendered ${btnOptions.length} master quick-reply buttons for node '${node.id}'`
      };
    } else {
      const rows = options.slice(0, 10).map((opt) => ({
        id: `mst_${opt.value}`,
        title: String(opt.label || opt.value).slice(0, 24),
        description: opt.metadata?.description
          ? String(opt.metadata.description).slice(0, 72)
          : undefined
      }));

      return {
        action: "WAIT_FOR_INPUT",
        nodeWaiting: node.id,
        replyMessages: [bodyText],
        replyInteractive: {
          type: "LIST",
          listTitle: "Available Options",
          listButtonText: String(listButtonTitle || "Select Option").slice(0, 20),
          options: rows
        },
        traceNote: `Rendered interactive list menu with ${rows.length} master options for node '${node.id}'`
      };
    }
  }
};

