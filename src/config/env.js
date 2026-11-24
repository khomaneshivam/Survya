// SARVYA WhatsApp Bulk Configuration & Environment Loader
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

process.env.TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

const INSECURE_DEFAULT_SECRETS = new Set([
  "your_jwt_secret_min_32_characters_long_here",
  "change_this_secret_in_production_32_chars",
  "default_secret_key_12345678901234567890",
  "secret12345678901234567890123456789012"
]);

let jwtSecret = process.env.JWT_SECRET;
if (isProduction) {
  if (!jwtSecret || jwtSecret.trim().length < 32) {
    throw new Error(
      "FATAL SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable is missing, empty, or shorter than 32 characters in production. Application startup aborted."
    );
  }
  if (INSECURE_DEFAULT_SECRETS.has(jwtSecret.trim())) {
    throw new Error(
      "FATAL SECURITY CONFIGURATION ERROR: JWT_SECRET is set to an insecure default placeholder from .env.example. Please generate a unique cryptographic secret for production."
    );
  }
} else if (!jwtSecret || !jwtSecret.trim() || INSECURE_DEFAULT_SECRETS.has(jwtSecret.trim())) {
  // Safe ephemeral dev fallback (changes on restart in dev if placeholder is used)
  jwtSecret = process.env.DEV_JWT_SECRET || "dev_secret_" + crypto.randomBytes(32).toString("hex");
}

// Webhook verify token & Meta App Secret (primarily stored & managed in database settings table)
const webhookVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN || "";
const metaAppSecret = process.env.META_APP_SECRET || "";

const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV,
  DB_CLIENT: (process.env.DB_CLIENT || "mysql").toLowerCase(),
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: parseInt(process.env.DB_PORT || "3306", 10),
  DB_USER: process.env.DB_USER || "root",
  DB_PASSWORD: process.env.DB_PASSWORD || "",
  DB_NAME: process.env.DB_NAME || "whatsapp_bulk_db",
  WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  META_APP_SECRET: metaAppSecret,
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || "v21.0",
  // An explicit endpoint override allows CI to route any accidental API call to
  // an unreachable local address instead of Meta's live Graph API.
  META_API_URL: process.env.META_API_URL || "",
  WHATSAPP_TEMPLATE_ID: process.env.WHATSAPP_TEMPLATE_ID || "",
  DEFAULT_TEMPLATE_NAME: process.env.DEFAULT_TEMPLATE_NAME || "kt_restaurant_invitation",
  DEFAULT_TEMPLATE_LANG: process.env.DEFAULT_TEMPLATE_LANG || "en",
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || "91",
  BROADCAST_DELAY_MS: parseInt(process.env.BROADCAST_DELAY_MS || "250", 10),
  WEBHOOK_VERIFY_TOKEN: webhookVerifyToken,
  DATA_DIR: path.resolve(__dirname, "../../data"),
  UPLOADS_DIR: path.resolve(__dirname, "../../uploads"),
  APP_TIMEZONE: process.env.APP_TIMEZONE || "Asia/Kolkata",
  JWT_SECRET: jwtSecret,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || "",
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
  WHATSAPP_FLOWS_ENABLED: process.env.WHATSAPP_FLOWS_ENABLED ? process.env.WHATSAPP_FLOWS_ENABLED === "true" : true,
  FLOWS_PRIVATE_KEY: process.env.FLOWS_PRIVATE_KEY || "",
  FLOWS_PASSPHRASE: process.env.FLOWS_PASSPHRASE || "",
  FLOWS_ENDPOINT_URL: process.env.FLOWS_ENDPOINT_URL || ""
};

module.exports = config;
