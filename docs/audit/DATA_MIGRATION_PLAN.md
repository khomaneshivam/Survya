# SURVYA — Database Migration & Constraint Hardening Plan

> **Non-Destructive Guarantee:** Expand-migrate-contract strategy. **Zero tables or columns containing historical records are dropped.** All migrations are idempotent across both empty fresh installs and populated production clones.

---

## 1. Current Baseline Audit (`schema.js`)
- Total `TABLE_SCHEMAS` tables: **109**
- Known schema cleanliness defects verified before hardening:
  1. Redundant `CREATE TABLE IF NOT EXISTS flow_global_settings` inside `runColumnMigrations` (`L448`) duplicates `TABLE_SCHEMAS["flow_global_settings"]` (`L69`).
  2. Stale comments reference `"all 55 tables"` (`L3`) and `"all 49 tables"` (`L1440`).
  3. Empty `catch (err) {}` blocks hide DDL index errors (`L1461-1463`).
  4. Static `"wb_verify_konkantrip_7f3a9e2c4b810d56"` verify token default (`L820`) exposes identical verify token across fresh deployments if env is unset.
  5. Missing composite tenant-scoping indexes on `booking_enquiries(tenant_id, property_id, status)`, `customer_replies(tenant_id, from_phone(64), received_at)`, and `templates(tenant_id, name(128), language(32))`.
  6. Legacy `enquiries` table unused due to column mismatch in `hospitalityChatService.js:512` (`property_id`, `customer_name`, `customer_phone`, `channel`, `notes`).
  7. Legacy `merchant_payout_beneficiaries` & `merchant_payout_ledger` contain historical schema from deprecated PA/PG settlement simulation.

## 2. Migration Steps (Ordered & Idempotent)

1. **Phase A — Schema Cleanup & Random Verify Token Seed (`schema.js`):**
   - Remove redundant `flow_global_settings` `CREATE TABLE` at `L448`.
   - Generate cryptographically random `"wb_verify_" + crypto.randomBytes(16).toString("hex")` if `WEBHOOK_VERIFY_TOKEN` env is missing and DB row does not yet exist.
   - Update stale comments (`109` tables dynamically logged).
2. **Phase B — Non-Breaking Composite Indexes (`schema.js` `INDEXES`):**
   - Add `idx_booking_enquiries_tenant_prop` on `booking_enquiries (tenant_id, property_id, status)`.
   - Add `idx_customer_replies_tenant_phone` on `customer_replies (tenant_id, from_phone(64), received_at)`.
   - Add `idx_templates_tenant_name_lang` on `templates (tenant_id, name(128), language(32))`.
   - Log non-benign index creation errors (ignore only MySQL `ER_DUP_KEYNAME` / `1061` equivalent messages).
3. **Phase C — Deprecated Table Preservation (`DATABASE_TABLE_REGISTER.csv`):**
   - Stop all broken writes to `enquiries` (`hospitalityChatService` redirects to canonical enquiry/CRM pipeline).
   - Freeze `merchant_payout_beneficiaries` and `merchant_payout_ledger` writes for simulated PA/PG transfers while preserving read access for audit history.
   - Verify clean cold-start install + upgrade compatibility via `node scripts/test_fresh_deployment.js` and full regression suite on cloned production snapshot `whatsapp_bulk_prod_clone_test`.
