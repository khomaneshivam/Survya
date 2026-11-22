const { db } = require("../config/database");

/**
 * Universal Soft/Hard Delete Recycle Bin Service
 * Implements governance, recovery, referential safety, and immutable ledger protection.
 */

const ENTITY_CONFIGS = {
  users: {
    table: "users",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "email",
    displayName: "User Account"
  },
  waba_phone_numbers: {
    table: "waba_phone_numbers",
    primaryKey: "id",
    labelColumn: "display_name",
    secondaryColumn: "phone_number",
    displayName: "WhatsApp Phone Line"
  },
  conversation_flows: {
    table: "conversation_flows",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "description",
    displayName: "Conversation Flow"
  },
  campaigns: {
    table: "campaigns",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "template_name",
    displayName: "Broadcast Campaign"
  },
  templates: {
    table: "templates",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "category",
    displayName: "Meta WhatsApp Template"
  },
  contacts: {
    table: "contacts",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "phone_e164",
    displayName: "Customer Contact"
  },
  enquiries: {
    table: "enquiries",
    primaryKey: "id",
    labelColumn: "guest_name",
    secondaryColumn: "phone_e164",
    displayName: "General Enquiry"
  },
  booking_enquiries: {
    table: "booking_enquiries",
    primaryKey: "id",
    labelColumn: "guest_name",
    secondaryColumn: "phone_e164",
    displayName: "Booking Enquiry"
  },
  crm_pipelines: {
    table: "crm_pipelines",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "description",
    displayName: "CRM Pipeline"
  },
  crm_records: {
    table: "crm_records",
    primaryKey: "id",
    labelColumn: "title",
    secondaryColumn: "contact_phone",
    displayName: "CRM Lead/Deal"
  },
  business_entities: {
    table: "business_entities",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "slug",
    displayName: "Business Entity"
  },
  catalog_items: {
    table: "catalog_items",
    primaryKey: "id",
    labelColumn: "title",
    secondaryColumn: "slug",
    displayName: "Catalog Item"
  },
  room_types: {
    table: "room_types",
    primaryKey: "id",
    labelColumn: "name",
    secondaryColumn: "room_code",
    displayName: "Room Type"
  },
  chat_links: {
    table: "chat_links",
    primaryKey: "id",
    labelColumn: "title",
    secondaryColumn: "slug",
    displayName: "Click-to-Chat Link"
  },
  inapp_experiences: {
    table: "inapp_experiences",
    primaryKey: "id",
    labelColumn: "title",
    secondaryColumn: "slug",
    displayName: "In-App Experience Studio"
  }
};

// Aliases for singular or common terms
const ALIAS_MAP = {
  user: "users",
  waba_phone_number: "waba_phone_numbers",
  phone_number: "waba_phone_numbers",
  phone: "waba_phone_numbers",
  conversation_flow: "conversation_flows",
  flow: "conversation_flows",
  campaign: "campaigns",
  template: "templates",
  contact: "contacts",
  enquiry: "enquiries",
  booking_enquiry: "booking_enquiries",
  crm_pipeline: "crm_pipelines",
  pipeline: "crm_pipelines",
  crm_record: "crm_records",
  deal: "crm_records",
  lead: "crm_records",
  business_entity: "business_entities",
  entity: "business_entities",
  catalog_item: "catalog_items",
  item: "catalog_items",
  room_type: "room_types",
  room: "room_types",
  chat_link: "chat_links",
  link: "chat_links",
  inapp_experience: "inapp_experiences",
  experience: "inapp_experiences"
};

const IMMUTABLE_TABLES = [
  "audit_logs",
  "whatsapp_usage_ledger",
  "merchant_payout_ledger",
  "dpdp_consent_ledger",
  "whatsapp_messages"
];

