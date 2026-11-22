# Survya conversation foundation — candidate patch

This candidate change is **not production certified**. It is intentionally left off branches pending the complete project test suite and environment-backed integration verification.

## Included
- Resolve inbound WhatsApp channel account from `waba_phone_numbers`, rejecting unknown and ambiguous identifiers.
- Resolve the property from a published line-bound flow or a tenant-owned fallback.
- Select active conversation sessions by tenant, channel and receiving number.
- Route trigger matching and default published flows using the resolved tenant.
- Prevent non-default tenants from entering the legacy, global-settings hospitality fallback.
- Scope process-local sequential queues by receiving phone account.
- Reject unknown node types at runtime and workflow publish validation.
- Permit trusted server-side registration of additional node executors.
- Validate assigned WhatsApp phone lines belong to the same tenant.
- Add isolated regression tests for the channel resolver, node registry, publish validation, and session scoping.

## Explicitly not completed
- `customer_replies` schema and inbox query migration to tenant-scoped records.
- Durable account-scoped human handoff state and distributed conversation locks.
- Migrations for existing unscoped active sessions; they must be drained or migrated before enabling multi-line routing.
- Config-schema-driven node editor, reusable subflows, and capability registry UI.
- Full end-to-end Meta webhook, send, retry and scheduler tests.
- Environment-backed MySQL tests, load tests and full `npm test` run.

## Release gate
1. Run `npm ci` and `npm test` on the exact candidate tree.
2. Run `npm ci && npm run build && npm run lint` inside `frontend`.
3. Test tenant A/tenant B and same customer number across two sender accounts.
4. Test duplicate/reordered Meta webhooks, workflow resume, and business action idempotency.
5. Verify legacy tenant-1 behavior, onboarding, and migration/rollback against a staging copy of MySQL.
6. Complete tenant-scoped inbox persistence and credential isolation before enabling the feature for external clients.

Do not deploy this candidate directly to production.
