# SARVYA — Database Architecture & Migration Strategy

## 1. Engine & Connection Architecture

- **Primary Database:** MySQL 8.4 (`InnoDB`, `utf8mb4_unicode_ci`).
- **Time Handling Standard:** Server runs under `TZ=Asia/Kolkata`. All SQL persistence timestamps for session TTL, scheduled jobs, cooldowns, and audit trails MUST use `UTC_TIMESTAMP()` and be parsed cleanly in JS using `parseMysqlUtcTimestamp()` (`src/utils/timeUtil.js`), avoiding timezone skew from mixed `NOW()` vs `UTC_TIMESTAMP()` calls.
- **Dual Access Layer:**
  - `src/config/mysqlAdapter.js`: Synchronous bridge backed by `worker_threads` (`Atomics.wait`) used across existing synchronous service queries.
  - `src/config/asyncDb.js`: Native `mysql2/promise` pool used for asynchronous queue locking (`SELECT ... FOR UPDATE SKIP LOCKED`), transactions, and worker loops.

---

## 2. Core Table Domains (101+ Tables in `src/config/schema.js`)

1. **Identity, Tenancy & Billing:** `tenants`, `users`, `tenant_user_memberships`, `tenant_subscriptions`, `password_resets`, `audit_logs`, `settings`.
2. **Communication & Channels:** `waba_phone_numbers` (encrypted tokens via AES-256-GCM), `templates` (Meta templates), `campaigns`, `campaign_recipients`, `whatsapp_messages`, `whatsapp_usage_ledger`, `customer_replies`, `incoming_webhook_events`, `contact_marketing_cooldowns`, `contact_suppressions`, `chat_links`.
3. **CRM, Contacts & Privacy (DPDP):** `contacts`, `contact_consents`, `enquiries`, `crm_pipelines`, `crm_records`, `dpdp_consent_ledger`, `dpdp_data_requests`.
4. **Configurable Workflow & Template Ecosystem:** `conversation_flows`, `conversation_flow_versions`, `conversation_flow_sessions`, `conversation_flow_events`, `conversation_flow_templates`, `flow_approval_requests`, `flow_preview_links`, `flow_global_settings`, `flow_message_templates`, `flow_responses`, `flow_tokens`, `workflow_triggers`, `workflow_scheduled_jobs`, `template_catalog`, `template_versions`, `template_installations`, `template_bindings`.
5. **Universal Masters, Catalog & Fulfillment:** `master_*` (categories, locations, resources, payment_modes, tax_slabs, units, attributes, status_tags, domain_profiles), `business_entities`, `catalog_items`, `catalog_item_media`, `catalog_item_variants`, `catalog_addon_groups`, `catalog_addons`, `catalog_pricing_rules`, `catalog_availability_slots`, `catalog_inventory_holds`, `daily_inventory_matrix`, `universal_transactions`, `universal_transaction_items`.
6. **Hospitality Domain:** `properties`, `room_types`, `room_inventory_daily`, `booking_enquiries`, `quotes`, `quote_items`, `hospitality_*` tables.
7. **In-App Experience Studio, AI & Jobs:** `inapp_experiences`, `inapp_screens`, `inapp_form_fields`, `inapp_sessions`, `inapp_rate_negotiations`, `inapp_call_requests`, `ai_knowledge_sources`, `ai_agent_configs`, `ai_interaction_logs`, `system_job_queue`, `system_job_schedules`.

---

## 3. Identified Migration & Schema Risks (Layer 0 Audit)

1. **`room_inventory_daily` Missing Unique Key (Critical):** Currently only a non-unique index `idx_room_inventory_daily(room_type_id, inventory_date)` exists. Repeated upserts insert duplicate rows causing `checkStayAvailability()` to double-count inventory and permit double bookings. **Mitigation:** Deduplicate any duplicate rows deterministically keeping latest `id`, then apply `ALTER TABLE room_inventory_daily ADD UNIQUE KEY uq_room_inv_daily (room_type_id, inventory_date)` idempotently.
2. **In-Memory vs Durable Bot Takeover State:** Bot pause timers (`webhookService.botPausedUntil`) and contact locks are not persisted in MySQL yet. **Mitigation:** Add additive `conversation_handoff_states` table keyed by `(tenant_id, phone_number_id, contact_phone)`.
3. **Destructive Change Prohibition:** All schema updates in `src/config/schema.js` MUST remain strictly additive (`CREATE TABLE IF NOT EXISTS`, guarded `ADD COLUMN` via `INFORMATION_SCHEMA` check, non-destructive index additions) so production upgrades preserve existing tenant workflows, versions, and audit records.
4. **Timezone Drift:** Ensure `workflow_scheduled_jobs` and `schedulerService.js` strictly use `UTC_TIMESTAMP()` everywhere.