function resolveEntityKey(entityType) {
  if (!entityType) return null;
  const clean = String(entityType).trim().toLowerCase();
  if (ENTITY_CONFIGS[clean]) return clean;
  if (ALIAS_MAP[clean] && ENTITY_CONFIGS[ALIAS_MAP[clean]]) return ALIAS_MAP[clean];
  return null;
}

/**
 * List deleted items across all supported entities or a specific entity
 */
async function listDeletedItems({ entityType = "ALL", tenantId = 1, limit = 100, offset = 0 } = {}) {
  const normType = String(entityType || "ALL").trim().toUpperCase();
  const keysToQuery = normType === "ALL" 
    ? Object.keys(ENTITY_CONFIGS) 
    : [resolveEntityKey(entityType)].filter(Boolean);

  if (keysToQuery.length === 0) {
    throw new Error(`Unsupported or unknown entity type '${entityType}'.`);
  }

  const results = [];

  for (const key of keysToQuery) {
    const cfg = ENTITY_CONFIGS[key];
    try {
      // Check if table has delete_status
      const cols = db.prepare(`DESCRIBE ${cfg.table}`).all().map(c => c.Field);
      if (!cols.includes("delete_status")) continue;

      let sql = `
        SELECT *
        FROM ${cfg.table}
        WHERE delete_status = 1
      `;
      const params = [];
      if (cols.includes("tenant_id") && tenantId) {
        sql += " AND tenant_id = ?";
        params.push(tenantId);
      }
      sql += " ORDER BY deleted_at DESC, id DESC LIMIT ?";
      params.push(limit);

      const rows = db.prepare(sql).all(...params);

      for (const row of rows) {
        let label = row[cfg.labelColumn] || row.name || row.title || row.id;
        let secondary = row[cfg.secondaryColumn] || row.email || row.slug || row.phone_number || "";

        results.push({
          entityType: key,
          displayNameType: cfg.displayName,
          id: row[cfg.primaryKey],
          displayName: String(label || "Unnamed"),
          label: String(label || "Unnamed"),
          secondaryText: String(secondary || ""),
          secondary: String(secondary || ""),
          deletedAt: row.deleted_at || row.updated_at || null,
          deletedBy: row.deleted_by || "System",
          details: {
            activeStatus: row.active_status,
            createdAt: row.created_at,
            table: cfg.table
          }
        });
      }
    } catch (err) {
      console.warn(`[RecycleBin] Error querying ${cfg.table}:`, err.message);
    }
  }

  // Sort by deletedAt descending
  results.sort((a, b) => {
    const tA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const tB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return tB - tA;
  });

  return results.slice(offset, offset + limit);
}

/**
 * Restore a soft-deleted entity record
 */
async function restoreItem({ entityType, id, restoredBy = null, tenantId = 1 } = {}) {
  const key = resolveEntityKey(entityType);
  if (!key) {
    throw new Error(`Unsupported entity type '${entityType}'.`);
  }
  const cfg = ENTITY_CONFIGS[key];

  const existing = db.prepare(`
    SELECT * FROM ${cfg.table} WHERE ${cfg.primaryKey} = ?
  `).get(id);

  if (!existing) {
    throw new Error(`Record not found in ${cfg.displayName} (#${id}).`);
  }

  if (Number(existing.delete_status) === 0) {
    return { success: true, message: `${cfg.displayName} #${id} is already active (not in Recycle Bin).`, item: existing };
  }

  // Restore record
  db.prepare(`
    UPDATE ${cfg.table}
    SET delete_status = 0,
        active_status = 1,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE ${cfg.primaryKey} = ?
  `).run(id);

  // If conversation_flow: reactivate triggers
  if (key === "conversation_flows") {
    try {
      db.prepare("UPDATE workflow_triggers SET is_active = 1, delete_status = 0 WHERE flow_id = ?").run(id);
    } catch (e) {}
  }

  // Log immutable audit log
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, 'ENTITY_RESTORED', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      restoredBy ? String(restoredBy) : "admin",
      String(id),
      JSON.stringify({ entityType: key, restoredAt: new Date().toISOString() })
    );
  } catch (auditErr) {}

  return {
    success: true,
    message: `Successfully restored ${cfg.displayName} #${id}.`,
    id,
    entityType: key
  };
}

