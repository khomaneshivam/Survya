const { db } = require("../config/database");
const { SECTOR_BLUEPRINTS, importFullIndustrySuite } = require("./universal/universalCatalogService");
const industryBlueprintService = require("./studio/industryBlueprintService");

const DOMAIN_CATALOG = Object.freeze([
  {
    code: "HOSPITALITY",
    name: "Hospitality & Resorts",
    shortLabel: "Hospitality",
    sidebarLabel: "Hospitality & Stays",
    studioBlueprintKey: "hospitality-resort",
    tagline: "Direct room & villa bookings, date-range tariffs, and concierge automation",
    highlights: ["Room & Villa Categories", "Check-in / Check-out Calendar", "Seasonal Rates & Quote Builder"]
  },
  {
    code: "RESTAURANT_FOOD",
    name: "Restaurants & Cloud Kitchens",
    shortLabel: "Restaurants",
    sidebarLabel: "Menu & Kitchen",
    studioBlueprintKey: "retail-store",
    tagline: "Digital menu ordering, Veg/Non-Veg add-ons, and instant out-of-stock 86 toggles",
    highlights: ["Categorized Food Menu", "Add-ons & Spice Prefs", "WhatsApp Quick Ordering"]
  },
  {
    code: "RETAIL_ECOM",
    name: "Retail & D2C E-Commerce",
    shortLabel: "Retail & D2C",
    sidebarLabel: "Store & Products",
    studioBlueprintKey: "retail-store",
    tagline: "Product catalogs, size/variant stock tracking, promo codes, and doorstep orders",
    highlights: ["Multi-Variant SKU Stock", "Cart & Promo Discounts", "Automated Order Confirmation"]
  },
  {
    code: "CLINIC_HEALTH",
    name: "Clinics & Healthcare",
    shortLabel: "Healthcare",
    sidebarLabel: "Clinic & Appointments",
    studioBlueprintKey: "clinic-appointment",
    tagline: "Doctor consultation slots, specialty scheduling, and WhatsApp patient intake",
    highlights: ["Doctor & Therapy Slots", "Consultation Scheduling", "Automated Reminder Receipts"]
  },
  {
    code: "SALON_WELLNESS",
    name: "Salons & Wellness Spas",
    shortLabel: "Salons & Spas",
    sidebarLabel: "Salon & Bookings",
    studioBlueprintKey: "clinic-appointment",
    tagline: "Stylist time-slot booking, therapy packages, and VIP client follow-ups",
    highlights: ["Appointment Time Slots", "Service Add-on Upsells", "Instant Confirmation Alerts"]
  },
  {
    code: "REAL_ESTATE",
    name: "Real Estate & Living",
    shortLabel: "Real Estate",
    sidebarLabel: "Properties & Visits",
    studioBlueprintKey: "real-estate-enquiry",
    tagline: "Property listings, budget qualification, and automated site-visit scheduling",
    highlights: ["Project & Unit Inventory", "Buyer Lead Qualification", "Site Visit Booking"]
  },
  {
    code: "EDUCATION_COACHING",
    name: "Education & Coaching",
    shortLabel: "Education",
    sidebarLabel: "Courses & Admissions",
    studioBlueprintKey: "event-registration",
    tagline: "Course catalogs, batch admissions, counselling bookings, and student onboarding",
    highlights: ["Courses & Cohort Batches", "Admission Intake Forms", "Registration Receipts"]
  },
  {
    code: "B2B_WHOLESALE",
    name: "B2B Wholesale & Manufacturing",
    shortLabel: "B2B Wholesale",
    sidebarLabel: "Wholesale & RFQs",
    studioBlueprintKey: "service-quotation",
    tagline: "Tiered bulk MOQ pricing, dynamic RFQ quotations, and lead qualification",
    highlights: ["Bulk Tier Volume Discounts", "Instant RFQ Quotations", "Rate Negotiation Desk"]
  }
]);

const PLAN_DOMAIN_POLICY = Object.freeze({
  TRIAL: { maxDomains: 1, multiDomainEnabled: false, label: "Free Trial — 1 Pre-built Domain" },
  STARTER: { maxDomains: 1, multiDomainEnabled: false, label: "Starter Plan — 1 Pre-built Domain" },
  GROWTH: { maxDomains: 3, multiDomainEnabled: true, label: "Growth Plan — Up to 3 Domains" },
  ENTERPRISE: { maxDomains: 8, multiDomainEnabled: true, label: "Enterprise Plan — All 8 Domains" }
});

