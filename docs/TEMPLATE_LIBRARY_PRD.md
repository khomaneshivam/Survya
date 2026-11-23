# Product Requirements Document (PRD)
## SURVYA Universal Flow Template Library & Client Configuration Engine

---

## 1. Objective & Vision

Survya enables businesses across Hospitality, Retail, B2B SaaS, Healthcare, and Professional Services to automate WhatsApp conversations, lead qualification, and bookings. Historically, building conversational workflows required intricate graph design, leading to repetitive setup and high operational overhead.

The **Universal Flow Template Library & Client Configuration Engine** establishes an enterprise template ecosystem:
- **For Platform Admins:** Author high-conversion conversation workflows once, define typed configuration schemas, and publish immutable versions across thousands of customer accounts.
- **For Tenant Operators:** Select an industry blueprint, walk through a 5-step guided wizard to customize business details, bind verified WhatsApp lines and catalogs, and launch in under 5 minutes without touching raw JSON or node graphs.
- **For Power Users:** Access the Unified Advanced Builder to tweak graph logic, add custom conditions, and run in-memory sandbox simulations safely.

---

## 2. Target Personas

| Persona | Role | Core Goal | Primary Surface |
|---|---|---|---|
| **Platform Administrator** | Survya Core Engineering / Solutions | Create and maintain standardized conversation blueprints, manage release lifecycles (`1.0.0` → `1.1.0`), and monitor cross-tenant adoption. | **Platform Admin (`TemplateAdminPage.jsx`)** |
| **Tenant Business Operator** | General Manager, Reservation Head, Marketing Lead | Launch pre-built customer journeys, update tariffs/operating hours, and inspect automation health without coding. | **My Automations & Setup Wizard (`AutomationHomePage.jsx`, `TemplateSetupPage.jsx`)** |
| **Workflow Specialist / Developer** | Automation Architect, Integrations Specialist | Customize node graphs, add webhook integrations, and test edge-case conditions. | **Advanced Builder (`WorkflowBuilderPage.jsx`)** |
| **End Customer / Guest** | WhatsApp User | Experience frictionless, instant responses, real-time availability quotes, and seamless booking confirmations. | **WhatsApp Direct Messaging** |

---

## 3. User Journeys & Product Modules

### Module A: My Automations Dashboard (`AutomationHomePage.jsx`)
- **Executive Metrics**: High-density operational tiles displaying **Active Automations**, **Draft Workflows**, and **Needs Attention** (flows with binding errors or degraded health).
- **Automation Inventory Table**: Lists workflows with status badges (Active, Draft, Paused), source template tag, connected WhatsApp line, last execution timestamp, and performance metrics.
- **Direct Operational Controls**: 1-click status toggles (Activate / Pause), Duplicate, Configure Settings, Advanced Edit, and Delete with confirmation modal.

### Module B: Template Library & Discovery (`TemplateLibraryPage.jsx` & `TemplateDetailsPage.jsx`)
- **Industry & Use-Case Taxonomy**: Tabbed navigation across Hospitality, B2B SaaS, E-Commerce, Healthcare, and Professional Services.
- **Template Presentation Cards**: Modern cards displaying industry badges, icon, description, capability bullet points, step count, and 1-click "Use Template" CTA.
- **Deep Inspection Drawer**: Inspects template capabilities, required channel/master bindings, and client-configurable fields before installation.

### Module C: 5-Step Guided Setup Wizard (`TemplateSetupPage.jsx`)
A linear, zero-friction onboarding wizard:
1. **Step 1: Business Identity**: Pre-fills existing tenant profile (Business Name, Phone, Email, Welcome Message).
2. **Step 2: Channel Connection**: Discovers verified WhatsApp sender lines owned by the tenant.
3. **Step 3: Master Data Mapping**: Maps required template bindings to tenant-owned properties, room catalogs, or CRM pipelines.
4. **Step 4: Dynamic Customization**: Renders dynamic JSON Schema form controls (check-in/out times, cancellation policies, budget qualification thresholds) with real-time field validation.
5. **Step 5: Test & Activate**: Side-by-side interactive WhatsApp chat simulator (using in-memory sandbox mocks) allowing operators to verify responses before live activation.

### Module D: Automation Details & Version Upgrades (`AutomationDetailsPage.jsx`)
- **Configuration Management**: Edit business profile, contact numbers, and policies at any time without resetting conversation sessions or recreating graphs.
- **1-Click Version Upgrades**: When platform admins publish new versions (`1.1.0`), detects upgrade availability, displays changelogs and compatibility impact, and upgrades the workflow while preserving tenant overrides.

### Module E: Advanced Workflow Builder (`WorkflowBuilderPage.jsx`)
- Modern visual graph editor wrapping `FlowCanvas`, `NodePaletteSidebar`, and `NodeInspectorDrawer`.
- Supports dragging and dropping nodes, configuring triggers, editing condition rules, and executing side-by-side sandbox simulations.

### Module F: Execution History & Session Audit (`ExecutionHistoryPage.jsx`)
- Full session audit log inspecting inbound turns, node transition paths, collected variables, and error traces.

---

## 4. Non-Functional Requirements & Security Guarantees

1. **Strict Multi-Tenant Isolation**: Tenant A and Tenant B installing the same template receive independent database records. Modifying Tenant A has mathematically zero effect on Tenant B.
2. **Absolute Live Message Prohibition**: All automated tests, sandbox simulators, and preview interfaces are bound to `isSimulation: true` mock adapters. Zero live WhatsApp messages or Meta Graph API calls are dispatched during testing.
3. **Sub-50ms Turn Processing**: The runtime engine resolves template configurations and evaluates expressions in memory with O(1) graph step traversal.
4. **Immutable Template Releases**: Once published, a version record (`template_versions`) cannot be mutated. New features require a new semantic release (`1.1.0`).

