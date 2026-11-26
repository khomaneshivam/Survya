# SURVYA — Confirmed Bug & Investigation Register (Baseline @ `59e71f5`)

> **Classification:** Only defects directly verified in source files, runtime database state, or empirical schema checks are marked `CONFIRMED`. Runtime-inferred issues not yet executed under load are marked `SUSPECTED`.

---

## Phase 2 — Tenant Isolation, Property Lifecycle & Hardcoded IDs

| ID | Severity | Status | Affected Module(s) | Summary & Root Cause | Resolution Status | Planned Regression Test |
|---|---|---|---|---|---|---|
| **BUG-P2-01** | **P0** | **CONFIRMED** | `hospitalityRoutes.js`, `hospitalityController.js`, `hospitalityConfigService.js`, `universalCatalogService.js`, `webhookService.js:3924`, `InventoryCalendarPage.jsx` | Creating a new property overwrote existing KonkanTrip Property #1: no `POST /hospitality/properties` endpoint exists; `importFullIndustrySuite` & `updateBusinessProfile` run `ORDER BY id ASC LIMIT 1`; `saveAutoReplySettings` runs `UPDATE properties SET name = ? WHERE id = 1`; frontend initializes `useState(1)` with no create UI. | `OPEN` | `tests/property_lifecycle_isolation.test.js` |
| **BUG-P2-02** | **P0** | **CONFIRMED** | `hospitalityController.js:29,76`, `hospitalityConfigService.js:24,967` | Cross-tenant IDOR parameter swap: controller passes `(tenantId, propertyId)` to service expecting `(propertyId, tenantId)`, letting Tenant 2 read Tenant 1's property #2 via swapped query. Write routes also omit `assertPropertyOwnedByTenant` & `requireWorkspaceAdmin`. | `OPEN` | `tests/property_lifecycle_isolation.test.js` |
| **BUG-P2-03** | **P1** | **CONFIRMED** | `hospitalityController.js:737-856` | Public hospitality routes accept unauthenticated `req.query.tenant_id`/`req.body.tenant_id` (`|| 1`), leaking any tenant's properties/rates/rooms. | `OPEN` | `tests/property_lifecycle_isolation.test.js` |
| **BUG-P2-04** | **P1** | **CONFIRMED** | `schema.js:472`, `templateBindingService.js:34-37`, `room_inventory_daily` | `properties` lacks soft-delete columns causing `WHERE delete_status = 0` to fail silently inside `try/catch` and fall back to `id = 1`; `room_inventory_daily` lacks `property_id`. | `OPEN` | `tests/property_lifecycle_isolation.test.js` |
| **BUG-P2-05** | **P1** | **CONFIRMED** | `chatLinkController.js:386,436`, `sarvyaConnectController.js:565`, `catalogController.js:118,130`, `inappRuntimeService.js:226,396`, 100+ `\|\| 1` paths | Hardcoded Tenant 1 / Property 1 / phone `919307382030` / brand `"Hotel Green Vally"` fallbacks across services & UI (`HospitalityImageUploadModule`, `CallConnectScreen`, `ConfirmationScreen`, `ResourceBindingPicker`); `catalogController` reads `:id` instead of `:catId`; `inappRuntimeService` treats `business_entity_id` as `property_id`. | `OPEN` | `tests/property_lifecycle_isolation.test.js` |

---

## Phase 3 — WhatsApp Webhook Ingress & Configuration Precedence

