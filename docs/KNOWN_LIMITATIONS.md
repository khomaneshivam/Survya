# Survya — Known Limitations, Technical Debt & Risk Register

> Verified issues observed during Layer 0 repository, schema, security, and runtime audits (`d:\whatsapp_bulk`). Each active item tracks severity, affected module(s), impact, and planned remediation layer.

---

## 1. Remediated Critical & High-Risk Issues (Verified Resolved Across Layers 1–10)

| ID | Severity | Component / File(s) | Observed Limitation / Vulnerability | Remediation & Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **LIM-01** | **CRITICAL (P0)** | `src/controllers/authController.js`, `src/middleware/authMiddleware.js`, `src/controllers/agencyController.js`, `src/config/schema.js` | Self-registered SaaS users received `ADMIN` privilege; `seedDefaults()` also defaulted non-admin `USER` rows to `ADMIN` tenant memberships. | **Resolved (Layers 1 & 10):** Enforced `USER`/`OWNER` separation, JWT `tenant_id`, and safe `seedDefaults()` role mapping. |
| **LIM-02** | **CRITICAL (P0)** | `src/modules/templateLibrary/templateController.js` | Read `req.user?.tenantId` (`undefined`) instead of `req.user?.tenant_id`, routing operations across tenants to Tenant 1. | **Resolved (Layers 1 & 4):** Switched to `req.user?.tenant_id` and gated `PUBLIC` master templates to `isPlatformAdmin`. |
| **LIM-03** | **CRITICAL (P0)** | `src/routes/publicUniversalFulfillmentRoutes.js`, `src/services/billingService.js`, `src/controllers/payoutController.js` | Fail-open Razorpay webhook signature verification, unauthenticated capture, inline `simulatePayment()`, unescaped HTML output. | **Resolved (Layer 1):** Enforced HMAC SHA-256 verification over `rawBody`, auth checks, and escaped HTML output. |
| **LIM-04** | **HIGH (P1)** | `src/controllers/payoutController.js`, `src/controllers/reportsController.js`, `src/controllers/adminController.js` | Global `ADMIN` cross-tenant access on payouts/reports; `listRecycleBin` filtered platform admin strictly to `tenant_id = 1`. | **Resolved (Layers 1, 7 & 10):** Strict tenant ownership in payouts/reports and platform-scoped recycle bin visibility. |
| **LIM-05** | **HIGH (P1)** | `server.js`, `src/services/workflow/nodeExecutors/webhookExecutor.js` | `/uploads/inbound` auth preceded path traversal `403`; `webhookExecutor.js` lacked async DNS/private-IP/redirect SSRF defense. | **Resolved (Layer 1):** Ordered traversal checks first and enforced DNS/IPv6/private-IP SSRF blocks + `redirect: 'manual'`. |
| **LIM-06** | **HIGH (P1)** | `src/services/inventoryService.js`, `src/config/schema.js` | Non-unique `idx_room_inventory_daily` caused upsert duplicates and double-booking risk. | **Resolved (Layer 5):** Added `UNIQUE(room_type_id, inventory_date)` and InnoDB transactional locks. |
| **LIM-07** | **HIGH (P1)** | `src/services/webhookService.js`, `src/services/metaWhatsAppService.js`, `src/services/queue/jobWorkerEngine.js` | In-memory handoff/queue state lost across restarts; non-Tenant-1 Meta credential fallback risks. | **Resolved (Layer 2):** DB-backed `incoming_webhook_events`, `conversation_handoff_states`, `OUTBOUND_MESSAGE_DISPATCH`, strict line scoping. |
| **LIM-08** | **MEDIUM-HIGH** | `src/services/schedulerService.js`, Blueprints, `webhookService.js` | Mixed `NOW()` / `UTC_TIMESTAMP()`, 21-char Meta button, hardcoded legacy hospitality routing conflicts. | **Resolved (Layers 3 & 7):** Unified UTC timestamps, compliant Meta button limits, and consolidated Flow Studio routing. |

---

## 2. Remediated Structural Technical Debt & Remaining Operational Notes

| ID | Area | Description | Current Status |
| :--- | :--- | :--- | :--- |
| **DEBT-01** | Team Collaboration | Dedicated workspace-scoped team/employee invite & role API + UI (`/api/v1/workspace/users` + `SettingsPage.jsx` Team & Access tab). | **Resolved (Layers 1 & 8)** |
| **DEBT-02** | AI Domain Coupling | Domain-parameterized AI personas, injection sanitization, strict JSON validation, `/api/v1/ai/usage` token/cost tracking. | **Resolved (Layer 6)** |
| **DEBT-03** | Frontend Duplication | 3-tier role UI split (`isPlatformAdmin`, `isWorkspaceAdmin`, `isEmployee`), consolidated Flow Builder nav, verified design system & `0`-error lint/build. | **Resolved (Layer 8)** |
| **DEBT-04** | Plan & Quota Metering | Fail-closed `402`/`403` message & WABA line quota enforcement, DB-checked `/api/health`, `x-request-id` structured JSON logging, 6 composite indexes. | **Resolved (Layer 9)** |
| **DEBT-05** | Test Harness & Cache Isolation | Cleaned cross-test flow/cache pollution and isolated synthetic tenants across 78 test files (`509` passed, `0` failed, `1` opt-in skip). | **Resolved (Layer 10)** |
| **NOTE-01** | Frontend Lint Warnings | `npm --prefix frontend run lint` exits `0` with `0` errors and `630` non-blocking warnings across 126 frontend files (pre-existing hook/unused-var advisories). | **Tracked Advisory** |

---

## 3. Intentional Environment Boundaries
- **No Automated Live WhatsApp Transmission:** Sending live Meta WhatsApp messages from agent scripts or automated test suites is permanently prohibited; all outbound verification uses mock/simulation modes or local loopback stubs.
- **No Unattended Production Secret/Financial Mutation:** Real Razorpay live settlements, production database mutations, and `.env` credential printing remain strictly out of bounds.
