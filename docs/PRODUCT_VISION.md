# SARVYA — Product Vision & Positioning

**Product:** Survya (SARVYA)  
**Category:** Multi-Tenant Conversational Business Automation & Customer Lifecycle Platform  
**Primary Channel:** WhatsApp Business Cloud API (`v21.0`) + Built-in Web Chat / In-App Studio  
**Future Channels (Architectural Adapter Targets):** Instagram Messaging, Facebook Messenger, Website Widget

---

## 1. Mission Statement

Transform Survya from a WhatsApp broadcast/hospitality prototype into a **mature, secure, multi-tenant, configuration-driven business automation platform** that empowers businesses across industries (Hospitality, Retail/D2C, Clinics & Healthcare, Restaurants, Salons & Wellness, Real Estate, Education, B2B Sales/Services) to automate and manage the complete customer lifecycle from initial acquisition to repeat business.

---

## 2. Full Customer Lifecycle Scope

```
Customer Acquisition (Ads / QR / Chat Links / Campaigns / Webhooks)
  → Conversation Initiation (WhatsApp / Web Chat Channel Adapter)
  → Requirement Collection (Deterministic Intake & Schema-Driven Nodes)
  → Lead Qualification & CRM Sync
  → Product / Service Discovery (Universal Catalog & Search)
  → Recommendation & Grounded AI Assistance (Confidence + Policy Guardrails)
  → Quotation & Real-Time Availability Check (Authoritative Inventory)
  → Customer Selection & Reservation Hold
  → Confirmation & Payment (Signed Webhook / Server-Verified Payment)
  → Transaction Completion & GST Receipt / Voucher
  → Human Agent Handover & Shared Inbox Support
  → Post-Service Follow-up, Retention & Repeat Business Campaigns
```

---

## 3. Core Product Principles

1. **Industry-Agnostic Core, Vertical Depth via Configuration:** Core runtime, CRM pipelines, catalog, availability holds, pricing rules, and workflow engine operate generically through data schemas and templates without hardcoded vertical branching. Hospitality remains a first-class supported vertical using the shared primitives.
2. **One Master Design, Many Isolated Workspaces:** Platform administrators publish immutable versioned workflow templates; client tenants import and configure brand identity, rates, hours, policies, and WhatsApp lines without touching code or leaking data across tenants.
3. **Zero Trust Tenant Boundary:** Every query, route, background job, webhook, media download, and AI retrieval derives tenant scope server-side from verified authentication or verified receiving channel account ownership.
4. **Deterministic Financial & Availability Guarantees:** Inventory deductions, double-booking prevention, price calculations, and payment state transitions rely strictly on server-side transactional database logic and cryptographically verified payment events — never client input or LLM hallucinations.
5. **Policy-Safe & Simulation-Safe by Default:** Outbound messaging strictly respects WhatsApp 24-hour customer service windows, approved templates, marketing cooldowns (131049), and opt-out suppressions. All test runs and previews run in strict `isSimulation: true` mode with zero live WhatsApp dispatch.
