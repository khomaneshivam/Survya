# SARVYA — Security Architecture & Threat Controls

## 1. Security Model & Current Posture (Layer 0 Audit)

### Authentication & Sessions
- **JWT Verification (`src/middleware/authMiddleware.js`):** Signed with `HS256` using `config.JWT_SECRET`. Production startup aborts if `JWT_SECRET` is `< 32` characters or matches insecure defaults (`src/config/env.js`). Tokens are re-verified against live `users` DB row (`status === 'ACTIVE'`).
- **Password Hashing:** `bcryptjs` with salt rounds (`10`).
- **Rate Limiting (`src/middleware/rateLimiter.js`):** Auth limiter (`15 req/min`), Broadcast limiter (`25 req/min`), Upload limiter (`30 req/min`), Public endpoints limiter (`120 req/min`), Global API limiter (`300 req/min`).
- **HTTP Hardening (`src/middleware/securityHeaders.js`):** Disables `x-powered-by`, sets OWASP headers + strict CSP.

### Cryptography & Secret Protection
- **At-Rest Encryption (`src/utils/cryptoUtil.js`):** AES-256-GCM symmetric encryption for `WHATSAPP_API_TOKEN`, `META_APP_SECRET`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, per-line WABA access tokens (`access_token_enc`), and merchant API secrets (`api_secret_encrypted`).
- **Masked API Responses:** Sensitive credentials returned masked in admin APIs (`••••`).

---

## 2. Critical Security Gaps Identified in Layer 0 (To Be Fixed in Layer 1)

| Severity | Finding | Location | Remediation Plan |
|---|---|---|---|
| **CRITICAL** | **Self-Registered Users Receive Global `ADMIN` Role & Cross-Tenant Switch:** `register()` sets `role = 'ADMIN'` for every workspace creator. `requireAdmin()` & `resolveWorkspaceAccess()` do not distinguish Platform Super-Admin from Tenant Workspace Owner, permitting Tenant 2+ owners to access `/api/admin/*` and switch into any tenant via `x-workspace-id`. | `authController.js`, `authMiddleware.js`, `adminRoutes.js`, `agencyController.js` | Separate Platform Super-Admin check (`isPlatformAdmin`), grant newly registered workspace creators `OWNER` membership in `tenant_user_memberships` and standard `USER` (or `WORKSPACE_ADMIN` never accepted as platform `ADMIN`) on `users.role`, restrict `x-workspace-id` switching strictly to verified memberships/agency child workspaces unless verified Platform Admin. |
| **CRITICAL** | **Payment Webhook & Checkout Auth Bypass:** Razorpay webhooks fail open when `x-razorpay-signature` is omitted or prefixed `mock_`, or when secret env is unset; `capturePayment` runs under `optionalAuth`; `/pay/:referenceCode` embeds a live browser auto-pay simulation trigger. | `payoutController.js`, `payoutRoutes.js`, `publicUniversalFulfillmentRoutes.js`, `billingService.js` | Fail closed on missing/invalid HMAC signatures (except explicit unit-test/sandbox mode gated safely), remove unauthenticated `capturePayment` access, gate simulation checkout button strictly to local sandbox mode, escape HTML on receipt error templates. |
| **CRITICAL** | **API Tenant Isolation Bug (`tenantId` vs `tenant_id`):** `templateController.js` reads `req.user?.tenantId` (undefined) instead of `req.user?.tenant_id`, forcing all tenants to Tenant 1. `reportsController` & `payoutController.checkEntityAccess` also allow cross-tenant access for `ADMIN` / unauthenticated callers. | `templateController.js`, `payoutController.js`, `reportsController.js` | Unify tenant extraction helper `getTenantId(req)`, enforce strict `tenant_id` scoping on all queries and mutations. |
| **HIGH** | **SSRF Bypass Vectors in Workflow Webhooks:** `webhookExecutor.js` checks hostname literal regexes only, missing DNS-resolved private IPs (e.g. DNS rebinding / `nip.io`), IPv6 private/ULA/loopback addresses, numeric IPs, and HTTP redirects. | `webhookExecutor.js` | Add DNS lookup IP validation (blocking private/loopback/metadata IPv4 + IPv6 targets prior to request) and set `redirect: 'manual'`. |
| **HIGH** | **Path Traversal Response Order on `/uploads/inbound`:** Authentication runs before path traversal rejection (`401` before `403`). | `server.js` | Reject `..` and disallowed extensions uniformly on `/uploads` before route-specific auth handlers. |
| **HIGH** | **WhatsApp Outbound Policy & Simulation Guardrail:** Tests and sandboxes MUST never trigger Meta Cloud API live message endpoints. | `metaWhatsAppService.js`, controllers | Consolidate all Meta HTTP requests through `metaWhatsAppService` respecting `isSimulation` / `META_API_URL`, remove Tenant 1 token fallback for non-tenant-1 accounts. |
