# SURVYA — Root Cause Analysis (Confirmed Production Incidents)

> Traceability from reported customer/operator symptoms to verified codebase root causes.

---

## 1. Incident: Creating "Greenvally Hotel & Resort" Overwrote "KonkanTrip Beach Resort & Spa" (Phase 2)

- **Root Causes:**
  1. `hospitalityRoutes.js` exposes `GET/PUT /properties/:id` with **no `POST /properties`** creation endpoint.
  2. `universalCatalogService.importFullIndustrySuite` (`1970-1976`) queries `SELECT id FROM properties WHERE tenant_id = ? ORDER BY id ASC LIMIT 1` and updates that existing Property #1 record with the newly entered business name.
  3. `universalCatalogService.updateBusinessProfile` (`2186-2189`) similarly updates `properties ORDER BY id ASC LIMIT 1` (omitting `AND tenant_id = ?` in `WHERE id = ?`).
  4. `webhookService.saveAutoReplySettings` (`3924`) executes `UPDATE properties SET name = ? WHERE id = 1` when Tenant 1 updates auto-reply settings.
  5. `InventoryCalendarPage.jsx` initializes `selectedPropertyId` to `useState(1)`, hides the switcher when `properties.length <= 1`, and has no Create Property workflow.

## 2. Incident: Outbound WhatsApp Succeeded While Inbound Messages Failed / Dropped (Phase 3)

- **Root Causes:**
  1. **Duplicate WABA Rows Block Context Resolution:** `waba_phone_numbers` lacks a `UNIQUE` index on `phone_number_id`. `conversationContextResolver.js` requires `accounts.length === 1` (`delete_status` unchecked). Live DB inspection confirmed duplicate `VERIFIED` rows for `phone_number_id = '1510764325447375'`, causing `webhookService.saveCustomerReply` to reject inbound messages.
  2. **Cross-File Credential & App Secret Drift:** `META_APP_ID` is absent from `env.js`; `metaEmbeddedSignupService.exchangeCode` ignores DB `getSetting("META_APP_SECRET")`; `WHATSAPP_BUSINESS_ACCOUNT_ID` and `WHATSAPP_WABA_ID` hold conflicting values in live settings; `whatsappMessagingService.resolveCredentialsForPhone` forces global settings for all tenants instead of `waba_phone_numbers` tokens; `/admin/phone-numbers*` ignore `access_token_enc`.
  3. **Dedup Before Enqueue Loss Window:** `webhookController.handleIncomingEvent` inserts `incoming_webhook_events` before `enqueueJob`; a failed enqueue returns `503` but Meta's retry sees committed dedup keys and drops the webhook with `200 EVENT_RECEIVED`.

## 3. Incident: CRM Null Stages, Zero Upcoming Check-ins & Dashboard Revenue Mismatch (Phase 4)

- **Root Causes:**
  1. **Null Stages in Both CRM Tables:** `DataTable.jsx:232-238` passes scalar `row[fieldKey]` as arg 1 when `fieldKey in row`, while `EnquiriesPage.jsx` uses 1-arg `render: (row) => ...`, turning `row.stage_name` and `row.status` into `undefined`. Additionally Kanban/Drawer read `stg.id`/`stg.name` vs schema `{ key, label }`.
  2. **Zero Check-ins:** `enquiryService.getDashboardSummary` checks `user.role !== "ADMIN"` instead of `isWorkspaceAdmin(user)` (filtering out Workspace `OWNER`s and bot-assigned enquiries), reads only `booking_enquiries` (ignoring `crm_records` and `universal_transactions`), and compares `longtext` dates against UTC instead of IST.
  3. **Revenue Drift:** `enquiryService` sums every quote row on `WON` enquiries (ignoring `CONFIRMED` and `universal_transactions`), `reportsController` checks dead `q.status = 'WON'` and joins `ut.crm_record_id = q.enquiry_id`, and `hospitalityFlowEngine` creates quotes with a 12% fallback tax rate instead of `hospitalityPricingService` rules.

## 4. Incident: Published Education Workflow Visible on Hospitality "Global / Default" Line (Phase 6)

