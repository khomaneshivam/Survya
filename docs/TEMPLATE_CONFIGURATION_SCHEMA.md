# Template Configuration Schema Specification
## Data Contracts & Type Validation Engine

---

## 1. Overview

The Template Configuration Schema defines the contract between a reusable master workflow template and a client tenant's business configuration. It specifies which fields a tenant operator can customize, the data types and validation constraints enforced, and how default values are applied.

The schema is stored in `template_versions.config_schema_json` as a JSON object of field definitions.

---

## 2. Supported Field Types

| Type | Input Control | Validation Rules | Sanitization / Normalization |
|---|---|---|---|
| `string` | Single-line Text Input | `required`, `minLength`, `maxLength` | Trim whitespace |
| `text` | Multiline Textarea | `required`, `minLength`, `maxLength` | Preserves line breaks |
| `phone` | Phone Input with Country Code | Validates 10-15 digits E.164 | Strips `+`, spaces, dashes; retains clean digits |
| `email` | Email Input | Validates standard email regex | Trim and lower-case |
| `time` | Time Picker | 24-hour time format `HH:mm` (e.g. `14:00`) | Standardized `HH:mm` string |
| `date` | Date Picker | ISO format `YYYY-MM-DD` | Standardized ISO date string |
| `number` | Numeric Input | `min`, `max`, `integer` | Coerced to JavaScript `Number` |
| `currency` | Currency Input with symbol | Numeric, positive | Coerced to Number, formatted as currency |
| `boolean` | Toggle Switch | `true` or `false` | Coerced to Boolean |
| `select` | Dropdown Select | Must match one of `options: [{ id, label }]` | Selected option ID string |
| `multiselect` | Multi-select Chips | Must match subset of `options` | Array of option IDs |
| `resource_ref`| Resource Picker Dropdown | Must belong to tenant's verified resources | Resource identifier string |

---

## 3. Schema Structure Definition

Each field in `configSchema` is indexed by its logical variable path (e.g. `business.name` or `cancellation_policy`):

```json
{
  "business.name": {
    "type": "string",
    "label": "Resort / Hotel Name",
    "description": "Your public business name displayed in welcome greetings.",
    "required": true,
    "default": "Konkan Beach Resort",
    "placeholder": "e.g. Palm Grove Sanctuary"
  },
  "business.phone": {
    "type": "phone",
    "label": "Reservation Phone Number",
    "description": "Contact number displayed for direct inquiries and front desk calls.",
    "required": true,
    "default": "919422359446"
  },
  "checkin_time": {
    "type": "time",
    "label": "Standard Check-in Time",
    "required": false,
    "default": "14:00"
  },
  "threshold": {
    "type": "number",
    "label": "Enterprise Budget Threshold (₹)",
    "required": false,
    "min": 1000,
    "max": 10000000,
    "default": 50000
  }
}
```

---

## 4. Resource Bindings Specification (`requiredBindings`)

Resource bindings define external tenant resources required for the workflow to operate. They are stored in `template_versions.required_bindings_json`:

```json
[
  {
    "key": "sender_line",
    "type": "WHATSAPP_LINE",
    "required": true,
    "label": "WhatsApp Sender Line",
    "description": "Verified Meta WhatsApp business number used to dispatch messages."
  },
  {
    "key": "property_id",
    "type": "PROPERTY",
    "required": true,
    "label": "Target Property / Resort Location",
    "description": "Property whose room inventory and rates are bound to this assistant."
  },
  {
    "key": "crm_pipeline",
    "type": "CRM_PIPELINE",
    "required": true,
    "label": "Destination CRM Sales Pipeline",
    "description": "Sales pipeline where incoming leads and deal stages will be created."
  }
]
```

### Supported Resource Types & Verification Queries:
1. `WHATSAPP_LINE`: Validates `SELECT * FROM waba_phone_numbers WHERE phone_number_id = ? AND tenant_id = ?`.
2. `PROPERTY`: Validates `SELECT * FROM properties WHERE id = ? AND (tenant_id = ? OR tenant_id = 1)`.
3. `CATALOG_CATEGORY`: Validates `SELECT * FROM catalog_categories WHERE id = ? AND tenant_id = ?`.
4. `CRM_PIPELINE`: Validates `SELECT * FROM crm_pipelines WHERE (id = ? OR slug = ?) AND (tenant_id = ? OR tenant_id = 1)`.

---

## 5. Reference Blueprint Schemas

### Reference Blueprint A: Hospitality Resort Booking (`hospitality.resort-booking`)
```json
{
  "configSchema": {
    "business.name": {
      "type": "string",
      "label": "Resort / Hotel Name",
      "required": true,
      "default": "Konkan Beach Resort"
    },
    "business.phone": {
      "type": "phone",
      "label": "Reservation Phone Number",
      "required": true,
      "default": "919422359446"
    },
    "greeting": {
      "type": "text",
      "label": "Welcome Greeting",
      "required": true,
      "default": "Welcome to our coastal sanctuary! How may we assist your stay today?"
    },
    "checkin_time": {
      "type": "time",
      "label": "Standard Check-in Time",
      "required": false,
      "default": "14:00"
    },
    "checkout_time": {
      "type": "time",
      "label": "Standard Check-out Time",
      "required": false,
      "default": "11:00"
    },
    "cancellation_policy": {
      "type": "text",
      "label": "Cancellation Policy Notice",
      "required": false,
      "default": "Free cancellation up to 48 hours prior to check-in."
    }
  },
  "requiredBindings": [
    { "key": "sender_line", "type": "WHATSAPP_LINE", "required": true, "label": "WhatsApp Sender Line" },
    { "key": "property_id", "type": "PROPERTY", "required": true, "label": "Target Property Location" }
  ]
}
```

### Reference Blueprint B: B2B Lead Qualification (`b2b.lead-qualification`)
```json
{
  "configSchema": {
    "business.name": {
      "type": "string",
      "label": "Company / Brand Name",
      "required": true,
      "default": "Survya Enterprise"
    },
    "business.sales_email": {
      "type": "email",
      "label": "Sales Notification Email",
      "required": true,
      "default": "sales@company.com"
    },
    "business.phone": {
      "type": "phone",
      "label": "Sales Support Phone",
      "required": true,
      "default": "919307382030"
    },
    "greeting": {
      "type": "text",
      "label": "Welcome & Value Proposition",
      "required": true,
      "default": "Hello! Welcome to our enterprise platform. Let us assess how we can help scale your business."
    },
    "qualification_threshold": {
      "type": "number",
      "label": "Enterprise Budget Threshold (₹)",
      "required": false,
      "default": 50000
    }
  },
  "requiredBindings": [
    { "key": "sender_line", "type": "WHATSAPP_LINE", "required": true, "label": "WhatsApp Business Sender Line" },
    { "key": "crm_pipeline", "type": "CRM_PIPELINE", "required": true, "label": "Destination CRM Sales Pipeline" }
  ]
}
```
