# Automation Studio & Template Library REST API Reference
## API Contracts, Authentication, Payloads, and Error Schemas

---

## 1. Authentication & Security Headers

All Automation Studio endpoints require Bearer JWT authentication:

```http
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
```

Tenant ID is extracted directly from the verified token (`req.user.tenant_id`). Client requests attempting to inject `tenant_id` via body or query parameters to access other workspaces are rejected with `403 Forbidden`.

---

## 2. Template Catalog Endpoints (`/api/v1/template-library`)

### 1. List Available Templates
- **Method:** `GET /api/v1/template-library`
- **Access:** Authenticated Tenant Operator / Admin
- **Query Parameters:**
  - `industry` (optional): Filter by industry (e.g. `HOSPITALITY`, `B2B_SAAS`)
  - `category` (optional): Filter by category (e.g. `BOOKING`, `SALES`)
- **Response:** `200 OK`
```json
{
  "success": true,
  "templates": [
    {
      "id": 1,
      "uuid": "7a3b4c12-3456-4789-a012-3456789abcde",
      "template_key": "hospitality.resort-booking",
      "title": "Resort Booking Assistant",
      "description": "24/7 reservation concierge. Greets guests using your business details...",
      "industry": "HOSPITALITY",
      "category": "BOOKING",
      "icon": "Hotel",
      "badge": "POPULAR",
      "current_version": "1.0.0",
      "visibility": "PUBLIC",
      "status": "PUBLISHED",
      "capabilities_json": [
        "Dynamic tenant business profile & welcome message resolution",
        "Real-time room availability & rates lookup via Universal Catalog"
      ]
    }
  ]
}
```

### 2. Get Template Details
- **Method:** `GET /api/v1/template-library/:idOrKey`
- **Access:** Authenticated Tenant Operator / Admin
- **Response:** `200 OK`
```json
{
  "success": true,
  "template": {
    "id": 1,
    "template_key": "hospitality.resort-booking",
    "title": "Resort Booking Assistant",
    "current_version": "1.0.0",
    "versions": [
      {
        "id": 1,
        "version_number": "1.0.0",
        "status": "PUBLISHED",
        "config_schema": { ... },
        "required_bindings": [ ... ],
        "graph": { ... }
      }
    ]
  }
}
```

### 3. Get Tenant Resource Options for Bindings
- **Method:** `GET /api/v1/template-library/resources`
- **Access:** Authenticated Tenant Operator
- **Description:** Returns tenant-owned resources to populate wizard dropdowns.
- **Response:** `200 OK`
```json
{
  "success": true,
  "resources": {
    "whatsappLines": [
      { "phone_number_id": "919422359446", "phone_number": "+919422359446", "display_name": "Resort Concierge Line" }
    ],
    "properties": [
      { "id": 1, "name": "Konkan Beach Sanctuary", "city": "Alibaug" }
    ],
    "catalogCategories": [
      { "id": 4, "name": "Villas & Suites" }
    ],
    "crmPipelines": [
      { "id": 1, "slug": "b2b-sales-pipeline", "name": "B2B Sales Pipeline" }
    ]
  }
}
```

### 4. Create Master / Private Template
- **Method:** `POST /api/v1/template-library`
- **Access:** Platform Admin (for `PUBLIC`), Tenant Admin (for `PRIVATE`)
- **Request Body:**
```json
{
  "template_key": "custom.vip-concierge",
  "title": "VIP Concierge Experience",
  "description": "High-touch customer assistant.",
  "industry": "SERVICES",
  "category": "SUPPORT",
  "visibility": "PRIVATE",
  "current_version": "1.0.0"
}
```

### 5. Release Immutable Template Version
- **Method:** `POST /api/v1/template-library/:id/versions`
- **Access:** Platform Super-Admin
- **Request Body:**
```json
{
  "version_number": "1.1.0",
  "graph_json": { "nodes": [ ... ], "transitions": [ ... ] },
  "config_schema_json": { ... },
  "required_bindings_json": [ ... ],
  "changelog": "Added multi-lingual greeting options and dynamic currency."
}
```

