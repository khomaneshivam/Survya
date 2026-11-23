# SURVYA Enterprise Automation Studio & Reusable Workflow Platform
## System Architecture & Technical Specification

---

## 1. Executive Summary & Core Principle

Survya is a multi-tenant conversational commerce, customer engagement, and WhatsApp workflow automation SaaS platform. The **Enterprise Automation Studio** replaces legacy, monolithic flow builders with a unified platform architecture governed by one foundational principle:

> **"One reusable workflow design. Independent client configurations. Separate client data."**

Platform administrators author master conversation workflows with typed configuration schemas and resource bindings once. Client tenants discover and install these templates into their independent workspaces, customize their business profile and variables without writing code or mutating graph structures, bind their dedicated channels and catalogs, and execute them safely with zero cross-tenant data leakage.

---

## 2. Architectural Boundaries & Data Flow

```mermaid
flowchart TD
    subgraph Master Template Registry (Platform Governance)
        TC[template_catalog] -->|Immutable Semantic Release| TV[template_versions]
        TV -->|Config Schema & Typed Bindings| TR[Template Repository]
    end

    subgraph Tenant Isolation Layer
        T1[Tenant A: Resort A<br/>Starting Price: ₹3,500] -->|Installs v1.0.0| TI1[template_installations A]
        T2[Tenant B: Resort B<br/>Starting Price: ₹5,000] -->|Installs v1.0.0| TI2[template_installations B]
        T3[Tenant C: B2B Enterprise<br/>Budget: ₹50,000+] -->|Installs v1.0.0| TI3[template_installations C]
        
        TI1 -->|Tenant Bindings| TB1[template_bindings A]
        TI2 -->|Tenant Bindings| TB2[template_bindings B]
        TI3 -->|Tenant Bindings| TB3[template_bindings C]
    end

    subgraph O(1) Conversation Flow Engine
        TI1 -->|Provisions Flow & Overrides| CF1[conversation_flows A]
        TI2 -->|Provisions Flow & Overrides| CF2[conversation_flows B]
        TI3 -->|Provisions Flow & Overrides| CF3[conversation_flows C]
        
        CF1 --> CFE[conversationFlowEngine.processTurn]
        CF2 --> CFE
        CF3 --> CFE
        
        CFE -->|Dot-Path Traversal & Safe String Interpolation| EE[expressionEvaluator.js]
        EE -->|Resolves: config.*, catalog.*, pricing.*, session.*| OUT[Tenant Outbound Response]
    end
```

### Separation of Concerns
1. **Template Definition (Immutable Master):**
   - Stored in `template_catalog` and `template_versions`.
   - Contains graph topologies (nodes, transitions), typed `configSchema`, `requiredBindings`, and capability descriptors.
   - Zero hardcoded customer details, phone numbers, or property IDs.
2. **Tenant Installation (Customer Workspace):**
   - Stored in `template_installations` and `template_bindings`.
   - Maps an installation to an independent tenant-owned `conversation_flows` record.
   - Holds tenant-specific configuration overrides in `config_values_json`.
3. **Runtime Execution (Stateful & Zero-Leakage):**
   - Executes through `conversationFlowEngine.processTurn`.
   - Injects tenant context, catalog prices (`SELECT MIN(base_price) FROM catalog_items WHERE tenant_id = ?`), and contact parameters dynamically.

---

## 3. Database Architecture & Schema Design

The platform extends the MySQL 8 schema non-destructively:

### A. `template_catalog`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | BIGINT | PRIMARY KEY, AUTO_INCREMENT | Internal surrogate ID |
| `uuid` | VARCHAR(36) | UNIQUE, NOT NULL | Global public identifier |
| `template_key` | VARCHAR(120) | UNIQUE, NOT NULL | Stable namespaced key (e.g. `hospitality.resort-booking`) |
| `owner_tenant_id` | BIGINT | NULL | NULL = Platform Master; Non-null = Private Tenant Template |
| `visibility` | VARCHAR(32) | NOT NULL, DEFAULT 'PUBLIC' | `PUBLIC` or `PRIVATE` |
| `industry` | VARCHAR(64) | NOT NULL | `HOSPITALITY`, `B2B_SAAS`, `RETAIL`, `HEALTHCARE`, etc. |
| `category` | VARCHAR(64) | NOT NULL | `BOOKING`, `SALES`, `SUPPORT`, `FEEDBACK` |
| `title` | VARCHAR(255) | NOT NULL | Human-readable name |
| `description` | TEXT | NULL | Detailed capabilities overview |
| `icon` | VARCHAR(64) | DEFAULT 'Workflow' | Lucide icon identifier |
| `badge` | VARCHAR(32) | DEFAULT 'STANDARD' | `POPULAR`, `FEATURED`, `NEW` |
| `capabilities_json` | JSON | NULL | Array of feature highlights |
| `current_version` | VARCHAR(32) | DEFAULT '1.0.0' | Active semantic release pointer |
| `status` | VARCHAR(32) | DEFAULT 'PUBLISHED' | `DRAFT`, `IN_REVIEW`, `PUBLISHED`, `DEPRECATED`, `ARCHIVED` |

