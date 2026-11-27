# SURVYA — Canonical Business Model

> Single authoritative business semantics separating Tenancy, Entities, Contacts, Conversations, Commercial Leads/Quotes, Inventory Holds, Transactions/Fulfillment/Payment State Machines, and Recognized Revenue.

---

## 1. Core Entity Definitions

1. **Tenant (`tenants`):** Strict security, isolation, billing, and quota boundary. Every authenticated API request derives `tenant_id` exclusively from verified auth membership (`req.user.tenant_id`, or explicit audited Super-Admin workspace switch). Arbitrary request-body/query `tenant_id` overrides are rejected. `tenant_id = 1` is treated symmetrically with any other tenant and never acts as an implicit multi-tenant default or global Super-Admin proxy.
2. **Workspace Sandbox Mode (`tenants.is_sandbox`):** Dedicated isolated sandbox tenants only. Production tenants with live paid transactions or live WABA billing cannot self-toggle into sandbox mode via workspace settings. Sandbox tenants bypass all live external providers (WhatsApp, SMTP Email, Razorpay/Gateways, HTTP Webhooks, LLM APIs) via mock adapters and are strictly excluded from platform-wide live analytics and quotas.
3. **Business Entity vs Property (`business_entities` vs `properties`):**
   - `business_entities`: Canonical commercial operating unit across all domains (brand, slug, currency INR, timezone Asia/Kolkata, domain profile).
   - `properties`: Domain extension for `HOSPITALITY` linked cleanly by `tenant_id` (and verified via `assertPropertyOwnedByTenant`). Never interchange `tenant_id`, `entity_id`, `branch_id`, and `property_id`.
4. **Customer / Contact (`contacts`):** Tenant-scoped identity keyed by `(tenant_id, phone_e164)`. Channel identities (`wa_bsuid`, WhatsApp phone, web session token) never merge across tenant boundaries.
5. **Conversation (`customer_replies`, `conversation_flow_sessions`, `hospitality_chat_sessions`):** Customer communication thread and flow cursor pinned strictly to `(tenant_id, phone_number_id, flow_id, flow_version_id)`. A conversation is never synonymous with a confirmed booking, order, or settled payment.
6. **Lead & Enquiry (`crm_records`, `booking_enquiries`):** Sales opportunity or intake requirement tracked across pipeline stages. Moving a deal to `WON` records commercial pipeline conversion, **not** settled payment or confirmed inventory unless backed by a `PAID`/`CONFIRMED` transaction or confirmed hold.
7. **Quote (`quotes`, `quote_items` & `universalPricingService` snapshots):** Versioned price offer containing currency, deterministic line items, server-calculated taxes (CGST/SGST/IGST), discounts/promo rules, and expiry validity. Multiple revised quotes for the same enquiry MUST NOT multiply recognized revenue.
8. **Reservation Hold (`catalog_inventory_holds`):** Bounded temporary reservation (`HELD` -> `CONFIRMED` | `RELEASED` | `EXPIRED`) protecting unit stock, time slots, or date ranges against concurrent overselling. Expired or cancelled holds **fail closed** (`409 Conflict`) and cannot silently confirm.
9. **Transaction / Booking / Order (`universal_transactions`, legacy `unified_orders`):** Canonical commercial execution entity carrying independent state machines (`transaction_status`, `fulfillment_status`, `payment_status`).
10. **Payment Reconciliation (`universal_transactions` + Merchant-Direct logs):** Survya operates solely in **Merchant-Direct** payment mode. Payment success is established only via verified Razorpay/gateway HMAC-SHA256 webhook callbacks (matching merchant secret, capture event allowlist, amount, and currency) or authorized manual offline recording (`CASH`/`UPI_DIRECT`), never via unverified frontend redirects.

---

## 2. Canonical Revenue & Metric Definitions

All dashboards (`DashboardPage`), reports (`reportsController`), and CRM exports consume unified definitions:

| Metric | Canonical Definition | Exclusions |
|---|---|---|
| **Quoted Value** | Latest active/non-superseded quote total per open enquiry or unpaid checkout transaction | Excludes superseded quotes on the same enquiry & `is_sandbox = 1` |
| **Confirmed Booking / Order Value** | Sum of `grand_total` for non-deleted transactions in `fulfillment_status IN ('CONFIRMED','COMPLETED','IN_PROGRESS')` or confirmed stays | Excludes cancelled, draft, unconfirmed quotes & `is_sandbox = 1` |
| **Payments Received / Recognized Revenue** | Sum of `amount_paid` where `payment_status = 'PAID'` (verified webhook or authorized offline receipt) across `universal_transactions` + settled non-duplicated `unified_orders` / `WON` standalone quotes | Excludes `PENDING`, `FAILED`, `REFUNDED`, multi-quote duplicates & `is_sandbox = 1` |
| **Outstanding Receivables** | Sum of `GREATEST(grand_total - amount_paid, 0)` on `CONFIRMED` / `PARTIALLY_PAID` active transactions | Excludes `CANCELLED` & `VOID` |
| **Refunds** | Explicit `payment_status = 'REFUNDED'` / `PARTIALLY_REFUNDED` ledger entries tied to gateway refund IDs | Must trigger idempotent inventory restoration where applicable |
| **WhatsApp Billed Usage** | Count & `unit_cost` in `whatsapp_usage_ledger` where `billing_status NOT IN ('WAIVED', 'WAIVED_SANDBOX')` | Excludes `131049` `WAIVED` & `WAIVED_SANDBOX` rows |