| ID | Severity | Status | Affected Module(s) | Summary & Root Cause | Resolution Status | Planned Regression Test |
|---|---|---|---|---|---|---|
| **BUG-P3-01** | **P0** | **CONFIRMED** | `webhookController.js:158-210`, `jobQueueService.js` | Dedup keys inserted into `incoming_webhook_events` **before** `enqueueJob` outside a transaction: queue failure returns `503`, but Meta retries hit committed dedup row and return `200` silently dropping the message; events remain stuck in `'PROCESSING'`. | `OPEN` | `tests/webhook_durability_and_config.test.js` |
| **BUG-P3-02** | **P0** | **CONFIRMED** | `workflow/conversationContextResolver.js:12-17`, `schema.js:58`, `webhookService.js:704-712` | Duplicate active `phone_number_id` rows (`'1510764325447375'`) break `accounts.length === 1` check, causing `saveCustomerReply` to reject inbound messages; query omits `delete_status = 0` and table lacks `UNIQUE` constraint. | `OPEN` | `tests/webhook_durability_and_config.test.js` |
| **BUG-P3-03** | **P0** | **CONFIRMED** | `metaWhatsAppService.js`, `whatsappMessagingService.js:302`, `metaEmbeddedSignupService.js:18,97`, `adminController.js`, `settingsController.js`, `server.js:260` | Split Meta credential precedence: `META_APP_ID` missing from `env.js`; `exchangeCode` ignores DB `META_APP_SECRET`; `WHATSAPP_BUSINESS_ACCOUNT_ID` & `WHATSAPP_WABA_ID` diverge; `resolveCredentialsForPhone` forces global settings for all tenants; `resolveWabaId` lacks tenant filter; `/admin/phone-numbers*` ignore `access_token_enc`. | `OPEN` | `tests/webhook_durability_and_config.test.js` |
| **BUG-P3-04** | **P1** | **CONFIRMED** | `webhookService.js:563-571`, `adminController.js:966,978`, `SystemAdminPanel.jsx:925`, `settingsController.js:68` | `verifyHandshake` still accepts `.env` and hardcoded fallback `"wb_verify_konkantrip_..."` even after rotation; `getWebhookConfig` queries nonexistent table `replies` & exposes unmasked verify token; Meta Settings form drops `WEBHOOK_VERIFY_TOKEN` edits. | `OPEN` | `tests/webhook_durability_and_config.test.js` |
| **BUG-P3-05** | **P1** | **CONFIRMED** | `webhookService.js:655,2508,3552`, `jobWorkerEngine.js:544-553`, `jobQueueRoutes.js` | `triggerAutoReply` runs unawaited inside `META_WEBHOOK_INGEST` bypassing retries/DLQ; bot `customer_replies` omit `tenant_id`; stale-lock reset ignores `max_attempts`; webhook jobs (`tenant_id = 0`) hidden from admin queue UI; `webhookWorker` syncs unrelated schedules every 1s. | `OPEN` | `tests/webhook_durability_and_config.test.js` |
| **BUG-P3-06** | **P2** | **CONFIRMED** | `scripts/send_meta_test_webhook.js:12,308` | Test webhook script uses inverted secret precedence (`config` -> `env` -> `DB`), risks signing with encrypted ciphertext on decrypt mismatch, mutates DB on import, and queries nonexistent `sender_phone` on `flow_responses`. | `OPEN` | Manual / Script verification |

---

## Phase 4 — CRM, Booking & Dashboard Reconciliation

| ID | Severity | Status | Affected Module(s) | Summary & Root Cause | Resolution Status | Planned Regression Test |
|---|---|---|---|---|---|---|
| **BUG-P4-01** | **P1** | **CONFIRMED** | `EnquiriesPage.jsx:542-600, 947-1003`, `DataTable.jsx:223-239` | CRM Lead Pipeline & Dynamic Pipelines tables render blank stages/cells because `DataTable` passes scalar `row[fieldKey]` as arg 1 while 1-arg `render(row)` expects row object. | `OPEN` | `tests/crm_dashboard_reconciliation.test.js` |
| **BUG-P4-02** | **P1** | **CONFIRMED** | `EnquiriesPage.jsx:768-812, 1595`, `schema.js:1241`, `crmPipelineController.js:108`, `inappRuntimeService.js:866`, `jobWorkerEngine.js:280`, `universalFulfillmentService.js:331` | Kanban & Drawer read `stg.id`/`stg.name` vs schema `{ key, label }`; `updateStage` ignores `stage_key`; automated writers hardcode mismatched stage keys (`NEW_LEAD`, `NEW`, `PROSPECT`). | `OPEN` | `tests/crm_dashboard_reconciliation.test.js` |
| **BUG-P4-03** | **P1** | **CONFIRMED** | `enquiryService.js:412-490`, `reportsController.js:428-501`, `hospitalityFlowEngine.js:829-845`, `paymentPayoutService.js:347`, `universalPricingService.js:271` | Upcoming check-ins show `0` (queries only `booking_enquiries`, checks `user.role !== "ADMIN"` excluding Owners & bot leads, uses UTC date & `longtext`); revenue/quotes diverge across `enquiryService` (multi-quote WON inflation), `reportsController` (dead `q.status='WON'`, bad `crm_record_id = q.enquiry_id` join), `hospitalityFlowEngine` (`12%` fallback tax), and `paymentPayoutService`. | `OPEN` | `tests/crm_dashboard_reconciliation.test.js` |

---

## Phase 5 — Inventory, Pricing, Payment & Concurrency Engine

