const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const config = require("./env");
const { createMysqlDatabase } = require("./mysqlAdapter");

let db;

if (config.DB_CLIENT === "mysql") {
  db = createMysqlDatabase({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME
  });
} else {
  const { DatabaseSync } = require("node:sqlite");
  // Ensure data directory exists inside whatsapp_bulk/
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }

  const dbPath = path.join(config.DATA_DIR, "whatsapp_bulk.db");
  db = new DatabaseSync(dbPath);

  // Enable busy_timeout first so concurrent workers wait up to 5000ms
  try { db.exec("PRAGMA busy_timeout = 5000;"); } catch (e) { }
  try { db.exec("PRAGMA journal_mode = WAL;"); } catch (e) { }
  try { db.exec("PRAGMA synchronous = NORMAL;"); } catch (e) { }
  try { db.exec("PRAGMA foreign_keys = ON;"); } catch (e) { }
  try { db.exec("PRAGMA cache_size = -64000;"); } catch (e) { }
  try { db.exec("PRAGMA temp_store = MEMORY;"); } catch (e) { }
}

function initializeMysqlDatabase() {
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
    if (userCount === 0) {
      console.log("[Security] Platform initialized with 0 users. First user to register will be designated Master Administrator.");
    }

    const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
    const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");

    const defaults = [
      ["WHATSAPP_API_TOKEN", config.WHATSAPP_API_TOKEN],
      ["WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID],
      ["DEFAULT_COUNTRY_CODE", config.DEFAULT_COUNTRY_CODE],
      ["BROADCAST_DELAY_MS", String(config.BROADCAST_DELAY_MS)],
      ["WHATSAPP_TEMPLATE_ID", config.WHATSAPP_TEMPLATE_ID || ""],
      ["DEFAULT_TEMPLATE_NAME", config.DEFAULT_TEMPLATE_NAME || "kt_restaurant_invitation"],
      ["DEFAULT_TEMPLATE_LANG", config.DEFAULT_TEMPLATE_LANG || "en"],
      ["WEBHOOK_VERIFY_TOKEN", config.WEBHOOK_VERIFY_TOKEN || "wb_verify_konkantrip_7f3a9e2c4b810d56"],
      ["AUTO_REPLY_ENABLED", "true"],
      ["AUTO_REPLY_MODE", "ONCE_PER_CONTACT"],
      ["AUTO_REPLY_MESSAGE", "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."],
      ["BOOKING_AUTOMATION_ENABLED", "true"],
      ["PRE_CHECKIN_OFFSET_DAYS", "1"],
      ["PRE_CHECKIN_TEMPLATE", "kt_best_route_to_property"],
      ["CHECKOUT_TEMPLATE", "kt_checkout_belongings_reminder"],
      ["WHATSAPP_FLOWS_ENABLED", config.WHATSAPP_FLOWS_ENABLED ? "true" : "false"]
    ];

    for (const [k, v] of defaults) {
      if (!getSetting.get(k)) {
        setSetting.run(k, v);
      }
    }

    const primaryAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
    if (primaryAdmin && primaryAdmin.id) {
      const adminId = primaryAdmin.id;
      db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE automated_booking_contacts SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
    }
    // Ensure waba_phone_numbers has access_token, token_type, last_verified_at columns
    try {
      const cols = db.prepare("DESCRIBE waba_phone_numbers").all().map(c => c.Field);
      if (!cols.includes("access_token")) {
        db.exec("ALTER TABLE waba_phone_numbers ADD COLUMN access_token LONGTEXT NULL");
      }
      if (!cols.includes("token_type")) {
        db.exec("ALTER TABLE waba_phone_numbers ADD COLUMN token_type VARCHAR(50) DEFAULT 'PERMANENT'");
      }
      if (!cols.includes("last_verified_at")) {
        db.exec("ALTER TABLE waba_phone_numbers ADD COLUMN last_verified_at DATETIME NULL");
      }
      // Populate missing line token from WHATSAPP_API_TOKEN setting if available
      const globalToken = getSetting.get("WHATSAPP_API_TOKEN")?.value || config.WHATSAPP_API_TOKEN;
      if (globalToken && !globalToken.startsWith("EAAX_") && !globalToken.includes("placeholder")) {
        db.prepare("UPDATE waba_phone_numbers SET access_token = ?, token_type = 'PERMANENT', last_verified_at = CURRENT_TIMESTAMP WHERE (access_token IS NULL OR access_token = '') AND is_default = 1").run(globalToken);
      }
    } catch (migColErr) {
      // Table may not exist yet during fresh install
    }

    console.log(`[Database] Connected to MySQL (${config.DB_NAME} on ${config.DB_HOST}:${config.DB_PORT}) successfully.`);
  } catch (err) {
    console.error("[Database] MySQL initialization notice:", err.message);
  }
}

