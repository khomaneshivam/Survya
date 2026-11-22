const universalCatalogService = require("../../universal/universalCatalogService");

/**
 * Universal Catalog Browser Node Executor (CATALOG_BROWSER)
 * Renders interactive catalog items with WhatsApp lists/buttons,
 * supports categories, pagination, and single/multi-item selection.
 */
module.exports = {
  type: "CATALOG_BROWSER",

  async execute(node, context) {
    const { session = {}, userInput = "", userPayload = null, tenantId = 1, isWaitingForThisNode } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };

    const entityId = cfg.entityId || null;
    const categoryName = cfg.categoryName || null;
    const inventoryMode = cfg.inventoryMode || null;
    const pageSize = Math.max(1, Math.min(10, Number(cfg.pageSize) || 6));

    // Handle incoming user response
    if (isWaitingForThisNode) {
      const selectedId = userPayload?.id || userInput;
      const cleanInput = String(selectedId || "").trim();

      // Check if user selected an item
      if (cleanInput.startsWith("item_")) {
        const itemId = parseInt(cleanInput.replace("item_", ""), 10);
        const item = universalCatalogService.getItemById(tenantId, itemId);

        if (item) {
          const updatedData = {
            selectedItemId: item.id,
            selectedItemTitle: item.title,
            selectedItemPrice: item.base_price,
            selectedItemGst: item.gst_percent,
            selectedItemMode: item.inventory_mode,
            selectedItemCurrency: item.currency || "INR",
            selectedItemImageUrl: item.media?.[0]?.media_url || null
          };

          return {
            action: "CONTINUE",
            nextHandle: "item_selected",
            updatedData,
            traceNote: `Customer selected catalog item #${item.id}: '${item.title}' (${item.currency || 'INR'} ${item.base_price})`
          };
        }
      }

      // Check for pagination "next" or "back"
      if (cleanInput === "cat_next_page") {
        const currentOffset = Number(session._catalogOffset || 0) + pageSize;
        session._catalogOffset = currentOffset;
      } else if (cleanInput === "cat_prev_page") {
        const currentOffset = Math.max(0, Number(session._catalogOffset || 0) - pageSize);
        session._catalogOffset = currentOffset;
      } else {
        // Fallback: search query typed by customer
        const searchMatches = universalCatalogService.searchCatalog(tenantId, {
          entityId,
          query: cleanInput,
          category: categoryName,
          inventoryMode,
          limit: 1
        });

        if (searchMatches.length > 0) {
          const item = searchMatches[0];
          return {
            action: "CONTINUE",
            nextHandle: "item_selected",
            updatedData: {
              selectedItemId: item.id,
              selectedItemTitle: item.title,
              selectedItemPrice: item.base_price,
              selectedItemGst: item.gst_percent,
              selectedItemMode: item.inventory_mode
            },
            traceNote: `Customer query '${cleanInput}' matched item #${item.id}: '${item.title}'`
          };
        }
      }
    }

    // Query catalog items
    const offset = Number(session._catalogOffset || 0);
    const items = universalCatalogService.searchCatalog(tenantId, {
      entityId,
      category: categoryName,
      inventoryMode,
      limit: pageSize,
      offset
    });

    if (!items || items.length === 0) {
      return {
        action: "CONTINUE",
        nextHandle: "empty",
        replyMessages: [cfg.emptyMessage || "No items are currently available in this catalog."],
        traceNote: "Catalog browser: No items found for criteria."
      };
    }

    const titleText = cfg.title || "🛍️ *Explore Our Offerings*";
    const bodyIntro = cfg.bodyText || "Select an item below to check details, customize add-ons, or proceed with your order:";

    // Format list rows (max 10 rows for WhatsApp interactive list)
    const listRows = items.map(item => ({
      id: `item_${item.id}`,
      title: String(item.title).substring(0, 24),
      description: `₹${Number(item.base_price).toLocaleString("en-IN")}${item.category_name ? ` • ${item.category_name}` : ""}`.substring(0, 72)
    }));

    if (items.length <= 3) {
      // Use interactive buttons if 3 or fewer
      return {
        action: "WAIT_FOR_INPUT",
        replyMessages: [`${titleText}\n\n${bodyIntro}`],
        replyInteractive: {
          type: "BUTTONS",
          options: items.map(item => ({
            id: `item_${item.id}`,
            title: String(item.title).substring(0, 20)
          }))
        },
        traceNote: `Catalog browser presented ${items.length} items as buttons.`
      };
    }

    return {
      action: "WAIT_FOR_INPUT",
      replyMessages: [`${titleText}\n\n${bodyIntro}`],
      replyInteractive: {
        type: "LIST",
        listTitle: (cfg.listTitle || "Catalog Items").substring(0, 24),
        listButtonText: (cfg.buttonText || "View Items").substring(0, 20),
        options: listRows
      },
      traceNote: `Catalog browser presented ${items.length} items in interactive list.`
    };
  }
};
