# SARVYA — Workflow Engine Specification

## 1. Architectural Design

Survya's workflow runtime (`src/services/conversationFlowEngine.js`) is a **version-pinned, event-driven state machine** backed by persistent MySQL sessions (`conversation_flow_sessions`) and auditable execution logs (`conversation_flow_events`).

### Key Execution Principles
- **Version Pinning:** Active customer sessions bind to an exact `flow_version_id` at session start (`conversation_flow_versions`). Publishing a new version (`v2`) creates a new immutable version row without mutating running `v1` customer sessions.
- **Zero-Eval Expressions:** All dynamic interpolation (`{{config.*}}`, `{{session.*}}`, `{{catalog.*}}`, `{{pricing.*}}`, `{{contact.*}}`, `{{property.*}}`) and rule conditions (`evaluateRules`) run through bounded dot-path traversal in `src/services/workflow/expressionEvaluator.js` — zero `eval()`, `new Function()`, or dynamic code execution.
- **Channel & Tenant Context:** Inbound routing executes strictly in waterfall order via `webhookService.js`:
  1. Active unexpired session (`conversation_flow_sessions` scoped by `tenant_id`, channel, and receiving `phone_number_id`)
  2. Global escape navigation (`flow_global_settings`: Back stack pop, Root Menu reset, Human Agent handoff)
  3. Compiled O(1) trigger match (`workflowTriggerService.js`)
  4. Default published flow for that receiving line / tenant (`is_default DESC, priority DESC`)

---

## 2. Pluggable Node Executor Contracts (`src/services/workflow/nodeExecutors/`)

Supported node categories registered in `nodeExecutors/index.js`:
- **Triggers:** `START`, `TRIGGER_WHATSAPP`, `TRIGGER_EVENT`
- **Messaging & Menus:** `SEND_MESSAGE`/`MESSAGE`, `BUTTON_MENU`/`INTERACTIVE_MENU`, `SELECTION`, `SEND_TEMPLATE`, `SEND_WHATSAPP_FLOW`
- **Intake & Validation:** `ASK_INPUT`, `COLLECT_INPUT`, `SCHEMA_INPUT`, `QUESTION`
- **Logic & Modularity:** `CONDITION`, `SET_VARIABLE`, `CALL_SUBFLOW` (re-entrant call stack on `call_stack_json`), `WAIT_DELAY` (scheduled via `workflow_scheduled_jobs` with `cancel_on_reply`)
- **Commerce & Actions:** `CATALOG_BROWSER`, `ADDON_UPSELL_AND_QUOTE`, `MASTER_PICKER`, `CATALOG_BOOKING`/`BUSINESS_ACTION`/`TRANSACTION`/`BOOKING`/`QUOTATION`, `CRM_UPSERT`, `OPEN_INAPP_EXPERIENCE`
- **Integrations:** `HTTP_WEBHOOK`/`API_INTEGRATION`/`ACTION_API` (SSRF-guarded, 8s timeout, 256 KB max response, dry-run mock in simulator)
- **Intelligence & Escalation:** `AI_KNOWLEDGE_REPLY`, `AI_HYBRID_ASSIST`, `HUMAN_HANDOFF`, `END`

---

## 3. Graph Validation & Guardrails (`conversationFlowService.validateFlowGraph`)

Pre-publish validation strictly enforces:
1. Exactly one reachable `START` / trigger entry node and at least one terminal path without dangling edges.
2. Self-loop prevention and bounded step traversal (`MAX_HOPS` loop protection in engine).
3. Meta Cloud API structural constraints: quick-reply button count `<= 3`, button title `<= 20` characters, list row count `<= 10`, row title `<= 24` characters.
4. Registered executor verification (rejects unknown/untrusted node types).
5. Sub-flow cyclic call prevention (`CALL_SUBFLOW`).

*(Layer 0 Note: Blueprint `payment-recovery-renewal-reminder` currently violates the 20-character button check with `"Request 7-Day Grace ⏳"` (21 chars) and will be remediated in Layer 3.)*