### B. `template_versions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | BIGINT | PRIMARY KEY, AUTO_INCREMENT | Version record surrogate key |
| `uuid` | VARCHAR(36) | UNIQUE, NOT NULL | Public version UUID |
| `template_id` | BIGINT | FOREIGN KEY (`template_catalog.id`) | Owning template |
| `version_number` | VARCHAR(32) | NOT NULL | SemVer string (`1.0.0`, `1.1.0`) |
| `status` | VARCHAR(32) | DEFAULT 'PUBLISHED' | Release lifecycle status |
| `graph_json` | LONGTEXT | NOT NULL | Canonical ReactFlow/workflow graph nodes & transitions |
| `config_schema_json` | LONGTEXT | NOT NULL | Typed schema defining client-configurable fields |
| `required_bindings_json` | LONGTEXT | NOT NULL | Channel & master data requirements |
| `checksum` | VARCHAR(64) | NOT NULL | SHA-256 integrity hash of graph |
| `changelog` | TEXT | NULL | Release notes and compatibility warnings |

### C. `template_installations`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | BIGINT | PRIMARY KEY, AUTO_INCREMENT | Installation record ID |
| `uuid` | VARCHAR(36) | UNIQUE, NOT NULL | Installation identifier |
| `tenant_id` | BIGINT | NOT NULL, INDEX | Owning customer workspace |
| `template_id` | BIGINT | NOT NULL, INDEX | Source template catalog ID |
| `installed_version_id` | BIGINT | NOT NULL | Exact immutable version installed |
| `installed_version_number` | VARCHAR(32) | NOT NULL | Semantic version string at install time |
| `flow_id` | BIGINT | NOT NULL, INDEX | Cloned runnable flow in `conversation_flows` |
| `status` | VARCHAR(32) | DEFAULT 'CONFIGURED' | `INSTALLING`, `DRAFT`, `CONFIGURED`, `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `config_values_json` | LONGTEXT | NOT NULL | Tenant-specific business overrides |
| `last_validated_at` | DATETIME | NULL | Timestamp of last pre-flight validation |
| `last_upgraded_at` | DATETIME | NULL | Timestamp of last version migration |

### D. `template_bindings`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | BIGINT | PRIMARY KEY, AUTO_INCREMENT | Binding ID |
| `installation_id` | BIGINT | NOT NULL, INDEX | Owning installation |
| `tenant_id` | BIGINT | NOT NULL, INDEX | Tenant data boundary |
| `logical_key` | VARCHAR(64) | NOT NULL | Template logical name (e.g. `sender_line`) |
| `resource_type` | VARCHAR(32) | NOT NULL | `WHATSAPP_LINE`, `PROPERTY`, `CATALOG_CATEGORY`, `CRM_PIPELINE` |
| `target_resource_id` | VARCHAR(255) | NOT NULL | Resolved tenant resource ID |
| `target_resource_name` | VARCHAR(255) | NULL | Cached human label |

---

## 4. Dynamic Expression Resolution Engine

Workflow text, messages, and condition rules support strict dot-path interpolation via `src/services/workflow/expressionEvaluator.js`:

```javascript
const namespaces = {
  config: templateConfig,               // e.g. {{config.business.name}}, {{config.greeting}}
  catalog: { starting_price: '₹3,500' },// e.g. {{catalog.starting_price}}
  session: collectedSessionVariables,   // e.g. {{session.check_in_date}}, {{session.guest_count}}
  contact: contactProfileData,          // e.g. {{contact.name}}, {{contact.phone}}
  pricing: calculatedQuoteBreakdown,    // e.g. {{pricing.quote_total}}, {{pricing.tax_amount}}
  property: propertyProfile             // e.g. {{property.name}}, {{property.city}}
};
```

### Safety and Security Directives:
1. **Zero-Eval Guarantee**: Expression evaluation performs zero code execution, zero `eval()`, zero `new Function()`, and zero VM contexts.
2. **Deterministic Dot-Traversal**: Traverses strictly bounded JSON structures. Missing or undefined paths cleanly evaluate to an empty string or null rather than throwing unhandled exceptions.
3. **Session Reset Isolation**: Conversation restarts (e.g. timeout or keyword reset) purge ephemeral intake variables while strictly preserving immutable `config` and `catalog` namespaces.

---

## 5. Security & Multi-Tenant Authorization

1. **Verified JWT Authentication**: All endpoints require verified Bearer tokens decoded by `authMiddleware.js`.
2. **Tenant ID Derivation**: The effective workspace is derived exclusively from `req.user.tenant_id`. Request body tenant ID injection is strictly rejected.
3. **Platform vs Tenant Role Boundaries**:
   - `ADMIN` role within a tenant grants administrative rights *only within that tenant's workspace*.
   - Master template authoring, public publishing, and cross-workspace version deprecation require verified Platform Super-Admin authorization (`req.user.isPlatformAdmin === true` or verified system root privileges).
4. **Mandatory Safety Rule**: In accordance with system safety constraints, **all testing, verification, and sandboxes utilize mock adapters and `isSimulation: true` stubs**. Real Meta Graph API outbound endpoints are never triggered by automated testing.