/**
 * Permanently hard-delete a soft-deleted item with referential safety checks
 */
async function hardDeleteItem({ entityType, id, confirmHardDelete = false, deletedBy = null, tenantId = 1 } = {}) {
  if (!confirmHardDelete) {
    throw new Error("Hard delete requires explicit confirmation: { confirmHardDelete: true }.");
  }

  const key = resolveEntityKey(entityType);
  if (!key) {
    throw new Error(`Unsupported entity type '${entityType}'.`);
  }
  const cfg = ENTITY_CONFIGS[key];

  // IMMUTABLE LEDGER PROTECTION
  if (IMMUTABLE_TABLES.includes(cfg.table)) {
    throw new Error("Hard delete is strictly prohibited on immutable audit, compliance, and financial ledgers.");
  }

  const existing = db.prepare(`
    SELECT * FROM ${cfg.table} WHERE ${cfg.primaryKey} = ?
  `).get(id);

  if (!existing) {
    throw new Error(`Record not found in ${cfg.displayName} (#${id}).`);
  }

  // REFERENTIAL SAFETY CHECKS
  if (key === "users") {
    const runningCampaigns = db.prepare("SELECT COUNT(*) as cnt FROM campaigns WHERE user_id = ? AND status = 'RUNNING'").get(id)?.cnt || 0;
    if (runningCampaigns > 0) {
      throw new Error(`Cannot hard-delete user #${id}: has ${runningCampaigns} active running campaigns.`);
    }
  } else if (key === "crm_pipelines") {
    const activeRecords = db.prepare("SELECT COUNT(*) as cnt FROM crm_records WHERE pipeline_id = ? AND COALESCE(delete_status, 0) = 0").get(id)?.cnt || 0;
    if (activeRecords > 0) {
      throw new Error(`Cannot hard-delete pipeline #${id}: has ${activeRecords} active CRM deals. Delete or move them first.`);
    }
  } else if (key === "business_entities") {
    const activeItems = db.prepare("SELECT COUNT(*) as cnt FROM catalog_items WHERE entity_id = ? AND COALESCE(delete_status, 0) = 0").get(id)?.cnt || 0;
    if (activeItems > 0) {
      throw new Error(`Cannot hard-delete business entity #${id}: has ${activeItems} active catalog items.`);
    }
  } else if (key === "waba_phone_numbers") {
    const assignedUsers = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE assigned_phone_id = ?").get(id)?.cnt || 0;
    if (assignedUsers > 0) {
      throw new Error(`Cannot hard-delete phone line #${id}: currently assigned to ${assignedUsers} users.`);
    }
  }

  // Perform permanent hard delete
  db.prepare(`DELETE FROM ${cfg.table} WHERE ${cfg.primaryKey} = ?`).run(id);

  // Clean up dependent triggers if deleting conversation_flows
  if (key === "conversation_flows") {
    try {
      db.prepare("DELETE FROM workflow_triggers WHERE flow_id = ?").run(id);
    } catch (e) {}
  }

  // Log immutable audit log
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, 'ENTITY_HARD_DELETED', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      deletedBy ? String(deletedBy) : "admin",
      String(id),
      JSON.stringify({
        entityType: key,
        table: cfg.table,
        deletedRecord: existing,
        confirmedAt: new Date().toISOString()
      })
    );
  } catch (auditErr) {}

  return {
    success: true,
    message: `Permanently hard-deleted ${cfg.displayName} #${id}.`,
    id,
    entityType: key
  };
}

module.exports = {
  ENTITY_CONFIGS,
  resolveEntityKey,
  listDeletedItems,
  restoreItem,
  hardDeleteItem
};
