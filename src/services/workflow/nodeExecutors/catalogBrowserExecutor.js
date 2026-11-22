const universalCatalogService = require("../../universal/universalCatalogService");

/**
 * Universal Catalog Browser Node Executor (CATALOG_BROWSER)
 * Renders interactive catalog items with WhatsApp lists/buttons,
 * supports categories, location, budget filters, pagination, and single/multi-item selection.
 */
module.exports = {
  type: "CATALOG_BROWSER",

  async execute(node, context) {
    const { session = {}, userInput = "", userPayload = null, tenantId = 1, isWaitingForThisNode } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };

    const entityId = cfg.entityId || session.entityId || null;
    const locationId = cfg.locationId || cfg.masterLocationId || session.selected_location_id || session.master_location_id || session.locationId || null;
    const categoryId = cfg.categoryId || cfg.masterCategoryId || session.selected_category_id || session.master_category_id || session.categoryId || null;
    const categoryName = cfg.categoryName || cfg.category || session.selectedCategory || null;
    const inventoryMode = cfg.inventoryMode || session.inventoryMode || null;
    const minPrice = cfg.minPrice !== undefined ? cfg.minPrice : (session.budget_min !== undefined ? session.budget_min : null);
    const maxPrice = cfg.maxPrice !== undefined ? cfg.maxPrice : (session.budget_max !== undefined ? session.budget_max : null);
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
            selected_item_id: item.id,
            selectedItemTitle: item.title,
            selectedItemPrice: item.base_price,
            selectedItemGst: item.gst_percent,
            selectedItemMode: item.inventory_mode,
            selectedItemCurrency: item.currency || "INR",
            selectedItemImageUrl: item.media?.[0]?.media_url || item.primary_image_url || null,
            selected_category_id: item.master_category_id || null,
            selected_location_id: item.master_location_id || null
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
          locationId,
          masterLocationId: locationId,
          categoryId,
          masterCategoryId: categoryId,
          query: cleanInput,
          category: categoryName,
          inventoryMode,
          minPrice,
          maxPrice,
          limit: 1
        });

        if (searchMatches.length > 0) {
          const item = searchMatches[0];
          return {
            action: "CONTINUE",
            nextHandle: "item_selected",
            updatedData: {
              selectedItemId: item.id,
              selected_item_id: item.id,
              selectedItemTitle: item.title,
              selectedItemPrice: item.base_price,
              selectedItemGst: item.gst_percent,
              selectedItemMode: item.inventory_mode,
              selectedItemCurrency: item.currency || "INR",
              selectedItemImageUrl: item.primary_image_url || null,
              selected_category_id: item.master_category_id || null,
              selected_location_id: item.master_location_id || null
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
      locationId,
      masterLocationId: locationId,
      categoryId,
      masterCategoryId: categoryId,
      category: categoryName,
      inventoryMode,
      minPrice,
      maxPrice,
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

    // Format list rows (max 10 rows for WhatsApp interactive list) with master unit label
    const listRows = items.map(item => {
      const unitLabel = item.master_unit_symbol || item.unit_symbol || item.master_unit_name || item.unit_name || "";
      const priceStr = `₹${Number(item.base_price).toLocaleString("en-IN")}${unitLabel ? ` / ${unitLabel}` : ""}`;
      const descStr = `${priceStr}${item.category_name ? ` • ${item.category_name}` : ""}`;
      return {
        id: `item_${item.id}`,
        title: String(item.title).substring(0, 24),
        description: descStr.substring(0, 72)
      };
    });

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