const VALID_DOMAIN_CODES = new Set(DOMAIN_CATALOG.map((d) => d.code));

function normalizeDomainCode(rawCode, fallback = "HOSPITALITY") {
  if (!rawCode) return fallback;
  const upper = String(rawCode).trim().toUpperCase();
  const aliasMap = {
    DINING: "RESTAURANT_FOOD",
    FOOD: "RESTAURANT_FOOD",
    RESTAURANT: "RESTAURANT_FOOD",
    RETAIL: "RETAIL_ECOM",
    ECOMMERCE: "RETAIL_ECOM",
    HEALTHCARE: "CLINIC_HEALTH",
    CLINIC: "CLINIC_HEALTH",
    MEDICAL: "CLINIC_HEALTH",
    SERVICES: "SALON_WELLNESS",
    SALON: "SALON_WELLNESS",
    WELLNESS: "SALON_WELLNESS",
    EDUCATION: "EDUCATION_COACHING",
    B2B_SALES: "B2B_WHOLESALE",
    WHOLESALE: "B2B_WHOLESALE",
    B2B: "B2B_WHOLESALE"
  };
  const resolved = aliasMap[upper] || upper;
  return VALID_DOMAIN_CODES.has(resolved) ? resolved : null;
}

function getPlanDomainPolicy(planCode = "TRIAL") {
  const upper = String(planCode || "TRIAL").trim().toUpperCase();
  return PLAN_DOMAIN_POLICY[upper] || PLAN_DOMAIN_POLICY.TRIAL;
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function getTenantDomainAccess(tenantOrId, { isPlatformAdmin = false } = {}) {
  const tenant = typeof tenantOrId === "object" && tenantOrId !== null
    ? tenantOrId
    : db.prepare("SELECT id, name, plan_code, primary_domain, allowed_domains_json FROM tenants WHERE id = ? AND delete_status = 0").get(Number(tenantOrId) || 1);

  const planCode = String(tenant?.plan_code || "TRIAL").toUpperCase();
  const policy = getPlanDomainPolicy(planCode);
  const primaryDomain = normalizeDomainCode(tenant?.primary_domain, "HOSPITALITY") || "HOSPITALITY";

  let storedDomains = parseJsonArray(tenant?.allowed_domains_json)
    .map((d) => normalizeDomainCode(d, null))
    .filter(Boolean);

  if (!storedDomains.includes(primaryDomain)) {
    storedDomains = [primaryDomain, ...storedDomains];
  }

  let allowedDomains;
  if (isPlatformAdmin || policy.maxDomains >= DOMAIN_CATALOG.length) {
    allowedDomains = DOMAIN_CATALOG.map((d) => d.code);
  } else {
    allowedDomains = [...new Set(storedDomains)].slice(0, policy.maxDomains);
  }

  const activeProfile = DOMAIN_CATALOG.find((d) => d.code === primaryDomain) || DOMAIN_CATALOG[0];

  const hasExplicitDomainConfig = Boolean(
    tenant &&
    tenant.allowed_domains_json !== null &&
    tenant.allowed_domains_json !== undefined &&
    String(tenant.allowed_domains_json).trim() !== ""
  );

  return {
    planCode,
    maxDomains: isPlatformAdmin ? DOMAIN_CATALOG.length : policy.maxDomains,
    multiDomainEnabled: isPlatformAdmin ? true : policy.multiDomainEnabled,
    policyLabel: isPlatformAdmin ? "Platform Super-Admin — All Domains" : policy.label,
    primaryDomain,
    allowedDomains,
    hasExplicitDomainConfig,
    activeProfile,
    availableProfiles: DOMAIN_CATALOG.map((d) => ({
      ...d,
      unlocked: allowedDomains.includes(d.code),
      isPrimary: d.code === primaryDomain
    }))
  };
}

function getPublicDomainCatalog() {
  return DOMAIN_CATALOG.map((d) => {
    const bp = SECTOR_BLUEPRINTS[d.code];
    return {
      ...d,
      sampleBusinessName: bp?.entity?.name || d.name,
      sampleItemsCount: bp?.items?.length || 0,
      sampleItems: (bp?.items || []).slice(0, 3).map((i) => ({
        title: i.title,
        price: i.base_price
      }))
    };
  });
}

/**
 * Provisions a complete pre-built business profile for a tenant's chosen domain:
 * updates tenant primary/allowed domains, seeds ERP masters, catalog, pricing,
 * WhatsApp flow, and publishes the matching pre-built Studio chat experience.
 */
function provisionTenantDomainProfile(tenantId, {
  domain = "HOSPITALITY",
  businessName = null,
  phone = null,
  city = null,
  userId = "system",
  isPlatformAdmin = false
} = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const resolvedDomain = normalizeDomainCode(domain, null);
  if (!resolvedDomain) {
    const err = new Error(`Unsupported business domain '${domain}'.`);
    err.statusCode = 400;
    throw err;
  }

  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ? AND delete_status = 0").get(numericTenantId);
  if (!tenant) {
    throw new Error(`Workspace #${numericTenantId} not found.`);
  }

  const policy = getPlanDomainPolicy(tenant.plan_code);
  const currentAllowed = parseJsonArray(tenant.allowed_domains_json)
    .map((d) => normalizeDomainCode(d, null))
    .filter(Boolean);

  if (!isPlatformAdmin && currentAllowed.length > 0 && !currentAllowed.includes(resolvedDomain)) {
    if (policy.maxDomains <= 1 && tenant.primary_domain && tenant.primary_domain !== resolvedDomain && currentAllowed.length >= policy.maxDomains) {
      // Allow switching primary domain only if caller is explicitly updating during onboarding; otherwise enforce plan cap on multi-domain additions
      if (policy.multiDomainEnabled === false && currentAllowed.length >= 1) {
        const nextAllowed = [resolvedDomain];
        db.prepare(`
          UPDATE tenants
          SET primary_domain = ?, allowed_domains_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(resolvedDomain, JSON.stringify(nextAllowed), numericTenantId);
      }
    } else if (currentAllowed.length >= policy.maxDomains) {
      const err = new Error(`Your current ${tenant.plan_code} plan supports up to ${policy.maxDomains} domain(s). Upgrade to unlock more.`);
      err.statusCode = 403;
      err.code = "DOMAIN_PLAN_LIMIT_REACHED";
      throw err;
    } else {
      const nextAllowed = [...new Set([...currentAllowed, resolvedDomain])];
      db.prepare(`
        UPDATE tenants
        SET allowed_domains_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(nextAllowed), numericTenantId);
    }
  } else {
    const nextAllowed = [...new Set([resolvedDomain, ...currentAllowed])].slice(0, policy.maxDomains);
    db.prepare(`
      UPDATE tenants
      SET primary_domain = COALESCE(primary_domain, ?),
          allowed_domains_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(resolvedDomain, JSON.stringify(nextAllowed), numericTenantId);
  }

  // 1. Ensure matching pre-built Studio Conversational Experience exists BEFORE seeding flow so link resolves directly
  const bp = SECTOR_BLUEPRINTS[resolvedDomain];
  const resolvedBizName = businessName || `${tenant.name?.replace(/'s Workspace$/i, "") || bp?.entity?.name || resolvedDomain}`;

  let studioExp = db.prepare(`
    SELECT * FROM inapp_experiences
    WHERE tenant_id = ? AND delete_status = 0
    ORDER BY (status = 'PUBLISHED') DESC, id ASC LIMIT 1
  `).get(numericTenantId);

  if (!studioExp) {
    const domainMeta = DOMAIN_CATALOG.find((d) => d.code === resolvedDomain);
    if (domainMeta?.studioBlueprintKey) {
      studioExp = industryBlueprintService.cloneBlueprintToTenant(
        numericTenantId,
        domainMeta.studioBlueprintKey,
        {
          name: `${resolvedBizName || domainMeta.name} Concierge`,
          publishImmediately: true
        },
        userId
      );
    }
  }

  // 2. Provision full pre-built sector suite (masters, catalog entity + items, addons, pricing, hybrid flow)
  const suiteResult = importFullIndustrySuite(numericTenantId, {
    sectorCode: resolvedDomain,
    businessName: resolvedBizName,
    phone: phone || bp?.entity?.phone_e164 || "+919999900000",
    city: city || bp?.entity?.city || "Mumbai",
    experienceSlug: studioExp?.slug || ""
  }, userId);

  const updatedAccess = getTenantDomainAccess(numericTenantId, { isPlatformAdmin });
  return {
    success: true,
    domain: resolvedDomain,
    suite: suiteResult,
    studioExperienceId: studioExp?.id || null,
    domainAccess: updatedAccess
  };
}

/**
 * Adds or switches a workspace domain respecting plan entitlements.
 */
function activateDomainForTenant(tenantId, domain, { makePrimary = false, businessName = null, userId = "owner", isPlatformAdmin = false } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const resolvedDomain = normalizeDomainCode(domain, null);
  if (!resolvedDomain) {
    const err = new Error(`Unsupported business domain '${domain}'.`);
    err.statusCode = 400;
    throw err;
  }

  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ? AND delete_status = 0").get(numericTenantId);
  if (!tenant) throw new Error(`Workspace #${numericTenantId} not found.`);

  const currentAccess = getTenantDomainAccess(tenant, { isPlatformAdmin });
  if (!currentAccess.allowedDomains.includes(resolvedDomain)) {
    if (!isPlatformAdmin && currentAccess.allowedDomains.length >= currentAccess.maxDomains) {
      const err = new Error(`Plan limit reached: ${currentAccess.policyLabel}. Upgrade your plan to add ${resolvedDomain}.`);
      err.statusCode = 403;
      err.code = "DOMAIN_PLAN_LIMIT_REACHED";
      throw err;
    }
  }

  const nextPrimary = makePrimary ? resolvedDomain : (tenant.primary_domain || resolvedDomain);
  const currentStored = parseJsonArray(tenant.allowed_domains_json)
    .map((d) => normalizeDomainCode(d, null))
    .filter(Boolean);
  const nextAllowed = [...new Set([nextPrimary, ...currentStored, resolvedDomain])].slice(0, currentAccess.maxDomains);

  db.prepare(`
    UPDATE tenants
    SET primary_domain = ?,
        allowed_domains_json = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextPrimary, JSON.stringify(nextAllowed), numericTenantId);

  let domainExp = db.prepare(`
    SELECT * FROM inapp_experiences
    WHERE tenant_id = ? AND delete_status = 0
    ORDER BY (status = 'PUBLISHED') DESC, id ASC LIMIT 1
  `).get(numericTenantId);

  if (!domainExp) {
    const domainMeta = DOMAIN_CATALOG.find((d) => d.code === resolvedDomain);
    if (domainMeta?.studioBlueprintKey) {
      domainExp = industryBlueprintService.cloneBlueprintToTenant(
        numericTenantId,
        domainMeta.studioBlueprintKey,
        {
          name: `${businessName || domainMeta.name} Concierge`,
          publishImmediately: true
        },
        userId
      );
    }
  }

  // Preserve existing workspace business name on Re-Sync when caller did not explicitly override it
  let resolvedBusinessName = businessName;
  if (!resolvedBusinessName) {
    if (resolvedDomain === "HOSPITALITY") {
      const existingProp = db.prepare(`
        SELECT name FROM properties
        WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0
        ORDER BY id ASC LIMIT 1
      `).get(numericTenantId);
      if (existingProp?.name) resolvedBusinessName = existingProp.name;
    }
    if (!resolvedBusinessName) {
      const existingEntity = db.prepare(`
        SELECT name FROM business_entities
        WHERE tenant_id = ? AND domain = ? AND COALESCE(delete_status, 0) = 0
        ORDER BY id ASC LIMIT 1
      `).get(numericTenantId, resolvedDomain);
      if (existingEntity?.name) resolvedBusinessName = existingEntity.name;
    }
  }

  const suiteResult = importFullIndustrySuite(numericTenantId, {
    sectorCode: resolvedDomain,
    businessName: resolvedBusinessName || undefined,
    experienceSlug: domainExp?.slug || ""
  }, userId);

  return {
    success: true,
    domain: resolvedDomain,
    suite: suiteResult,
    domainAccess: getTenantDomainAccess(numericTenantId, { isPlatformAdmin })
  };
}

module.exports = {
  DOMAIN_CATALOG,
  PLAN_DOMAIN_POLICY,
  normalizeDomainCode,
  getPlanDomainPolicy,
  getTenantDomainAccess,
  getPublicDomainCatalog,
  provisionTenantDomainProfile,
  activateDomainForTenant
};
