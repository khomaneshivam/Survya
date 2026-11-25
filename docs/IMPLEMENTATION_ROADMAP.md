# Survya — Phased Transformation & Implementation Roadmap

> Sequencing of Layers 0–10 for transforming Survya (`d:\whatsapp_bulk`) into an enterprise-grade, multi-tenant, configuration-driven SaaS platform.

---

## Roadmap Overview

| Layer | Phase Title | Primary Objective | Gate Verification |
| :--- | :--- | :--- | :--- |
| **Layer 0** | Audit, Architecture & Planning *(Current)* | Baseline test measurement, security/schema/runtime audit, 14 architecture/planning documents | `whatsapp_bulk_test` initialized; all 14 `docs/` baseline specs written |
| **Layer 1** | Platform Foundation, RBAC & Security Hardening | Eliminate cross-tenant privilege escalation, fail-open payments, SSRF DNS/IPv6 bypasses, upload traversal `401` ordering, template tenant bugs; add workspace team RBAC | Negative security test suite + `security_and_reliability` + `data_ownership` + `multi_tenant_onboarding_billing` pass |
| **Layer 2** | Communication & Webhook Reliability | Centralize Meta channel adapter, drop unsafe Tenant-1 credential fallbacks, move pause/queue state to durable DB (`conversation_handoff_states` + `OUTBOUND_MESSAGE_DISPATCH`), fix `inbox/reply` | Webhook dedup burst tests, multi-line credential isolation, `meta_phone_registration` & `permanent_token_and_lines` pass |
| **Layer 3** | Unified Config-Driven Workflow Engine | Consolidate flow execution onto `conversationFlowEngine`, pin running sessions to immutable version snapshots, fix `schedulerService` UTC timestamps & 21-char blueprint buttons, isolate runtime from hardcoded industry logic | `workflow_engine_comprehensive`, `bot_customization`, `dynamic_workflow_platform`, version pinning & loop-guard tests pass |
| **Layer 4** | Template Studio & Customer Configuration | Enforce Platform Admin (`PUBLIC`) vs Tenant Owner (install/configure/upgrade) split, Level-A schema forms vs Level-B canvas editing, safe non-destructive upgrade diffs | `template_library_platform`, `schema_driven_workflow_input`, `conversation_tenant_workflows`, upgrade preservation tests pass |
| **Layer 5** | Commerce, Atomic Inventory & Fulfillment | Add `UNIQUE(room_type_id, inventory_date)` + atomic transactional reservation lock preventing concurrent double-booking; unify catalog/quote/booking/payment pipeline | `resort_booking_prd`, `universal_fulfillment`, 10-way concurrent booking race test pass |
| **Layer 6** | Guardrailed Multi-Domain AI Assistance | Remove hospitality prompt hardcoding, inject tenant profile/catalog boundaries, sanitize user inputs, enforce structured JSON intent parsing & confidence handoffs, meter AI token costs | AI JSON schema, prompt-injection & cross-domain fixture tests pass |
| **Layer 7** | Campaigns, Retention & Verified Analytics | Harden opt-in/24h/131049 broadcast delivery shield, standardize UTC retention triggers, ensure reports & funnel dashboards reflect 100% DB-backed tenant metrics | Campaign window/shield, retention sequence & analytics reconciliation tests pass |
| **Layer 8** | Role-Tailored UI & Frontend Consolidation | Align Platform Admin vs Workspace Owner vs Employee UI navigation, reconcile `frontend_design_system.test.js`, reduce duplicated automation views cleanly | `oxlint` (0 errors), `vite build` clean, `frontend_design_system.test.js` pass, UI smoke verified |
| **Layer 9** | Performance, Quota Enforcement & DevSecOps | Enforce plan message/resource entitlements, index hot query paths, add DB-backed `/health` check & structured correlation logging | Entitlement gate, load/latency check & health check tests pass |
| **Layer 10** | Full End-to-End, Resilience & Documentation Sign-off | Execute full Journeys A–J suite, concurrency & failure-recovery tests, zero-failure backend + frontend verification, finalize all `docs/` against observed reality | Full test suite (`0` failures), lint/build green, docs audit complete |

---

## Sequencing Rationale
1. **Security & Isolation First (Layer 1):** Adding features before closing Tenant-2 `ADMIN` escalation, fail-open webhooks, and `templateController.tenantId` routing bugs would compound breach surfaces.
2. **Reliable Messaging Before Engine Changes (Layer 2 -> 3):** Deterministic webhook deduplication, credential lookup, and durable outbox delivery are prerequisites for predictable flow state transitions.
3. **Engine & Templates Before Vertical Commerce/AI (Layer 3–4 -> 5–6):** Once the engine cleanly executes versioned, schema-driven configs, inventory locks and domain-agnostic AI become composable workflow capabilities rather than hardcoded branches.
4. **UI Consolidation After API Contracts Stabilize (Layer 8):** Aligning role views and removing redundant page logic once backend RBAC, templates, flows, and analytics APIs are finalized prevents UI churn.
