# Survya — Test Strategy & Verification Matrix

> Aligned with `d:\whatsapp_bulk` (`package.json`, `frontend/package.json`, `.github/workflows/ci-cd.yml`).

---

## 1. Non-Negotiable Test Safety Rules

1. **Zero Live WhatsApp Dispatch:** All test suites MUST run against mock HTTP adapters, `META_API_URL=http://127.0.0.1:9` (or controlled in-memory `global.fetch` interceptors), and dummy test tokens. Never trigger a live `POST https://graph.facebook.com/.../{phone_number_id}/messages` request.
2. **Isolated Database:** Backend tests run against a dedicated MySQL 8.4 database (`DB_NAME=whatsapp_bulk_test`), never touching production or developer `whatsapp_bulk_db` data.
3. **Timezone Determinism:** Backend suites run explicitly under `TZ=Asia/Kolkata` and `APP_TIMEZONE=Asia/Kolkata` matching production India deployment assumptions so UTC vs IST bugs surface immediately.
4. **Sequential & Concurrency Execution Integrity:** Backend integration suites sharing MySQL tables run cleanly sequentially (`--test-concurrency=1`), while dedicated race-condition tests explicitly spawn parallel `Promise.all` / multi-request workers against transactional endpoints.

---

## 2. Test Pyramid & Layer Coverage

| Level | Scope | Tools / Harness | Cadence |
| :--- | :--- | :--- | :--- |
| **L1: Unit Tests** | Signature HMAC checks, expression evaluator, button/message schema validators, time parsing (`parseMysqlUtcTimestamp`), SSRF IP/DNS helpers, AI JSON parser & prompt sanitizer | `node:test` (`node --test`) | Every change |
| **L2: Security & Negative Auth Tests** | Role escalation (`USER` -> `ADMIN`), cross-tenant header spoofing (`x-workspace-id`), cross-tenant entity/report/template reads, unsigned/spoofed payment webhooks, path traversal (`/uploads`), SSRF redirects/IPv6/DNS rebinding, XSS HTML escaping | Dedicated `tests/layer1_security_foundation.test.js` + `security_and_reliability.test.js` | Every PR / Layer gate |
| **L3: Integration & DB Contract Tests** | MySQL 8.4 schema initialization (`schema.js`), idempotent migrations, webhook ingestion -> job queue -> flow engine -> outbound outbox, template install/configure/upgrade, catalog availability & payout ledger | `node:test` + Express `http.createServer` ephemeral port (`0`) + MySQL `whatsapp_bulk_test` | Every Layer gate |
| **L4: Concurrency & Resilience Tests** | Parallel last-room/slot bookings (10 simultaneous requests -> max inventory honored), duplicate Meta webhook `message_id` bursts, duplicate payment webhook bursts, server restart recovery from DB queue/handoff state | `node:test` parallel `Promise.all` drivers | Layers 2, 5, 10 |
| **L5: End-to-End Journey Tests (A–J)** | Full lifecycle scenarios per `docs/USER_JOURNEYS.md` across multi-tenant hospitality, clinic, and retail/education fixtures | `node:test` E2E specs | Layer 10 final gate |
| **L6: Frontend Verification** | Static lint (`oxlint`), Vite production bundle build, UI component contract tests, and role-based UI flow smoke checks | `npm --prefix frontend run lint`, `npm --prefix frontend run build`, browser/UI checks | Every UI change & Layer 8/10 |

---

## 3. Baseline Test Audit Findings (Layer 0 Observed)

Baseline run on `whatsapp_bulk_test` (`473 subtests / 79 files: 393 pass, 79 fail, 1 skip`):
1. **Genuine Product Bugs Exposed by Baseline Suite:**
   - Auth/RBAC role escalation (`authController.register` granting `ADMIN`; `security_and_reliability.test.js` expects `USER`).
   - `/uploads/inbound` auth returning `401` before path traversal `403` guard in `server.js`.
   - `inventoryService.bulkUpdateInventory()` duplicate rows due to missing `UNIQUE` index on `room_inventory_daily(room_type_id, inventory_date)` (`resort_booking_prd.test.js`).
   - `schedulerService.js` mixing `NOW()` vs `UTC_TIMESTAMP()` under `TZ=Asia/Kolkata`.
   - `payment-recovery-renewal-reminder` blueprint 21-char button title exceeding Meta's 20-char cap.
   - `reportsController.js` missing strict `tenant_id` scoping.
2. **Test Environment & Legacy Contract Mismatches to Align Carefully:**
   - Tests that intercept `global.fetch` checking `url.startsWith('https://graph.facebook.com')` failed because `META_API_URL=http://127.0.0.1:9` overrode the base URL; test harness & `metaWhatsAppService` test mocks should work cleanly without risking live network traffic (always aborting unmocked external hosts).
   - Strict `require` stubs in `conversation_tenant_workflows.test.js` and `schema_driven_workflow_input.test.js` reject the newer `./flowApprovalService` dependency in `conversationFlowService.js`.
   - Legacy tests expecting older pre-migration behavior (e.g., synchronous webhook writes vs queue ingestion, soft-delete vs hard-delete in inbox, outdated brand fixtures) will be verified against current intended product contracts and either fixed (if regression) or updated (if intentional architectural shift documented in ADRs/traceability).

---

## 4. Layer Gate Exit Criteria

A Layer cannot be marked complete until:
1. All new and existing tests covering that Layer pass under `TZ=Asia/Kolkata` on `whatsapp_bulk_test` with zero live Meta HTTP calls.
2. Negative / unauthorized / invalid-input tests exist and fail closed as designed.
3. `npm --prefix frontend run lint` (0 errors) and `npm --prefix frontend run build` succeed when frontend files are touched.
4. `docs/IMPLEMENTATION_STATUS.md` is updated exclusively with post-edit observed command results.