| ID | Severity | Status | Affected Module(s) | Summary & Root Cause | Resolution Status | Planned Regression Test |
|---|---|---|---|---|---|---|
| **BUG-P5-01** | **P0** | **CONFIRMED** | `src/config/mysqlWorker.js:147-174` | Sync worker pool runs `pool.query(...)` per call instead of pinning one `pool.getConnection()` across `START TRANSACTION ... FOR UPDATE ... COMMIT`, breaking concurrency isolation under shared traffic. | `OPEN` | `tests/concurrent_booking_100_race.test.js` |
| **BUG-P5-02** | **P0** | **CONFIRMED** | `universalFulfillmentService.js:390-459` | `reconcilePaymentSuccess` invokes `confirmHold` (starts nested `START TRANSACTION`) inside an open `START TRANSACTION ... FOR UPDATE`, causing an implicit MySQL commit and ignoring expired holds (`success: false`). | `OPEN` | `tests/concurrent_booking_100_race.test.js` |
| **BUG-P5-03** | **P0** | **CONFIRMED** | `publicUniversalFulfillmentRoutes.js:142-227`, `payoutController.js:76-102` | `/pay/webhook/razorpay` ignores `event` type (signed `payment.failed` or `refund.processed` settles bookings `PAID` & `CONFIRMED`), skips amount/currency verification, and ignores per-merchant `merchant_payment_configs.webhook_secret`. | `OPEN` | `tests/concurrent_booking_100_race.test.js` |
| **BUG-P5-04** | **P1** | **CONFIRMED** | `hospitalityAvailabilityService.js:393`, `universalAvailabilityService.js`, `universalFulfillmentService.js:131,556`, `unifiedOrderService.js`, `paymentPayoutService.js:177`, `server.js:13,516` | `reserveConfirmedBookingAtomically` unused in prod; `DATE_RANGE` holds unsupported; checkouts without `holdId` skip stock checks; canceling confirmed universal bookings fails to release `CONFIRMED` holds; `captureOrderPayment` unlocked & hits legacy `stock_quantity` col; `server.js` doesn't run `default`/`maintenance` hold-expiry workers. | `OPEN` | `tests/concurrent_booking_100_race.test.js` |
| **BUG-P5-05** | **P1** | **CONFIRMED** | `universalPricingService.js:173-241`, `universalFulfillmentService.js:80-88,275-315`, `schema.js:46,103` | Field-name mismatch (`itemId`/`gstPercent` vs `id`/`taxRate`) zeroes out `catalog_item_id`, `tax_percent`, `tax_amount`, `line_total` on `universal_transaction_items`; `double` money types & rupee `Math.round` cause tax/total drift. | `OPEN` | `tests/concurrent_booking_100_race.test.js` |

---

## Phase 6 — Automation Studio, Flow Governance & AI

| ID | Severity | Status | Affected Module(s) | Summary & Root Cause | Resolution Status | Planned Regression Test |
|---|---|---|---|---|---|---|
| **BUG-P6-01** | **P1** | **CONFIRMED** | `universalCatalogController.js`, `universalCatalogService.js`, `conversationFlowService.js`, `workflow/runtimeCache.js`, `schema.js:67` | Un-gated blueprint imports let `EDUCATION_COACHING` publish onto Hospitality Tenant `#1` under `phone_number_id = NULL` (`Global / Default`) and overwrite `BOT_BUSINESS_NAME`; `conversation_flow_templates` lacks `tenant_id`; `is_default` is per-category instead of per-line; `templateController.listTemplates` omits `tenant_id` (`WHERE 1=1`); `aiFlowContextBuilder` exposes all tenants' WABA numbers. | `OPEN` | `tests/conversation_tenant_workflows.test.js` |
| **BUG-P6-02** | **P1** | **CONFIRMED** | `workflowTriggerService.js:29,72`, `conversationFlowController.js:516-525` | `syncFlowTriggers` queries nonexistent `trigger_keywords` (`trigger_keywords_json`), discarding flow-level keywords; `listSessions` swaps `(tenantId, options)` into `(flowId, options, tenantId)`, leaking Tenant 1 sessions across tenants! | `OPEN` | `tests/conversation_tenant_workflows.test.js` |
| **BUG-P6-03** | **P1** | **CONFIRMED** | `templateUpgradeService.js`, `templateInstallService.js`, `AutomationDetailsPage.jsx`, `AutomationStudio.jsx:148`, `useAutomations.js`, `useFlowEditor.js`, `FlowStudioPage.jsx`, `TemplateAdminPage.jsx` | `targetVersion` vs `latestVersion` breaks upgrades; upgrades fail to re-inject `WHATSAPP_LINE`/`CATALOG_CATEGORY` or invalidate trigger cache; `installTemplate` drops custom trigger keyword; 5 frontend Studio files crash or no-op due to mismatched field names/vars. | `OPEN` | `tests/template_library_and_installations.test.js` |
| **BUG-P6-04** | **P2** | **CONFIRMED** | `taskScopedAiAgentService.js:62,525`, `inboxCopilotService.js:36` | Ignore DB `getSetting("GEMINI_API_KEY")`; `resolveTenantAiProfile` grabs `ORDER BY id ASC LIMIT 1` entity domain. | `OPEN` | `tests/layer6_ai_guardrails.test.js` |

