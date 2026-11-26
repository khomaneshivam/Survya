const { db } = require("../config/database");

/**
 * Resolves the authenticated caller's tenant_id strictly from verified server identity.
 * Never falls back to tenant_id = 1 silently.
 */
function requireAuthTenantId(req) {
  const raw = req?.user?.tenant_id;
  const tenantId = Number(raw);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    const err = new Error("Forbidden: Valid authenticated workspace tenant context is required.");
    err.statusCode = 403;
    throw err;
  }
  return tenantId;
}

/**
 * Validates and returns a positive integer resource ID.
 */
function requirePositiveId(raw, label = "Resource ID") {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    const err = new Error(`${label} must be a positive integer.`);
    err.statusCode = 400;
    throw err;
  }
  return num;
}

/**
 * Verifies a hospitality property belongs to the authenticated tenant (fail-closed 404/403).
 */
function assertPropertyOwned(tenantId, propertyId, { allowArchived = false } = {}) {
  const tid = requirePositiveId(tenantId, "Tenant ID");
  const pid = requirePositiveId(propertyId, "Property ID");
  const prop = db.prepare(`
    SELECT * FROM properties
    WHERE id = ? AND tenant_id = ?
      ${allowArchived ? "" : "AND COALESCE(delete_status, 0) = 0"}
    LIMIT 1
  `).get(pid, tid);

  if (!prop) {
    const err = new Error("Property not found in your workspace.");
    err.statusCode = 404;
    throw err;
  }
  return prop;
}

/**
 * Verifies a business_entities record belongs to the authenticated tenant.
 */
function assertEntityOwned(tenantId, entityId) {
  const tid = requirePositiveId(tenantId, "Tenant ID");
  const eid = requirePositiveId(entityId, "Business Entity ID");
  const ent = db.prepare(`
    SELECT * FROM business_entities
    WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
    LIMIT 1
  `).get(eid, tid);

  if (!ent) {
    const err = new Error("Business entity not found in your workspace.");
    err.statusCode = 404;
    throw err;
  }
  return ent;
}

module.exports = {
  requireAuthTenantId,
  requirePositiveId,
  assertPropertyOwned,
  assertEntityOwned
};
