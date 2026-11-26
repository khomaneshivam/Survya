const crypto = require("crypto");
const { db } = require("../../config/database");
const inappValidator = require("./inappValidator");
const expressionEvaluator = require("../workflow/expressionEvaluator");
const crmPipelineService = require("../crmPipelineService");
const continuationTokenService = require("../studio/continuationTokenService");
const {
  mapLegacyScreenToComponent,
  validateComponentTurnInput,
  sanitizePayloadValue,
  sanitizeText
} = require("../studio/conversationalComponentRegistry");
const {
  buildTranscriptFromScreen,
  appendConversationTurn
} = require("../studio/transcriptHelper");

/**
 * Dynamic Public Multi-Screen Runtime Service
 * Powers customer-facing mobile-first experiences at /x/:slug
 */

/**
 * Load a published in-app experience by slug with screens, fields, and catalog bounds
 */
function getPublicExperience(slug, { versionId = null } = {}) {
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

  // Prefer immutable published version snapshot (pinned session version or active published_version_id)
  const effectiveVersionId = versionId || exp.published_version_id || null;
  if (effectiveVersionId) {
    try {
      const verRow = db.prepare(`
        SELECT * FROM experience_versions
        WHERE id = ? AND experience_id = ?
      `).get(effectiveVersionId, exp.id);
      if (verRow?.snapshot_json) {
        const snap = JSON.parse(verRow.snapshot_json);
        const snapScreens = (snap.screens || []).map((s, idx) => {
          const base = {
            id: s.id,
            screenKey: s.screenKey,
            title: sanitizeText(s.title),
            subtitle: sanitizeText(s.subtitle),
            screenType: s.screenType,
            config: sanitizePayloadValue(s.config || {}),
            navigationRules: s.navigationRules || {},
            sortOrder: s.displayOrder ?? idx,
            displayOrder: s.displayOrder ?? idx
          };
          base.component = mapLegacyScreenToComponent(base, s.fields || []);
          return base;
        });
        const snapFields = {};
        for (const s of (snap.screens || [])) {
          snapFields[s.id] = Array.isArray(s.fields) ? s.fields : [];
        }
        const catalogMeta = getExperienceCatalogMeta(exp);
        const snapExp = snap.experience || {};
        return {
          experience: {
            id: exp.id,
            tenantId: exp.tenant_id,
            slug: exp.slug,
            name: snapExp.name || exp.name,
            domainType: snapExp.domainType || exp.domain_type,
            businessEntityId: exp.business_entity_id,
            crmPipelineId: exp.crm_pipeline_id,
            assignedPhoneNumberId: exp.assigned_phone_number_id,
            entryScreenKey: snapExp.entryScreenKey || exp.entry_screen_key || snapScreens[0]?.screenKey || "welcome",
            theme: snapExp.theme || JSON.parse(exp.theme_json || "{}"),
            features: snapExp.features || JSON.parse(exp.features_json || "{}"),
            businessHours: snapExp.businessHours || JSON.parse(exp.business_hours_json || "{}"),
            status: exp.status,
            publishedVersionId: verRow.id,
            publishedVersionNumber: verRow.version_number
          },
          screens: snapScreens,
          formFieldsByScreen: snapFields,
          catalogMeta
        };
      }
    } catch (_) {}
  }

  // Fetch active screens in sort order
  const rawScreens = db.prepare(`
    SELECT * FROM inapp_screens
    WHERE experience_id = ? AND delete_status = 0 AND active_status = 1
    ORDER BY display_order ASC, id ASC
  `).all(exp.id);

  const screens = rawScreens.map(s => {
    const parsedConfig = JSON.parse(s.config_json || "{}");
    const parsedNav = JSON.parse(s.navigation_rules_json || "{}");
    return {
      id: s.id,
      screenKey: s.screen_key,
      title: sanitizeText(s.title),
      subtitle: sanitizeText(s.subtitle),
      screenType: s.screen_type,
      config: sanitizePayloadValue(parsedConfig),
      navigationRules: parsedNav,
      sortOrder: s.display_order,
      displayOrder: s.display_order
    };
  });

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

  // Enrich each screen with its authoritative Conversational Component definition
  for (const scr of screens) {
    scr.component = mapLegacyScreenToComponent(scr, formFieldsByScreen[scr.id] || []);
  }

  // Calculate catalog metadata (minPrice, maxPrice, categories, totalItems)
  const catalogMeta = getExperienceCatalogMeta(exp);

  const hasEntryScreen = screens.some(s => s.screenKey === exp.entry_screen_key);
  const entryScreenKey = hasEntryScreen ? exp.entry_screen_key : (screens[0]?.screenKey || exp.entry_screen_key || "welcome");

  return {
    experience: {
      id: exp.id,
      tenantId: exp.tenant_id,
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
      // Match property strictly inside exp.tenant_id (preferring matching entity name or active primary property)
      let prop = null;
      if (exp.business_entity_id) {
        const ent = db.prepare("SELECT id, name FROM business_entities WHERE id = ? AND tenant_id = ? LIMIT 1").get(exp.business_entity_id, exp.tenant_id);
        if (ent?.name) {
          prop = db.prepare("SELECT id FROM properties WHERE tenant_id = ? AND name = ? AND COALESCE(delete_status, 0) = 0 LIMIT 1").get(exp.tenant_id, ent.name);
        }
      }
      if (!prop) {
        prop = db.prepare("SELECT id FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0 ORDER BY id ASC LIMIT 1").get(exp.tenant_id);
      }

      if (prop?.id) {
        const roomTypes = db.prepare(`
          SELECT id, name, base_rate FROM room_types
          WHERE tenant_id = ? AND property_id = ? AND active = 1
        `).all(exp.tenant_id, prop.id);

        if (roomTypes.length > 0) {
          totalItems = roomTypes.length;
          const rates = roomTypes.map(r => Number(r.base_rate) || 0);
          minPrice = Math.min(...rates);
          maxPrice = Math.max(...rates);
          categories = [{ id: "rooms", name: "Rooms & Villas", slug: "rooms" }];
          return { minPrice, maxPrice, totalItems, categories };
        }
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
function startOrResumeSession(slug, { sessionToken, contactPhone, contactName, initialData, demoMode = false } = {}) {
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

        let transcript = [];
        try {
          transcript = JSON.parse(session.transcript_json || "[]");
        } catch (_) {}
        if (transcript.length === 0) {
          transcript = buildTranscriptFromScreen(experience.id, session.current_screen_key || entryScreenKey);
        }

        return {
          sessionToken: session.session_token,
          currentScreenKey: session.current_screen_key || entryScreenKey,
          navigationStack: JSON.parse(session.navigation_stack_json || "[]"),
          stateData: JSON.parse(session.state_data_json || "{}"),
          transcript,
          channelOwner: session.channel_owner || "SURVYA",
          optimisticLockVersion: Number(session.optimistic_lock_version || 1),
          demoMode: Boolean(session.demo_mode)
        };
      }
    }
  }

  // Create brand new session pinned to currently published version snapshot (if published via governance)
  const newToken = `exp_${crypto.randomBytes(16).toString("hex")}`;
  const navigationStack = [entryScreenKey];
  const stateData = sanitizePayloadValue(initialData && typeof initialData === "object" ? initialData : {});
  const initialTranscript = buildTranscriptFromScreen(experience.id, entryScreenKey);

  db.prepare(`
    INSERT INTO inapp_sessions (
      tenant_id, experience_id, session_token, visitor_phone, visitor_name,
      current_screen_key, navigation_stack_json, state_data_json, transcript_json,
      channel_owner, optimistic_lock_version, demo_mode,
      experience_version_id, experience_version_number,
      expires_at, last_activity_at, status, active_status, delete_status,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      'SURVYA', 1, ?,
      ?, ?,
      DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), UTC_TIMESTAMP(), 'ACTIVE', 1, 0,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    experience.tenantId || experience.tenant_id || 1,
    experience.id,
    newToken,
    contactPhone || null,
    contactName || null,
    entryScreenKey,
    JSON.stringify(navigationStack),
    JSON.stringify(stateData),
    JSON.stringify(initialTranscript),
    demoMode ? 1 : 0,
    experience.publishedVersionId || null,
    experience.publishedVersionNumber || null
  );

  return {
    sessionToken: newToken,
    currentScreenKey: entryScreenKey,
    navigationStack,
    stateData,
    transcript: initialTranscript,
    channelOwner: "SURVYA",
    optimisticLockVersion: 1,
    demoMode: Boolean(demoMode)
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

  const expTenantId = experience.tenantId || experience.tenant_id;
  if (experience.domainType === "HOSPITALITY" && expTenantId) {
    let prop = null;
    if (experience.businessEntityId) {
      const ent = db.prepare("SELECT id, name FROM business_entities WHERE id = ? AND tenant_id = ? LIMIT 1").get(experience.businessEntityId, expTenantId);
      if (ent?.name) {
        prop = db.prepare("SELECT id FROM properties WHERE tenant_id = ? AND name = ? AND COALESCE(delete_status, 0) = 0 LIMIT 1").get(expTenantId, ent.name);
      }
    }
    if (!prop) {
      prop = db.prepare("SELECT id FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0 ORDER BY id ASC LIMIT 1").get(expTenantId);
    }
    const propId = prop?.id || null;

    let sql = `
      SELECT r.*, p.name as property_name, p.currency
      FROM room_types r
      LEFT JOIN properties p ON p.id = r.property_id
      WHERE r.tenant_id = ? ${propId ? "AND r.property_id = ?" : "AND 1=0"} AND r.active = 1
    `;
    const params = propId ? [expTenantId, propId] : [expTenantId];

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
  const params = [expTenantId];

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
  selectedItemId,
  expectedLockVersion
} = {}) {
  if (!sessionToken) {
    const err = new Error("sessionToken is required");
    err.statusCode = 400;
    throw err;
  }

  // Peek session to resolve pinned immutable experience_version_id before loading snapshot
  const preSession = db.prepare(`
    SELECT s.* FROM inapp_sessions s
    JOIN inapp_experiences e ON e.id = s.experience_id
    WHERE s.session_token = ? AND e.slug = ? AND s.delete_status = 0 AND e.delete_status = 0
  `).get(sessionToken.trim(), String(slug || "").trim());

  const { experience, screens, formFieldsByScreen } = getPublicExperience(slug, {
    versionId: preSession?.experience_version_id || null
  });

  // Load session validated against experience
  const session = preSession && preSession.experience_id === experience.id
    ? preSession
    : db.prepare(`
      SELECT * FROM inapp_sessions
      WHERE session_token = ? AND experience_id = ? AND delete_status = 0
    `).get(sessionToken.trim(), experience.id);

  if (!session) {
    const err = new Error("Session expired or invalid. Please refresh.");
    err.statusCode = 401;
    throw err;
  }

  // Optimistic concurrency lock check
  const currentLockVersion = Number(session.optimistic_lock_version || 1);
  if (expectedLockVersion !== undefined && expectedLockVersion !== null && Number(expectedLockVersion) !== currentLockVersion) {
    const err = new Error("Session state changed concurrently in another tab or channel. Refreshing latest state.");
    err.statusCode = 409;
    err.code = "CONCURRENT_SESSION_UPDATE";
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
  let transcript = [];
  try {
    transcript = JSON.parse(session.transcript_json || "[]");
  } catch (_) {}

  // Handle BACK action: pop navigation stack while preserving stateData
  if (action === "BACK") {
    if (navigationStack.length > 1) {
      navigationStack.pop();
    }
    const currentScreenKey = navigationStack[navigationStack.length - 1] || experience.entryScreenKey || screens[0]?.screenKey;

    const backUpdate = db.prepare(`
      UPDATE inapp_sessions
      SET current_screen_key = ?,
          navigation_stack_json = ?,
          optimistic_lock_version = optimistic_lock_version + 1,
          last_activity_at = UTC_TIMESTAMP(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND optimistic_lock_version = ?
    `).run(currentScreenKey, JSON.stringify(navigationStack), session.id, currentLockVersion);

    if (!backUpdate || backUpdate.changes === 0) {
      const err = new Error("Concurrent session update detected while navigating back.");
      err.statusCode = 409;
      err.code = "CONCURRENT_SESSION_UPDATE";
      throw err;
    }

    return {
      success: true,
      currentScreenKey,
      navigationStack,
      stateData,
      transcript,
      channelOwner: session.channel_owner || "SURVYA",
      optimisticLockVersion: currentLockVersion + 1
    };
  }

  // Find fromScreen
  const activeFromKey = fromScreenKey || session.current_screen_key;
  const fromScreen = screens.find(s => s.screenKey === activeFromKey);
  const safeFormValues = sanitizePayloadValue(formValues && typeof formValues === "object" ? formValues : {});

  // Validate dynamic form if fromScreen is DYNAMIC_FORM or FORM
  if (fromScreen && (fromScreen.screenType === "DYNAMIC_FORM" || fromScreen.screenType === "FORM")) {
    const fields = formFieldsByScreen[fromScreen.id] || [];
    if (fields.length > 0) {
      const validation = inappValidator.validateFormSubmission(fields, safeFormValues);

      if (!validation.valid) {
        const err = new Error("Form validation failed");
        err.statusCode = 422;
        err.fieldErrors = validation.errors;
        throw err;
      }
    }
  } else if (fromScreen?.component?.componentType && Object.keys(safeFormValues).length > 0) {
    const compValidation = validateComponentTurnInput(
      fromScreen.component.componentType,
      safeFormValues,
      fromScreen.config || {}
    );
    if (!compValidation.valid) {
      const err = new Error("Step input validation failed");
      err.statusCode = 422;
      err.fieldErrors = compValidation.fieldErrors;
      throw err;
    }
  }

  // Merge form values into stateData
  if (Object.keys(safeFormValues).length > 0) {
    stateData = { ...stateData, ...safeFormValues };
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

  // Append conversational turn into transcript
  const nextScreen = screens.find(s => s.screenKey === nextScreenKey) || null;
  const userSummary = stateData.selectedItemTitle
    || (Object.keys(safeFormValues).length > 0 ? Object.values(safeFormValues).slice(0, 3).join(", ") : action);
  transcript = appendConversationTurn(transcript, {
    userSummary,
    userData: safeFormValues,
    fromScreenKey: activeFromKey,
    nextScreen,
    nextFields: nextScreen ? (formFieldsByScreen[nextScreen.id] || []) : [],
    channelOwner: session.channel_owner || "SURVYA"
  });

  // If linked to a flow session and reaching terminal or checkout confirmation screen
  const isCompletionScreen = nextScreenKey === "confirmation" || nextScreenKey === "thank_you" || action === "COMPLETE" || (safeFormValues && safeFormValues.checkout_complete);
  const nextChannelOwner = isCompletionScreen ? "WHATSAPP" : (session.channel_owner || "SURVYA");
  const nextGoalStatus = isCompletionScreen ? "COMPLETED" : (session.goal_status || "PENDING");

  // Persist updated session with optimistic CAS lock
  const navUpdate = db.prepare(`
    UPDATE inapp_sessions
    SET current_screen_key = ?,
        navigation_stack_json = ?,
        state_data_json = ?,
        transcript_json = ?,
        visitor_phone = COALESCE(?, visitor_phone),
        visitor_name = COALESCE(?, visitor_name),
        visitor_email = COALESCE(?, visitor_email),
        crm_record_id = COALESCE(?, crm_record_id),
        channel_owner = ?,
        goal_status = ?,
        optimistic_lock_version = optimistic_lock_version + 1,
        last_activity_at = UTC_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND optimistic_lock_version = ?
  `).run(
    nextScreenKey,
    JSON.stringify(navigationStack),
    JSON.stringify(stateData),
    JSON.stringify(transcript),
    contactPhone || null,
    contactName || null,
    contactEmail || null,
    crmRecordId || null,
    nextChannelOwner,
    nextGoalStatus,
    session.id,
    currentLockVersion
  );

  if (!navUpdate || navUpdate.changes === 0) {
    const err = new Error("Concurrent session update detected. Please retry.");
    err.statusCode = 409;
    err.code = "CONCURRENT_SESSION_UPDATE";
    throw err;
  }

  // Evaluate & persist Business Goal Outcome + Email Notification idempotently on completion
  let goalOutcome = null;
  if (isCompletionScreen) {
    try {
      const businessGoalService = require("../studio/businessGoalService");
      const rawExpRow = db.prepare("SELECT * FROM inapp_experiences WHERE id = ?").get(experience.id);
      if (rawExpRow) {
        goalOutcome = businessGoalService.recordGoalCompletion({
          tenantId: rawExpRow.tenant_id || 1,
          experience: rawExpRow,
          session: { ...session, visitor_phone: contactPhone || session.visitor_phone, visitor_name: contactName || session.visitor_name, visitor_email: contactEmail || session.visitor_email },
          stateData: { ...stateData, ...safeFormValues }
        });
        if (goalOutcome?.referenceCode && !stateData.referenceCode) {
          stateData.referenceCode = goalOutcome.referenceCode;
          db.prepare("UPDATE inapp_sessions SET state_data_json = ? WHERE id = ?")
            .run(JSON.stringify(stateData), session.id);
        }
      }
    } catch (goalErr) {
      console.warn("[inappRuntimeService] Business goal trigger warning:", goalErr.message);
    }
  }

  let syncResult = null;
  if (isCompletionScreen && (session.flow_session_id || stateData.flow_session_id)) {
    try {
      syncResult = syncInappCompletionToFlowSession(session.session_token, {
        ...stateData,
        ...safeFormValues,
        referenceCode: goalOutcome?.referenceCode || stateData.referenceCode || null,
        targetScreenKey: nextScreenKey
      });
      if (syncResult?.confirmationText) {
        stateData.whatsapp_confirmation_preview = syncResult.confirmationText;
        db.prepare("UPDATE inapp_sessions SET state_data_json = ? WHERE id = ?")
          .run(JSON.stringify(stateData), session.id);
      }
    } catch (syncErr) {
      console.warn("[inappRuntimeService] Auto-sync to flow session warning:", syncErr.message);
    }
  }

  return {
    success: true,
    currentScreenKey: nextScreenKey,
    navigationStack,
    stateData,
    transcript,
    channelOwner: nextChannelOwner,
    goalStatus: nextGoalStatus,
    goalOutcome,
    syncResult,
    optimisticLockVersion: currentLockVersion + 1
  };
}

/**
 * Creates a linked In-App session from a WhatsApp flow session (Step 1 Bidirectional Bridge)
 * Pre-populates customer identity and carried session variables so the customer never re-enters info.
 */
function createLinkedSession({
  tenantId = 1,
  experienceId = null,
  slug = null,
  flowSessionId = null,
  customerPhone = null,
  customerName = null,
  carrySessionVars = [],
  initialData = {},
  entryScreenKey = null
} = {}) {
  const numericTenantId = Number(tenantId) || 1;

  // 1. Resolve experience
  let exp = null;
  if (slug) {
    exp = db.prepare(`
      SELECT * FROM inapp_experiences
      WHERE tenant_id = ? AND slug = ? AND delete_status = 0
    `).get(numericTenantId, String(slug).trim());
  } else if (experienceId) {
    exp = db.prepare(`
      SELECT * FROM inapp_experiences
      WHERE tenant_id = ? AND id = ? AND delete_status = 0
    `).get(numericTenantId, experienceId);
  }

  if (!exp) {
    exp = db.prepare(`
      SELECT * FROM inapp_experiences
      WHERE tenant_id = ? AND delete_status = 0
      ORDER BY (status = 'PUBLISHED') DESC, updated_at DESC, id ASC
      LIMIT 1
    `).get(numericTenantId);
  }

  if (!exp) {
    // If no experience exists for this tenant, create a default published experience
    const newSlug = `experience-${numericTenantId}-${crypto.randomBytes(3).toString("hex")}`;
    const insertExp = db.prepare(`
      INSERT INTO inapp_experiences (
        tenant_id, name, slug, domain_type, status, entry_screen_key,
        active_status, delete_status, created_at, updated_at
      ) VALUES (
        ?, 'Interactive Catalog & Order Experience', ?, 'RETAIL', 'PUBLISHED', 'welcome',
        1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(numericTenantId, newSlug);

    exp = db.prepare(`SELECT * FROM inapp_experiences WHERE id = ?`).get(insertExp.lastInsertRowid);
  }

  // 2. Prepare stateData carrying variables from flow session
  const stateData = {
    ...initialData,
    flow_session_id: flowSessionId,
    visitor_phone: customerPhone,
    visitor_name: customerName,
    phone: customerPhone,
    name: customerName
  };

  if (Array.isArray(carrySessionVars)) {
    for (const key of carrySessionVars) {
      if (initialData[key] !== undefined) {
        stateData[key] = initialData[key];
      }
    }
  }

  // 3. Generate session row + opaque short-lived continuation token
  const sessionToken = `isess_${crypto.randomBytes(16).toString("hex")}`;
  const targetEntryScreen = entryScreenKey || exp.entry_screen_key || "welcome";
  const navigationStack = [targetEntryScreen];
  const initialTranscript = buildTranscriptFromScreen(exp.id, targetEntryScreen);

  const res = db.prepare(`
    INSERT INTO inapp_sessions (
      tenant_id, experience_id, flow_session_id, session_token,
      visitor_phone, visitor_name, visitor_email, current_screen_key,
      navigation_stack_json, state_data_json, transcript_json,
      channel_owner, optimistic_lock_version, status,
      last_activity_at, expires_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      'SURVYA', 1, 'ACTIVE',
      UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR),
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    numericTenantId,
    exp.id,
    flowSessionId || null,
    sessionToken,
    customerPhone || null,
    customerName || null,
    initialData.email || null,
    targetEntryScreen,
    JSON.stringify(navigationStack),
    JSON.stringify(stateData),
    JSON.stringify(initialTranscript)
  );

  const ctResult = continuationTokenService.issueContinuationToken({
    tenantId: numericTenantId,
    experienceId: exp.id,
    flowSessionId: flowSessionId || null,
    inappSessionId: res.lastInsertRowid,
    contactPhone: customerPhone || null,
    channelSource: "WHATSAPP",
    ttlMinutes: 30,
    isSingleUse: true
  });

  const baseUrl = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const inappUrl = `${baseUrl}/x/${exp.slug}?ct=${ctResult.continuationToken}`;

  return {
    success: true,
    sessionId: res.lastInsertRowid,
    sessionToken,
    continuationToken: ctResult.continuationToken,
    continuationTokenPrefix: ctResult.tokenPrefix,
    inappUrl,
    experience: exp,
    entryScreenKey: targetEntryScreen,
    stateData,
    transcript: initialTranscript
  };
}

/**
 * Syncs in-app completion back to the linked WhatsApp flow session
 */
function syncInappCompletionToFlowSession(sessionToken, payload = {}) {
  if (!sessionToken) {
    return { success: false, reason: "sessionToken is required" };
  }

  const inappSession = db.prepare(`
    SELECT * FROM inapp_sessions
    WHERE session_token = ? AND delete_status = 0
  `).get(sessionToken.trim());

  if (!inappSession) {
    return { success: false, reason: "In-app session not found" };
  }

  const flowSessionId = inappSession.flow_session_id || JSON.parse(inappSession.state_data_json || "{}").flow_session_id;
  if (!flowSessionId) {
    return { success: false, reason: "No linked flow session found" };
  }

  const flowSession = db.prepare(`
    SELECT * FROM conversation_flow_sessions
    WHERE id = ?
  `).get(flowSessionId);

  if (!flowSession) {
    return { success: false, reason: `Flow session #${flowSessionId} not found` };
  }

  let existingCollected = {};
  try {
    existingCollected = JSON.parse(flowSession.collected_data_json || "{}");
  } catch (_) {}

  // Merge payload and in-app state into flow session collected data
  const inappState = JSON.parse(inappSession.state_data_json || "{}");
  const mergedCollected = {
    ...existingCollected,
    ...inappState,
    ...payload,
    inapp_completed: true,
    inapp_session_token: sessionToken,
    catalog_item_id: payload.catalogItemId || payload.selectedItemId || inappState.selectedItemId || existingCollected.catalog_item_id || null,
    selected_item_id: payload.selectedItemId || payload.catalogItemId || inappState.selectedItemId || existingCollected.selected_item_id || null,
    selected_addons: payload.addons || inappState.selectedAddons || existingCollected.selected_addons || [],
    transaction_id: payload.transactionId || payload.transaction_id || existingCollected.transaction_id || null,
    transaction_ref: payload.referenceCode || payload.reference_code || payload.transaction_ref || payload.transactionRef || existingCollected.transaction_ref || null,
    negotiation_id: payload.negotiationId || payload.negotiation_id || inappState.negotiationId || null
  };

  // Find linked flow's next node & confirmation message template
  let advancedNodeId = flowSession.current_node_id;
  const flow = db.prepare(`SELECT * FROM conversation_flows WHERE id = ?`).get(flowSession.flow_id);
  let transitions = [];
  let flowNodes = [];
  const versionId = flowSession.flow_version_id || flow?.published_version_id || flow?.current_draft_version_id;
  if (versionId) {
    const ver = db.prepare(`SELECT * FROM conversation_flow_versions WHERE id = ?`).get(versionId);
    if (ver?.transitions_json) {
      try {
        transitions = typeof ver.transitions_json === "string" ? JSON.parse(ver.transitions_json) : (ver.transitions_json || []);
      } catch (_) {}
    }
    if (ver?.nodes_json) {
      try {
        flowNodes = typeof ver.nodes_json === "string" ? JSON.parse(ver.nodes_json) : (ver.nodes_json || []);
      } catch (_) {}
    }
  }
  if (transitions.length === 0 && flow?.definition_json) {
    try {
      const def = typeof flow.definition_json === "string" ? JSON.parse(flow.definition_json) : (flow.definition_json || {});
      transitions = def.transitions || [];
      if (flowNodes.length === 0) flowNodes = def.nodes || [];
    } catch (_) {}
  }

  if (transitions.length > 0) {
    const compTrans = transitions.find(t =>
      (t.sourceNodeId === flowSession.current_node_id || t.source === flowSession.current_node_id) &&
      (t.sourceHandle === "completed" || t.handle === "completed")
    ) || transitions.find(t =>
      (t.sourceNodeId === flowSession.current_node_id || t.source === flowSession.current_node_id)
    );
    if (compTrans?.targetNodeId || compTrans?.target) {
      advancedNodeId = compTrans.targetNodeId || compTrans.target;
    }
  }

  let confirmationText = null;
  let shouldMarkCompleted = false;
  if (advancedNodeId && advancedNodeId !== flowSession.current_node_id && flowNodes.length > 0) {
    const confirmNode = flowNodes.find((n) => String(n.id) === String(advancedNodeId));
    const confirmCfg = { ...(confirmNode?.data || {}), ...(confirmNode?.config || {}) };
    const rawTemplate = confirmCfg.text || confirmCfg.message || confirmCfg.farewellMessage || "";
    if (rawTemplate) {
      confirmationText = expressionEvaluator.interpolateTemplate(rawTemplate, mergedCollected);
    }
    const nextFromConfirm = transitions.filter((t) => (t.sourceNodeId || t.source) === advancedNodeId);
    if (nextFromConfirm.length === 0 || ["END", "SEND_MESSAGE"].includes(confirmNode?.type)) {
      shouldMarkCompleted = true;
    }
  }

  db.prepare(`
    UPDATE conversation_flow_sessions
    SET current_node_id = ?,
        session_status = CASE WHEN ? = 1 THEN 'COMPLETED' ELSE session_status END,
        collected_data_json = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    advancedNodeId,
    shouldMarkCompleted ? 1 : 0,
    JSON.stringify(mergedCollected),
    flowSession.id
  );

  return {
    success: true,
    synced: true,
    flowSessionId: flowSession.id,
    previousNodeId: flowSession.current_node_id,
    currentNodeId: advancedNodeId,
    nextNodeId: advancedNodeId,
    flowAdvanced: advancedNodeId !== flowSession.current_node_id,
    confirmationText,
    collectedData: mergedCollected
  };
}

/**
 * Dispatches (or records in test/simulation mode) a confirmation message back to
 * the customer's WhatsApp thread once a Survya experience completes.
 */
async function dispatchWhatsappConfirmation(sessionToken, navResult = {}, opts = {}) {
  if (!sessionToken) {
    return { success: false, skipped: true, reason: "sessionToken is required" };
  }

  const session = db.prepare(`
    SELECT s.*, e.name as experience_name, e.slug as experience_slug, e.tenant_id as exp_tenant_id
    FROM inapp_sessions s
    JOIN inapp_experiences e ON e.id = s.experience_id
    WHERE s.session_token = ? AND s.delete_status = 0
  `).get(String(sessionToken).trim());

  if (!session) {
    return { success: false, skipped: true, reason: "session_not_found" };
  }

  let stateData = {};
  try {
    stateData = JSON.parse(session.state_data_json || "{}");
  } catch (_) {}

  if (stateData.whatsapp_confirmation_sent) {
    return {
      success: true,
      alreadySent: true,
      messageId: stateData.whatsapp_confirmation_message_id || null,
      body: stateData.whatsapp_confirmation_text || null
    };
  }

  const rawPhone = session.visitor_phone || stateData.phone || stateData.visitor_phone || "";
  const cleanPhone = String(rawPhone).replace(/\D/g, "");
  if (cleanPhone.length < 7) {
    return { success: false, skipped: true, reason: "no_customer_phone" };
  }

  const tenantId = Number(session.exp_tenant_id || session.tenant_id || 1);
  const refCode = navResult?.goalOutcome?.referenceCode || stateData.referenceCode || stateData.transaction_ref || "CONFIRMED";
  const selectedItemTitle = stateData.selectedItemTitle || stateData.selected_option || "";
  const customerName = session.visitor_name || stateData.name || stateData.guest_name || "Customer";

  let bodyText = navResult?.syncResult?.confirmationText || stateData.whatsapp_confirmation_preview || "";
  if (!bodyText) {
    const itemLine = selectedItemTitle ? `\nSelection: *${selectedItemTitle}*` : "";
    bodyText = `✅ *${session.experience_name || "Request"} Confirmed!*\n\nHi ${customerName}, your submission is complete.\nReference: *${refCode}*${itemLine}\n\nThank you — our team will assist you right here on WhatsApp.`;
  }

  let phoneNumberId = null;
  if (session.flow_session_id) {
    try {
      const flowPhoneRow = db.prepare(`
        SELECT cf.phone_number_id
        FROM conversation_flow_sessions cfs
        JOIN conversation_flows cf ON cf.id = cfs.flow_id
        WHERE cfs.id = ?
      `).get(session.flow_session_id);
      if (flowPhoneRow?.phone_number_id) {
        phoneNumberId = flowPhoneRow.phone_number_id;
      }
    } catch (_) {}
  }

  if (!phoneNumberId) {
    try {
      const activeLine = db.prepare(`
        SELECT phone_number_id
        FROM waba_phone_numbers
        WHERE tenant_id = ? AND status IN ('VERIFIED', 'CONNECTED', 'REGISTERED')
          AND COALESCE(delete_status, 0) = 0
        ORDER BY is_default DESC, id ASC
        LIMIT 1
      `).get(tenantId);
      if (activeLine?.phone_number_id) {
        phoneNumberId = activeLine.phone_number_id;
      }
    } catch (_) {}
  }

  const isSimulated = Boolean(
    opts.isSimulation ||
    process.env.NODE_ENV === "test" ||
    String(sessionToken).startsWith("sim_") ||
    String(session.experience_slug || "").startsWith("demo_")
  );

  let sentLive = false;
  let sentMessageId = `survya_wa_conf_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  let sendError = null;

  if (!isSimulated) {
    try {
      const metaWhatsAppService = require("../metaWhatsAppService");
      const creds = metaWhatsAppService.resolveCredentials({ tenantId, phoneNumberId }, tenantId);
      const sendRes = await metaWhatsAppService.sendTextMessage({
        to: cleanPhone,
        body: bodyText,
        customCredentials: { ...creds, tenantId }
      });
      if (sendRes?.messageId) {
        sentMessageId = sendRes.messageId;
      }
      sentLive = true;
    } catch (err) {
      sendError = err.message;
      console.warn(`[inappRuntimeService] WhatsApp confirmation send note (tenant ${tenantId}):`, err.message);
    }
  }

  try {
    const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, tenant_id, from_phone, customer_name, message_type,
        message_body, reply_text, reply_sent_at, reply_status,
        link_id, source, is_read, user_id, received_at
      ) VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, 'AUTO_REPLIED', ?, 'SURVYA_INAPP_CONFIRMATION', 1, 'bot', ?)
    `).run(
      sentMessageId,
      tenantId,
      cleanPhone,
      customerName,
      bodyText,
      bodyText,
      nowIso,
      String(session.id),
      nowIso
    );
  } catch (logErr) {
    console.warn("[inappRuntimeService] Could not record confirmation row in customer_replies:", logErr.message);
  }

  try {
    const broadcastEngine = require("../broadcastEngine");
    broadcastEngine.emit("webhook:reply", {
      wa_message_id: sentMessageId,
      tenant_id: tenantId,
      from_phone: cleanPhone,
      customer_name: customerName,
      message_type: "outbound",
      message_body: bodyText,
      reply_text: bodyText,
      source: "SURVYA_INAPP_CONFIRMATION"
    });
  } catch (_) {}

  stateData.whatsapp_confirmation_sent = true;
  stateData.whatsapp_confirmation_mode = sentLive ? "LIVE_WHATSAPP" : (isSimulated ? "SIMULATED" : "LOGGED_ONLY");
  stateData.whatsapp_confirmation_message_id = sentMessageId;
  stateData.whatsapp_confirmation_text = bodyText;
  if (sendError) stateData.whatsapp_confirmation_error = sendError;

  db.prepare(`
    UPDATE inapp_sessions
    SET state_data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JSON.stringify(stateData), session.id);

  return {
    success: true,
    sent: sentLive,
    simulated: isSimulated,
    messageId: sentMessageId,
    phone: cleanPhone,
    body: bodyText,
    error: sendError
  };
}

function redeemContinuation(slug, continuationToken) {
  return continuationTokenService.redeemContinuationToken(slug, continuationToken);
}

/**
 * Coordinates channel handoff between SURVYA interactive chat, WHATSAPP, and HUMAN assistance.
 */
function switchChannelOwner(slug, { sessionToken, targetChannel = "WHATSAPP", note = "" } = {}) {
  const { experience } = getPublicExperience(slug);
  if (!sessionToken) {
    const err = new Error("sessionToken is required");
    err.statusCode = 400;
    throw err;
  }

  const normalizedChannel = String(targetChannel || "WHATSAPP").toUpperCase();
  if (!["WHATSAPP", "SURVYA", "HUMAN"].includes(normalizedChannel)) {
    const err = new Error("Invalid targetChannel. Allowed: WHATSAPP, SURVYA, HUMAN");
    err.statusCode = 400;
    throw err;
  }

  const session = db.prepare(`
    SELECT * FROM inapp_sessions
    WHERE session_token = ? AND experience_id = ? AND delete_status = 0
  `).get(sessionToken.trim(), experience.id);

  if (!session) {
    const err = new Error("Session expired or invalid");
    err.statusCode = 401;
    throw err;
  }

  const stateData = JSON.parse(session.state_data_json || "{}");
  stateData.last_channel_switch = {
    from: session.channel_owner || "SURVYA",
    to: normalizedChannel,
    note: sanitizeText(note),
    at: new Date().toISOString()
  };

  db.prepare(`
    UPDATE inapp_sessions
    SET channel_owner = ?,
        state_data_json = ?,
        optimistic_lock_version = optimistic_lock_version + 1,
        last_activity_at = UTC_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(normalizedChannel, JSON.stringify(stateData), session.id);

  // Sync ownership back to WhatsApp flow session if linked
  if (session.flow_session_id) {
    try {
      const flowSess = db.prepare("SELECT id, collected_data_json FROM conversation_flow_sessions WHERE id = ?").get(session.flow_session_id);
      if (flowSess) {
        const collected = JSON.parse(flowSess.collected_data_json || "{}");
        collected.active_channel = normalizedChannel;
        collected.waiting_for_inapp = normalizedChannel === "SURVYA";
        db.prepare(`
          UPDATE conversation_flow_sessions
          SET collected_data_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(JSON.stringify(collected), flowSess.id);
      }
    } catch (_) {}
  }

  return {
    success: true,
    channelOwner: normalizedChannel,
    optimisticLockVersion: Number(session.optimistic_lock_version || 1) + 1,
    stateData
  };
}

module.exports = {
  getPublicExperience,
  startOrResumeSession,
  getCatalogItems,
  navigateSession,
  createLinkedSession,
  syncInappCompletionToFlowSession,
  dispatchWhatsappConfirmation,
  redeemContinuation,
  switchChannelOwner,
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
