# SURVYA — Final Regression & Verification Report (`refactor/production-core-rationalization`)

> **Execution Policy Notice (User Global Rule #3 / `AGENTS.md` §3):** Test suites, linters, and production Vite builds MUST NOT be executed using AI model credits; all runtime verification is executed strictly in the user's laptop terminal.

---

## 1. Execution Status Summary

| Check Category | Status as of Final Commit Prep | Scope & Notes |
|---|---|---|
| Fresh Clean-DB Schema Deployment (`node scripts/test_fresh_deployment.js`) | **PASSED (109 tables)** during WS1; re-run recommended locally after WS2–WS8 | Executed in WS1 after `schema.js` fixes (`idx_*` indexes, verify token entropy, removed duplicate `CREATE TABLE flow_global_settings`). |
| Source Inventory / DB / Auth Registers (`generate_registers.js`) | **GENERATED** post-WS8 cleanup | Refreshes `SOURCE_FILE_REGISTER.csv`, `DATABASE_TABLE_REGISTER.csv` (109 tables), `API_AUTHORIZATION_MATRIX.csv`. |
| Backend Security, Crypto, Commerce, CRM, Workflow, AI & Sandbox Suites (`npm test`) | **PENDING LOCAL LAPTOP TERMINAL RUN** | Updated per WS2–WS8 (`tests/helpers/testFixtures.js`, `closeTestResources`, `multi_industry_payouts.test.js`, `sandbox_isolation.test.js`, `layer1`, `layer2`, `layer4`, `layer6`, `layer7`, `layer9`, `layer10`, `master_production_qa`, etc.). |
| Frontend Lint (`npm --prefix frontend run lint`) & Vite Build (`npm --prefix frontend run build`) | **PENDING LOCAL LAPTOP TERMINAL RUN** | Dead imports removed (`PageSystem.jsx`), `PayoutsPage.jsx` retired simulated escrow UI, `Badge` variant compatibility added (`Primitives.jsx`), `FlowBuilderPage` simulator `token` fixed, `@types/*` removed. |
| AI Flow Generator DB Integration Suite (`RUN_DATABASE_INTEGRATION_TESTS=true`) | **OPT-IN (Local Isolated DB)** | Requires isolated MySQL + explicit opt-in env flag. |

---

## 2. Exact Commands to Execute in Your Laptop Terminal

Run these commands sequentially from `d:\whatsapp_bulk` against your isolated local MySQL database (never against production):

```powershell
# 1. Clean environment setup & schema verification (109 tables)
$env:NODE_ENV="test"
$env:DISABLE_SCHEDULER="true"
$env:VERIFY_WEBHOOK_SIGNATURE="true"
$env:DB_CLIENT="mysql"
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="your_local_mysql_password"
$env:DB_NAME="whatsapp_bulk_test"
$env:JWT_SECRET="local_test_jwt_secret_at_least_32_characters_long_12345"
$env:META_APP_SECRET="local_test_meta_app_secret_at_least_32_chars_long_123"
$env:WHATSAPP_API_TOKEN="local_test_whatsapp_token_at_least_50_chars_for_offline_simulation_only"

npm run db:init
node scripts/test_fresh_deployment.js

# 2. Backend syntax & complete regression suite (offline/mock/sandbox only)
npm test

# 3. Optional explicit DB AI flow generator integration test
$env:RUN_DATABASE_INTEGRATION_TESTS="true"
node --test tests/ai_flow_generator_and_line_binding.test.js
Remove-Item Env:RUN_DATABASE_INTEGRATION_TESTS -ErrorAction SilentlyContinue

# 4. Frontend dependency clean install (reflecting removed @types/react*) & lint + production build
npm --prefix frontend install --package-lock-only
npm --prefix frontend run lint
npm --prefix frontend run build
```

> **Note on `package-lock.json`:** Because `@types/react`, `@types/react-dom` (frontend) and `uuid` (backend) were removed from `package.json` in Workstream 7, run `npm install --package-lock-only` and `npm --prefix frontend install --package-lock-only` (or full `npm install`) locally if your lockfiles need syncing before CI `npm ci`.

---

## 3. Key Test Coverage Added / Hardened in This Cycle

1. **`tests/helpers/testFixtures.js`:** Clean-DB `ensureTestAdmin`, `ensureTestWabaLine`, and `closeTestResources` preventing open socket/MySQL pool hangs across suites.
2. **`tests/multi_industry_payouts.test.js`:** Updated Tests 8, 9, and 11 to assert `410 Gone` (`MERCHANT_DIRECT_MODE`) on retired Penny-Drop and instant pooled payout endpoints, while confirming Merchant-Direct reconciliation summary and read-only historical ledger access remain intact.
3. **`tests/sandbox_isolation.test.js`:** Added Test 3 verifying the full **Greenvally Hotel & Resort** 4-category, 25-unit hospitality catalog (`Deluxe Room` 10 @ ₹3,500, `Executive Suite` 8 @ ₹5,500, `Family Suite` 5 @ ₹7,500, `Private Pool Villa` 2 @ ₹12,000), atomic overbooking rejection, hold release availability restoration, and strict Sandbox quarantine of outbound emails (`SANDBOX_SUPPRESSED`), webhooks, and live AI calls.
4. **Scripted Suites Converted to `node:test`:** `tests/universal_autoreply_platform.test.js` and `tests/universal_masters_and_nodes.test.js` converted to proper `node:test` suites without `process.exit(1)`.
