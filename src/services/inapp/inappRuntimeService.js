const crypto = require("crypto");
const { db } = require("../../config/database");
const inappValidator = require("./inappValidator");
const expressionEvaluator = require("../workflow/expressionEvaluator");
const crmPipelineService = require("../crmPipelineService");

/**
 * Dynamic Public Multi-Screen Runtime Service
 * Powers customer-facing mobile-first experiences at /x/:slug
 */

/**
 * Load a published in-app experience by slug with screens, fields, and catalog bounds
 */
function getPublicExperience(slug) {
  if (!slug || typeof slug !== "string") {
    const err = new Error("Experience slug is required");
    err.statusCode = 400;
    throw err;
  }

  const exp = db.prepare(`
    SELECT * FROM inapp_experiences
    WHERE slug = ? AND delete_status = 0
  `).get(slug.trim());

  if (!exp) {
    const err = new Error("Experience not found");
    err.statusCode = 404;
    throw err;
  }

  if (exp.status !== "PUBLISHED" || exp.active_status !== 1) {
    const err = new Error("This experience is currently paused or inactive");
    err.statusCode = 410;
    err.status = exp.status;
    throw err;
  }

  // Fetch active screens in sort order
  const rawScreens = db.prepare(`
    SELECT * FROM inapp_screens
    WHERE experience_id = ? AND delete_status = 0 AND active_status = 1
    ORDER BY display_order ASC, id ASC
  `).all(exp.id);

  const screens = rawScreens.map(s => ({
    id: s.id,
    screenKey: s.screen_key,
    title: s.title,
    subtitle: s.subtitle,
    screenType: s.screen_type,
    config: JSON.parse(s.config_json || "{}"),
    navigationRules: JSON.parse(s.navigation_rules_json || "{}"),
    sortOrder: s.display_order,
    displayOrder: s.display_order
  }));

  // Fetch all active form fields for these screens
  const screenIds = screens.map(s => s.id);
  const formFieldsByScreen = {};

  if (screenIds.length > 0) {
    const placeholders = screenIds.map(() => "?").join(",");
    const fields = db.prepare(`
      SELECT * FROM inapp_form_fields
      WHERE screen_id IN (${placeholders}) AND delete_status = 0 AND active_status = 1
      ORDER BY display_order ASC, id ASC
    `).all(...screenIds);

    for (const f of fields) {
      if (!formFieldsByScreen[f.screen_id]) {
        formFieldsByScreen[f.screen_id] = [];
      }

      let parsedOptions = [];
      try {
        if (f.options_json) {
          const rawOpts = typeof f.options_json === "string" ? JSON.parse(f.options_json) : f.options_json;
          if (Array.isArray(rawOpts)) {
            parsedOptions = rawOpts;
          } else if (rawOpts && typeof rawOpts === "object" && (rawOpts.source || rawOpts.masterType || rawOpts.master_type)) {
            const masterSource = rawOpts.source || rawOpts.masterType || rawOpts.master_type;
            const masterDataService = require("../masters/masterDataService");
            const resolved = masterDataService.resolveDynamicMasterOptions(exp.tenant_id || 1, masterSource, rawOpts.criteria || rawOpts.filters || {});
            parsedOptions = resolved.options.map(o => ({ value: o.value, label: o.label, metadata: o.metadata }));
          }
        }
      } catch (optErr) {
        parsedOptions = [];
      }

      formFieldsByScreen[f.screen_id].push({
        id: f.id,
        screenId: f.screen_id,
        fieldKey: f.field_key,
        label: f.label,
        inputType: f.input_type,
        placeholder: f.placeholder,
        options: parsedOptions,
        validationRules: JSON.parse(f.validation_rules_json || "{}"),
        crmFieldMapping: f.crm_field_mapping,
        crmAttributeMapping: f.crm_field_mapping,
        sortOrder: f.display_order,
        displayOrder: f.display_order
      });
    }
  }

  // Calculate catalog metadata (minPrice, maxPrice, categories, totalItems)
  const catalogMeta = getExperienceCatalogMeta(exp);

  const hasEntryScreen = screens.some(s => s.screenKey === exp.entry_screen_key);
  const entryScreenKey = hasEntryScreen ? exp.entry_screen_key : (screens[0]?.screenKey || exp.entry_screen_key || "welcome");

  return {
    experience: {
      id: exp.id,
      slug: exp.slug,
      name: exp.name,
      domainType: exp.domain_type,
      businessEntityId: exp.business_entity_id,
      crmPipelineId: exp.crm_pipeline_id,
      assignedPhoneNumberId: exp.assigned_phone_number_id,
      entryScreenKey,
      theme: JSON.parse(exp.theme_json || "{}"),
      features: JSON.parse(exp.features_json || "{}"),
      businessHours: JSON.parse(exp.business_hours_json || "{}"),
      status: exp.status
    },
    screens,
    formFieldsByScreen,
    catalogMeta
  };
}

