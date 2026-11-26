# SURVYA — System Audit (Baseline @ Commit `59e71f5`)

> **Audit Branch:** `fix/platform-stabilization-prod-readiness` (branched from `feat/automation-studio-template-platform` @ `59e71f5`)  
> **Scope:** Complete read-only audit of backend (`177` files in `src/`), frontend (`133` files in `frontend/src/`), schema (`109` tables in `src/config/schema.js`), scripts (`6` files in `scripts/`), CI workflows (`.github/workflows/`), and docs (`docs/`).  
> **Preserved Uncommitted Edits:** `src/config/asyncDb.js`, `src/config/env.js`.

---

## 1. Platform Topology & Runtime Architecture

| Layer | Implementation | Key Entrypoints / Notes |
|---|---|---|
| **API Server** | Node.js + Express (`^4.21.2`) | `server.js`, mounts `/api/*` via `src/routes/apiRoutes.js`, webhook aliases (`/webhook`, `/api/webhook`, `/api/v1/webhook`, `/webhooks/meta/whatsapp`), health `/api/health` & `/health`, SPA static hosting (`frontend/dist`) |
| **Background Worker** | Separate PM2 worker + in-process webhook worker | `worker.js` polls `default`, `broadcast`, `maintenance` queues; `server.js:13,516` spawns `JobWorkerEngine({ queueName: "webhook" })`; `schedulerService.js` polls scheduled jobs |
| **Database Layer** | Dual MySQL 8.4/8.0 adapters | Sync `mysqlAdapter.js` -> Worker thread `mysqlWorker.js` (`pool.query` across 15 connections); Async Promise pool `asyncDb.js` |
| **Schema & Seeder** | Declarative DDL + inline migrations | `src/config/schema.js` (`109` tables in `TABLE_SCHEMAS`, `INDEXES`, `runColumnMigrations`, `seedDefaults`) |
| **Frontend SPA** | React 19 + Vite 8 + `@xyflow/react` | `frontend/src/App.jsx`, `PageSystem.jsx` (`PAGE_REGISTRY`), `Sidebar.jsx`, `Topbar.jsx`, `AuthProvider.jsx`, `oxlint` + Vite bundler |
| **CI/CD** | GitHub Actions (`ubuntu-latest`) | `.github/workflows/ci-cd.yml` (Node 20, MySQL 8.4, Layer 1-10 tests) & `.github/workflows/conversation-foundation.yml` (Node 22, MySQL 8.4, `npm test`), `scripts/deploy.sh` (fail-closed manual deploy guard) |

---

## 2. Backend Module & Table Mapping Summary

### Core Domain Groups (`src/routes/apiRoutes.js` & Sub-Routers)
1. **Auth, Workspaces & Platform Admin:** `authRoutes`/`apiRoutes` -> `authController.js`, `workspaceTeamController.js`, `adminRoutes.js` -> `adminController.js`, `agencyController.js`, `settingsController.js`, `recycleBinService.js`.
2. **WhatsApp Messaging & Webhooks:** `webhookRoutes.js`, `webhookController.js`, `webhookService.js`, `metaWhatsAppService.js`, `whatsappMessagingService.js`, `metaEmbeddedSignupService.js`, `sarvyaConnectController.js`, `templateController.js`, `templateRoutes.js`.
3. **CRM, Enquiries & Chat Links:** `crmPipelineRoutes.js`, `crmPipelineController.js`, `crmPipelineService.js`, `enquiryService.js`, `chatLinkController.js`, `chatLinkService.js`, `reportsController.js`.
4. **Hospitality PMS & Booking:** `hospitalityRoutes.js`, `hospitalityController.js`, `hospitalityConfigService.js`, `hospitalityAvailabilityService.js`, `hospitalityPricingService.js`, `hospitalityFlowEngine.js`, `hospitalityChatService.js`, legacy `resortController.js` & `inventoryService.js` (note: unmounted `src/routes/resortRoutes.js` also exists).
5. **Universal Commerce, Masters & Fulfillment:** `masterRoutes.js`, `commerceRoutes.js`, `universalCatalogRoutes.js`, `universalCatalogController.js`, `universalCatalogService.js`, `universalAvailabilityService.js`, `universalPricingService.js`, `universalFulfillmentRoutes.js`, `publicUniversalFulfillmentRoutes.js`, `universalFulfillmentService.js`, `unifiedOrderController.js`, `unifiedOrderService.js`, `payoutRoutes.js`, `payoutController.js`, `paymentPayoutService.js`, `billingRoutes.js`, `billingService.js`.
6. **Automation Studio, Flows & AI:** `conversationFlowRoutes.js`, `conversationFlowController.js`, `conversationFlowService.js`, `conversationFlowEngine.js`, `runtimeCache.js`, `workflowTriggerService.js`, `conversationContextResolver.js`, `src/modules/templateLibrary/*`, `flowApprovalController.js`, `flowPreviewController.js`, `inappExperienceRoutes.js`, `publicInappRoutes.js`, `inappRuntimeService.js`, `aiAssistantRoutes.js`, `taskScopedAiAgentService.js`, `inboxCopilotService.js`, `aiFlowGeneratorService.js`, `aiFlowContextBuilder.js`.
7. **Queue & Jobs:** `jobQueueRoutes.js`, `jobQueueService.js`, `jobWorkerEngine.js`, `schedulerService.js`.

