# SURVYA — Canonical Entity State Transitions

> Every commercial transaction, inventory hold, payment status, CRM deal, and workflow session uses explicit, non-overlapping state machines. Payment success never infers from UI state; inventory holds fail closed on expiry.

---

## 1. Universal Transaction (`universal_transactions`) State Machines

```mermaid
stateDiagram-v2
    state "Transaction Status" as TXN {
        [*] --> OPEN : Checkout / Quote Created
        OPEN --> SETTLED : Payment Verified / Offline Confirmed
        OPEN --> VOID : Expired / User Cancelled
        SETTLED --> REFUNDED_TXN : Gateway Refund Recorded
    }
    state "Payment Status" as PAY {
        [*] --> UNPAID
        UNPAID --> PARTIALLY_PAID : Partial Capture Verified
        UNPAID --> PAID : Full Webhook HMAC Verified
        PARTIALLY_PAID --> PAID : Balance Capture Verified
        PAID --> REFUNDED : Verified Refund Webhook
    }
    state "Fulfillment Status" as FUL {
        [*] --> PENDING
        PENDING --> CONFIRMED : Payment / COD Authorized & Hold Confirmed
        CONFIRMED --> IN_PROGRESS : Check-in / Service Started
        IN_PROGRESS --> COMPLETED : Service / Stay Completed
        CONFIRMED --> CANCELLED : Idempotent Cancel (Restores Stock)
        PENDING --> CANCELLED : Unpaid Expiry / Cancel (Releases Hold)
    }
```

## 2. Inventory Hold (`catalog_inventory_holds`)

```mermaid
stateDiagram-v2
    [*] --> HELD : createInventoryHold() Atomic Reserve
    HELD --> CONFIRMED : confirmHold() [BEFORE expires_at]
    HELD --> EXPIRED : releaseExpiredHolds() [AFTER expires_at]
    HELD --> RELEASED : releaseHold() User Cancel
    CONFIRMED --> RELEASED : releaseHold() Booking Cancel (Restores Stock)
```

- **Fail-Closed Rule:** Any `confirmHold()` or `reconcilePaymentSuccess()` encountering `status IN ('EXPIRED','CANCELLED','RELEASED')` or `expires_at <= UTC_TIMESTAMP()` MUST reject confirmation with `409 Conflict` unless explicit re-availability check re-acquires stock atomically.

## 3. CRM Record Stage (`crm_records`) & Lead Status Mapping

- **`stage_key`** always stores the canonical uppercase key defined by its parent `crm_pipelines.stages_json` (e.g. `NEW_LEAD`, `MQL`, `SQL`, `DEMO_BOOKED`, `PROPOSAL_SENT`, `WON`, `LOST` or booking stages `INQUIRY`, `AVAILABILITY_CHECKED`, `QUOTED`, `PAYMENT_PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`).
- Derived `status`:
  - `WON`: `stage_key IN ('WON', 'CLOSED_WON', 'CONFIRMED', 'CONVERTED', 'COMPLETED')`
  - `LOST`: `stage_key IN ('LOST', 'CLOSED_LOST', 'CANCELLED', 'UNQUALIFIED')`
  - `ACTIVE`: all earlier pipeline stages.

## 4. Workflow Definition & Installation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT : AI Generate / Blueprint Import / Template Install
    DRAFT --> PENDING_REVIEW : Submit for Workspace Approval
    PENDING_REVIEW --> APPROVED : Approver Signs Off
    APPROVED --> PUBLISHED : Explicit Admin Publish (Syncs Triggers)
    DRAFT --> PUBLISHED : Explicit Quick-Publish [Only Validated Non-Conflicting Tenant Drafts]
    PUBLISHED --> PAUSED : Admin Pause (Deactivates Triggers)
    PUBLISHED --> ARCHIVED : Superseded / Deleted
```