- **Root Causes:**
  1. `universalCatalogController.seedBlueprint` / `importFullSuite` perform no check against tenant allowed domains (`ENTERPRISE` unlocks all 8 sectors), seed `EDUCATION_COACHING` (`phone_number_id = NULL` shown as `Global / Default`), merge generic greeting triggers (`"hi"`, `"hello"`, `"menu"`), immediately auto-publish (`publishFlow`), and overwrite Tenant 1 `settings.BOT_BUSINESS_NAME` (`"NextGen Tech Institute & Code Academy"` verified in live DB).
  2. `workflowTriggerService.syncFlowTriggers` queries nonexistent column `trigger_keywords` instead of `trigger_keywords_json` (`try/catch` discards errors).
  3. `conversation_flow_templates` has no `tenant_id`, `templateController.listTemplates` omits `tenant_id`, and `conversationFlowController.listSessions` swaps `(tenantId, options)` into `(flowId, options, tenantId)`.

---

## 5. Incident: Cross-File Credential Drift, Webhook Secret Override & Plaintext Token Persistence (WS3)

- **Root Causes:**
  1. `webhookController.verifyMetaSignature` checked `config.META_APP_SECRET` ahead of DB `getSetting("META_APP_SECRET")`, ignoring UI secret rotations whenever `.env` had an older secret.
  2. `cryptoUtil.decrypt` returned the original `enc:aes-256-gcm:` ciphertext verbatim on key mismatch, causing downstream Meta Graph callers to dispatch ciphertext in `Authorization: Bearer` headers.
  3. `adminController.registerPhoneNumber` persisted plaintext `access_token` instead of `access_token_enc`, while `sarvyaConnectController` returned `access_token_enc` in API JSON responses and `flowService` bypassed `resolveCredentials()` and `isSandbox` checks.

## 6. Incident: Payment/Settlement Mismatch, Simulated Escrow Retirement & CRM Schema Drift (WS4)

- **Root Causes:**
  1. `paymentPayoutService` and `PayoutsPage.jsx` modeled simulated PA/PG escrow fees (`2%`), NPCI penny-drop references (`NPCI_PD_...`), and IMPS UTR dispatches (`4319...`), rather than operating purely in Merchant-Direct mode.
  2. `hospitalityAvailabilityService.reserveConfirmedBookingAtomically` wrote `booking_enquiries` without synchronizing `room_inventory_daily`, and `checkRoomAvailability` omitted `overall_status`.
  3. `complianceService.js` and `recycleBinService.js` queried legacy `crm_records`/`crm_pipelines` columns (`title`, `stage`, `value`, `custom_data`, `description`) that do not exist in `src/config/schema.js`.
  4. `reportsController` and `metaRateService` aggregated `is_sandbox = 1` / `WAIVED_SANDBOX` rows alongside production tenants.

## 7. Incident: Workflow Executor Output Contract Mismatch & AI Unbounded Calls (WS5–WS6)

- **Root Causes:**
  1. `masterPickerExecutor` returned `message` rather than `replyMessages` + `replyInteractive` expected by `conversationFlowEngine.processTurn`.
  2. `catalogBookingExecutor` silently fabricated `7840 / 7000 / 840` rupee quotes and `isAvail = true` on pricing/availability exceptions, while `resolveNextTransition` followed single outbound edges even on explicit `failure`/`unavailable`/`max_retries` handles.
  3. `voiceTranscriptionService` imported an unlisted `'form-data'` package and cached API keys at startup; external AI calls lacked `AbortSignal.timeout` and `is_sandbox` short-circuits.

## 8. Incident: Dead Code Bloat, CI Quality Bypass & Hanging Test Handles (WS7–WS8)

- **Root Causes:**
  1. 8 legacy unmounted routers (`src/routes/*`), `tenantScope.js`, 18 dead frontend files/components, and `@types/*`/`uuid` packages remained in the repository alongside stale `KonkanTrip` UI placeholders.
  2. `.github/workflows/conversation-foundation.yml` set `VERIFY_WEBHOOK_SIGNATURE: "false"`, while `.github/workflows/ci-cd.yml` ran a partial subset without `DISABLE_SCHEDULER: "true"` or `WHATSAPP_API_TOKEN`, and HTTP test suites left MySQL pool/socket handles open.
