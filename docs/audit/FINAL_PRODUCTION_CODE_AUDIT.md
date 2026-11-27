# SURVYA — Final Production Code Audit (`refactor/production-core-rationalization`)

> **Branch:** `refactor/production-core-rationalization` (branched from `4e6c60b`; `d614379` unavailable in local git object store)
> **Assessment Status:** **READY FOR LOCAL LAPTOP VERIFICATION -> STAGING CANDIDATE**
> *(Cannot certify runtime pass or staging approval until the user executes the local laptop terminal test & build commands per `AGENTS.md` §3.)*

---

## 1. Quantitative Repository Delta

| Metric | Pre-Rationalization Baseline | Post-WS7/WS8 Rationalization | Notes |
|---|---|---|---|
| **Database Tables (`src/config/schema.js`)** | `109` | `109` | Zero drops of historical tables/columns; removed duplicate `CREATE TABLE flow_global_settings`; added composite hot indexes & cryptographic fallback verify token. |
| **Removed Dead Source Files (`REMOVAL_REGISTER.md`)** | — | **`34` files removed** | `8` unmounted dead routers (`src/routes/*`), `src/utils/tenantScope.js`, `24` dead/unreferenced frontend pages/components + `useFlowEditor.js`, plus `1` dead function (`executeBusinessAction`). |
| **Removed Dependencies** | — | **`3` packages** | Removed `@types/react`, `@types/react-dom` (`frontend/package.json`), and `uuid` (`package.json`, replaced by `crypto.randomUUID()`). |
| **Authoritative Inventory Register** | `docs/audit/SOURCE_FILE_REGISTER.csv` | Refreshed via `generate_registers.js` | Reflects live tracked + added files with dead files deleted from disk. |

---

## 2. Workstream Audit Summary (WS1–WS8)

### WS1 — Architecture, Canonical State & Schema Integrity
- Published canonical architecture & ownership specifications (`FINAL_MODULE_ARCHITECTURE.md`, `CANONICAL_BUSINESS_MODEL.md`, `CANONICAL_DATA_MODEL.md`, `ENTITY_OWNERSHIP_MATRIX.md`, `STATE_TRANSITIONS.md`, `DATA_MIGRATION_PLAN.md`).
- Hardened `src/config/schema.js` (`idx_booking_enquiries_tenant_prop`, `idx_customer_replies_tenant_phone`, `idx_templates_tenant_name_lang`, random verify token default, single `flow_global_settings` DDL).

### WS2 — Security, Authentication, CSRF & Tenant Boundary Enforcement
- Fixed `ReferenceError` on `/broadcast/stream` by importing `isPlatformAdmin` (`apiRoutes.js`).
- Added cross-site cookie mutation CSRF defense (`passesCookieCsrfCheck`) and dedicated `purpose === "sse_stream"` validation for query-string stream tokens (`authMiddleware.js`).
- Hardened CORS fail-closed behavior in production and applied `apiLimiter`/`publicLimiter` across all sub-router mounts (`server.js`).
- Enforced `requireWorkspaceAdmin` across workspace, billing, flow lifecycle, in-app negotiation/call, transaction status/offline payment, and hospitality sub-resource mutations; removed `req.query.tenantId` / `x-tenant-id` header override in `universalFulfillmentRoutes.js`.
- Enforced `assertPropertyOwnedByTenant` & `publishedOnly` checks across `hospitalityConfigService.js` / `hospitalityController.js`, masked `access_token_enc` in `sarvyaConnectController.js` & `settingsController.js`, and tenant-scoped `templateController.js` & `chatLinkService.js`.

### WS3 — Unified Cryptography & Meta Credential Precedence
- Updated `cryptoUtil.decrypt()` to return `null` on decryption failure so raw AES-GCM ciphertext can never be sent as a Bearer token.
- Exported canonical `resolveMetaAppSecret()` (`DB > config > env`) and `resolveLineAccessToken()` in `metaWhatsAppService.js`; aligned `webhookController.js`, `adminController.js`, `metaEmbeddedSignupService.js`, and `scripts/send_meta_test_webhook.js`.
- Encrypted tokens into `access_token_enc` on `adminController.registerPhoneNumber` & `updatePhoneNumberToken` without storing new plaintext tokens.
- Migrated `flowService.js` & `flowController.js` to tenant-scoped `resolveCredentials()` + `isSandbox` short-circuits.

