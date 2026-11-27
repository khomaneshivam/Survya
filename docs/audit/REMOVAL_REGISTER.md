# SURVYA — Dead Code & Dependency Removal Register

> **Protocol Followed:** Every candidate listed below has `0` active runtime consumers after reference/AST tracing, migration of still-relevant UI features to canonical modules, and regression test verification. Zero historical DB tables or columns were dropped.

## Status: EXECUTED on `refactor/production-core-rationalization` (Workstream 7 / Phase 17)

27 dead/unreferenced source files (`9` backend + `18` frontend, leaving the `6` active `inapp-runtime/*` card widgets used by `studio-chat/componentRegistry.jsx` and `SchemaDrivenConfigFields.jsx` used by `NodeInspectorDrawer.jsx` intact), 1 dead function (`executeBusinessAction`), and 3 unnecessary npm dependencies (`@types/react`, `@types/react-dom`, `uuid`) were verified at `0` active consumers via recursive import checking and removed. Zero historical DB tables or columns were dropped.

| Category | Target File / Dependency | Why Unnecessary | Previous Consumers | Replacement / Consolidation | Compatibility Impact | Recovery |
|---|---|---|---|---|---|---|
| Backend Router | `src/routes/authRoutes.js` | Duplicated inline in `apiRoutes.js` | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/campaignRoutes.js` | Duplicated in `apiRoutes.js`; 8 broken controller bindings | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/flowRoutes.js` | Duplicated in `apiRoutes.js`; 8 broken controller bindings | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/inboxRoutes.js` | Duplicated in `apiRoutes.js`; 4 broken controller bindings | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/resortRoutes.js` | Superseded by `apiRoutes.js` & `hospitalityRoutes.js`; 11 broken handlers | `0` runtime/tests | `src/routes/apiRoutes.js` & `hospitalityRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/sarvyaConnectRoutes.js` | Duplicated in `apiRoutes.js`; 5 broken controller bindings | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/settingsRoutes.js` | Duplicated in `apiRoutes.js`; 2 broken controller bindings | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Router | `src/routes/webhookRoutes.js` | Duplicated in `apiRoutes.js` | `0` runtime/tests | `src/routes/apiRoutes.js` | None (unmounted) | `git checkout` |
| Backend Utility | `src/utils/tenantScope.js` | Completely unused utility | `0` runtime/tests | Direct `req.user.tenant_id` & `assertPropertyOwnedByTenant` | None | `git checkout` |
| Backend Dead fn | `conversationFlowEngine.executeBusinessAction` | Dead legacy stub (`L654-893`) with fake URLs | `0` runtime/tests | Modular `nodeExecutors/catalogBookingExecutor.js` | None | `git checkout` |
| Frontend Pages & Components | `FlowsPage.jsx`, `AutomationPage.jsx`, `AutoReplyBotPage.jsx`, `FlowStudioPage.jsx` + `8` exclusive children (`StepJourneyDesigner`, `FlowTemplatesModal`, `FlowVersionsModal`, `FlowAnalyticsPanel`, `FlowExecutionsModal`, `FlowApprovalPanel`, `FlowPreviewLinksPanel`, `MessageTemplatesStudio`) + `TemplateInstallerModal.jsx` + `TransactionsPage.jsx` + `useFlowEditor.js` + `3` legacy `inapp-runtime` shells (`ConfirmationScreen`, `ExperienceShell`, `HeroWelcomeScreen`) (`18` files) | Dead unrouted imports in `PageSystem.jsx` & legacy runtime shells; replaced by `AutomationStudio`, `BookingsOrdersPage`, `studio-chat/ConversationalRenderer` (keeping `SchemaDrivenConfigFields.jsx` & the `6` active `inapp-runtime` card screens) | `0` runtime/build consumers (`check_imports.js` verified `0` missing refs) | Canonical `AutomationStudio` + `FlowBuilderPage` + `studio-chat/componentRegistry` | Hash routes preserved via `PageSystem` aliases | `git checkout` |
| Frontend DevDeps | `@types/react`, `@types/react-dom` | 0 TypeScript files in `frontend/` | `0` | Remove from `frontend/package.json` | None | `npm --prefix frontend i -D` |
| Backend Deps | `uuid` | Single `uuidv4()` call in `broadcastController.js` | `broadcastController.js:3` | Node built-in `crypto.randomUUID()` | None | `npm i uuid` |
