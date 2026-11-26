# SURVYA — Phase 1 Test & Migration Baseline (`59e71f5`)

> Executed on isolated MySQL 8.0.44 test database (`127.0.0.1:13306`, `DISABLE_SCHEDULER=true`, `NODE_ENV=test`, `TZ=Asia/Kolkata`, zero live Meta/email/payment calls).

---

## 1. Automated Regression Baseline (`86` Test Files)

Observed verbatim on commit `59e71f5` prior to stabilization edits:
- **Command:** `node --test --test-concurrency=1 tests/*.test.js` (`86` files)
- **Summary:** `tests: 537`, `suites: 96`, `pass: 536`, `fail: 0`, `cancelled: 0`, `skipped: 1` (`database integration suite is opt-in`)
- **Frontend Lint (`npm --prefix frontend run lint`):** `oxlint` exited `0` (`Found 657 warnings and 0 errors.`)
- **Frontend Build (`npm --prefix frontend run build`):** `vite build` exited `0` (`2347 modules transformed`, `built in 1.64s`)

*(Reference historical context: earlier pre-Layers-1-10 audit in `docs/PRODUCT_GAP_ANALYSIS.md` reported 473 tests / 393 passed / 79 failed on commit `7cdd969`; subsequent Layers 1–10 and Flow Canvas / Domain gating commits brought tests to `536 pass / 0 fail`.)*

---

## 2. Fresh Empty Database Deployment & Index Baseline

Executed on branch `fix/platform-stabilization-prod-readiness` against empty databases:

- **`node scripts/test_fresh_deployment.js`:** Exited `0`:
  - `109` tables initialized cleanly.
  - Default seeds verified (`1` tenant, `1` property `KonkanTrip Beach Resort & Spa`, `3` room types, `2` chat links, `16` settings, `2` business entities, `3` rate plans, `3` CRM pipelines).
- **Direct `SHOW INDEX` Audit on Clean Fresh Install (`whatsapp_bulk_idx_audit`) — Confirms Silent Index Drop Defect (`BUG-P9-02`):**

| Table | Observed Key Names on Fresh Install | Missing Expected Indexes (Silently Swallowed at Startup) |
|---|---|---|
| `campaigns` | `PRIMARY`, `idx_campaigns_status_scheduled`, `idx_campaigns_user` | `idx_campaigns_tenant_created` (columns `tenant_id`, `delete_status` added after `INDEXES`) |
| `catalog_items` | `PRIMARY`, `idx_items_entity`, `idx_items_sku` | `idx_cat_fast_filter`, `idx_cat_master_links`, `idx_ucat_filter` (universal & soft-delete columns added after `INDEXES`) |
| `daily_inventory_matrix` | `PRIMARY` | `idx_inv_date`, `idx_inv_entity_date` (`inventory_date` starts as `longtext` before `runColumnMigrations` converts it to `VARCHAR(32)`) |
| `room_inventory_daily` | `PRIMARY`, `idx_room_inventory_daily` | Salvaged later by `runColumnMigrations:709-731` |
| `waba_phone_numbers` | `PRIMARY`, `idx_waba_phone_id`, `idx_waba_tenant` | Missing active `UNIQUE` guard on `phone_number_id` |
| `properties` | `PRIMARY` | Missing `idx_properties_tenant` and soft-delete columns (`active_status`, `delete_status`, `deleted_at`, `deleted_by`) |

---

## 3. Baseline Release Gap Summary

Despite `536` passing unit/integration tests on `59e71f5`, existing tests miss critical real-world defects documented in `docs/audit/BUG_REGISTER.md` (single-pool `mysqlWorker.js` sync transaction interleaving, 100-request simultaneous room booking concurrency race, `DataTable` 1-arg CRM stage rendering bug in live UI, non-transactional webhook dedup before enqueue, Razorpay event/amount bypass, property #1 overwrite paths, cross-domain blueprint auto-publishing onto Global/Default line, and dropped fresh-install indexes). These gaps define our Phase 2–10 work packages and new mandatory regression suites.
