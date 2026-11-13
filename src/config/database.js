const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");
const config = require("./env");

// Ensure data directory exists inside whatsapp_bulk/
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const dbPath = path.join(config.DATA_DIR, "whatsapp_bulk.db");
const db = new DatabaseSync(dbPath);

// Enable busy_timeout first so concurrent workers wait up to 5000ms
try { db.exec("PRAGMA busy_timeout = 5000;"); } catch (e) {}
try { db.exec("PRAGMA journal_mode = WAL;"); } catch (e) {}
try { db.exec("PRAGMA synchronous = NORMAL;"); } catch (e) {}
try { db.exec("PRAGMA foreign_keys = ON;"); } catch (e) {}
try { db.exec("PRAGMA cache_size = -64000;"); } catch (e) {}
try { db.exec("PRAGMA temp_store = MEMORY;"); } catch (e) {}

// Initialize tables
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT,
      total_contacts INTEGER DEFAULT 0,
      valid_contacts INTEGER DEFAULT 0,
      invalid_contacts INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'DRAFT',
      message_type TEXT DEFAULT 'TEMPLATE',
      template_name TEXT,
      template_language TEXT DEFAULT 'en_US',
      message_body TEXT,
      mapping_config TEXT,
      delay_ms INTEGER DEFAULT 250,
      scheduled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      clean_phone TEXT NOT NULL,
      contact_name TEXT,
      raw_data TEXT,
      rendered_message TEXT,
      status TEXT DEFAULT 'PENDING',
      meta_message_id TEXT,
      error_message TEXT,
      sent_at DATETIME,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      meta_id TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      category TEXT DEFAULT 'MARKETING',
      status TEXT DEFAULT 'APPROVED',
      parameter_format TEXT DEFAULT 'POSITIONAL',
      body_text TEXT,
      variables TEXT,
      components TEXT,
      buttons TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_message_id TEXT UNIQUE,
      from_phone TEXT NOT NULL,
      customer_name TEXT,
      message_type TEXT DEFAULT 'text',
      message_body TEXT,
      raw_payload TEXT,
      context_message_id TEXT,
      campaign_id TEXT,
      is_read INTEGER DEFAULT 0,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reply_text TEXT,
      reply_sent_at DATETIME,
      reply_status TEXT,
      user_id TEXT,
      media_url TEXT,
      media_type TEXT,
      media_caption TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS automated_booking_dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT,
      guest_name TEXT,
      phone_number TEXT NOT NULL,
      clean_phone TEXT NOT NULL,
      property_name TEXT,
      checkin_date TEXT,
      checkout_date TEXT,
      trigger_type TEXT NOT NULL,
      template_name TEXT NOT NULL,
      meta_message_id TEXT,
      status TEXT DEFAULT 'SENT',
      error_message TEXT,
      dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED')),
      assigned_phone_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS waba_phone_numbers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      phone_number_id TEXT UNIQUE NOT NULL,
      waba_id TEXT,
      quality_rating TEXT DEFAULT 'GREEN',
      status TEXT DEFAULT 'VERIFIED',
      is_default INTEGER DEFAULT 0,
      registered_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automated_booking_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT,
      guest_name TEXT,
      phone_number TEXT,
      clean_phone TEXT NOT NULL,
      property_name TEXT,
      checkin_date TEXT,
      checkout_date TEXT,
      raw_data TEXT,
      source TEXT DEFAULT 'UPLOAD',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_suppressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clean_phone TEXT UNIQUE NOT NULL,
      reason TEXT DEFAULT 'USER_OPT_OUT',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incoming_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE,
      event_type TEXT,
      status TEXT DEFAULT 'PROCESSED',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whatsapp_flows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      meta_flow_id TEXT UNIQUE,
      status TEXT DEFAULT 'DRAFT',
      categories TEXT DEFAULT '["OTHER"]',
      flow_json TEXT NOT NULL,
      json_version TEXT DEFAULT '3.1',
      data_api_version TEXT DEFAULT '3.0',
      endpoint_uri TEXT,
      preview_url TEXT,
      validation_errors TEXT DEFAULT '[]',
      sync_status TEXT DEFAULT 'LOCAL',
      last_sync_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flow_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      flow_id TEXT NOT NULL,
      meta_flow_id TEXT,
      recipient_phone TEXT NOT NULL,
      clean_phone TEXT,
      meta_message_id TEXT,
      context_message_id TEXT,
      campaign_id TEXT,
      user_id TEXT DEFAULT 'system',
      status TEXT DEFAULT 'ACTIVE',
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flow_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id TEXT NOT NULL,
      flow_token TEXT,
      wa_message_id TEXT UNIQUE,
      from_phone TEXT,
      sender_phone TEXT,
      clean_phone TEXT,
      customer_name TEXT,
      response_json TEXT,
      response_data TEXT,
      parsed_data TEXT,
      user_id TEXT,
      campaign_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    /* PRD Phase 1: Tenants & Properties */
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      timezone TEXT DEFAULT 'Asia/Kolkata',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      city TEXT,
      timezone TEXT DEFAULT 'Asia/Kolkata',
      inventory_mode TEXT DEFAULT 'MANUAL',
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    /* PRD Phase 1: Contacts & Consent History */
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      phone_e164 TEXT NOT NULL,
      name TEXT,
      email TEXT,
      source TEXT DEFAULT 'WHATSAPP',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, phone_e164)
    );

    CREATE TABLE IF NOT EXISTS contact_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      contact_id INTEGER NOT NULL,
      purpose TEXT DEFAULT 'BOOKING',
      status TEXT DEFAULT 'GRANTED',
      source TEXT DEFAULT 'WHATSAPP_INBOUND',
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    /* PRD Phase 1: Room Types & Daily Manual Inventory */
    CREATE TABLE IF NOT EXISTS room_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      property_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      max_adults INTEGER DEFAULT 2,
      max_children INTEGER DEFAULT 2,
      base_rate REAL DEFAULT 3500.00,
      description TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (property_id) REFERENCES properties(id)
    );

    CREATE TABLE IF NOT EXISTS room_inventory_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      room_type_id INTEGER NOT NULL,
      inventory_date TEXT NOT NULL,
      available_qty INTEGER DEFAULT 5,
      base_rate REAL DEFAULT 3500.00,
      is_closed INTEGER DEFAULT 0,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_type_id, inventory_date),
      FOREIGN KEY (room_type_id) REFERENCES room_types(id)
    );

    /* PRD Phase 1: Booking Enquiries Pipeline */
    CREATE TABLE IF NOT EXISTS booking_enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      property_id INTEGER NOT NULL DEFAULT 1,
      contact_id INTEGER NOT NULL,
      conversation_id INTEGER,
      flow_session_id TEXT UNIQUE,
      guest_name TEXT,
      phone_e164 TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      adults INTEGER DEFAULT 2,
      children INTEGER DEFAULT 0,
      rooms_requested INTEGER DEFAULT 1,
      room_type_id INTEGER,
      room_preference TEXT,
      preferences_json TEXT,
      status TEXT DEFAULT 'NEW',
      assigned_to TEXT,
      follow_up_at DATETIME,
      notes TEXT,
      lost_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (room_type_id) REFERENCES room_types(id)
    );

    /* PRD Phase 1: Quotations & Itemized Lines */
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      enquiry_id INTEGER NOT NULL,
      quote_number TEXT NOT NULL,
      currency TEXT DEFAULT 'INR',
      subtotal REAL NOT NULL DEFAULT 0.00,
      tax_total REAL NOT NULL DEFAULT 0.00,
      total REAL NOT NULL DEFAULT 0.00,
      valid_until TEXT NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      created_by TEXT NOT NULL,
      notes TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (enquiry_id) REFERENCES booking_enquiries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      quote_id INTEGER NOT NULL,
      room_type_id INTEGER,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      nights INTEGER NOT NULL DEFAULT 1,
      unit_rate REAL NOT NULL DEFAULT 0.00,
      amount REAL NOT NULL DEFAULT 0.00,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON campaign_recipients(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_recipients_status ON campaign_recipients(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
    CREATE INDEX IF NOT EXISTS idx_templates_meta_id ON templates(meta_id);
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    CREATE INDEX IF NOT EXISTS idx_replies_phone ON customer_replies(from_phone);
    CREATE INDEX IF NOT EXISTS idx_replies_campaign ON customer_replies(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_replies_received ON customer_replies(received_at);
    CREATE INDEX IF NOT EXISTS idx_replies_is_read ON customer_replies(is_read);
    CREATE INDEX IF NOT EXISTS idx_auto_booking_phone_trigger ON automated_booking_dispatches(clean_phone, trigger_type, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_auto_booking_dispatched ON automated_booking_dispatches(dispatched_at);
    CREATE INDEX IF NOT EXISTS idx_auto_contacts_phone ON automated_booking_contacts(clean_phone);
    CREATE INDEX IF NOT EXISTS idx_auto_contacts_checkin ON automated_booking_contacts(checkin_date);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_waba_phone_id ON waba_phone_numbers(phone_number_id);
    CREATE INDEX IF NOT EXISTS idx_suppressions_phone ON contact_suppressions(clean_phone);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token_hash, used, expires_at);
    CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);
    CREATE INDEX IF NOT EXISTS idx_flows_user ON whatsapp_flows(user_id);
    CREATE INDEX IF NOT EXISTS idx_flows_meta_id ON whatsapp_flows(meta_flow_id);
    CREATE INDEX IF NOT EXISTS idx_flows_status ON whatsapp_flows(status);
    CREATE INDEX IF NOT EXISTS idx_flow_tokens_token ON flow_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_flow_tokens_phone ON flow_tokens(clean_phone);
    CREATE INDEX IF NOT EXISTS idx_flow_tokens_flow ON flow_tokens(flow_id);
    CREATE INDEX IF NOT EXISTS idx_flow_responses_flow ON flow_responses(flow_id);
    CREATE INDEX IF NOT EXISTS idx_flow_responses_phone ON flow_responses(clean_phone);
    CREATE INDEX IF NOT EXISTS idx_flow_responses_wa_msg ON flow_responses(wa_message_id);
    CREATE INDEX IF NOT EXISTS idx_flow_responses_user ON flow_responses(user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON contacts(tenant_id, phone_e164);
    CREATE INDEX IF NOT EXISTS idx_room_types_tenant_prop ON room_types(tenant_id, property_id);
    CREATE INDEX IF NOT EXISTS idx_room_inventory_daily ON room_inventory_daily(room_type_id, inventory_date);
    CREATE INDEX IF NOT EXISTS idx_enquiries_tenant_status ON booking_enquiries(tenant_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_enquiries_assigned_follow ON booking_enquiries(tenant_id, assigned_to, follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_quotes_enquiry ON quotes(enquiry_id);
    CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
  `);

  // Migrate existing databases: add scheduled_at, unknown_count, estimated_cost to campaigns
  try {
    const tableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const colNames = tableInfo.map(col => col.name);
    if (!colNames.includes("scheduled_at")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME;");
    }
    if (!colNames.includes("unknown_count")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN unknown_count INTEGER DEFAULT 0;");
    }
    if (!colNames.includes("estimated_cost")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN estimated_cost REAL DEFAULT 0;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled ON campaigns(status, scheduled_at);");
  } catch (migErr) {
    console.warn("[DB Migration] campaigns columns check:", migErr.message);
  }

  // Migrate customer_replies: add reply tracking columns if not present
  try {
    const replyTableInfo = db.prepare("PRAGMA table_info(customer_replies)").all();
    const cols = replyTableInfo.map(c => c.name);
    if (!cols.includes("reply_text")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN reply_text TEXT;");
    }
    if (!cols.includes("reply_sent_at")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN reply_sent_at DATETIME;");
    }
    if (!cols.includes("reply_status")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN reply_status TEXT;");
    }
    if (!cols.includes("user_id")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN user_id TEXT;");
    }
    if (!cols.includes("media_url")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN media_url TEXT;");
    }
    if (!cols.includes("media_type")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN media_type TEXT;");
    }
    if (!cols.includes("media_caption")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN media_caption TEXT;");
    }
    if (!cols.includes("flow_id")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN flow_id TEXT;");
    }
    if (!cols.includes("flow_response_id")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN flow_response_id INTEGER;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_replies_user ON customer_replies(user_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_replies_flow ON customer_replies(flow_id);");
  } catch (migErr2) {
    console.warn("[DB Migration] customer_replies columns check:", migErr2.message);
  }

  // Migrate flow_tokens and flow_responses columns & constraints
  try {
    const ftInfo = db.prepare("PRAGMA table_info(flow_tokens)").all();
    const cleanPhoneCol = ftInfo.find(c => c.name === "clean_phone");
    if (cleanPhoneCol && cleanPhoneCol.notnull === 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS flow_tokens_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          flow_id TEXT NOT NULL,
          meta_flow_id TEXT,
          recipient_phone TEXT NOT NULL,
          clean_phone TEXT,
          meta_message_id TEXT,
          context_message_id TEXT,
          campaign_id TEXT,
          user_id TEXT DEFAULT 'system',
          status TEXT DEFAULT 'ACTIVE',
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO flow_tokens_v2 (id, token, flow_id, meta_flow_id, recipient_phone, clean_phone, meta_message_id, campaign_id, user_id, status, expires_at, created_at)
          SELECT id, token, flow_id, meta_flow_id, recipient_phone, clean_phone, meta_message_id, campaign_id, user_id, status, expires_at, created_at FROM flow_tokens;
        DROP TABLE flow_tokens;
        ALTER TABLE flow_tokens_v2 RENAME TO flow_tokens;
        CREATE INDEX IF NOT EXISTS idx_flow_tokens_token ON flow_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_flow_tokens_phone ON flow_tokens(clean_phone);
        CREATE INDEX IF NOT EXISTS idx_flow_tokens_flow ON flow_tokens(flow_id);
      `);
    } else {
      const ftCols = ftInfo.map(c => c.name);
      if (!ftCols.includes("context_message_id")) {
        db.exec("ALTER TABLE flow_tokens ADD COLUMN context_message_id TEXT;");
      }
    }

    const frInfo = db.prepare("PRAGMA table_info(flow_responses)").all();
    const frCols = frInfo.map(c => c.name);
    if (!frCols.includes("sender_phone")) {
      db.exec("ALTER TABLE flow_responses ADD COLUMN sender_phone TEXT;");
    }
    if (!frCols.includes("response_data")) {
      db.exec("ALTER TABLE flow_responses ADD COLUMN response_data TEXT;");
    }
  } catch (flowMigErr) {
    console.warn("[DB Migration] flow tables migration notice:", flowMigErr.message);
  }

  // Migrate campaigns: add user_id and phone_number_id columns if not present
  try {
    const tableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const cols = tableInfo.map(c => c.name);
    if (!cols.includes("user_id")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN user_id TEXT;");
    }
    if (!cols.includes("phone_number_id")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN phone_number_id TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);");
  } catch (migErr3) {
    console.warn("[DB Migration] campaigns user columns check:", migErr3.message);
  }

  // Migrate campaign_recipients: add delivery tracking timestamps and error_code if not present
  try {
    const recipTableInfo = db.prepare("PRAGMA table_info(campaign_recipients)").all();
    const recipCols = recipTableInfo.map(c => c.name);
    if (!recipCols.includes("delivered_at")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN delivered_at DATETIME;");
    }
    if (!recipCols.includes("read_at")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN read_at DATETIME;");
    }
    if (!recipCols.includes("failed_at")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN failed_at DATETIME;");
    }
    if (!recipCols.includes("error_code")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN error_code TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipients_meta_msg_id ON campaign_recipients(meta_message_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipients_pending_batch ON campaign_recipients(campaign_id, status, id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipients_clean_phone ON campaign_recipients(clean_phone);");
  } catch (migErrRecip) {
    console.warn("[DB Migration] campaign_recipients delivery columns check:", migErrRecip.message);
  }

  // Migrate campaigns: add delivered_count and read_count columns if not present
  try {
    const campTableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const campCols = campTableInfo.map(c => c.name);
    if (!campCols.includes("delivered_count")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN delivered_count INTEGER DEFAULT 0;");
    }
    if (!campCols.includes("read_count")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN read_count INTEGER DEFAULT 0;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_replies_context_msg ON customer_replies(context_message_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_replies_camp_from ON customer_replies(campaign_id, from_phone);");
  } catch (migErrCampCols) {
    console.warn("[DB Migration] campaigns delivered/read columns check:", migErrCampCols.message);
  }

  // Migrate automated_booking_dispatches: add user_id column if not present
  try {
    const tableInfo = db.prepare("PRAGMA table_info(automated_booking_dispatches)").all();
    const cols = tableInfo.map(c => c.name);
    if (!cols.includes("user_id")) {
      db.exec("ALTER TABLE automated_booking_dispatches ADD COLUMN user_id TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_auto_booking_user ON automated_booking_dispatches(user_id);");
  } catch (migErr4) {
    console.warn("[DB Migration] automated_booking_dispatches user column check:", migErr4.message);
  }

  // Seed default templates if empty
  try {
    const templateCount = db.prepare("SELECT COUNT(*) as count FROM templates").get().count;
    if (templateCount === 0) {
      const insertTpl = db.prepare(`
        INSERT INTO templates (
          id, name, meta_id, language, category, status, parameter_format,
          body_text, variables, components, buttons
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 1. kt_invitation_ (1059862786867912)
      insertTpl.run(
        "1059862786867912",
        "kt_invitation_",
        "1059862786867912",
        "en",
        "MARKETING",
        "APPROVED",
        "POSITIONAL",
        "Hi *{{1}}*,\n\nKonkanTrip is inviting *{{2}}* to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: {{3}}\n\nRegards,\nKonkanTrip Partner Team",
        JSON.stringify([
          { key: "1", label: "{{1}}", example: "Shivam khomane" },
          { key: "2", label: "{{2}}", example: "Konkan Trip Beach Resort" },
          { key: "3", label: "{{3}}", example: "https://konkantrip.com/partner" }
        ]),
        JSON.stringify([]),
        JSON.stringify([])
      );

      // 2. kt_restaurant_invitation (1757343188867100)
      insertTpl.run(
        "1757343188867100",
        "kt_restaurant_invitation",
        "1757343188867100",
        "en",
        "MARKETING",
        "APPROVED",
        "NAMED",
        "Hi *{{name}}*,\n\nKonkanTrip is inviting *{{restaurant}}* to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: {{link}}\n\nRegards,\nKonkanTrip Partner Team",
        JSON.stringify([
          { key: "name", label: "{{name}}", example: "Shivam khomane" },
          { key: "restaurant", label: "{{restaurant}}", example: "Konkan Trip Beach Resort" },
          { key: "link", label: "{{link}}", example: "https://konkantrip.com/partner" }
        ]),
        JSON.stringify([]),
        JSON.stringify([
          { type: "URL", text: "Register Now", url: "https://konkantrip.com/" }
        ])
      );

      // 3. konkantrip_auth (OTP)
      insertTpl.run(
        "konkantrip_auth",
        "konkantrip_auth",
        "konkantrip_auth",
        "en_US",
        "AUTHENTICATION",
        "APPROVED",
        "POSITIONAL",
        "Your KonkanTrip verification code is *{{1}}*. Do not share this code with anyone.",
        JSON.stringify([
          { key: "1", label: "{{1}}", example: "492018" }
        ]),
        JSON.stringify([]),
        JSON.stringify([
          { type: "OTP", text: "Copy Code" }
        ])
      );
    }
  } catch (tplSeedErr) {
    console.warn("[DB Seed] templates seed check:", tplSeedErr.message);
  }

  // Admin User Bootstrap Notice
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
    if (userCount === 0) {
      console.log("[Security] Platform initialized with 0 users. First user to register will be designated Master Administrator.");
    }
  } catch (userSeedErr) {
    console.warn("[DB Init] user check:", userSeedErr.message);
  }

  // Seed default settings if not exists
  const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
  const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");

  if (!getSetting.get("WHATSAPP_API_TOKEN")) {
    setSetting.run("WHATSAPP_API_TOKEN", config.WHATSAPP_API_TOKEN);
  }
  if (!getSetting.get("WHATSAPP_PHONE_NUMBER_ID")) {
    setSetting.run("WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID);
  }
  if (!getSetting.get("DEFAULT_COUNTRY_CODE")) {
    setSetting.run("DEFAULT_COUNTRY_CODE", config.DEFAULT_COUNTRY_CODE);
  }
  if (!getSetting.get("BROADCAST_DELAY_MS")) {
    setSetting.run("BROADCAST_DELAY_MS", String(config.BROADCAST_DELAY_MS));
  }
  if (!getSetting.get("WHATSAPP_TEMPLATE_ID")) {
    setSetting.run("WHATSAPP_TEMPLATE_ID", config.WHATSAPP_TEMPLATE_ID || "");
  }
  if (!getSetting.get("DEFAULT_TEMPLATE_NAME")) {
    setSetting.run("DEFAULT_TEMPLATE_NAME", config.DEFAULT_TEMPLATE_NAME || "kt_restaurant_invitation");
  }

  // Auto-heal legacy unassigned records to primary Master Admin
  try {
    const primaryAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
    if (primaryAdmin && primaryAdmin.id) {
      const adminId = primaryAdmin.id;
      db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE automated_booking_contacts SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
    }
  } catch (migErr) {
    console.warn("[DB Migration] Legacy ownership migration check:", migErr.message);
  }
  if (!getSetting.get("DEFAULT_TEMPLATE_LANG")) {
    setSetting.run("DEFAULT_TEMPLATE_LANG", config.DEFAULT_TEMPLATE_LANG || "en");
  }
  if (!getSetting.get("WEBHOOK_VERIFY_TOKEN")) {
    setSetting.run("WEBHOOK_VERIFY_TOKEN", config.WEBHOOK_VERIFY_TOKEN || "wb_verify_konkantrip_7f3a9e2c4b810d56");
  }
  if (!getSetting.get("AUTO_REPLY_ENABLED")) {
    setSetting.run("AUTO_REPLY_ENABLED", "true");
  }
  if (!getSetting.get("AUTO_REPLY_MODE")) {
    setSetting.run("AUTO_REPLY_MODE", "ONCE_PER_CONTACT");
  }
  if (!getSetting.get("AUTO_REPLY_MESSAGE")) {
    setSetting.run(
      "AUTO_REPLY_MESSAGE",
      "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."
    );
  }
  if (!getSetting.get("BOOKING_AUTOMATION_ENABLED")) {
    setSetting.run("BOOKING_AUTOMATION_ENABLED", "true");
  }
  if (!getSetting.get("PRE_CHECKIN_OFFSET_DAYS")) {
    setSetting.run("PRE_CHECKIN_OFFSET_DAYS", "1");
  }
  if (!getSetting.get("PRE_CHECKIN_TEMPLATE")) {
    setSetting.run("PRE_CHECKIN_TEMPLATE", "kt_best_route_to_property");
  }
  if (!getSetting.get("CHECKOUT_TEMPLATE")) {
    setSetting.run("CHECKOUT_TEMPLATE", "kt_checkout_belongings_reminder");
  }
  if (!getSetting.get("WHATSAPP_FLOWS_ENABLED")) {
    setSetting.run("WHATSAPP_FLOWS_ENABLED", config.WHATSAPP_FLOWS_ENABLED ? "true" : "false");
  }

  // Seed starter templates into whatsapp_flows as local DRAFTs if table is empty
  try {
    const flowCount = db.prepare("SELECT COUNT(*) as count FROM whatsapp_flows").get()?.count || 0;
    if (flowCount === 0) {
      const primaryAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
      const adminId = primaryAdmin?.id || "system";
      const { STARTER_TEMPLATES } = require("../services/flowStarterTemplates");
      const insertFlow = db.prepare(`
        INSERT INTO whatsapp_flows (
          id, user_id, name, description, meta_flow_id, status, categories,
          flow_json, json_version, data_api_version, endpoint_uri, preview_url,
          validation_errors, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 'DRAFT', ?, ?, ?, ?, NULL, NULL, '[]', 'LOCAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      for (const tpl of STARTER_TEMPLATES) {
        const flowId = crypto.randomUUID();
        insertFlow.run(
          flowId,
          adminId,
          tpl.name,
          tpl.description,
          JSON.stringify(tpl.categories),
          JSON.stringify(tpl.flow_json),
          tpl.json_version,
          tpl.data_api_version
        );
      }
    }
  } catch (flowSeedErr) {
    console.warn("[DB Seed] whatsapp_flows starter seed notice:", flowSeedErr.message);
  }

  // SARVYA Connect PRD: extend templates table + add whatsapp_messages & whatsapp_usage_ledger
  try {
    const tplTableInfo = db.prepare("PRAGMA table_info(templates)").all();
    const tplCols = tplTableInfo.map(c => c.name);
    if (!tplCols.includes("header_type")) db.exec("ALTER TABLE templates ADD COLUMN header_type TEXT DEFAULT 'NONE';");
    if (!tplCols.includes("header_text")) db.exec("ALTER TABLE templates ADD COLUMN header_text TEXT;");
    if (!tplCols.includes("header_media_url")) db.exec("ALTER TABLE templates ADD COLUMN header_media_url TEXT;");
    if (!tplCols.includes("footer_text")) db.exec("ALTER TABLE templates ADD COLUMN footer_text TEXT;");
    if (!tplCols.includes("rejection_reason")) db.exec("ALTER TABLE templates ADD COLUMN rejection_reason TEXT;");
    if (!tplCols.includes("version")) db.exec("ALTER TABLE templates ADD COLUMN version INTEGER DEFAULT 1;");
    if (!tplCols.includes("submitted_at")) db.exec("ALTER TABLE templates ADD COLUMN submitted_at DATETIME;");
    if (!tplCols.includes("approved_at")) db.exec("ALTER TABLE templates ADD COLUMN approved_at DATETIME;");
    if (!tplCols.includes("user_id")) db.exec("ALTER TABLE templates ADD COLUMN user_id TEXT;");
    if (!tplCols.includes("tenant_id")) db.exec("ALTER TABLE templates ADD COLUMN tenant_id INTEGER DEFAULT 1;");

    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id TEXT PRIMARY KEY,
        tenant_id INTEGER DEFAULT 1,
        user_id TEXT,
        phone_number_id TEXT,
        campaign_id TEXT,
        recipient_phone TEXT NOT NULL,
        direction TEXT DEFAULT 'OUTBOUND',
        message_type TEXT NOT NULL,
        template_id TEXT,
        template_name TEXT,
        template_category TEXT,
        message_body TEXT,
        components_json TEXT,
        status TEXT DEFAULT 'SENT',
        meta_message_id TEXT,
        error_code TEXT,
        error_message TEXT,
        estimated_cost REAL DEFAULT 0,
        currency TEXT DEFAULT 'INR',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME,
        read_at DATETIME,
        failed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS whatsapp_usage_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        user_id TEXT,
        phone_number_id TEXT,
        campaign_id TEXT,
        message_id TEXT,
        meta_message_id TEXT,
        recipient_phone TEXT,
        category TEXT DEFAULT 'MARKETING',
        unit_cost REAL DEFAULT 0,
        currency TEXT DEFAULT 'INR',
        billing_status TEXT DEFAULT 'ESTIMATED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_wa_messages_meta_id ON whatsapp_messages(meta_message_id);
      CREATE INDEX IF NOT EXISTS idx_wa_messages_recipient ON whatsapp_messages(recipient_phone, created_at);
      CREATE INDEX IF NOT EXISTS idx_wa_messages_campaign ON whatsapp_messages(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_wa_usage_campaign ON whatsapp_usage_ledger(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_wa_usage_category ON whatsapp_usage_ledger(category, created_at);
    `);
  } catch (connectMigErr) {
    console.warn("[DB Migration] SARVYA Connect tables/columns notice:", connectMigErr.message);
  }

  // Migrate users and tables: add tenant_id column if not present
  try {
    const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
    const userCols = userTableInfo.map(c => c.name);
    if (!userCols.includes("tenant_id")) {
      db.exec("ALTER TABLE users ADD COLUMN tenant_id INTEGER DEFAULT 1;");
    }

    const auditTableInfo = db.prepare("PRAGMA table_info(audit_logs)").all();
    const auditCols = auditTableInfo.map(c => c.name);
    if (!auditCols.includes("tenant_id")) {
      db.exec("ALTER TABLE audit_logs ADD COLUMN tenant_id INTEGER DEFAULT 1;");
    }
  } catch (migErrTenant) {
    console.warn("[DB Migration] users/audit_logs tenant_id column check:", migErrTenant.message);
  }

  // Seed default tenant & property (PRD Section 7)
  try {
    const tenantCount = db.prepare("SELECT COUNT(*) as count FROM tenants").get()?.count || 0;
    if (tenantCount === 0) {
      db.prepare(`
        INSERT INTO tenants (id, name, slug, status, timezone, created_at)
        VALUES (1, 'KonkanTrip Beach Resort', 'konkantrip', 'ACTIVE', 'Asia/Kolkata', CURRENT_TIMESTAMP)
      `).run();
    }

    const propCount = db.prepare("SELECT COUNT(*) as count FROM properties").get()?.count || 0;
    if (propCount === 0) {
      db.prepare(`
        INSERT INTO properties (id, tenant_id, name, city, timezone, inventory_mode, status, created_at)
        VALUES (1, 1, 'KonkanTrip Beach Resort & Spa', 'Alibaug, Maharashtra', 'Asia/Kolkata', 'MANUAL', 'ACTIVE', CURRENT_TIMESTAMP)
      `).run();
    }

    // Seed room types if empty
    const roomCount = db.prepare("SELECT COUNT(*) as count FROM room_types").get()?.count || 0;
    if (roomCount === 0) {
      const insertRoom = db.prepare(`
        INSERT INTO room_types (id, tenant_id, property_id, name, max_adults, max_children, base_rate, description, active)
        VALUES (?, 1, 1, ?, ?, ?, ?, ?, 1)
      `);
      insertRoom.run(1, "Deluxe Sea View Room", 2, 1, 4500.00, "King-sized bed with ocean view private balcony & breakfast");
      insertRoom.run(2, "Luxury Coconut Cottage", 3, 2, 6500.00, "Spacious detached garden cottage with patio and open-air rain shower");
      insertRoom.run(3, "Family Ocean Suite", 4, 2, 8500.00, "Two-bedroom inter-connected suite with panoramic sea terrace");

      // Seed 30 days of manual room inventory
      const insertInv = db.prepare(`
        INSERT OR IGNORE INTO room_inventory_daily (tenant_id, room_type_id, inventory_date, available_qty, base_rate, is_closed)
        VALUES (1, ?, ?, ?, ?, 0)
      `);
      const now = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        insertInv.run(1, dateStr, 6, 4500.00);
        insertInv.run(2, dateStr, 4, 6500.00);
        insertInv.run(3, dateStr, 3, 8500.00);
      }
    }
  } catch (resortSeedErr) {
    console.warn("[DB Seed] Resort PRD baseline seed notice:", resortSeedErr.message);
  }
}

initializeDatabase();

module.exports = {
  db,
  getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  },
  setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(key, String(value));
  },
  getAllSettings() {
    const rows = db.prepare("SELECT key, value FROM settings").all();
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }
};
