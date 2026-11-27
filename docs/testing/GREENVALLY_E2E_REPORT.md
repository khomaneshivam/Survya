# Greenvally Hotel & Resort — Sandbox E2E Verification Specification (`WS6`)

> **Safety Constraint:** Executed strictly in **Workspace Sandbox Mode (`tenants.is_sandbox = 1`)** with `global.fetch` loopback interception (`127.0.0.1` only), zero external Meta/SMTP/AI/payment dispatches, and zero mutation to Tenant 1 production records (`id = 1`).

---

## 1. Test Inventory Specification (25 Total Units across 4 Room Categories)

Configured in `tests/sandbox_isolation.test.js` (Test 3) under isolated Greenvally tenant (`primary_domain = 'HOSPITALITY'`, `is_sandbox = 1`):

| # | Room Category | Total Units | Base Nightly Rate (INR) | GST Slab |
|---|---|---|---|---|
| 1 | `Deluxe Room` | `10` | `₹3,500` | `12%` Hospitality |
| 2 | `Executive Suite` | `8` | `₹5,500` | `12%` Hospitality |
| 3 | `Family Suite` | `5` | `₹7,500` | `12%` Hospitality |
| 4 | `Private Pool Villa` | `2` | `₹12,000` | `12%` Hospitality |
| **Total** | **4 Categories** | **`25` Units** | — | — |

---

## 2. End-to-End Lifecycle Steps Verified in Code & Suite Design

1. **Workspace Sandbox Activation (`PUT /api/v1/workspace/sandbox`):**
   - Switches dedicated Greenvally tenant into Sandbox Mode (`isSandbox: true`), while blocking non-platform attempts to switch Tenant 1 or workspaces with live `PAID` transactions (`workspaceTeamController.js`).
2. **Hospitality Property & WABA Line Registration:**
   - Creates `Greenvally Hotel & Resort` (`POST /api/v1/hospitality/properties`) isolated under Greenvally `tenant_id` without modifying Tenant 1 `properties.id = 1`.
   - Registers WABA reception line with zero live Meta tokens; outbound messages short-circuit cleanly with `mock_txt_*` IDs and `WAIVED_SANDBOX` ledger entries (`billing_status = 'WAIVED_SANDBOX'`, `unit_cost = 0`).
3. **Inbound Webhook Durability (`POST /webhook` -> `webhook` worker):**
   - Verifies Meta HMAC-SHA256 signature using canonical DB-first `resolveMetaAppSecret()`.
   - Atomically deduplicates & enqueues inbound message to Greenvally's `customer_replies` scoped by `tenant_id` and `channel_account_id`.
4. **25-Unit Capacity, Overbooking Lock & Cancellation Restoration:**
   - Holds `2` of `2` `Private Pool Villa` units (`createInventoryHold` / `reserveConfirmedBookingAtomically` syncing `room_inventory_daily` under `FOR UPDATE`).
   - Concurrent/subsequent attempt to hold a `3rd` unit fails closed (`409` / insufficient availability).
   - Cancelling/releasing the hold restores `2` sellable units immediately.
5. **Quotation, Razorpay Webhook Reconciliation & Receipt:**
   - Computes exact 2-night GST breakdown (`₹10,000` net + `₹1,200` 12% GST = `₹11,200` total on Misty Valley Villa test).
   - Verifies signed merchant Razorpay webhook (`payment_link.paid` -> `PAID` & `CONFIRMED`), renders XSS-safe public receipt (`/api/v1/public/receipt/:ref`), and reconciles `reports/overview` revenue.
6. **Sandbox External Quarantine (`0` External Calls):**
   - `emailNotificationService.enqueueGoalEmailNotification` returns `{ suppressed: true, status: "SANDBOX_SUPPRESSED" }`.
   - `webhookExecutor` and AI clients (`taskScopedAiAgentService`, `inboxCopilotService`, `voiceTranscriptionService`, `aiFlowGeneratorService`) short-circuit without external HTTP calls.

---

## 3. Local Verification Command

Run directly in your laptop terminal after configuring your isolated MySQL test DB:

```powershell
$env:NODE_ENV="test"
$env:DISABLE_SCHEDULER="true"
$env:VERIFY_WEBHOOK_SIGNATURE="true"
node --test tests/sandbox_isolation.test.js tests/property_lifecycle_isolation.test.js
```