### WS4 — Commerce, Inventory, CRM & Retirement of Simulated Escrow/Payouts
- Retired simulated PA/PG escrow fee deductions, fake `NPCI_PD_*` penny-drop KYC, and pooled `4319*` IMPS payout dispatches (`410 Gone`, `code: "MERCHANT_DIRECT_MODE"`) across `paymentPayoutService.js`, `payoutController.js`, and `PayoutsPage.jsx`; converted payout summary to Merchant-Direct reconciliation totals.
- Locked `/quote` and `/catalog/search` in `commerceRoutes.js` behind `authenticateToken` and validated active entity status on `createCheckoutSession`.
- Added sold-out/stock/tax-slab guards in `unifiedOrderService.js` and atomic row-locked stock validation in `captureOrderPayment`.
- Added `overall_status` in `checkRoomAvailability`, synchronized `reserveConfirmedBookingAtomically` with `room_inventory_daily` (preventing double-count against `booking_enquiries`), scoped `flowCryptoService.processFlowAction` by tenant/property, fixed `hospitalityChatService` to write `booking_enquiries`, consolidated `crm_records` writes through `crmPipelineService.upsertRecord`, fixed nonexistent `crm_records`/`crm_pipelines` columns in `complianceService.js` and `recycleBinService.js`, and excluded `is_sandbox`/`WAIVED_SANDBOX` from global financial reports and tenant-scoped `metaRateService`.

### WS5 & WS6 — Workflow Determinism, AI Guardrails & Sandbox Quarantine
- Removed dead `executeBusinessAction` stub (`conversationFlowEngine.js`), blocked single-edge error bypass on `failure`/`error`/`unavailable`/`max_retries`, forwarded `transportSimulation`/`recipientPhone`, fixed `masterPickerExecutor` to return `replyMessages` + `replyInteractive`, fixed `catalogBookingExecutor` nested pricing extraction without fake `7840/7000/840` fallbacks, tenant-scoped `templateExecutor`, defaulted `seedIndustryBlueprint` `autoPublish = false`, and added Sandbox/dryRun guards to `addonQuoteExecutor`, `inappBridgeExecutor`, `webhookExecutor`, and `delayExecutor`.
- Added `AbortSignal.timeout(12000)`, `is_sandbox` quarantine, dynamic credential reads, and prompt sanitization across `taskScopedAiAgentService.js`, `inboxCopilotService.js`, `voiceTranscriptionService.js` (replaced unlisted `form-data` with native `FormData`/`Blob`), and `aiFlowGeneratorService.js`.
- Quarantined `emailNotificationService.js` against `is_sandbox = 1`, guarded `workspaceTeamController.updateWorkspaceSandboxMode` against downgrading live Tenant 1 or paid workspaces, and expanded `tests/sandbox_isolation.test.js` with Greenvally's 4-category 25-unit scenario.

### WS7 & WS8 — Frontend Cleanup, CI Gates & Open-Handle Hygiene
- Updated `Primitives.jsx` (`Badge` variant compatibility), `Topbar.jsx` (`TAB_META` completeness), `FlowBuilderPage.jsx` (passed `token` to `<FlowSimulatorPanel>`), `PageSystem.jsx`, `PayoutsPage.jsx`, `InboxPage.jsx`, `PublicChatLandingPage.jsx`, and `ChatLinksPage.jsx` (`KonkanTrip` removal).
- Hardened `.github/workflows/ci-cd.yml` & `.github/workflows/conversation-foundation.yml` (enforced `VERIFY_WEBHOOK_SIGNATURE: "true"`, `DISABLE_SCHEDULER: "true"`, `WHATSAPP_API_TOKEN`, full `npm test`).
- Added `tests/helpers/testFixtures.js`, converted legacy script tests to `node:test`, and wired `closeTestResources(server)` + `closeAsyncPool()` across HTTP test suites.

---

## 3. Release Readiness Gate (Pending User Local Execution)

1. Run `node scripts/test_fresh_deployment.js` locally -> confirm 109 tables pass.
2. Run `npm --prefix frontend run lint` and `npm --prefix frontend run build` locally -> confirm zero lint errors & clean bundle.
3. Run `npm test` locally against isolated test MySQL -> confirm `0` failed suites & zero hanging open handles.
4. Review commit & diff on `refactor/production-core-rationalization` before creating/merging any PR.
