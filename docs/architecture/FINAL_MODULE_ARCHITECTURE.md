# SURVYA — Final Logical Module Architecture

> **Target Architecture:** Modular Monolith (Node.js + Express + MySQL + React SPA). No microservices or unnecessary brokers. All domain specialization is expressed via `master_domain_profiles`, templates, and bindings over a shared commerce and orchestration core.

---

## 1. The 11 Canonical Logical Modules

| Logical Module | Core Responsibilities | Authoritative Backend Modules | Authoritative Frontend Modules |
|---|---|---|---|
| **1. Platform Foundation** | Auth, JWT/Cookie/SSE stream tokens, tenants, memberships, 3-tier RBAC (`SUPER_ADMIN`, `OWNER`/`ADMIN`, `USER`), entitlements, configuration, audit history, sandbox isolation | `authController.js`, `workspaceTeamController.js`, `agencyController.js`, `settingsController.js`, `authMiddleware.js`, `rateLimiter.js`, `schema.js` | `AuthContext`, `LoginPage.jsx`, `RegisterPage.jsx`, `SettingsPage.jsx`, `ImpersonationBanner.jsx` |
| **2. Channel Management** | WABA sender lines, encrypted channel credentials (`access_token_enc`), Embedded Signup, webhook signature verification & durable ingestion, outbound WhatsApp transport, delivery status, chat links/QR entry points | `metaWhatsAppService.js`, `whatsappMessagingService.js`, `metaEmbeddedSignupService.js`, `webhookController.js`, `webhookService.js`, `sarvyaConnectController.js`, `templateController.js` | `SarvyaConnectPage.jsx`, `AddPhoneNumberModal.jsx`, `MetaEmbeddedSignupButton.jsx`, `ChatLinksPage.jsx` |
| **3. Conversation Management** | Contacts, customer message threads, human handover states, workspace operator assignment, active session state | `conversationContextResolver.js`, `chatLinkService.js`, `inappSseManager.js`, `webhookService.js` (reply ledger) | `InboxPage.jsx`, `PublicChatLandingPage.jsx` |
| **4. Automation Studio** | Master template catalog, template versions, tenant installations, workflow definitions, trigger routing (`workflow_triggers`), visual graph builder, resource bindings, publish approvals, simulation, execution history | `src/modules/templateLibrary/*`, `conversationFlowService.js`, `conversationFlowController.js`, `conversationFlowEngine.js`, `workflowTriggerService.js`, `flowApprovalService.js`, `flowAnalyticsService.js`, `src/services/workflow/nodeExecutors/*` | `AutomationStudio.jsx` (canonical entry, preserving legacy tabs/deep-links via `PageSystem`), `WorkflowBuilderPage.jsx`, `FlowCanvas.jsx`, `NodeInspectorDrawer.jsx` |
| **5. In-App Experience** | Public multi-screen conversational pages (`/x/:slug`), configurable screen graphs, catalog/gallery browsing, schema-validated forms, rate discussions, continuation handoff back to WhatsApp | `inappExperienceController.js`, `inappRuntimeController.js`, `inappExperienceService.js`, `inappRuntimeService.js`, `inappValidator.js`, `studioController.js`, `studio/*` | `InAppStudioPage.jsx`, `PublicExperiencePage.jsx`, `PublicFlowPreviewPage.jsx`, `components/inapp-studio/*`, `components/studio-chat/*` |
| **6. Business Configuration** | Business profiles (`business_entities`), domain profiles (`master_domain_profiles`), hospitality property extensions (`properties`, rooms, policies), branches/locations, categories, units, tax slabs, payment modes, business hours | `masterDataService.js`, `masterCacheService.js`, `domainProfileService.js`, `hospitalityConfigService.js`, `hospitalityController.js` | `MastersHubPage.jsx`, `DomainWorkspacePage.jsx`, `InventoryCalendarPage.jsx` |
| **7. Commerce Engine** | Products/services/rooms (`catalog_items`), pricing/promos (`universalPricingService`), atomic holds (`universalAvailabilityService`), quotes, bookings/orders/appointments (`universalFulfillmentService`), payment webhook verification & reconciliation | `universalCatalogService.js`, `universalAvailabilityService.js`, `universalPricingService.js`, `universalFulfillmentService.js`, `hospitalityAvailabilityService.js`, `hospitalityPricingService.js`, `paymentPayoutService.js` (merchant-direct only) | `CatalogInventoryPage.jsx`, `BookingsOrdersPage.jsx`, `UniversalAvailabilityTab.jsx`, `UniversalAddonsPricingTab.jsx`, `InboxCommerceDrawer.jsx` |
| **8. CRM** | Tenant-scoped contacts, enquiries, multi-industry CRM pipelines, deal/lead stages (`NEW_LEAD`..`WON`/`LOST`), qualification, follow-up & conversion | `crmPipelineService.js`, `crmPipelineController.js`, `enquiryService.js`, `quotationService.js` | `EnquiriesPage.jsx` |
| **9. Growth** | Sharable chat/booking links, QR codes, bulk campaigns & delivery shield, DPDP consent ledger, source/CTWA attribution, conversion/KPI analytics | `broadcastEngine.js`, `broadcastService` (`broadcastController`, `campaignController`), `complianceService.js`, `reportsController.js`, `chatLinkController.js` | `BroadcastPage.jsx`, `ReportsPage.jsx`, `DashboardPage.jsx` |
| **10. Intelligence** | Grounded RAG business answers, intent & entity extraction, voice note transcription, operator Inbox Copilot, AI flow drafting, injection/output guardrails, mandatory HTTP timeouts | `taskScopedAiAgentService.js`, `knowledgeRetrievalService.js`, `inboxCopilotService.js`, `voiceTranscriptionService.js`, `aiFlowGeneratorService.js`, `aiFlowContextBuilder.js` | `AiAssistantPage.jsx` |
| **11. Governance** | Platform super-admin console, usage ledger & SaaS billing, merchant-direct payment webhook logs, job queues/workers, recycle bin, audit logs, `/livez` + `/readyz` + `/metrics` | `adminController.js`, `billingService.js`, `metaRateService.js`, `jobQueueService.js`, `jobWorkerEngine.js`, `schedulerService.js`, `recycleBinService.js` | `SystemAdminPanel.jsx`, `PayoutsPage.jsx` (Merchant-Direct Reconciliation), `AdminComplianceTab.jsx`, `AdminRecycleBinTab.jsx`, `JobQueueMonitor.jsx` |