/**
 * Calculates price bounds and categories for an experience dynamically
 */
function getExperienceCatalogMeta(exp) {
  let minPrice = 0;
  let maxPrice = 100000;
  let totalItems = 0;
  let categories = [];

  try {
    if (exp.domain_type === "HOSPITALITY") {
      let propId = exp.business_entity_id;
      if (!propId) {
        const defaultProp = db.prepare("SELECT id FROM properties WHERE tenant_id = ? ORDER BY id ASC LIMIT 1").get(exp.tenant_id);
        propId = defaultProp?.id || 1;
      }

      const roomTypes = db.prepare(`
        SELECT id, name, base_rate FROM room_types
        WHERE tenant_id = ? AND property_id = ? AND active = 1
      `).all(exp.tenant_id, propId);

      if (roomTypes.length > 0) {
        totalItems = roomTypes.length;
        const rates = roomTypes.map(r => Number(r.base_rate) || 0);
        minPrice = Math.min(...rates);
        maxPrice = Math.max(...rates);
        categories = [{ id: "rooms", name: "Rooms & Villas", slug: "rooms" }];
        return { minPrice, maxPrice, totalItems, categories };
      }
    }

    // Standard Catalog Items lookup
    const entityId = exp.business_entity_id;
    let itemsQuery = "SELECT id, base_price, category_id FROM catalog_items WHERE tenant_id = ? AND is_active = 1";
    const params = [exp.tenant_id];

    if (entityId) {
      itemsQuery += " AND entity_id = ?";
      params.push(entityId);
    }

    const items = db.prepare(itemsQuery).all(...params);
    if (items.length > 0) {
      totalItems = items.length;
      const prices = items.map(i => Number(i.base_price) || 0);
      minPrice = Math.min(...prices);
      maxPrice = Math.max(...prices);

      let catQuery = "SELECT id, name, slug FROM catalog_categories WHERE tenant_id = ? AND is_active = 1";
      const catParams = [exp.tenant_id];
      if (entityId) {
        catQuery += " AND entity_id = ?";
        catParams.push(entityId);
      }
      categories = db.prepare(catQuery).all(...catParams);
    }
  } catch (err) {
    console.warn("[inappRuntimeService] getExperienceCatalogMeta warning:", err.message);
  }

  return { minPrice, maxPrice, totalItems, categories };
}

/**
 * Starts or resumes a visitor session
 */