---

## 3. Template Installation Endpoints (`/api/v1/template-installations`)

### 1. List Tenant Installations
- **Method:** `GET /api/v1/template-installations`
- **Access:** Authenticated Tenant Operator
- **Response:** `200 OK`
```json
{
  "success": true,
  "installations": [
    {
      "id": 12,
      "flow_id": 45,
      "flow_name": "Seaside Haven Concierge",
      "template_title": "Resort Booking Assistant",
      "installed_version_number": "1.0.0",
      "status": "ACTIVE",
      "flow_status": "PUBLISHED",
      "created_at": "2026-11-23T18:00:00Z"
    }
  ]
}
```

### 2. Install Template into Workspace
- **Method:** `POST /api/v1/template-installations/install`
- **Access:** Authenticated Tenant Operator
- **Request Body:**
```json
{
  "templateIdOrKey": "hospitality.resort-booking",
  "customFlowName": "Seaside Haven Concierge",
  "configValues": {
    "business.name": "Seaside Haven Resort",
    "business.phone": "919422359446",
    "greeting": "Welcome to the pristine coast! How can we make your stay magical?",
    "checkin_time": "15:00",
    "checkout_time": "11:00"
  },
  "bindings": [
    { "key": "sender_line", "type": "WHATSAPP_LINE", "target_resource_id": "919422359446" },
    { "key": "property_id", "type": "PROPERTY", "target_resource_id": "1" }
  ],
  "activateImmediately": false
}
```
- **Response:** `201 Created`
```json
{
  "success": true,
  "installation": { "id": 12, "status": "CONFIGURED", "flow_id": 45 },
  "flow": { "id": 45, "name": "Seaside Haven Concierge", "status": "DRAFT" }
}
```

### 3. Validate & Activate Installation
- **Method:** `POST /api/v1/template-installations/:id/activate`
- **Access:** Authenticated Tenant Operator
- **Response:** `200 OK`
```json
{
  "success": true,
  "message": "Template installation validated and activated successfully.",
  "installation": { "id": 12, "status": "ACTIVE" },
  "flow": { "id": 45, "status": "PUBLISHED", "published_version_id": 88 }
}
```

### 4. Check Version Upgrade Availability
- **Method:** `GET /api/v1/template-installations/:id/upgrade-check`
- **Response:** `200 OK`
```json
{
  "success": true,
  "upgradeAvailable": true,
  "installedVersion": "1.0.0",
  "latestVersion": "1.1.0",
  "changelog": "Added upgraded welcome node and improved validation"
}
```

### 5. Upgrade Installation to Target Version
- **Method:** `POST /api/v1/template-installations/:id/upgrade`
- **Request Body:**
```json
{
  "targetVersionNumber": "1.1.0"
}
```
- **Response:** `200 OK`
```json
{
  "success": true,
  "message": "Installation upgraded to version 1.1.0 successfully.",
  "installedVersion": "1.1.0",
  "flowVersionNumber": 2
}
```

### 6. In-Memory Sandbox Chat Simulation
- **Method:** `POST /api/v1/template-installations/:id/simulate`
- **Safety Directive:** Zero live WhatsApp messages dispatched (`isSimulation: true`).
- **Request Body:**
```json
{
  "userInput": "hi",
  "sessionContext": {}
}
```
- **Response:** `200 OK`
```json
{
  "success": true,
  "handled": true,
  "replyText": "🌿 *Welcome to Seaside Haven Resort!*\n\nWelcome to the pristine coast! How can we make your stay magical?\nOur starting rate is ₹3,500.\nFor direct inquiries, contact 919422359446.",
  "trace": [
    { "node": "node_start", "type": "START", "status": "PASSED" },
    { "node": "node_welcome", "type": "MESSAGE", "status": "EXECUTED" }
  ]
}
```