// Initialize tables
function initializeDatabase() {
  if (config.DB_CLIENT === "mysql") {
    initializeMysqlDatabase();
    return;
  }
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
      access_token TEXT,
      token_type TEXT DEFAULT 'PERMANENT',
      last_verified_at DATETIME,
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

  // Migrate waba_phone_numbers: add access_token, token_type, last_verified_at if not present
  try {
    const phoneCols = db.prepare("PRAGMA table_info(waba_phone_numbers)").all().map(c => c.name);
    if (!phoneCols.includes("access_token")) {
      db.exec("ALTER TABLE waba_phone_numbers ADD COLUMN access_token TEXT;");
    }
    if (!phoneCols.includes("token_type")) {
      db.exec("ALTER TABLE waba_phone_numbers ADD COLUMN token_type TEXT DEFAULT 'PERMANENT';");
    }
    if (!phoneCols.includes("last_verified_at")) {
      db.exec("ALTER TABLE waba_phone_numbers ADD COLUMN last_verified_at DATETIME;");
    }
  } catch (phoneMigErr) {
    console.warn("[DB Migration] waba_phone_numbers columns check:", phoneMigErr.message);
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
    if (!cols.includes("link_id")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN link_id TEXT;");
    }
    if (!cols.includes("source")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN source TEXT DEFAULT 'WHATSAPP';");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_replies_user ON customer_replies(user_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_replies_flow ON customer_replies(flow_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_replies_link ON customer_replies(link_id);");
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

      CREATE TABLE IF NOT EXISTS chat_links (
        id TEXT PRIMARY KEY,
        tenant_id INTEGER DEFAULT 1,
        user_id TEXT,
        phone_number_id TEXT,
        phone_number TEXT NOT NULL,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        default_message TEXT NOT NULL,
        welcome_title TEXT,
        welcome_description TEXT,
        auto_reply_enabled INTEGER DEFAULT 1,
        auto_reply_message TEXT,
        flow_id TEXT,
        category TEXT DEFAULT 'GENERAL',
        status TEXT DEFAULT 'ACTIVE',
        clicks_count INTEGER DEFAULT 0,
        conversations_count INTEGER DEFAULT 0,
        last_clicked_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_links_slug ON chat_links(slug);
      CREATE INDEX IF NOT EXISTS idx_chat_links_tenant ON chat_links(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_chat_links_phone ON chat_links(phone_number);
    `);
  } catch (connectMigErr) {
    console.warn("[DB Migration] SARVYA Connect tables/columns notice:", connectMigErr.message);
  }

  // Ensure custom_fields exists in chat_links
  try {
    const clInfo = db.prepare("PRAGMA table_info(chat_links)").all();
    const clCols = clInfo.map(c => c.name || c.Field);
    if (!clCols.includes("custom_fields")) {
      db.exec("ALTER TABLE chat_links ADD COLUMN custom_fields TEXT;");
    }
  } catch (clMigErr) {
    console.warn("[DB Migration] chat_links custom_fields check:", clMigErr.message);
  }

  // Seed default chat links if empty
  try {
    const linkCount = db.prepare("SELECT COUNT(*) as count FROM chat_links").get()?.count || 0;
    if (linkCount === 0) {
      let defaultPhone = "919307382030";
      let defaultPhoneId = null;
      try {
        const ph = db.prepare("SELECT phone_number, phone_number_id FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1").get();
        if (ph) {
          defaultPhone = ph.phone_number;
          defaultPhoneId = ph.phone_number_id;
        }
      } catch (e) { }

      const insertLink = db.prepare(`
        INSERT INTO chat_links (
          id, tenant_id, user_id, phone_number_id, phone_number,
          title, slug, default_message, welcome_title, welcome_description,
          auto_reply_enabled, auto_reply_message, category, status
        ) VALUES (?, 1, 'system', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'ACTIVE')
      `);

      insertLink.run(
        "link_resort_inquiry",
        defaultPhoneId,
        defaultPhone,
        "General Resort & Booking Inquiry",
        "resort-inquiry",
        "Hi KonkanTrip Beach Resort! I would like to inquire about room availability and weekend packages.",
        "KonkanTrip Beach Resort & Spa",
        "Chat with our direct reservation concierge on WhatsApp or directly in browser.",
        "Hello! Thank you for connecting with KonkanTrip Beach Resort. Our reservation team is reviewing your inquiry now. Feel free to share your planned check-in dates!",
        "HOSPITALITY"
      );

      insertLink.run(
        "link_villa_booking",
        defaultPhoneId,
        defaultPhone,
        "Beach Villa Reservation Desk",
        "villa-booking",
        "Hi! I am interested in reserving the Deluxe Sea View Villa. Please share current tariffs and inclusions.",
        "Luxury Ocean Villa Booking Desk",
        "Direct reservation desk for private sea-facing cottages and suites.",
        "Welcome to KonkanTrip Luxury Villas! Our Sea View Villas feature private beach balconies and breakfast inclusions. Let us know if you need customized dining or airport transfers.",
        "HOSPITALITY"
      );
    }
  } catch (linkSeedErr) {
    console.warn("[DB Seed] chat_links seed notice:", linkSeedErr.message);
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

    const entTableInfo = db.prepare("PRAGMA table_info(business_entities)").all();
    const entCols = entTableInfo.map(c => c.name || c.Field);
    if (!entCols.includes("user_id")) {
      db.exec("ALTER TABLE business_entities ADD COLUMN user_id TEXT;");
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

  // =========================================================================
  // MULTI-INDUSTRY POLYMORPHIC ENGINE & MERCHANT PAYOUT SCHEMA
  // =========================================================================
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS business_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        domain TEXT NOT NULL CHECK(domain IN ('HOSPITALITY', 'DINING', 'RETAIL', 'SERVICES', 'REAL_ESTATE')),
        name TEXT NOT NULL,
        legal_name TEXT,
        slug TEXT NOT NULL UNIQUE,
        tagline TEXT,
        description TEXT,
        logo_url TEXT,
        banner_url TEXT,
        phone_e164 TEXT NOT NULL,
        email TEXT,
        city TEXT NOT NULL,
        state TEXT,
        country_code TEXT DEFAULT 'IN',
        currency TEXT DEFAULT 'INR',
        timezone TEXT DEFAULT 'Asia/Kolkata',
        tax_identifier TEXT,
        opening_time TEXT,
        closing_time TEXT,
        checkin_time TEXT,
        checkout_time TEXT,
        status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED')),
        settings_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_entities_tenant_domain ON business_entities(tenant_id, domain);
      CREATE INDEX IF NOT EXISTS idx_entities_slug ON business_entities(slug);

      CREATE TABLE IF NOT EXISTS catalog_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entity_id) REFERENCES business_entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_cat_entity ON catalog_categories(entity_id);

      CREATE TABLE IF NOT EXISTS catalog_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL,
        category_id INTEGER,
        item_type TEXT NOT NULL CHECK(item_type IN ('ROOM', 'FOOD', 'PRODUCT', 'SERVICE', 'EXPERIENCE')),
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        sku TEXT,
        short_description TEXT,
        description TEXT,
        image_url TEXT,
        gallery_json TEXT DEFAULT '[]',
        base_price REAL NOT NULL DEFAULT 0.0,
        tax_rate REAL DEFAULT 0.0,
        hsn_sac_code TEXT,
        
        -- Hospitality
        max_adults INTEGER DEFAULT 2,
        max_children INTEGER DEFAULT 1,
        bed_type TEXT,
        carpet_area_sqft INTEGER,
        
        -- F&B
        dietary_flag TEXT DEFAULT 'NONE' CHECK(dietary_flag IN ('NONE', 'VEG', 'NON_VEG', 'VEGAN', 'JAIN', 'EGG')),
        spice_level INTEGER DEFAULT 0,
        prep_time_minutes INTEGER DEFAULT 15,
        is_sold_out_today INTEGER DEFAULT 0,
        
        -- Retail
        inventory_tracking INTEGER DEFAULT 1,
        stock_quantity INTEGER DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 5,
        weight_grams REAL DEFAULT 0.0,
        
        -- Services
        duration_minutes INTEGER DEFAULT 30,
        buffer_minutes INTEGER DEFAULT 10,
        
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        attributes_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entity_id) REFERENCES business_entities(id) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES catalog_categories(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_entity ON catalog_items(entity_id, item_type);
      CREATE INDEX IF NOT EXISTS idx_items_sku ON catalog_items(sku);
      CREATE INDEX IF NOT EXISTS idx_items_sold_out ON catalog_items(entity_id, is_sold_out_today);

      CREATE TABLE IF NOT EXISTS catalog_item_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        item_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        sku TEXT,
        price_delta REAL DEFAULT 0.0,
        override_base_price REAL,
        stock_quantity INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_variants_item ON catalog_item_variants(item_id);

      CREATE TABLE IF NOT EXISTS daily_inventory_matrix (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        inventory_date TEXT NOT NULL,
        available_qty INTEGER NOT NULL DEFAULT 1,
        booked_qty INTEGER DEFAULT 0,
        rate_override REAL,
        min_stay_nights INTEGER DEFAULT 1,
        is_closed INTEGER DEFAULT 0,
        notes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_id, item_id, inventory_date),
        FOREIGN KEY(item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_inv_date ON daily_inventory_matrix(item_id, inventory_date);
      CREATE INDEX IF NOT EXISTS idx_inv_entity_date ON daily_inventory_matrix(entity_id, inventory_date);

      CREATE TABLE IF NOT EXISTS unified_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL,
        order_number TEXT NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        source TEXT DEFAULT 'CHAT_LINK' CHECK(source IN ('CHAT_LINK', 'WHATSAPP_FLOW', 'QR_STAND', 'MANUAL_INBOX', 'WEB')),
        link_id TEXT,
        
        check_in_date TEXT,
        check_out_date TEXT,
        table_number TEXT,
        appointment_slot TEXT,
        shipping_address_json TEXT,
        
        subtotal REAL NOT NULL DEFAULT 0.0,
        tax_total REAL NOT NULL DEFAULT 0.0,
        discount_total REAL DEFAULT 0.0,
        grand_total REAL NOT NULL DEFAULT 0.0,
        currency TEXT DEFAULT 'INR',
        
        order_status TEXT DEFAULT 'PENDING' CHECK(order_status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED')),
        payment_status TEXT DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'FAILED')),
        
        payment_method TEXT,
        payment_reference TEXT,
        notes TEXT,
        metadata_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entity_id) REFERENCES business_entities(id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_entity ON unified_orders(entity_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON unified_orders(customer_phone);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON unified_orders(order_status, payment_status);

      CREATE TABLE IF NOT EXISTS unified_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        variant_id INTEGER,
        item_title TEXT NOT NULL,
        variant_title TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        tax_amount REAL DEFAULT 0.0,
        total_price REAL NOT NULL,
        special_instructions TEXT,
        FOREIGN KEY(order_id) REFERENCES unified_orders(id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES catalog_items(id)
      );

      CREATE INDEX IF NOT EXISTS idx_order_items_order ON unified_order_items(order_id);

      CREATE TABLE IF NOT EXISTS merchant_payment_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL UNIQUE,
        upi_vpa TEXT,
        upi_payee_name TEXT,
        gateway_provider TEXT DEFAULT 'RAZORPAY' CHECK(gateway_provider IN ('RAZORPAY', 'CASHFREE', 'STRIPE', 'PHONEPE', 'OFFLINE')),
        api_key TEXT,
        api_secret_encrypted TEXT,
        merchant_id TEXT,
        webhook_secret TEXT,
        is_live_mode INTEGER DEFAULT 0,
        accept_cod INTEGER DEFAULT 1,
        auto_capture INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entity_id) REFERENCES business_entities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS merchant_payout_beneficiaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL,
        account_holder_name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        ifsc_code TEXT NOT NULL,
        account_type TEXT DEFAULT 'CURRENT' CHECK(account_type IN ('CURRENT', 'SAVINGS')),
        upi_vpa TEXT,
        verification_status TEXT DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING', 'PENNY_VERIFIED', 'MANUAL_VERIFIED', 'FAILED')),
        penny_drop_reference TEXT,
        registered_legal_name TEXT,
        is_primary INTEGER DEFAULT 1,
        payout_schedule TEXT DEFAULT 'DAILY' CHECK(payout_schedule IN ('DAILY', 'WEEKLY', 'INSTANT_ON_DEMAND')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entity_id) REFERENCES business_entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_beneficiaries_entity ON merchant_payout_beneficiaries(entity_id);

      CREATE TABLE IF NOT EXISTS merchant_payout_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        entity_id INTEGER NOT NULL,
        beneficiary_id INTEGER NOT NULL,
        payout_batch_id TEXT NOT NULL,
        gross_amount REAL NOT NULL,
        platform_fee REAL DEFAULT 0.0,
        tax_on_fee REAL DEFAULT 0.0,
        net_payout_amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED', 'REVERSED')),
        bank_utr TEXT,
        failure_reason TEXT,
        dispatched_at DATETIME,
        settled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entity_id) REFERENCES business_entities(id),
        FOREIGN KEY(beneficiary_id) REFERENCES merchant_payout_beneficiaries(id)
      );

      CREATE INDEX IF NOT EXISTS idx_payout_entity ON merchant_payout_ledger(entity_id, status);
      CREATE INDEX IF NOT EXISTS idx_payout_batch ON merchant_payout_ledger(payout_batch_id);
    `);

    // Seed default entities if none exist
    const entityCount = db.prepare("SELECT COUNT(*) as count FROM business_entities").get()?.count || 0;
    if (entityCount === 0) {
      const insertEntity = db.prepare(`
        INSERT INTO business_entities (
          id, tenant_id, domain, name, legal_name, slug, tagline, description,
          phone_e164, email, city, state, currency, timezone, tax_identifier,
          opening_time, closing_time, checkin_time, checkout_time, status
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'Asia/Kolkata', ?, ?, ?, ?, ?, 'ACTIVE')
      `);

      // 1. Hospitality Entity
      insertEntity.run(
        1,
        'HOSPITALITY',
        'KonkanTrip Beach Resort & Spa',
        'KonkanTrip Hospitality LLP',
        'konkantrip-resort',
        'Boutique Beachfront Stays & Ocean Villas',
        'Luxury beachfront villas and cottages with direct access to Alibaug beach.',
        '919307382030',
        'reservations@konkantrip.com',
        'Alibaug',
        'Maharashtra',
        '27AAACK1234M1Z5',
        '07:00',
        '23:00',
        '14:00',
        '11:00'
      );

      // 2. F&B Entity
      insertEntity.run(
        2,
        'DINING',
        'Konkan Wave Cafe & Beach Bar',
        'KonkanTrip Hospitality LLP',
        'konkan-wave-cafe',
        'Authentic Malvani Flavours, Wood-fired Pizza & Sunset Cocktails',
        'Open-air seaside dining with fresh local seafood, artisanal pizzas and barista coffee.',
        '919307382030',
        'dining@konkantrip.com',
        'Alibaug',
        'Maharashtra',
        '27AAACK1234M1Z5',
        '08:00',
        '23:30',
        null,
        null
      );

      // Seed categories for Hospitality
      const insertCat = db.prepare(`
        INSERT INTO catalog_categories (id, tenant_id, entity_id, name, slug, description, sort_order)
        VALUES (?, 1, ?, ?, ?, ?, ?)
      `);
      insertCat.run(1, 1, 'Luxury Sea Villas', 'luxury-sea-villas', 'Oceanfront detached villas with private terrace', 1);
      insertCat.run(2, 1, 'Garden Cottages', 'garden-cottages', 'Quiet cottages surrounded by coconut groves', 2);

      // Seed categories for F&B Dining
      insertCat.run(3, 2, 'Fresh Catch Seafood', 'fresh-catch', 'Locally caught fish and crab prepared Malvani style', 1);
      insertCat.run(4, 2, 'Wood-Fired Pizza & Pasta', 'wood-fired-pizza', 'Hand-stretched sourdough pizzas', 2);
      insertCat.run(5, 2, 'Beverages & Coolers', 'beverages-coolers', 'Solkadhi, fresh juices and specialty coffee', 3);

      // Seed items for Hospitality
      const insertItem = db.prepare(`
        INSERT INTO catalog_items (
          id, tenant_id, entity_id, category_id, item_type, title, slug, sku,
          short_description, description, base_price, tax_rate, max_adults, max_children,
          bed_type, carpet_area_sqft, is_active, sort_order
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      insertItem.run(
        1, 1, 1, 'ROOM', 'Deluxe Sea View Villa', 'deluxe-sea-view-villa', 'VILLA-SEA-01',
        'King bed, panoramic ocean view balcony, complimentary breakfast',
        'Wake up to the Arabian Sea with direct private beach access and open-air rain shower.',
        8500.0, 12.0, 2, 1, 'King Bed', 480, 1
      );

      insertItem.run(
        2, 1, 1, 'ROOM', 'Private Pool Villa Deluxe', 'private-pool-villa-deluxe', 'VILLA-POOL-02',
        'Private plunge pool, sundeck, butler service',
        'Exclusive 2-bedroom luxury villa with private 25ft swimming pool and private dining gazebos.',
        12500.0, 18.0, 4, 2, '2x King Beds', 850, 2
      );

      insertItem.run(
        3, 1, 2, 'ROOM', 'Coconut Grove Cottage', 'coconut-grove-cottage', 'COTTAGE-COCO-03',
        'Detached cottage in natural palm trees, quiet serenity',
        'Spacious eco-friendly cottage with wooden interiors, hammock verandah, and high-speed Wi-Fi.',
        5200.0, 12.0, 3, 1, 'Queen + Single Bed', 360, 3
      );

      // Seed items for F&B Dining
      const insertFood = db.prepare(`
        INSERT INTO catalog_items (
          id, tenant_id, entity_id, category_id, item_type, title, slug, sku,
          short_description, base_price, tax_rate, dietary_flag, spice_level,
          prep_time_minutes, is_sold_out_today, is_active, sort_order
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      insertFood.run(
        4, 2, 3, 'FOOD', 'Authentic Surmai Fish Thali', 'surmai-fish-thali', 'DISH-SURMAI-01',
        'Fresh Kingfish fry, Malvani curry, 2 bhakris, tisrya masala & solkadhi',
        480.0, 5.0, 'NON_VEG', 2, 20, 0, 1
      );

      insertFood.run(
        5, 2, 3, 'FOOD', 'Butter Garlic Prawns (Tawa)', 'butter-garlic-prawns', 'DISH-PRAWN-02',
        'Jumbo Arabian sea prawns tossed in golden garlic and compound butter',
        420.0, 5.0, 'NON_VEG', 1, 15, 0, 2
      );

      insertFood.run(
        6, 2, 4, 'FOOD', 'Artisanal Margherita Pizza (12")', 'margherita-pizza', 'DISH-PIZZA-01',
        'San Marzano tomato sauce, fresh buffalo mozzarella, fresh basil',
        380.0, 5.0, 'VEG', 0, 12, 0, 3
      );

      insertFood.run(
        7, 2, 5, 'FOOD', 'Chilled Kokum Solkadhi Cooler', 'kokum-solkadhi', 'BEV-SOLKADHI-01',
        'Hand-extracted coconut milk with kokum, garlic, and fresh green chili',
        110.0, 5.0, 'VEGAN', 1, 5, 0, 4
      );

      // Seed daily inventory matrix for rooms (next 30 days)
      const insertMatrix = db.prepare(`
        INSERT OR IGNORE INTO daily_inventory_matrix (
          tenant_id, entity_id, item_id, inventory_date, available_qty, booked_qty, rate_override
        ) VALUES (1, 1, ?, ?, ?, 0, ?)
      `);

      const now = new Date();
      for (let d = 0; d < 30; d++) {
        const dateObj = new Date(now);
        dateObj.setDate(dateObj.getDate() + d);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        // Deluxe Sea Villa (4 keys)
        insertMatrix.run(1, dateStr, 4, 8500.0);
        // Pool Villa (2 keys)
        insertMatrix.run(2, dateStr, 2, 12500.0);
        // Coconut Cottage (6 keys)
        insertMatrix.run(3, dateStr, 6, 5200.0);
      }

      // Seed payment config for Entity 1
      db.prepare(`
        INSERT OR IGNORE INTO merchant_payment_configs (
          tenant_id, entity_id, upi_vpa, upi_payee_name, gateway_provider, is_live_mode, accept_cod
        ) VALUES (1, 1, 'konkantrip@icici', 'KonkanTrip Hospitality LLP', 'RAZORPAY', 0, 1)
      `).run();

      // Seed bank payout beneficiary for Entity 1
      const insertBeneficiary = db.prepare(`
        INSERT INTO merchant_payout_beneficiaries (
          id, tenant_id, entity_id, account_holder_name, bank_name, account_number,
          ifsc_code, account_type, verification_status, registered_legal_name, is_primary, payout_schedule
        ) VALUES (1, 1, 1, 'KONKANTRIP HOSPITALITY LLP', 'HDFC BANK LIMITED', '50200084920194', 'HDFC0000240', 'CURRENT', 'PENNY_VERIFIED', 'KONKANTRIP HOSPITALITY LLP', 1, 'DAILY')
      `);
      insertBeneficiary.run();

      // Seed recent payout ledger history
      const insertLedger = db.prepare(`
        INSERT INTO merchant_payout_ledger (
          tenant_id, entity_id, beneficiary_id, payout_batch_id, gross_amount, platform_fee,
          tax_on_fee, net_payout_amount, currency, status, bank_utr, dispatched_at, settled_at
        ) VALUES (1, 1, 1, ?, ?, ?, ?, ?, 'INR', 'SETTLED', ?, datetime('now', ?), datetime('now', ?))
      `);

      insertLedger.run('BATCH_20261113_001', 64200.0, 1284.0, 231.12, 62684.88, '431802948192', '-1 day', '-1 day');
      insertLedger.run('BATCH_20261112_001', 48500.0, 970.0, 174.60, 47355.40, '431710394811', '-2 days', '-2 days');
      insertLedger.run('BATCH_20261111_001', 91000.0, 1820.0, 327.60, 88852.40, '431682910481', '-3 days', '-3 days');
    }
  } catch (multiIndustryErr) {
    console.warn("[DB Migration] Multi-Industry Polymorphic Schema notice:", multiIndustryErr.message);
  }

  // =========================================================================
  // Hospitality Inventory, Room & Rate Configuration Module Migration
  // =========================================================================
  try {
    // 1. Column extensions for properties
    const propTableInfo = db.prepare("PRAGMA table_info(properties)").all();
    const propCols = propTableInfo.map(c => c.name || c.Field);
    const propAddCols = [
      ["user_id", "VARCHAR(64)"],
      ["description", "TEXT"],
      ["property_type", "VARCHAR(64) DEFAULT 'RESORT'"],
      ["email", "VARCHAR(255)"],
      ["phone", "VARCHAR(64)"],
      ["website", "VARCHAR(255)"],
      ["social_links_json", "TEXT"],
      ["address", "TEXT"],
      ["district", "VARCHAR(128)"],
      ["state", "VARCHAR(128)"],
      ["country", "VARCHAR(128) DEFAULT 'India'"],
      ["postal_code", "VARCHAR(32)"],
      ["latitude", "REAL"],
      ["longitude", "REAL"],
      ["check_in_time", "VARCHAR(32) DEFAULT '14:00'"],
      ["check_out_time", "VARCHAR(32) DEFAULT '11:00'"],
      ["languages_json", "TEXT"],
      ["currency", "VARCHAR(16) DEFAULT 'INR'"],
      ["logo_url", "TEXT"],
      ["cover_image_url", "TEXT"],
      ["primary_image_url", "TEXT"],
      ["gallery_json", "TEXT"],
      ["publication_status", "VARCHAR(64) DEFAULT 'PUBLISHED'"],
      ["published_at", "DATETIME"],
      ["published_by", "VARCHAR(64)"],
      ["version", "INTEGER DEFAULT 1"],
      ["updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"]
    ];
    for (const [col, typeDef] of propAddCols) {
      if (!propCols.includes(col)) {
        try {
          db.exec(`ALTER TABLE properties ADD COLUMN ${col} ${typeDef};`);
        } catch (e) {
          console.warn(`[DB Migration] properties ADD ${col} notice:`, e.message);
        }
      }
    }

    // 2. Column extensions for room_types
    const rtTableInfo = db.prepare("PRAGMA table_info(room_types)").all();
    const rtCols = rtTableInfo.map(c => c.name || c.Field);
    const rtAddCols = [
      ["room_code", "VARCHAR(64)"],
      ["room_size", "REAL DEFAULT 350.0"],
      ["size_unit", "VARCHAR(32) DEFAULT 'sq_ft'"],
      ["bed_type", "VARCHAR(128) DEFAULT '1 King Bed'"],
      ["bed_count", "INTEGER DEFAULT 1"],
      ["max_occupancy", "INTEGER DEFAULT 3"],
      ["standard_occupancy", "INTEGER DEFAULT 2"],
      ["extra_adult_capacity", "INTEGER DEFAULT 1"],
      ["extra_child_capacity", "INTEGER DEFAULT 1"],
      ["extra_adult_price", "REAL DEFAULT 1200.0"],
      ["extra_child_price", "REAL DEFAULT 600.0"],
      ["bathroom_count", "INTEGER DEFAULT 1"],
      ["view_type", "VARCHAR(128) DEFAULT 'Garden View'"],
      ["smoking_policy", "VARCHAR(64) DEFAULT 'NON_SMOKING'"],
      ["accessibility_info", "TEXT"],
      ["amenities_json", "TEXT"],
      ["primary_image_url", "TEXT"],
      ["status", "VARCHAR(64) DEFAULT 'ACTIVE'"]
    ];
    for (const [col, typeDef] of rtAddCols) {
      if (!rtCols.includes(col)) {
        try {
          db.exec(`ALTER TABLE room_types ADD COLUMN ${col} ${typeDef};`);
        } catch (e) {
          console.warn(`[DB Migration] room_types ADD ${col} notice:`, e.message);
        }
      }
    }

    // 3. Column extensions for room_inventory_daily
    const invTableInfo = db.prepare("PRAGMA table_info(room_inventory_daily)").all();
    const invCols = invTableInfo.map(c => c.name || c.Field);
    const invAddCols = [
      ["total_rooms", "INTEGER DEFAULT 5"],
      ["blocked_qty", "INTEGER DEFAULT 0"],
      ["out_of_service_qty", "INTEGER DEFAULT 0"],
      ["allocated_qty", "INTEGER DEFAULT 0"],
      ["notes", "TEXT"]
    ];
    for (const [col, typeDef] of invAddCols) {
      if (!invCols.includes(col)) {
        try {
          db.exec(`ALTER TABLE room_inventory_daily ADD COLUMN ${col} ${typeDef};`);
        } catch (e) {}
      }
    }

    // 4. Create new hospitality supporting tables individually for safe cross-engine compatibility
    const hospitalityTables = [
      `CREATE TABLE IF NOT EXISTS hospitality_room_images (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        room_type_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        caption VARCHAR(255),
        alt_text VARCHAR(255),
        is_primary INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_physical_rooms (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        room_type_id INTEGER NOT NULL,
        room_number VARCHAR(64) NOT NULL,
        floor_or_building VARCHAR(128),
        operational_status VARCHAR(64) DEFAULT 'AVAILABLE',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_inventory_blocks (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        room_type_id INTEGER NOT NULL,
        start_date VARCHAR(32) NOT NULL,
        end_date VARCHAR(32) NOT NULL,
        blocked_qty INTEGER NOT NULL DEFAULT 1,
        reason VARCHAR(255),
        created_by VARCHAR(64),
        status VARCHAR(64) DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_rate_plans (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) NOT NULL,
        meal_plan VARCHAR(32) DEFAULT 'EP',
        description TEXT,
        cancellation_policy TEXT,
        is_refundable INTEGER DEFAULT 1,
        included_services_json TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_seasonal_rates (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        room_type_id INTEGER NOT NULL,
        rate_plan_id INTEGER,
        season_name VARCHAR(255) NOT NULL,
        start_date VARCHAR(32) NOT NULL,
        end_date VARCHAR(32) NOT NULL,
        price REAL NOT NULL,
        extra_adult_price REAL DEFAULT 0,
        extra_child_price REAL DEFAULT 0,
        priority INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_daily_rates (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        room_type_id INTEGER NOT NULL,
        rate_plan_id INTEGER,
        rate_date VARCHAR(32) NOT NULL,
        price REAL NOT NULL,
        extra_adult_price REAL DEFAULT 0,
        extra_child_price REAL DEFAULT 0,
        reason VARCHAR(255),
        created_by VARCHAR(64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_policies (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        policy_type VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        rules_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_facilities (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        category VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(64),
        is_featured INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_faqs (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        category VARCHAR(64) DEFAULT 'GENERAL',
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_tax_rules (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        tax_name VARCHAR(128) NOT NULL,
        percentage REAL NOT NULL,
        min_slab_rate REAL DEFAULT 0,
        max_slab_rate REAL DEFAULT 999999,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS hospitality_chat_sessions (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        session_key VARCHAR(128) NOT NULL UNIQUE,
        channel VARCHAR(32) NOT NULL DEFAULT 'WEB',
        tenant_id INTEGER NOT NULL DEFAULT 1,
        property_id INTEGER NOT NULL DEFAULT 1,
        link_id VARCHAR(64) NULL,
        phone VARCHAR(32) NOT NULL,
        guest_name VARCHAR(128) NULL,
        current_step VARCHAR(64) NOT NULL DEFAULT 'IDLE',
        session_data TEXT NULL,
        last_interaction_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of hospitalityTables) {
      try {
        db.exec(sql);
      } catch (tErr) {
        console.warn("[DB Migration] Table creation notice:", tErr.message);
      }
    }

    // 5. Seed default Hospitality metadata & rate plans if empty
    const rpCount = Number(db.prepare("SELECT COUNT(*) as count FROM hospitality_rate_plans").get()?.count || 0);
    if (rpCount === 0) {
      const insertRatePlan = db.prepare(`
        INSERT INTO hospitality_rate_plans (
          id, tenant_id, property_id, name, code, meal_plan, description,
          cancellation_policy, is_refundable, included_services_json, is_active
        ) VALUES (?, 1, 1, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      insertRatePlan.run(1, 'Room Only (European Plan)', 'EP', 'EP', 'Accommodation only. Meals available à la carte.', 'Free cancellation up to 48 hours before check-in', 1, '["Wi-Fi", "Swimming Pool Access", "Parking"]');
      insertRatePlan.run(2, 'Breakfast Included (Continental Plan)', 'CP', 'CP', 'Complimentary beachside buffet breakfast included for all standard guests.', 'Free cancellation up to 48 hours before check-in', 1, '["Buffet Breakfast", "Wi-Fi", "Swimming Pool Access"]');
      insertRatePlan.run(3, 'Half Board (Modified American Plan)', 'MAP', 'MAP', 'Includes accommodation, breakfast, and dinner.', 'Non-refundable within 7 days of check-in', 0, '["Breakfast", "Dinner", "Wi-Fi", "Welcome Drink"]');
    }

    // Seed default tax rules
    const taxCount = Number(db.prepare("SELECT COUNT(*) as count FROM hospitality_tax_rules").get()?.count || 0);
    if (taxCount === 0) {
      const insertTax = db.prepare(`
        INSERT INTO hospitality_tax_rules (tenant_id, property_id, tax_name, percentage, min_slab_rate, max_slab_rate, is_active)
        VALUES (1, 1, ?, ?, ?, ?, 1)
      `);
      insertTax.run('GST 12%', 12.0, 0, 7500);
      insertTax.run('GST 18%', 18.0, 7501, 999999);
    }

    // Seed default facilities
    const facCount = Number(db.prepare("SELECT COUNT(*) as count FROM hospitality_facilities").get()?.count || 0);
    if (facCount === 0) {
      const insertFac = db.prepare(`
        INSERT INTO hospitality_facilities (tenant_id, property_id, category, name, description, icon, is_featured, is_active)
        VALUES (1, 1, ?, ?, ?, ?, ?, 1)
      `);
      insertFac.run('RECREATION', 'Infinity Swimming Pool', 'Seaside pool open 07:00 to 20:00 with sun loungers and towel service.', 'Waves', 1);
      insertFac.run('DINING', 'The Konkan Breeze Oceanfront Dining', 'Authentic Malvani seafood, coastal thalis and multi-cuisine restaurant.', 'Utensils', 1);
      insertFac.run('SERVICES', 'High-Speed Wi-Fi', 'Complimentary broadband coverage across villas and communal gardens.', 'Wifi', 1);
      insertFac.run('RECREATION', 'Direct Beach Access', 'Private foot trail leading straight onto the pristine shoreline.', 'Palmtree', 1);
      insertFac.run('SERVICES', 'Secure On-Site Parking', '24/7 guarded private parking with EV charging points.', 'Car', 0);
      insertFac.run('SERVICES', '24/7 Concierge & Room Service', 'Round-the-clock front desk and in-room dining service.', 'Bell', 0);
    }

    // Seed default policies
    const polCount = Number(db.prepare("SELECT COUNT(*) as count FROM hospitality_policies").get()?.count || 0);
    if (polCount === 0) {
      const insertPol = db.prepare(`
        INSERT INTO hospitality_policies (tenant_id, property_id, policy_type, title, content, rules_json)
        VALUES (1, 1, ?, ?, ?, ?)
      `);
      insertPol.run('CHECK_IN_OUT', 'Standard Check-in & Check-out Timings', 'Check-in begins at 14:00 (2:00 PM) and check-out is by 11:00 (11:00 AM). Early check-in or late check-out is subject to room availability.', JSON.stringify({ check_in: "14:00", check_out: "11:00" }));
      insertPol.run('CANCELLATION', 'Flexible Cancellation Policy', 'Free cancellation is permitted up to 48 hours prior to arrival. Cancellations made within 48 hours or no-shows incur a 1-night retention fee.', JSON.stringify({ free_window_hours: 48, fee_nights: 1 }));
      insertPol.run('CHILD', 'Child & Extra Bed Guidelines', 'Children aged 5 and under stay free using existing bedding. Extra bed charges apply for children aged 6-12 (₹600/night) and additional adults (₹1,200/night).', JSON.stringify({ free_age_limit: 5, child_rate: 600, adult_rate: 1200 }));
      insertPol.run('PET', 'Pet Policy', 'Pets are welcome exclusively in ground-level Garden Cottages and Private Villas with prior concierge notification.', JSON.stringify({ pets_allowed: true, pet_fee: 0 }));
      insertPol.run('DIRECTIONS', 'Location & Driving Directions', 'Located in Alibaug, Maharashtra. Accessible via Ro-Ro ferry from Bhaucha Dhakka (Mumbai) to Mandwa Jetty (45 mins + 20 mins drive) or via NH-66 Mumbai-Goa highway.', JSON.stringify({ nearest_jetty: "Mandwa (18km)", nearest_airport: "Mumbai BOM (105km)" }));
    }

    // Seed default FAQs
    const faqCount = Number(db.prepare("SELECT COUNT(*) as count FROM hospitality_faqs").get()?.count || 0);
    if (faqCount === 0) {
      const insertFaq = db.prepare(`
        INSERT INTO hospitality_faqs (tenant_id, property_id, category, question, answer, display_order, is_active)
        VALUES (1, 1, ?, ?, ?, ?, 1)
      `);
      insertFaq.run('TIMINGS', 'What are the check-in and check-out timings?', 'Check-in is from 2:00 PM and check-out is until 11:00 AM. Early check-in can be requested upon booking.', 1);
      insertFaq.run('DINING', 'Is breakfast included in the booking?', 'Breakfast is included with our CP (Breakfast Included) and MAP (Half Board) rate plans. You can also purchase breakfast on-site.', 2);
      insertFaq.run('TRAVEL', 'How do I reach the resort from Mumbai or Pune?', 'From Mumbai, the Mandwa Ro-Ro ferry from Mazgaon/Bhaucha Dhakka takes just 50 minutes. From Pune, the resort is a scenic 3.5 hour drive via Khopoli/Pen.', 3);
      insertFaq.run('BOOKING', 'Are quotes guaranteed or estimated?', 'All quotes provided via chat are upfront estimates based on current published inventory and seasonal rates. Your reservation is finalized once confirmed by our reservations desk.', 4);
    }

    // Update Property 1 presentation details if missing
    try {
      db.prepare(`
        UPDATE properties
        SET description = COALESCE(description, 'Premier seaside resort offering private pool villas, coconut cottages, authentic coastal dining, and direct beach access.'),
            property_type = COALESCE(property_type, 'RESORT'),
            phone = COALESCE(phone, '919307382030'),
            email = COALESCE(email, 'reservations@konkantrip.com'),
            website = COALESCE(website, 'https://konkantrip.com'),
            address = COALESCE(address, 'Nagaon Beach Road, Alibaug'),
            district = COALESCE(district, 'Raigad'),
            state = COALESCE(state, 'Maharashtra'),
            postal_code = COALESCE(postal_code, '402204'),
            publication_status = 'PUBLISHED'
        WHERE id = 1
      `).run();
    } catch (e) {}

    // Update existing room types with standard hospitality attributes
    try {
      db.prepare("UPDATE room_types SET room_code = 'DLX-VIL', room_size = 480, bed_type = '1 King Bed', max_occupancy = 3, standard_occupancy = 2, view_type = 'Sea View' WHERE name LIKE '%Deluxe%' AND room_code IS NULL").run();
      db.prepare("UPDATE room_types SET room_code = 'PREM-VIL', room_size = 620, bed_type = '1 King Bed + 1 Daybed', max_occupancy = 4, standard_occupancy = 2, view_type = 'Ocean Front' WHERE name LIKE '%Premium%' AND room_code IS NULL").run();
      db.prepare("UPDATE room_types SET room_code = 'COT-GRD', room_size = 380, bed_type = '1 Queen Bed', max_occupancy = 3, standard_occupancy = 2, view_type = 'Garden View' WHERE (name LIKE '%Cottage%' OR name LIKE '%Standard%') AND room_code IS NULL").run();
    } catch (e) {}

  } catch (hospMigErr) {
    console.warn("[DB Migration] Hospitality Module Schema notice:", hospMigErr.message);
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