---

## 2. Domain Architecture Tier Classification

| Domain Code | Tier Classification | Capabilities & Scope Notes |
|---|---|---|
| `HOSPITALITY` | **Fully Supported** | Properties, room types, daily/seasonal rate calendar, room blocks, `DATE_RANGE` holds, WhatsApp + `/x/:slug` booking & Razorpay reconciliation |
| `RESTAURANT_FOOD` | **Fully Supported** | Food menu catalog (`FOOD`), dietary flags, prep time, add-on upsells, unit stock / instant 86 toggle, takeout/table ordering |
| `RETAIL_ECOM` | **Fully Supported** | SKU catalog (`PRODUCT`), variants, `ITEM_STOCK` atomic holds, bulk tier & promo pricing, order fulfillment & receipts |
| `CLINIC_HEALTH` | **Partially Implemented** | Appointment slots (`TIME_SLOT`), doctor resources, intake workflows, slot holds & payment confirmation (no clinical EHR/EMR) |
| `SALON_WELLNESS` | **Partially Implemented** | Service catalog (`SERVICE`), duration & staff slots, add-on upsells, appointment booking (shared slot infrastructure) |
| `EDUCATION_COACHING` | **Template-Only** | Lead intake, course inquiry catalogs & fee links via universal templates and CRM pipelines (no LMS/student grading) |
| `REAL_ESTATE` | **Template-Only** | Site-visit scheduling (`TIME_SLOT`), property brochure chat flows & BANT qualification in CRM (no MLS/escrow) |
| `B2B_WHOLESALE` | **Template-Only** | Custom B2B SaaS/wholesale sales pipeline, RFQ intake, and demo booking flows (no full ERP invoicing/payroll) |

*Explicitly Out of Scope:* Full accounting ERP, payroll, manufacturing ERP, full multi-room PMS house-keeping/OTA channel manager, consumer travel marketplace, regulated PA/PG escrow fund-holding, and unrestricted open-ended AI chat.
