/**
 * Resolve the receiving WhatsApp Business line from the trusted account registry.
 * Unknown and duplicate IDs are rejected rather than defaulting to tenant 1.
 */
function resolveWhatsAppContext(phoneNumberId, { simulation = false, database = null } = {}) {
  const id = String(phoneNumberId || '').trim();
  if (!id) {
    return simulation ? { tenantId: 1, propertyId: 1, channelAccountId: null } : null;
  }

  const db = database || require('../../config/database').db;
  const accounts = db.prepare(`
    SELECT id, tenant_id, phone_number_id FROM waba_phone_numbers
    WHERE phone_number_id = ?
      AND COALESCE(delete_status, 0) = 0
      AND status IN ('VERIFIED', 'ACTIVE', 'CONNECTED', 'REGISTERED')
    ORDER BY is_default DESC, id ASC
    LIMIT 5
  `).all(id);
  if (!accounts || accounts.length === 0) return null;

  // Reject genuine cross-tenant conflicts while allowing redundant legacy rows belonging to ONE tenant
  const distinctTenants = [...new Set(
    accounts.map(a => Number(a.tenant_id)).filter(t => Number.isSafeInteger(t) && t > 0)
  )];
  if (distinctTenants.length !== 1) return null;
  const tenantId = distinctTenants[0];

  const flow = db.prepare(`
    SELECT property_id FROM conversation_flows
    WHERE tenant_id = ? AND phone_number_id = ? AND status = 'PUBLISHED'
      AND property_id IS NOT NULL
    ORDER BY is_default DESC, priority DESC, id ASC LIMIT 1
  `).get(tenantId, id);
  const property = flow?.property_id ? null
    : db.prepare('SELECT id FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0 ORDER BY id ASC LIMIT 1').get(tenantId);
  return {
    tenantId,
    propertyId: flow?.property_id || property?.id || null,
    channelAccountId: id
  };
}

module.exports = { resolveWhatsAppContext };