function startOrResumeSession(slug, { sessionToken, contactPhone, contactName, initialData } = {}) {
  const { experience, screens } = getPublicExperience(slug);
  const entryScreenKey = experience.entryScreenKey || screens[0]?.screenKey || "welcome";

  if (sessionToken && typeof sessionToken === "string") {
    // Resume existing session if not expired (checked against UTC)
    const session = db.prepare(`
      SELECT * FROM inapp_sessions
      WHERE session_token = ? AND experience_id = ? AND delete_status = 0
    `).get(sessionToken.trim(), experience.id);

    if (session) {
      // Check if session has not expired
      const isExpired = db.prepare(`
        SELECT (expires_at < UTC_TIMESTAMP()) as is_expired
        FROM inapp_sessions WHERE id = ?
      `).get(session.id)?.is_expired === 1;

      if (!isExpired) {
        // Touch session
        db.prepare(`
          UPDATE inapp_sessions
          SET last_activity_at = UTC_TIMESTAMP(),
              expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(session.id);

        return {
          sessionToken: session.session_token,
          currentScreenKey: session.current_screen_key || entryScreenKey,
          navigationStack: JSON.parse(session.navigation_stack_json || "[]"),
          stateData: JSON.parse(session.state_data_json || "{}")
        };
      }
    }
  }

  // Create brand new session
  const newToken = `exp_${crypto.randomBytes(16).toString("hex")}`;
  const navigationStack = [entryScreenKey];
  const stateData = initialData && typeof initialData === "object" ? initialData : {};

  db.prepare(`
    INSERT INTO inapp_sessions (
      tenant_id, experience_id, session_token, visitor_phone, visitor_name,
      current_screen_key, navigation_stack_json, state_data_json,
      expires_at, last_activity_at, status, active_status, delete_status,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), UTC_TIMESTAMP(), 'ACTIVE', 1, 0,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    experience.tenant_id || 1,
    experience.id,
    newToken,
    contactPhone || null,
    contactName || null,
    entryScreenKey,
    JSON.stringify(navigationStack),
    JSON.stringify(stateData)
  );

  return {
    sessionToken: newToken,
    currentScreenKey: entryScreenKey,
    navigationStack,
    stateData
  };
}

/**
 * Filter and query live items by price range, category, search, and sort
 */
function getCatalogItems(slug, query = {}) {
  const { experience, catalogMeta } = getPublicExperience(slug);
  const minPrice = query.minPrice !== undefined && query.minPrice !== "" ? Number(query.minPrice) : null;
  const maxPrice = query.maxPrice !== undefined && query.maxPrice !== "" ? Number(query.maxPrice) : null;
  const categoryId = query.categoryId || null;
  const search = query.search ? String(query.search).trim() : null;
  const sort = query.sort || "sort_order";

  let items = [];

  if (experience.domainType === "HOSPITALITY") {
    let propId = experience.businessEntityId;
    if (!propId) {
      const defaultProp = db.prepare("SELECT id FROM properties WHERE tenant_id = ? ORDER BY id ASC LIMIT 1").get(experience.tenant_id || 1);
      propId = defaultProp?.id || 1;
    }

    let sql = `
      SELECT r.*, p.name as property_name, p.currency
      FROM room_types r
      LEFT JOIN properties p ON p.id = r.property_id
      WHERE r.tenant_id = ? AND r.property_id = ? AND r.active = 1
    `;
    const params = [experience.tenant_id || 1, propId];

    if (minPrice !== null && !isNaN(minPrice)) {
      sql += " AND r.base_rate >= ?";
      params.push(minPrice);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) {
      sql += " AND r.base_rate <= ?";
      params.push(maxPrice);
    }
    if (search) {
      sql += " AND (r.name LIKE ? OR r.description LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term);
    }

    if (sort === "price_asc") {
      sql += " ORDER BY r.base_rate ASC";
    } else if (sort === "price_desc") {
      sql += " ORDER BY r.base_rate DESC";
    } else {
      sql += " ORDER BY r.id ASC";
    }

    const rows = db.prepare(sql).all(...params);

    // Get images for each room
    const getImagesStmt = db.prepare(`
      SELECT image_url, caption, alt_text, is_primary, display_order
      FROM hospitality_room_images
      WHERE room_type_id = ?
      ORDER BY is_primary DESC, display_order ASC, id ASC
    `);

    items = rows.map(r => {
      const rawImages = getImagesStmt.all(r.id);
      const images = [];

      // Include primary_image_url if present
      if (r.primary_image_url) {
        images.push({
          url: r.primary_image_url,
          caption: r.name,
          alt: r.name,
          isPrimary: true
        });
      }

      for (const img of rawImages) {
        if (!images.some(existing => existing.url === img.image_url)) {
          images.push({
            url: img.image_url,
            caption: img.caption || r.name,
            alt: img.alt_text || r.name,
            isPrimary: img.is_primary === 1
          });
        }
      }

      let amenities = [];
      try {
        amenities = JSON.parse(r.amenities_json || "[]");
      } catch (_) {}

      return {
        id: r.id,
        title: r.name,
        name: r.name,
        description: r.description,
        price: Number(r.base_rate) || 0,
        basePrice: Number(r.base_rate) || 0,
        taxRate: 18, // 18% standard GST for hospitality
        currency: r.currency || "INR",
        categoryName: "Rooms & Villas",
        categoryId: "rooms",
        images,
        primaryImageUrl: images[0]?.url || r.primary_image_url || null,
        variants: [],
        maxAdults: r.max_adults,
        maxChildren: r.max_children,
        roomSize: r.room_size,
        sizeUnit: r.size_unit,
        bedType: r.bed_type,
        amenities,
        isSoldOutToday: 0,
        allowRateNegotiation: Boolean(experience.features?.enableRateDiscussion)
      };
    });

    return {
      success: true,
      count: items.length,
      items,
      minPrice: catalogMeta.minPrice,
      maxPrice: catalogMeta.maxPrice
    };
  }

  // Standard Catalog Items query
  let sql = `
    SELECT i.*, c.name as category_name
    FROM catalog_items i
    LEFT JOIN catalog_categories c ON i.category_id = c.id
    WHERE i.tenant_id = ? AND i.is_active = 1
  `;
  const params = [experience.tenant_id || 1];

  if (experience.businessEntityId) {
    sql += " AND i.entity_id = ?";
    params.push(experience.businessEntityId);
  }

  if (minPrice !== null && !isNaN(minPrice)) {
    sql += " AND i.base_price >= ?";
    params.push(minPrice);
  }
  if (maxPrice !== null && !isNaN(maxPrice)) {
    sql += " AND i.base_price <= ?";
    params.push(maxPrice);
  }
  if (categoryId) {
    sql += " AND (i.category_id = ? OR c.slug = ?)";
    params.push(categoryId, categoryId);
  }
  if (search) {
    sql += " AND (i.title LIKE ? OR i.short_description LIKE ? OR i.sku LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (sort === "price_asc") {
    sql += " ORDER BY i.base_price ASC";
  } else if (sort === "price_desc") {
    sql += " ORDER BY i.base_price DESC";
  } else if (sort === "newest") {
    sql += " ORDER BY i.created_at DESC, i.id DESC";
  } else {
    sql += " ORDER BY i.sort_order ASC, i.id ASC";
  }

  const rows = db.prepare(sql).all(...params);

  // Variant retrieval
  const getVariantsStmt = db.prepare("SELECT * FROM catalog_item_variants WHERE item_id = ? AND is_active = 1");

  items = rows.map(item => {
    const images = [];

    if (item.image_url) {
      images.push({
        url: item.image_url,
        caption: item.title,
        isPrimary: true
      });
    }

    let gallery = [];
    try {
      gallery = JSON.parse(item.gallery_json || "[]");
    } catch (_) {}

    if (Array.isArray(gallery)) {
      for (const entry of gallery) {
        const url = typeof entry === "string" ? entry : entry.url;
        if (url && !images.some(ex => ex.url === url)) {
          images.push({
            url,
            caption: typeof entry === "object" ? entry.caption : item.title,
            isPrimary: false
          });
        }
      }
    }

    // Also include media from catalog_item_media if available
    try {
      const dbMedia = db.prepare(`
        SELECT media_url, caption, is_primary FROM catalog_item_media
        WHERE catalog_item_id = ? AND delete_status = 0
        ORDER BY is_primary DESC, sort_order ASC, id ASC
      `).all(item.id);
      for (const m of dbMedia) {
        if (m.media_url && !images.some(ex => ex.url === m.media_url)) {
          images.push({
            url: m.media_url,
            caption: m.caption || item.title,
            isPrimary: m.is_primary === 1
          });
        }
      }
    } catch (_) {}

    const variants = getVariantsStmt.all(item.id);

    return {
      id: item.id,
      title: item.title,
      name: item.title,
      itemType: item.item_type,
      sku: item.sku,
      shortDescription: item.short_description,
      description: item.description,
      price: Number(item.base_price) || 0,
      basePrice: Number(item.base_price) || 0,
      taxRate: Number(item.tax_rate) || 0,
      categoryId: item.category_id,
      categoryName: item.category_name,
      images,
      primaryImageUrl: images[0]?.url || item.image_url || null,
      variants,
      isSoldOutToday: Number(item.is_sold_out_today) || 0,
      allowRateNegotiation: Boolean(experience.features?.enableRateDiscussion)
    };
  });

  return {
    success: true,
    count: items.length,
    items,
    minPrice: catalogMeta.minPrice,
    maxPrice: catalogMeta.maxPrice
  };
}

/**
 * Handle navigation stack transitions (NEXT, BACK, JUMP), form validation, and actions
 */
function navigateSession(slug, {
  sessionToken,
  fromScreenKey,
  action = "NEXT",
  targetScreenKey,
  formValues,
  selectedItemId
} = {}) {
  const { experience, screens, formFieldsByScreen } = getPublicExperience(slug);

  if (!sessionToken) {
    const err = new Error("sessionToken is required");
    err.statusCode = 400;
    throw err;
  }

  // Load session
  const session = db.prepare(`
    SELECT * FROM inapp_sessions
    WHERE session_token = ? AND experience_id = ? AND delete_status = 0
  `).get(sessionToken.trim(), experience.id);

  if (!session) {
    const err = new Error("Session expired or invalid. Please refresh.");
    err.statusCode = 401;
    throw err;
  }

  // Check expiry
  const isExpired = db.prepare(`
    SELECT (expires_at < UTC_TIMESTAMP()) as is_expired
    FROM inapp_sessions WHERE id = ?
  `).get(session.id)?.is_expired === 1;

  if (isExpired) {
    const err = new Error("Session expired. Please restart your session.");
    err.statusCode = 401;
    throw err;
  }

  let navigationStack = JSON.parse(session.navigation_stack_json || "[]");
  let stateData = JSON.parse(session.state_data_json || "{}");

  // Handle BACK action: pop navigation stack while preserving stateData
  if (action === "BACK") {
    if (navigationStack.length > 1) {
      navigationStack.pop();
    }
    const currentScreenKey = navigationStack[navigationStack.length - 1] || experience.entryScreenKey || screens[0]?.screenKey;

    db.prepare(`
      UPDATE inapp_sessions
      SET current_screen_key = ?,
          navigation_stack_json = ?,
          last_activity_at = UTC_TIMESTAMP(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(currentScreenKey, JSON.stringify(navigationStack), session.id);

    return {
      success: true,
      currentScreenKey,
      navigationStack,
      stateData
    };
  }

  // Find fromScreen
  const activeFromKey = fromScreenKey || session.current_screen_key;
  const fromScreen = screens.find(s => s.screenKey === activeFromKey);

  // Validate dynamic form if fromScreen is DYNAMIC_FORM or FORM
  if (fromScreen && (fromScreen.screenType === "DYNAMIC_FORM" || fromScreen.screenType === "FORM")) {
    const fields = formFieldsByScreen[fromScreen.id] || [];
    if (fields.length > 0) {
      const submitted = formValues && typeof formValues === "object" ? formValues : {};
      const validation = inappValidator.validateFormSubmission(fields, submitted);

      if (!validation.valid) {
        const err = new Error("Form validation failed");
        err.statusCode = 422;
        err.fieldErrors = validation.errors;
        throw err;
      }
    }
  }

  // Merge form values into stateData
  if (formValues && typeof formValues === "object") {
    stateData = { ...stateData, ...formValues };
  }

  // Merge selected item into stateData
  if (selectedItemId) {
    stateData.selectedItemId = selectedItemId;
    try {
      const catalogRes = getCatalogItems(slug, {});
      const matched = catalogRes.items?.find(i => String(i.id) === String(selectedItemId));
      if (matched) {
        stateData.selectedItem = matched;
        stateData.selectedItemTitle = matched.title;
        stateData.selectedItemPrice = matched.price;
      }
    } catch (_) {}
  }

  // Determine next screen
  let nextScreenKey = targetScreenKey || null;

  if (action === "JUMP" && targetScreenKey) {
    nextScreenKey = targetScreenKey;
  } else if (fromScreen) {
    const navRules = fromScreen.navigationRules || {};

    // 1. Evaluate conditional jump rules if defined
    let conditionMatched = false;
    const rulesList = Array.isArray(navRules.rules) ? navRules.rules : [];

    for (const rule of rulesList) {
      const conditionRules = rule.conditionGroup?.rules || rule.rules || [];
      const matchMode = rule.conditionGroup?.matchMode || rule.matchMode || "ALL";

      if (conditionRules.length > 0) {
        const passes = expressionEvaluator.evaluateRules(conditionRules, matchMode, stateData);
        if (passes && rule.targetScreenKey) {
          nextScreenKey = rule.targetScreenKey;
          conditionMatched = true;
          break;
        }
      }
    }

    // 2. Default next screen if condition did not match
    if (!conditionMatched && !nextScreenKey) {
      if (navRules.defaultNext) {
        nextScreenKey = navRules.defaultNext;
      } else if (navRules.nextScreenKey) {
        nextScreenKey = navRules.nextScreenKey;
      } else {
        // Fallback: look up next screen in sortOrder
        const currentIdx = screens.findIndex(s => s.screenKey === fromScreen.screenKey);
        if (currentIdx >= 0 && currentIdx < screens.length - 1) {
          nextScreenKey = screens[currentIdx + 1].screenKey;
        } else {
          nextScreenKey = fromScreen.screenKey;
        }
      }
    }
  }

  if (!nextScreenKey) {
    nextScreenKey = fromScreen?.screenKey || experience.entryScreenKey || "welcome";
  }

  // Push nextScreenKey to navigationStack if different from top
  if (navigationStack[navigationStack.length - 1] !== nextScreenKey) {
    navigationStack.push(nextScreenKey);
  }

  // Execute configured backend actions (e.g. CRM_UPSERT)
  let contactPhone = session.visitor_phone;
  let contactName = session.visitor_name;
  let contactEmail = session.visitor_email;

  const phoneCandidate = stateData.phone || stateData.contact_phone || stateData.mobile || stateData.phone_number;
  const nameCandidate = stateData.name || stateData.contact_name || stateData.full_name;
  const emailCandidate = stateData.email || stateData.contact_email;

  if (phoneCandidate) contactPhone = String(phoneCandidate).trim();
  if (nameCandidate) contactName = String(nameCandidate).trim();
  if (emailCandidate) contactEmail = String(emailCandidate).trim();

  let crmRecordId = session.crm_record_id || null;

  // If CRM pipeline is linked and we have a contact phone, upsert CRM record
  if (experience.crmPipelineId && contactPhone) {
    try {
      const crmRecord = crmPipelineService.createRecord({
        tenantId: experience.tenant_id || 1,
        pipelineId: experience.crmPipelineId,
        contactPhone,
        contactName: contactName || "In-App Visitor",
        contactEmail: contactEmail || null,
        stageKey: "NEW_LEAD",
        dealValue: Number(stateData.budget || stateData.quote_total || stateData.total_price || stateData.deal_value || stateData.selectedItemPrice || 0),
        tags: ["INAPP_EXPERIENCE", experience.slug, experience.domainType],
        customAttributes: {
          experience_slug: experience.slug,
          experience_name: experience.name,
          source_screen: activeFromKey,
          target_screen: nextScreenKey,
          ...stateData
        },
        sourceSessionId: session.id
      });

      if (crmRecord?.id) {
        crmRecordId = crmRecord.id;
        stateData.crmRecordId = crmRecord.id;
        stateData.crm_record_id = crmRecord.id;
      }
    } catch (crmErr) {
      console.warn("[inappRuntimeService] CRM record upsert warning:", crmErr.message);
    }
  }

  // Persist updated session
  db.prepare(`
    UPDATE inapp_sessions
    SET current_screen_key = ?,
        navigation_stack_json = ?,
        state_data_json = ?,
        visitor_phone = COALESCE(?, visitor_phone),
        visitor_name = COALESCE(?, visitor_name),
        visitor_email = COALESCE(?, visitor_email),
        crm_record_id = COALESCE(?, crm_record_id),
        last_activity_at = UTC_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    nextScreenKey,
    JSON.stringify(navigationStack),
    JSON.stringify(stateData),
    contactPhone || null,
    contactName || null,
    contactEmail || null,
    crmRecordId || null,
    session.id
  );

  return {
    success: true,
    currentScreenKey: nextScreenKey,
    navigationStack,
    stateData
  };
}

module.exports = {
  getPublicExperience,
  startOrResumeSession,
  getCatalogItems,
  navigateSession,
  startVisitorSession: (slugOrOpts, opts = {}) => {
    if (typeof slugOrOpts === "object" && slugOrOpts !== null) {
      return startOrResumeSession(slugOrOpts.slug, slugOrOpts);
    }
    return startOrResumeSession(slugOrOpts, opts);
  },
  submitScreenForm: async (slugOrOpts, opts = {}) => {
    const params = (typeof slugOrOpts === "object" && slugOrOpts !== null) ? slugOrOpts : { slug: slugOrOpts, ...opts };
    return navigateSession(params.slug, {
      sessionToken: params.sessionToken,
      fromScreenKey: params.screenKey || params.fromScreenKey,
      action: "NEXT",
      formValues: params.formData || params.formValues
    });
  }
};
