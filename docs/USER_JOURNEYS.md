# Survya — End-to-End Customer & Operator User Journeys

> Baseline audit & target contract compiled against repository `d:\whatsapp_bulk` (`feat/automation-studio-template-platform`).

This document defines the canonical end-to-end journeys for Survya across Platform Operators, Workspace Owners/Admins, Workspace Employees/Agents, and End Customers. Each journey specifies actors, entrypoints, state transitions, failure cases, and acceptance assertions tested in Layers 1–10.

---

## Journey A — Platform SaaS Onboarding & Workspace Provisioning

- **Actors:** Prospective Business Owner, Platform Super-Admin (for governance/overrides).
- **Entrypoints:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/v1/agency/workspaces`, `GET /api/v1/billing/*`.
- **Target Flow:**
  1. New business registers via `/api/auth/register` with name, email, phone, password, and business/workspace metadata.
  2. System creates a dedicated row in `tenants` (`PLAN` / 7-day `TRIAL`), creates a user record with workspace-scoped identity (never global platform super-admin privileges), and creates a `tenant_user_memberships` row with `role = 'OWNER'`.
  3. Issued JWT includes `id`, `role`, `tenant_id`, and token version/session context so all downstream workspace APIs resolve strictly to the owner's tenant.
  4. Owner connects a WhatsApp Business line (Meta Embedded Signup or manual WABA/Phone ID + token) isolated to their `tenant_id`.
- **Key Guardrails (Layer 1–2):**
  - Workspace Owner cannot send `x-workspace-id` to switch into another company's tenant.
  - Workspace Owner cannot call global `/api/admin/*` system user management or list cross-tenant PII.
  - Expired/suspended tenant status is enforced deterministically on billing-gated operations.

---

## Journey B — Workspace Team Setup & Role-Based Collaboration (RBAC)

- **Actors:** Workspace Owner (`OWNER` / Workspace Admin), Workspace Employee/Agent (`USER` / `AGENT`).
- **Entrypoints:** `/api/v1/workspace/users` (planned in Layer 1), Inbox & CRM views, Automation views.
- **Target Flow:**
  1. Workspace Owner creates or invites an employee scoped strictly to the Owner's `tenant_id`.
  2. Employee logs in and accesses day-to-day operational modules (Unified Inbox, Live Chat Handoff, Bookings/Orders, Contacts/CRM).
  3. Employee attempts restricted admin actions (e.g., rotating WhatsApp credentials, editing payout bank settings, deleting workspace flows, managing team users, viewing other tenants).
- **Expected Result:**
  - Operational Inbox/CRM endpoints succeed within `tenant_id`.
  - Administrative/credential/payout mutations return HTTP `403`.
  - Workspace Owner can deactivate or revoke the employee without impacting other tenants.

---

## Journey C — Template Discovery, Installation, Level-A Configuration & Safe Upgrade

- **Actors:** Platform Super-Admin (authoring Master `PUBLIC` templates), Workspace Owner (installing & configuring).
- **Entrypoints:** `/api/v1/templates/*`, `/api/v1/installations/*`, Flow Studio (`Automation Studio` / `FlowBuilderPage`).
- **Target Flow:**
  1. Platform Admin publishes a versioned `PUBLIC` industry template (`config_schema_json` + `flow_definition_json`) or a Workspace Owner imports an industry blueprint into their account.
  2. Workspace Owner creates an installation (`template_installations`) mapped to their `tenant_id` (`req.user.tenant_id`, fixing the baseline `tenantId` `undefined` fallback bug).
  3. Level-A operator edits business profile, entities, pricing rules, catalog items, and greeting/fallback messages via typed config forms without touching graph JSON.
  4. Level-B power user customizes nodes/edges on the visual canvas and publishes a pinned snapshot version (`vN`).
  5. When Platform Admin releases template `v(N+1)`, Workspace Owner previews diff and upgrades while preserving existing tenant overrides and keeping live in-flight customer sessions pinned safely.

---

## Journey D — Inbound WhatsApp Conversation & Config-Driven State Machine Execution

- **Actors:** End Customer (WhatsApp), `sarvya-api` Webhook Receiver, `sarvya-worker` Job Engine.
- **Entrypoints:** `POST /webhook` / `POST /api/webhooks/meta`, `incoming_webhook_events`, `job_queue` (`META_WEBHOOK_INGEST`), `conversation_flow_sessions`.
- **Target Flow:**
  1. Meta delivers webhook with valid HMAC-SHA256 (`x-hub-signature-256`). Invalid signatures fail closed (`401/403`) in non-local/signed modes.
  2. `sarvya-api` verifies, records idempotent event key in `incoming_webhook_events` (deduping duplicate `message_id` retries), and enqueues durable work.
  3. Webhook resolves `phone_number_id -> tenant_id -> published conversation_flows` version (with zero cross-tenant credential fallback for external lines).
  4. `conversationFlowEngine` evaluates triggers/buttons/interactive replies/text input, traverses nodes (`START`, `MESSAGE`, `MENU`, `COLLECT_INPUT`, `CONDITION`, `SUBFLOW`, `API_CALL`/`WEBHOOK`, `CREATE_BOOKING`, `AI_ROUTER`, `HANDOFF`, `END`) with recursion/hop limits and navigation stack (`BACK` / `HOME`).
  5. Outbound payloads respect Meta constraints (<= 20-char button titles, 24h customer-care window vs approved utility/marketing template, mock/simulation safety).

---

## Journey E — Catalog Discovery, Atomic Availability Lock & Reservation/Order Integrity

- **Actors:** End Customer, Automation Engine / AI Assistant, `inventoryService` / `universalFulfillmentService`.
- **Entrypoints:** Interactive WhatsApp flow or `/x/:slug` In-App Studio & `/pay/*`.
- **Target Flow:**
  1. Customer selects dates/items/variant for a tenant's catalog entity (room, appointment slot, course batch, table, or SKU).
  2. System computes server-side quote from authoritative catalog pricing + availability (`room_inventory_daily` or catalog slots) — never trusting client-submitted totals.
  3. Reservation/checkout acquires a transactional lock / atomic `UNIQUE(room_type_id, inventory_date)` upsert & availability check so concurrent requests for the last unit produce exactly 1 confirmed booking and reject/waitlist competing requests (`no double-booking`).

---

## Journey F — Payment Link, Signed Webhook Verification & Automatic Receipt

- **Actors:** End Customer, Payment Provider (Razorpay / Simulation Mode), Backend Webhook Handler, Outbound Notification Worker.
- **Entrypoints:** `/pay/:referenceCode`, `POST /pay/webhook/razorpay`, `POST /api/v1/billing/webhook/razorpay`, `POST /api/v1/payouts/webhook/razorpay`.
- **Target Flow:**
  1. Customer receives payment link or payment details referencing a server-computed order total.
  2. Provider posts webhook with valid HMAC-SHA256 signature verified over exact raw request bytes (`req.rawBody`).
  3. Unsigned, `mock_`-spoofed, or invalid-signature webhooks fail closed (HTTP `400/401/403`) in authenticated/webhook verification paths.
  4. Duplicate payment webhooks are idempotent (never double-confirming, double-decrementing inventory, or issuing duplicate receipts).
  5. Confirmed payment transitions order/booking -> `CONFIRMED` / `PAID`, updates tenant ledger/payout balance atomically, and dispatches confirmation receipt via outbound adapter.

---

## Journey G — AI Intent Routing, Guardrailed Handoff & Prompt Safety

- **Actors:** End Customer, AI Router / Task-Scoped Copilot, Workspace Human Agent.
- **Entrypoints:** `webhookService.js`, `taskScopedAiAgentService.js`, `aiReplyExecutor.js`, `inboxCopilotService.js`, `POST /api/inbox/reply`.
- **Target Flow:**
  1. Unmatched free-text message enters tenant-configured AI assistant (domain-agnostic: uses tenant profile/entities/policies rather than hardcoded hospitality copy).
  2. Input undergoes prompt-injection sanitization; model returns schema-validated structured intent + confidence + safe reply bounded to verified tenant context.
  3. On low confidence, explicit human request (`talk to agent`, `human`), complaint, or restricted action, system pauses automation durably in DB (`conversation_handoff_states`) and routes to Inbox with copilot summary.
  4. Agent replies via `POST /api/inbox/reply` (respecting 24h window and opt-out rules); automation stays paused until resolved or resume timeout expires.

---

## Journey H — Consent-Compliant Campaign Broadcasts & Delivery Shield

- **Actors:** Workspace Owner/Marketer, Campaign Broadcast Engine, `sarvya-worker`.
- **Entrypoints:** `POST /api/campaigns/*`, `POST /api/broadcast/*`, `contacts`, `broadcast_logs`.
- **Target Flow:**
  1. Owner uploads/selects opted-in audience segment (excluding `opted_out` / DND / suppressed contacts).
  2. Outside 24h customer-care window, system enforces approved WhatsApp template usage + variable binding.
  3. Worker applies per-tenant/per-number throttling, delivery shield / `131049` frequency-cap cooldowns, and tracks `SENT` / `DELIVERED` / `READ` / `FAILED` metrics per tenant without leaking cross-tenant recipients.

---

## Journey I — Retention Reminders, Post-Order Follow-Up & Conversion Analytics

- **Actors:** Scheduler (`schedulerService.js`), Workspace Owner.
- **Entrypoints:** Scheduled trigger workers, `GET /api/reports/*`, Funnel Analytics endpoints.
- **Target Flow:**
  1. `schedulerService` evaluates reminder windows consistently in UTC (`UTC_TIMESTAMP()` + `parseMysqlUtcTimestamp()`, immune to `TZ=Asia/Kolkata` local drift).
  2. Automated pre-arrival, renewal, or cart-recovery reminders respect quiet hours, opt-outs, and template rules.
  3. Conversion, booking revenue, CSAT, and AI token cost dashboards query strictly tenant-scoped tables and reconcile with `broadcast_logs`, `orders`/`bookings`, and `payment_transactions`.

---

## Journey J — Platform Audit, Compliance & Operational Recovery

- **Actors:** Platform Super-Admin, DevOps/SRE.
- **Entrypoints:** `GET /health`, `GET /api/admin/audit-logs`, DPDP endpoints, Recycle Bin, PM2 logs.
- **Target Flow:**
  1. `/health` checks process liveness plus database connectivity cleanly without leaking internal secrets.
  2. Security-sensitive actions (login failures, role changes, impersonation, payout edits, template publishing, deletes/restores) emit structured audit logs with correlation IDs and sanitized metadata.
  3. Soft-deleted records sit safely in Recycle Bin (`delete_status = 1`) and can be restored or DPDP-erased under strict role authorization.
