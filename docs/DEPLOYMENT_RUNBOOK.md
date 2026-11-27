# Survya — Deployment, Migration & Operations Runbook

> Grounded in `d:\whatsapp_bulk\ecosystem.config.js`, `package.json`, `frontend/package.json`, `server.js`, `worker.js`, `src/config/env.js`, and `.github/workflows/ci-cd.yml`.

---

## 1. Runtime Topology

Survya runs as a two-process Node.js system backed by MySQL 8.4 (managed in production via PM2 in `ecosystem.config.js`):

1. **`sarvya-api` (`server.js`):** Serves the Express API, Meta/Razorpay webhooks, Server-Sent Events (`/api/events` / streams), `/x/:slug` public studio/links, `/uploads`, and built frontend static bundle (`frontend/dist`).
2. **`sarvya-worker` (`worker.js`):** Runs `JobWorkerEngine` continuously polling MySQL `job_queue` (`META_WEBHOOK_INGEST`, broadcast/campaign jobs, scheduled tasks, outbound retries).
3. **Database (MySQL 8.4):** Single source of truth configured via `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Note: `src/config/mysqlAdapter.js` executes synchronous DB queries via a worker helper (`mysqlSyncWorker`) preserving zero-event-loop blocking on caller patterns while committing to MySQL 8.4.

---

## 2. Required Environment Configuration

Refer to `.env.example` and `src/config/env.js`:
- **Database:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Security & Auth:** `JWT_SECRET` (minimum 32 chars in non-dev environments), `SETTINGS_ENCRYPTION_KEY` (AES encryption for sensitive credentials in `settings`), `WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET` / `WHATSAPP_APP_SECRET`
- **Timezone Consistency:** `TZ=Asia/Kolkata` and `APP_TIMEZONE=Asia/Kolkata` at OS/PM2 process level, while database timestamps ALWAYS store/compare UTC via `UTC_TIMESTAMP()` and convert cleanly with `parseMysqlUtcTimestamp()`.
- **Channel / Payment Gateways (Per-Environment / Per-Tenant):** `META_API_URL`, `WHATSAPP_API_TOKEN`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GEMINI_API_KEY` (stored encrypted in tenant/system settings where multi-tenant).

> **Test/CI Environment Rule:** In CI/local tests, point `DB_NAME=whatsapp_bulk_test` and mock Meta endpoints (`META_API_URL=http://127.0.0.1:9` or controlled mock transport) so external WhatsApp numbers are NEVER contacted.

---

## 3. Build, Schema Initialization & Startup Sequence

### Pre-Deployment / Build
```powershell
# 1. Install backend & frontend dependencies cleanly
npm ci
npm --prefix frontend ci

# 2. Verify frontend lint & build
npm --prefix frontend run lint
npm --prefix frontend run build

# 3. Run schema initialization (idempotent ADD COLUMN / CREATE TABLE IF NOT EXISTS)
npm run db:init
```

### Verification Gate (Offline Test DB)
```powershell
# Run automated backend tests against whatsapp_bulk_test (never production DB)
$env:NODE_ENV='test'
$env:DB_NAME='whatsapp_bulk_test'
$env:TZ='Asia/Kolkata'
$env:APP_TIMEZONE='Asia/Kolkata'
$env:JWT_SECRET='test_jwt_secret_at_least_32_characters_long_12345'
node --test --test-concurrency=1 tests/*.test.js
```

### Production Process Startup & SRE Health Probes (PM2)
```bash
pm2 start ecosystem.config.js --update-env
pm2 status
```
Monitor both `sarvya-api` and `sarvya-worker` individually (`pm2 logs sarvya-api`, `pm2 logs sarvya-worker`).
- **Health & Observability Endpoints:**
  - `GET /livez` — Process liveness probe (`status: "alive"`).
  - `GET /readyz`, `GET /api/health`, `GET /health` — MySQL-verified readiness probe (`status: "healthy"`, latency, `requestId`).
  - `GET /metrics` — Prometheus-format gauges (`process_uptime_seconds`, `process_resident_memory_bytes`, `survya_job_queue_pending`, `survya_job_queue_dead_letter`).
- **Workspace Sandbox Mode:** Workspaces with `tenants.is_sandbox = 1` (managed via `GET/PUT /api/v1/workspace/sandbox`) simulate outbound Meta WhatsApp delivery cleanly without hitting live Graph API or billing usage (`WAIVED_SANDBOX`).

---

## 4. Schema Migration Safety Guidelines
- All schema changes MUST be additive and idempotent in `src/config/schema.js` (checking `INFORMATION_SCHEMA` before `ALTER TABLE ... ADD COLUMN` or `CREATE UNIQUE INDEX`).
- Never drop live tables or truncate tenant data during deployment.
- Before adding a `UNIQUE` index (such as `room_inventory_daily(room_type_id, inventory_date)` in Layer 5), deduplicate stale historical rows deterministically using latest updated timestamp inside the idempotent migration step so existing deployments upgrade cleanly.

---

## 5. Rollback & Incident Recovery
1. **Application Rollback:** Deploy previous verified git tag -> `npm --prefix frontend run build` -> `pm2 reload ecosystem.config.js`.
2. **Stuck Jobs / Webhook Backlogs:** Inspect `job_queue` status (`PROCESSING` / `FAILED` / `PENDING`) and `incoming_webhook_events` without flushing unprocessed payloads.
3. **Emergency Automation Pause:** Admins/owners can pause inbound automation globally per phone line or per conversation (`conversation_handoff_states` after Layer 2) while inbox agents handle live customer chats safely.
