# Survya No-Code Workflow Foundation — Iteration 4

This increment adds the first schema-driven configuration surface to the existing React Flow editor while retaining the existing, trusted Node.js execution engine. It is **not** a full runtime-extensible third-party plugin system.

## Delivered

- `SCHEMA_INPUT` node in the Flow Studio palette.
- Reusable descriptor fields (`text`, `textarea`, `number`, `select`, `boolean`) in `SchemaDrivenConfigFields.jsx`.
- Configured question, response type, stored variable name, retry count and retry text, without changing code per client journey.
- Existing intake executor handles runtime validation and state transitions, rather than creating a second conversation engine.
- Client and server validation independently reject invalid variable paths, unsupported response types and invalid retry budgets.
- Five regression tests for validation, execution, descriptor mapping and editor wiring.
- CI quality gate extended to include configurable-node tests.

## Example use cases

Exactly the same trusted code supports:
- Hotel: ask a check-in date and store `booking.check_in`.
- Clinic: ask for contact email and store `patient.contact_email`.
- Sales: collect lead qualification fields such as `lead.budget`.
- Support: collect a reference number and route the conversation using the saved value.

## Important boundaries

- Node **instances** are configurable, but trusted executor types still have to be registered by developers.
- The new declarative UI currently covers the new input node. The rest of the palette still contains specialized configuration components.
- User-defined external API execution, secrets, code extensions and long-running subflows require separate hardened capability registries and execution policies.
- Full frontend lint/build and MySQL-backed end-to-end tests are not verified.
- Do not merge this branch without a staged upgrade and validation of tenant ownership, webhook reliability, and media previews.

## Next milestones

1. Versioned server-owned node descriptor catalog, with authentication, input/output JSON schemas and capability permissions.
2. Dynamic editor rendering across the existing messaging, conditions, CRM and integration nodes.
3. Shared subflows, test fixtures, flow diff, per-version simulation, rollout/canary/revert.
4. Transactional message outbox, durable session/agent takeover, per-conversation ordering.
5. Tenant-scoped integration secret vault, declarative policy engine and administrative audit.
6. Load testing, threat modeling, restore drills, monitoring, observability and SLO-driven releases.
