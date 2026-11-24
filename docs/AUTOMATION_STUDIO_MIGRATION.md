# Automation Studio Migration & Legacy UI Retirement Guide
## Database Migrations, Navigation Routing, and Legacy Deprecation

---

## 1. Migration Overview

The migration to the Enterprise Automation Studio provides a modern, high-density, multi-tenant workflow experience while strictly preserving all existing database records, published conversation flow versions, active sessions, and execution histories.

---

## 2. Database Schema Additions (`src/config/schema.js`)

All schema additions are forward-only and non-destructive:

```sql
-- 1. Master Template Catalog
CREATE TABLE IF NOT EXISTS template_catalog (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  template_key VARCHAR(120) NOT NULL UNIQUE,
  owner_tenant_id BIGINT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'PUBLIC',
  industry VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  icon VARCHAR(64) DEFAULT 'Workflow',
  badge VARCHAR(32) DEFAULT 'STANDARD',
  capabilities_json JSON NULL,
  current_version VARCHAR(32) DEFAULT '1.0.0',
  status VARCHAR(32) DEFAULT 'PUBLISHED',
  tenant_id BIGINT NOT NULL DEFAULT 1,
  active_status TINYINT(1) NOT NULL DEFAULT 1,
  delete_status TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  deleted_by VARCHAR(64) NULL,
  created_by VARCHAR(64) DEFAULT 'system',
  updated_by VARCHAR(64) DEFAULT 'system',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tmpl_cat_tenant (tenant_id),
  INDEX idx_tmpl_cat_industry (industry),
  INDEX idx_tmpl_cat_vis (visibility)
);

-- 2. Master Template Immutable Versions
CREATE TABLE IF NOT EXISTS template_versions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  template_id BIGINT NOT NULL,
  version_number VARCHAR(32) NOT NULL,
  status VARCHAR(32) DEFAULT 'PUBLISHED',
  graph_json LONGTEXT NOT NULL,
  config_schema_json LONGTEXT NOT NULL,
  required_bindings_json LONGTEXT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  changelog TEXT NULL,
  tenant_id BIGINT NOT NULL DEFAULT 1,
  active_status TINYINT(1) NOT NULL DEFAULT 1,
  delete_status TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  deleted_by VARCHAR(64) NULL,
  created_by VARCHAR(64) DEFAULT 'system',
  updated_by VARCHAR(64) DEFAULT 'system',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tmpl_ver_template (template_id),
  UNIQUE KEY idx_tmpl_ver_unique (template_id, version_number)
);

-- 3. Tenant Template Installations
CREATE TABLE IF NOT EXISTS template_installations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  tenant_id BIGINT NOT NULL,
  template_id BIGINT NOT NULL,
  installed_version_id BIGINT NOT NULL,
  installed_version_number VARCHAR(32) NOT NULL,
  flow_id BIGINT NOT NULL,
  status VARCHAR(32) DEFAULT 'CONFIGURED',
  config_values_json LONGTEXT NOT NULL,
  last_validated_at DATETIME NULL,
  last_upgraded_at DATETIME NULL,
  active_status TINYINT(1) NOT NULL DEFAULT 1,
  delete_status TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  deleted_by VARCHAR(64) NULL,
  created_by VARCHAR(64) DEFAULT 'system',
  updated_by VARCHAR(64) DEFAULT 'system',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tmpl_inst_tenant (tenant_id),
  INDEX idx_tmpl_inst_template (template_id),
  INDEX idx_tmpl_inst_flow (flow_id)
);

-- 4. Template Resource Bindings
CREATE TABLE IF NOT EXISTS template_bindings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  logical_key VARCHAR(64) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  target_resource_id VARCHAR(255) NOT NULL,
  target_resource_name VARCHAR(255) NULL,
  active_status TINYINT(1) NOT NULL DEFAULT 1,
  delete_status TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  deleted_by VARCHAR(64) NULL,
  created_by VARCHAR(64) DEFAULT 'system',
  updated_by VARCHAR(64) DEFAULT 'system',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tmpl_bind_inst (installation_id),
  INDEX idx_tmpl_bind_tenant (tenant_id)
);
```

### Alterations on `conversation_flows`:
```sql
ALTER TABLE conversation_flows 
ADD COLUMN installed_from_template_id BIGINT NULL,
ADD COLUMN installed_from_version_id BIGINT NULL;
```

---

## 3. Frontend Navigation & Routing Migration

The frontend migration routes users cleanly into the unified Studio experience without breaking existing links or bookmarks:

1. **Sidebar Navigation (`Sidebar.jsx`):**
   - **Operations & Messaging:** The `Automations` menu item (`GitBranch` icon) is badged with `Studio` and activates the primary workspace for customer workflows.
   - **System Administration:** Added `Automation Studio` (`BotMessageSquare` icon) for platform template authoring and version releases.
2. **Page Dispatcher (`PageSystem.jsx`):**
   - Maps tab IDs `automationStudio`, `flowStudio`, and `autoreply` to `AutomationStudio.jsx`.
   - Backward-compatible hash routing: URLs accessing `/#flowStudio` or `/#autoreply` automatically open `AutomationStudio`.
3. **Studio Tab (`AutomationPage.jsx`):**
   - Replaced legacy embedded studio tabs with `AutomationStudio.jsx`.

---

## 4. Legacy Component Deprecation Roadmap

| Legacy Component | Lines | Current State | Replacement | Retirement Milestone |
|---|---|---|---|---|
| `FlowStudioPage.jsx` | 1,310 | Deprecated entry point | `AutomationStudio.jsx` & `AutomationHomePage.jsx` | Next major version release |
| `StepJourneyDesigner.jsx` | 2,068 | Deprecated step builder | `TemplateSetupPage.jsx` & `WorkflowBuilderPage.jsx` | Next major version release |
| `FlowTemplatesModal.jsx` | 420 | Deprecated modal popup | `TemplateLibraryPage.jsx` & `TemplateDetailsPage.jsx` | Next major version release |

### Existing Workflows Compatibility Guarantee:
All existing rows in `conversation_flows` and `conversation_flow_versions` remain 100% active. Their execution through `conversationFlowEngine.js` continues seamlessly because the underlying graph model is identical.