---

## 3. Duplicated & Legacy Modules Identified

| Functional Area | Coexisting / Duplicated Implementations | Risk / Impact |
|---|---|---|
| **Booking / Commerce Stores** | `booking_enquiries` + `quotes` vs `crm_records` vs `unified_orders` vs `universal_transactions` | Revenue & upcoming check-ins diverge across Overview Dashboard, Reports, and Payouts |
| **CRM Pipelines / Stages** | Legacy hospitality `booking_enquiries` vs dynamic `crm_pipelines` (`stages_json` using `{ key, label }`) + `crm_records` + unused `enquiries` | Stage badges blank in UI (`DataTable` signature mismatch); automated writers hardcode mismatched stage keys |
| **Flow & Automation UIs** | `FlowBuilderPage.jsx`, `InAppStudioPage.jsx`, `AutomationStudio.jsx`, plus unmounted/orphan `FlowsPage.jsx`, `FlowStudioPage.jsx`, `AutomationPage.jsx`, `AutoReplyBotPage.jsx` | Route collisions (`flows` and `automation` both map to `FlowBuilderPage.jsx`); broken calls from `DashboardPage` / `SarvyaConnectPage` |
| **Catalog & Hospitality Property** | `properties` + `room_types` vs `business_entities` + `catalog_items`; `resortController` + `inventoryService` vs `hospitalityController` + `hospitalityAvailabilityService`; `CatalogInventoryPage` vs `MastersHubPage` | Property #1 overwrites on blueprint import / profile save; hospitality `room_types` lookup treats `business_entity_id` as `property_id` |
| **Meta Credential Resolution** | `metaWhatsAppService.resolveCredentials` / `resolveWabaId` vs `whatsappMessagingService.resolveCredentialsForPhone` vs `metaEmbeddedSignupService` vs `adminController` vs `settingsController` | Three incompatible token/WABA resolvers; `access_token_enc` ignored in several endpoints |

---

## 4. Schema Migration, Constraints & Fresh-Deploy Findings

- **Zero Foreign Keys:** All `109` tables in `src/config/schema.js` omit SQL `FOREIGN KEY` constraints; integrity relies on application logic.
- **Confirmed Migration Ordering Defect:** `initSchema()` (`src/config/schema.js:1387-1396`) executes `INDEXES` **before** `runColumnMigrations` inside an empty `catch (err) {}`. Verified empirically on a clean empty MySQL 8.0.44 database (`whatsapp_bulk_idx_audit`):
  - `campaigns` is missing `idx_campaigns_tenant_created`
  - `catalog_items` is missing `idx_cat_fast_filter`, `idx_cat_master_links`, `idx_ucat_filter`
  - `daily_inventory_matrix` is missing `idx_inv_date` and `idx_inv_entity_date`
- **Missing Unique Keys & Undersized Columns:**
  - No `UNIQUE` index on `waba_phone_numbers.phone_number_id`, `users.email`, `tenants.slug`, `business_entities.slug`, `chat_links.slug`.
  - `business_entities.settings_json`, `catalog_items.gallery_json`, `catalog_items.attributes_json`, and `unified_orders.metadata_json` are typed `varchar(255)` instead of `json`/`longtext`.
  - `properties` table lacks soft-delete columns (`active_status`, `delete_status`, `deleted_at`, `deleted_by`), and `room_inventory_daily` lacks `property_id`.
- **Health & Observability Gaps:** `/api/health` checks only sync `db` (`SELECT 1`), not `asyncDb` or worker heartbeats; no `/livez` / `/readyz` split; no `/metrics`; correlation IDs do not flow through `system_job_queue` workers.

---

## 5. Business-Critical Transaction Paths Audited

1. **Property & Workspace Creation:** `RegisterPage` -> `authController.register` -> `domainProfileService.provisionTenantDomainProfile` / `IndustryBlueprintsModal` -> `importFullIndustrySuite` -> **Defect:** updates `properties ORDER BY id ASC LIMIT 1` instead of creating independent properties.
2. **Inbound Meta Webhook Ingestion:** `POST /webhook` -> `webhookController.handleIncomingEvent` -> `incoming_webhook_events` -> `system_job_queue (META_WEBHOOK_INGEST)` -> `webhookService.processIncomingPayload` -> `conversationContextResolver` -> `conversationFlowEngine.processTurn` -> `triggerAutoReply` -> **Defects:** non-atomic dedup before enqueue; duplicate `phone_number_id` blocks ingress; unawaited auto-reply dispatch.
3. **Customer Inquiry -> Quote -> Hold -> Payment -> Booking:** `catalogBookingExecutor` / `hospitalityFlowEngine` / `/x/:slug` -> `createInventoryHold` -> `createTransactionFromQuote` -> `/pay/webhook/razorpay` -> `reconcilePaymentSuccess` -> **Defects:** unpinned `mysqlWorker.js` sync pool queries inside transactions; nested `START TRANSACTION` inside `confirmHold`; unvalidated Razorpay webhook event/amount; missing stock restore on confirmed booking cancellation; missing `default`/`maintenance` queue workers in single-server mode.