---

## Phases 7, 8 & 9 — Sandbox, UI Consolidation, Security & Schema

| ID | Severity | Status | Affected Module(s) | Summary & Root Cause | Resolution Status | Planned Regression Test |
|---|---|---|---|---|---|---|
| **BUG-P7-01** | **P1** | **CONFIRMED** | `webhookService.js:2386-2387`, `metaWhatsAppService.js`, `whatsappMessagingService.js:567,677`, `tenants` schema | `_executeConversationalFlow` passes `isSimulation: false` even during test simulation (`catalogBookingExecutor` & `templateExecutor` write live DB/billing); `sendTemplateMessage`/`sendTextMessage`/`sendFlowMessage` omit `isSimulation` checks; `whatsappMessagingService` hardcodes `tenant_id = 1` in ledger; no workspace-level `SANDBOX` mode. | `OPEN` | `tests/sandbox_isolation.test.js` |
| **BUG-P8-01** | **P1** | **CONFIRMED** | `SarvyaConnectPage.jsx:454,589`, `SystemAdminPanel.jsx:800`, `MastersHubPage.jsx:186`, `CatalogInventoryPage.jsx:337,752`, `PageSystem.jsx`, `DashboardPage.jsx`, `EnquiriesPage.jsx`, `ChatLinksPage.jsx` | Embedded Signup callbacks invoke undefined `fetchAccounts`/`fetchTemplates`/`fetchPhoneNumbers`; `MastersHubPage` seed banner renders `undefined`; `CatalogInventoryPage` checks `'DINING'`/`'RETAIL'` instead of `'RESTAURANT_FOOD'`/`'RETAIL_ECOM'`; `flows`/`automation` route overlap hides `FlowsPage`/`AutomationPage`; hospitality fields leak into non-hospitality UI/routes; zero post-register onboarding checklist. | `OPEN` | `tests/frontend_design_system.test.js`, `tests/layer8_browser_e2e.test.js` |
| **BUG-P9-01** | **P0** | **CONFIRMED** | `apiRoutes.js:343`, `settingsController.js:455`, `commerceRoutes.js:118-126`, `unifiedOrderController.js`, `authMiddleware.js`, `authController.js`, `apiRoutes.js:761` | Unauthenticated `POST /api/meta/deregister-phone` (`optionalAuth`); unauthenticated `GET /v1/orders/:id` & un-scoped order mutations; soft-deleted users (`delete_status=1`) still authenticate JWTs & login; SSE `/api/broadcast/stream` broadcasts cross-tenant events; `DELETE /templates/custom/:id` un-scoped + param bug; `publicInappRoutes`/`chatLinkService` query `customer_replies` without `tenant_id`; query-string `?token=` accepted on all routes; `httpOnly: false` cookie; unverified `X-Forwarded-For` rate limiter; `conversationFlowRoutes` `/approvals/decision` & `masterRoutes` missing `requireWorkspaceAdmin`. | `OPEN` | `tests/layer1_security_foundation.test.js`, `tests/security_and_reliability.test.js` |
| **BUG-P9-02** | **P1** | **CONFIRMED** | `src/config/schema.js:1387-1396`, `server.js` | `INDEXES` executes before `runColumnMigrations` under swallowed catch, silently dropping `idx_campaigns_tenant_created`, `idx_cat_fast_filter`, `idx_cat_master_links`, `idx_ucat_filter`, `idx_inv_date`, `idx_inv_entity_date`; 4 JSON cols declared `varchar(255)`; no `/livez`/`/readyz`, `/metrics`, or worker correlation ID propagation. | `OPEN` | `scripts/test_fresh_deployment.js` + Index Check |

---

## Suspected Issues Investigated / To Verify Under Runtime Execution

| ID | Area | Hypothesis / Observation | Verification Plan |
|---|---|---|---|
| **SUS-01** | Live Multi-Request Sync Txns | While `tests/layer5_commerce_concurrency.test.js` spawns separate worker threads (masking `mysqlWorker.js` unpinned pool), concurrent async HTTP callers inside one Express process interleave statements across pool connections. | Prove & guard with `tests/concurrent_booking_100_race.test.js` over HTTP against single Express instance. |
| **SUS-02** | Dual `stock_qty` vs `stock_quantity` Drift | Legacy vs universal catalog writers mutate different columns on `catalog_items`. | Standardize writers + sync projection & test both paths cleanly. |
| **SUS-03** | Unmounted Router Dead Code | `src/routes/resortRoutes.js` references missing handlers on `resortController.js` while `server.js` mounts `apiRoutes.js`. | Audit & clean up / deprecate safely without breaking active mounts. |
