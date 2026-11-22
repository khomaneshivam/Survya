# Survya Conversation Security & Multi-Tenant Migration — Iteration 2

**Status:** Draft review branch only. Not production-certified. Do not merge until the release gates below pass.

## Implemented in this iteration

- Added additive `tenant_id`, `channel_account_id`, `deleted_at` and `deleted_by` fields for `customer_replies`.
- Added tenant ownership columns to legacy `campaigns` and `templates` for inbox queries.
- Added tenant-filtered inbox listing, unread metrics, message history, mark-read and soft-hide.
- Scoped manual reply records to the authenticated tenant, including selected channel-account ID.
- Scoped the direct inbox route for the legacy tenant; other tenants cannot use platform-global credentials.
- Protected inbound media downloads with an ownership query.
- Rejected unknown WhatsApp receiving accounts at production inbound persistence.
- Hardened Meta HMAC verification: production no longer accepts an empty secret or signature bypass.
- Added 7 regression tests and a GitHub Actions quality gate for focused tests, backend syntax, frontend lint and build.

## Explicit limitations / risks

1. **Historical data attribution:** The additive schema defaults legacy rows to tenant 1 for compatibility. If customer-reply, campaign or template records predate real multi-tenant ownership, their true owner must be verified and corrected **before merge**. The migration cannot safely infer ownership for every historic row.
2. **Legacy sender restriction:** `POST /api/inbox/reply` is blocked for non-tenant-1 workspaces until the tenant-owned channel-account sender can replace global Meta credentials. This is deliberate fail-closed behavior.
3. **Legacy settings:** Global bot controls remain tenant-1 only. Build tenant-specific automation settings before opening them to other tenants.
4. **Broadcast history hiding:** Soft-hiding `customer_replies` does not archive independently stored `campaign_recipients`. Implement a thread/archive model before treating this endpoint as a complete conversation archive.
5. **Webhook durability:** Inbound handler still acknowledges Meta before durably enqueuing processing. Current message record deduplication does not provide exactly-once delivery. Use transactional inbox/outbox and worker retries as the next reliability increment.
6. **Distributed controls:** Pause state and per-phone sequencing still use in-process maps; must move to durable state and per-thread locks before horizontal scaling.
7. **Privacy:** Soft-hide is not DPDP erasure. Preserve an auditable erasure path with appropriate legal retention exceptions.

## Staging migration checklist

1. Snapshot and securely back up the current MySQL database.
2. Inventory every legacy row in `customer_replies`, `campaigns` and `templates`; identify real owners via registered phone accounts, campaign ownership, and chat links.
3. Explicitly re-attribute any tenant-2+ rows that would otherwise get legacy tenant-1 default.
4. Run schema migration on a disposable staging copy, verify all columns/indexes and query plans.
5. Confirm a tenant-B administrator cannot read, mark, delete, download media from, or reply to tenant-A data. Repeat for two receiving WhatsApp numbers sharing the same customer phone.
6. Verify Meta signature checks and test actual webhooks with known subscribed phone ID.
7. Run `npm ci && npm test` against a test database and `cd frontend && npm ci && npm run lint && npm run build`.
8. Test duplicate and reordered messages, job worker restarts, delayed sessions, and channel credentials.
9. Only then promote to staging followed by a controlled production release.

## Further architecture milestones

- Transactional inbound event inbox + durable jobs + outbound message outbox.
- Channel-agnostic conversation/thread identity and stable per-thread concurrency.
- Tenant-scoped credential registry and shared messaging adapters.
- Versioned server node descriptors, schema-driven editor panels, reusable subflows and safe connector policies.
- Monitoring, SLOs, structured traces, rate limits, billing enforcement, backup restoration tests, security review and load testing.

**Branch:** `review/conversation-tenant-foundation` — **PR:** #1.
