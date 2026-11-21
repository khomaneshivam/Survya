/**
 * Canonical Database Schema & Deployment-Ready Initializer
 * Auto-creates all 55 tables, indexes, column migrations, and baseline seed data on startup.
 */
const crypto = require("crypto");

const TABLE_SCHEMAS = {
  "audit_logs": "CREATE TABLE IF NOT EXISTS `audit_logs` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `action` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `target_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `details` longtext COLLATE utf8mb4_unicode_ci,\n  `ip_address` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `tenant_id` bigint DEFAULT '1',\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "automated_booking_contacts": "CREATE TABLE IF NOT EXISTS `automated_booking_contacts` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `booking_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `guest_name` longtext COLLATE utf8mb4_unicode_ci,\n  `phone_number` longtext COLLATE utf8mb4_unicode_ci,\n  `clean_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `property_name` longtext COLLATE utf8mb4_unicode_ci,\n  `checkin_date` longtext COLLATE utf8mb4_unicode_ci,\n  `checkout_date` longtext COLLATE utf8mb4_unicode_ci,\n  `raw_data` longtext COLLATE utf8mb4_unicode_ci,\n  `source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'UPLOAD',\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "automated_booking_dispatches": "CREATE TABLE IF NOT EXISTS `automated_booking_dispatches` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `booking_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `guest_name` longtext COLLATE utf8mb4_unicode_ci,\n  `phone_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `clean_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `property_name` longtext COLLATE utf8mb4_unicode_ci,\n  `checkin_date` longtext COLLATE utf8mb4_unicode_ci,\n  `checkout_date` longtext COLLATE utf8mb4_unicode_ci,\n  `trigger_type` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `template_name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `meta_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'SENT',\n  `error_message` longtext COLLATE utf8mb4_unicode_ci,\n  `dispatched_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_auto_booking_user` (`user_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "booking_enquiries": "CREATE TABLE IF NOT EXISTS `booking_enquiries` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `property_id` bigint NOT NULL DEFAULT '1',\n  `contact_id` bigint NOT NULL,\n  `conversation_id` bigint DEFAULT NULL,\n  `flow_session_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `guest_name` longtext COLLATE utf8mb4_unicode_ci,\n  `phone_e164` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `check_in` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `check_out` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `adults` bigint DEFAULT '2',\n  `children` bigint DEFAULT '0',\n  `rooms_requested` bigint DEFAULT '1',\n  `room_type_id` bigint DEFAULT NULL,\n  `room_preference` longtext COLLATE utf8mb4_unicode_ci,\n  `preferences_json` longtext COLLATE utf8mb4_unicode_ci,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'NEW',\n  `assigned_to` longtext COLLATE utf8mb4_unicode_ci,\n  `follow_up_at` datetime DEFAULT NULL,\n  `notes` longtext COLLATE utf8mb4_unicode_ci,\n  `lost_reason` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "business_entities": "CREATE TABLE IF NOT EXISTS `business_entities` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `domain` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `legal_name` longtext COLLATE utf8mb4_unicode_ci,\n  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tagline` longtext COLLATE utf8mb4_unicode_ci,\n  `description` longtext COLLATE utf8mb4_unicode_ci,\n  `logo_url` longtext COLLATE utf8mb4_unicode_ci,\n  `banner_url` longtext COLLATE utf8mb4_unicode_ci,\n  `phone_e164` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `city` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `state` longtext COLLATE utf8mb4_unicode_ci,\n  `country_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'IN',\n  `currency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `timezone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Kolkata',\n  `tax_identifier` longtext COLLATE utf8mb4_unicode_ci,\n  `opening_time` longtext COLLATE utf8mb4_unicode_ci,\n  `closing_time` longtext COLLATE utf8mb4_unicode_ci,\n  `checkin_time` longtext COLLATE utf8mb4_unicode_ci,\n  `checkout_time` longtext COLLATE utf8mb4_unicode_ci,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `settings_json` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '{}',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "campaign_recipients": "CREATE TABLE IF NOT EXISTS `campaign_recipients` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `phone_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `clean_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `contact_name` longtext COLLATE utf8mb4_unicode_ci,\n  `raw_data` longtext COLLATE utf8mb4_unicode_ci,\n  `rendered_message` longtext COLLATE utf8mb4_unicode_ci,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',\n  `meta_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `error_message` longtext COLLATE utf8mb4_unicode_ci,\n  `sent_at` datetime DEFAULT NULL,\n  `delivered_at` datetime DEFAULT NULL,\n  `read_at` datetime DEFAULT NULL,\n  `failed_at` datetime DEFAULT NULL,\n  `error_code` longtext COLLATE utf8mb4_unicode_ci,\n  PRIMARY KEY (`id`),\n  KEY `idx_recipients_campaign` (`campaign_id`),\n  KEY `idx_recipients_status` (`campaign_id`,`status`),\n  KEY `idx_recipients_meta_msg_id` (`meta_message_id`),\n  KEY `idx_recipients_pending_batch` (`campaign_id`,`status`,`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "campaigns": "CREATE TABLE IF NOT EXISTS `campaigns` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `file_name` longtext COLLATE utf8mb4_unicode_ci,\n  `total_contacts` bigint DEFAULT '0',\n  `valid_contacts` bigint DEFAULT '0',\n  `invalid_contacts` bigint DEFAULT '0',\n  `sent_count` bigint DEFAULT '0',\n  `failed_count` bigint DEFAULT '0',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',\n  `message_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'TEMPLATE',\n  `template_name` longtext COLLATE utf8mb4_unicode_ci,\n  `template_language` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'en_US',\n  `message_body` longtext COLLATE utf8mb4_unicode_ci,\n  `mapping_config` longtext COLLATE utf8mb4_unicode_ci,\n  `delay_ms` bigint DEFAULT '250',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `started_at` datetime DEFAULT NULL,\n  `completed_at` datetime DEFAULT NULL,\n  `scheduled_at` datetime DEFAULT NULL,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone_number_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `delivered_count` bigint DEFAULT '0',\n  `read_count` bigint DEFAULT '0',\n  `unknown_count` bigint DEFAULT '0',\n  `estimated_cost` double DEFAULT '0',\n  PRIMARY KEY (`id`),\n  KEY `idx_campaigns_status_scheduled` (`status`,`scheduled_at`),\n  KEY `idx_campaigns_user` (`user_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "catalog_categories": "CREATE TABLE IF NOT EXISTS `catalog_categories` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` longtext COLLATE utf8mb4_unicode_ci,\n  `icon` longtext COLLATE utf8mb4_unicode_ci,\n  `sort_order` bigint DEFAULT '0',\n  `is_active` bigint DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "catalog_item_variants": "CREATE TABLE IF NOT EXISTS `catalog_item_variants` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `item_id` bigint NOT NULL,\n  `title` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `sku` longtext COLLATE utf8mb4_unicode_ci,\n  `price_delta` double DEFAULT '0',\n  `override_base_price` double DEFAULT NULL,\n  `stock_quantity` bigint DEFAULT '0',\n  `is_active` bigint DEFAULT '1',\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "catalog_items": "CREATE TABLE IF NOT EXISTS `catalog_items` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `category_id` bigint DEFAULT NULL,\n  `item_type` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `title` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `sku` longtext COLLATE utf8mb4_unicode_ci,\n  `short_description` longtext COLLATE utf8mb4_unicode_ci,\n  `description` longtext COLLATE utf8mb4_unicode_ci,\n  `image_url` longtext COLLATE utf8mb4_unicode_ci,\n  `gallery_json` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '[]',\n  `base_price` double NOT NULL DEFAULT '0',\n  `tax_rate` double DEFAULT '0',\n  `hsn_sac_code` longtext COLLATE utf8mb4_unicode_ci,\n  `max_adults` bigint DEFAULT '2',\n  `max_children` bigint DEFAULT '1',\n  `bed_type` longtext COLLATE utf8mb4_unicode_ci,\n  `carpet_area_sqft` bigint DEFAULT NULL,\n  `dietary_flag` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'NONE',\n  `spice_level` bigint DEFAULT '0',\n  `prep_time_minutes` bigint DEFAULT '15',\n  `is_sold_out_today` bigint DEFAULT '0',\n  `inventory_tracking` bigint DEFAULT '1',\n  `stock_quantity` bigint DEFAULT '0',\n  `low_stock_threshold` bigint DEFAULT '5',\n  `weight_grams` double DEFAULT '0',\n  `duration_minutes` bigint DEFAULT '30',\n  `buffer_minutes` bigint DEFAULT '10',\n  `is_active` bigint DEFAULT '1',\n  `sort_order` bigint DEFAULT '0',\n  `attributes_json` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '{}',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "chat_links": "CREATE TABLE IF NOT EXISTS `chat_links` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tenant_id` bigint DEFAULT '1',\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone_number_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `title` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `default_message` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `welcome_title` longtext COLLATE utf8mb4_unicode_ci,\n  `welcome_description` longtext COLLATE utf8mb4_unicode_ci,\n  `auto_reply_enabled` bigint DEFAULT '1',\n  `auto_reply_message` longtext COLLATE utf8mb4_unicode_ci,\n  `flow_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'GENERAL',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `clicks_count` bigint DEFAULT '0',\n  `conversations_count` bigint DEFAULT '0',\n  `last_clicked_at` datetime DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `custom_fields` text COLLATE utf8mb4_unicode_ci,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "contact_consents": "CREATE TABLE IF NOT EXISTS `contact_consents` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `contact_id` bigint NOT NULL,\n  `purpose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'BOOKING',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'GRANTED',\n  `source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'WHATSAPP_INBOUND',\n  `captured_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `revoked_at` datetime DEFAULT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "contact_suppressions": "CREATE TABLE IF NOT EXISTS `contact_suppressions` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `clean_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'USER_OPT_OUT',\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "contacts": "CREATE TABLE IF NOT EXISTS `contacts` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `phone_e164` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci,\n  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'WHATSAPP',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "customer_replies": "CREATE TABLE IF NOT EXISTS `customer_replies` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `wa_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `from_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `customer_name` longtext COLLATE utf8mb4_unicode_ci,\n  `message_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'text',\n  `message_body` longtext COLLATE utf8mb4_unicode_ci,\n  `raw_payload` longtext COLLATE utf8mb4_unicode_ci,\n  `context_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `is_read` bigint DEFAULT '0',\n  `received_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `reply_text` longtext COLLATE utf8mb4_unicode_ci,\n  `reply_sent_at` datetime DEFAULT NULL,\n  `reply_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `media_url` longtext COLLATE utf8mb4_unicode_ci,\n  `media_type` longtext COLLATE utf8mb4_unicode_ci,\n  `media_caption` longtext COLLATE utf8mb4_unicode_ci,\n  `flow_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `flow_response_id` bigint DEFAULT NULL,\n  `link_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'WHATSAPP',\n  PRIMARY KEY (`id`),\n  KEY `idx_customer_replies_user` (`user_id`),\n  KEY `idx_customer_replies_flow` (`flow_id`),\n  KEY `idx_customer_replies_link` (`link_id`),\n  KEY `idx_replies_context_msg` (`context_message_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "daily_inventory_matrix": "CREATE TABLE IF NOT EXISTS `daily_inventory_matrix` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `item_id` bigint NOT NULL,\n  `inventory_date` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `available_qty` bigint NOT NULL DEFAULT '1',\n  `booked_qty` bigint DEFAULT '0',\n  `rate_override` double DEFAULT NULL,\n  `min_stay_nights` bigint DEFAULT '1',\n  `is_closed` bigint DEFAULT '0',\n  `notes` longtext COLLATE utf8mb4_unicode_ci,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "flow_responses": "CREATE TABLE IF NOT EXISTS `flow_responses` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `flow_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `flow_token` longtext COLLATE utf8mb4_unicode_ci,\n  `wa_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `from_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `clean_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `customer_name` longtext COLLATE utf8mb4_unicode_ci,\n  `response_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `parsed_data` longtext COLLATE utf8mb4_unicode_ci,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `sender_phone` longtext COLLATE utf8mb4_unicode_ci,\n  `response_data` longtext COLLATE utf8mb4_unicode_ci,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "flow_tokens": "CREATE TABLE IF NOT EXISTS `flow_tokens` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `token` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `flow_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `meta_flow_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `recipient_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `clean_phone` longtext COLLATE utf8mb4_unicode_ci,\n  `meta_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `context_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `expires_at` datetime DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_chat_sessions": "CREATE TABLE IF NOT EXISTS `hospitality_chat_sessions` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `session_key` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `channel` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WEB',\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `link_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `guest_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `current_step` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'IDLE',\n  `session_data` text COLLATE utf8mb4_unicode_ci,\n  `last_interaction_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `session_key` (`session_key`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_daily_rates": "CREATE TABLE IF NOT EXISTS `hospitality_daily_rates` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `room_type_id` int NOT NULL,\n  `rate_plan_id` int DEFAULT NULL,\n  `rate_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `price` double NOT NULL,\n  `extra_adult_price` double DEFAULT '0',\n  `extra_child_price` double DEFAULT '0',\n  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_facilities": "CREATE TABLE IF NOT EXISTS `hospitality_facilities` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `category` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `icon` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `is_featured` int DEFAULT '0',\n  `is_active` int DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_faqs": "CREATE TABLE IF NOT EXISTS `hospitality_faqs` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `category` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'GENERAL',\n  `question` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `answer` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `display_order` int DEFAULT '0',\n  `is_active` int DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_inventory_blocks": "CREATE TABLE IF NOT EXISTS `hospitality_inventory_blocks` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `room_type_id` int NOT NULL,\n  `start_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `end_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `blocked_qty` int NOT NULL DEFAULT '1',\n  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `status` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_physical_rooms": "CREATE TABLE IF NOT EXISTS `hospitality_physical_rooms` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `room_type_id` int NOT NULL,\n  `room_number` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `floor_or_building` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `operational_status` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'AVAILABLE',\n  `notes` text COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_policies": "CREATE TABLE IF NOT EXISTS `hospitality_policies` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `policy_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `rules_json` text COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_rate_plans": "CREATE TABLE IF NOT EXISTS `hospitality_rate_plans` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `meal_plan` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'EP',\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `cancellation_policy` text COLLATE utf8mb4_unicode_ci,\n  `is_refundable` int DEFAULT '1',\n  `included_services_json` text COLLATE utf8mb4_unicode_ci,\n  `is_active` int DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_room_images": "CREATE TABLE IF NOT EXISTS `hospitality_room_images` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `room_type_id` int NOT NULL,\n  `image_url` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `caption` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `alt_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `is_primary` int DEFAULT '0',\n  `display_order` int DEFAULT '0',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_seasonal_rates": "CREATE TABLE IF NOT EXISTS `hospitality_seasonal_rates` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `room_type_id` int NOT NULL,\n  `rate_plan_id` int DEFAULT NULL,\n  `season_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `start_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `end_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `price` double NOT NULL,\n  `extra_adult_price` double DEFAULT '0',\n  `extra_child_price` double DEFAULT '0',\n  `priority` int DEFAULT '1',\n  `active` int DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "hospitality_tax_rules": "CREATE TABLE IF NOT EXISTS `hospitality_tax_rules` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `property_id` int NOT NULL DEFAULT '1',\n  `tax_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `percentage` double NOT NULL,\n  `min_slab_rate` double DEFAULT '0',\n  `max_slab_rate` double DEFAULT '999999',\n  `is_active` int DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "incoming_webhook_events": "CREATE TABLE IF NOT EXISTS `incoming_webhook_events` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `event_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `event_type` longtext COLLATE utf8mb4_unicode_ci,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'PROCESSED',\n  `error_message` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "merchant_payment_configs": "CREATE TABLE IF NOT EXISTS `merchant_payment_configs` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `upi_vpa` longtext COLLATE utf8mb4_unicode_ci,\n  `upi_payee_name` longtext COLLATE utf8mb4_unicode_ci,\n  `gateway_provider` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'RAZORPAY',\n  `api_key` longtext COLLATE utf8mb4_unicode_ci,\n  `api_secret_encrypted` longtext COLLATE utf8mb4_unicode_ci,\n  `merchant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `webhook_secret` longtext COLLATE utf8mb4_unicode_ci,\n  `is_live_mode` bigint DEFAULT '0',\n  `accept_cod` bigint DEFAULT '1',\n  `auto_capture` bigint DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "merchant_payout_beneficiaries": "CREATE TABLE IF NOT EXISTS `merchant_payout_beneficiaries` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `account_holder_name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `bank_name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `account_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `ifsc_code` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `account_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'CURRENT',\n  `upi_vpa` longtext COLLATE utf8mb4_unicode_ci,\n  `verification_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',\n  `penny_drop_reference` longtext COLLATE utf8mb4_unicode_ci,\n  `registered_legal_name` longtext COLLATE utf8mb4_unicode_ci,\n  `is_primary` bigint DEFAULT '1',\n  `payout_schedule` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'DAILY',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "merchant_payout_ledger": "CREATE TABLE IF NOT EXISTS `merchant_payout_ledger` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `beneficiary_id` bigint NOT NULL,\n  `payout_batch_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `gross_amount` double NOT NULL,\n  `platform_fee` double DEFAULT '0',\n  `tax_on_fee` double DEFAULT '0',\n  `net_payout_amount` double NOT NULL,\n  `currency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',\n  `bank_utr` longtext COLLATE utf8mb4_unicode_ci,\n  `failure_reason` longtext COLLATE utf8mb4_unicode_ci,\n  `dispatched_at` datetime DEFAULT NULL,\n  `settled_at` datetime DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "password_resets": "CREATE TABLE IF NOT EXISTS `password_resets` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `token_hash` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `expires_at` datetime NOT NULL,\n  `used` bigint DEFAULT '0',\n  `ip_address` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "properties": "CREATE TABLE IF NOT EXISTS `properties` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `city` longtext COLLATE utf8mb4_unicode_ci,\n  `timezone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Kolkata',\n  `inventory_mode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'MANUAL',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `property_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'RESORT',\n  `user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `social_links_json` text COLLATE utf8mb4_unicode_ci,\n  `address` text COLLATE utf8mb4_unicode_ci,\n  `district` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `state` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `country` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'India',\n  `postal_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `latitude` double DEFAULT NULL,\n  `longitude` double DEFAULT NULL,\n  `check_in_time` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT '14:00',\n  `check_out_time` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT '11:00',\n  `languages_json` text COLLATE utf8mb4_unicode_ci,\n  `currency` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `logo_url` text COLLATE utf8mb4_unicode_ci,\n  `cover_image_url` text COLLATE utf8mb4_unicode_ci,\n  `primary_image_url` text COLLATE utf8mb4_unicode_ci,\n  `gallery_json` text COLLATE utf8mb4_unicode_ci,\n  `publication_status` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'PUBLISHED',\n  `published_at` datetime DEFAULT NULL,\n  `published_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `version` int DEFAULT '1',\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "quote_items": "CREATE TABLE IF NOT EXISTS `quote_items` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `quote_id` bigint NOT NULL,\n  `room_type_id` bigint DEFAULT NULL,\n  `description` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `quantity` bigint NOT NULL DEFAULT '1',\n  `nights` bigint NOT NULL DEFAULT '1',\n  `unit_rate` double NOT NULL DEFAULT '0',\n  `amount` double NOT NULL DEFAULT '0',\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "quotes": "CREATE TABLE IF NOT EXISTS `quotes` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `enquiry_id` bigint NOT NULL,\n  `quote_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `currency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `subtotal` double NOT NULL DEFAULT '0',\n  `tax_total` double NOT NULL DEFAULT '0',\n  `total` double NOT NULL DEFAULT '0',\n  `valid_until` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',\n  `created_by` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `notes` longtext COLLATE utf8mb4_unicode_ci,\n  `sent_at` datetime DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "room_inventory_daily": "CREATE TABLE IF NOT EXISTS `room_inventory_daily` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `room_type_id` bigint NOT NULL,\n  `inventory_date` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `available_qty` bigint DEFAULT '5',\n  `base_rate` double DEFAULT '3500',\n  `is_closed` bigint DEFAULT '0',\n  `updated_by` longtext COLLATE utf8mb4_unicode_ci,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `total_rooms` int DEFAULT '5',\n  `blocked_qty` int DEFAULT '0',\n  `out_of_service_qty` int DEFAULT '0',\n  `allocated_qty` int DEFAULT '0',\n  `notes` text COLLATE utf8mb4_unicode_ci,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "room_types": "CREATE TABLE IF NOT EXISTS `room_types` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `property_id` bigint NOT NULL DEFAULT '1',\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `max_adults` bigint DEFAULT '2',\n  `max_children` bigint DEFAULT '2',\n  `base_rate` double DEFAULT '3500',\n  `description` longtext COLLATE utf8mb4_unicode_ci,\n  `active` bigint DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `room_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `room_size` double DEFAULT '350',\n  `size_unit` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'sq_ft',\n  `bed_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT '1 King Bed',\n  `bed_count` int DEFAULT '1',\n  `max_occupancy` int DEFAULT '3',\n  `standard_occupancy` int DEFAULT '2',\n  `extra_adult_capacity` int DEFAULT '1',\n  `extra_child_capacity` int DEFAULT '1',\n  `extra_adult_price` double DEFAULT '1200',\n  `extra_child_price` double DEFAULT '600',\n  `bathroom_count` int DEFAULT '1',\n  `view_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'Garden View',\n  `smoking_policy` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'NON_SMOKING',\n  `accessibility_info` text COLLATE utf8mb4_unicode_ci,\n  `amenities_json` text COLLATE utf8mb4_unicode_ci,\n  `primary_image_url` text COLLATE utf8mb4_unicode_ci,\n  `status` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "settings": "CREATE TABLE IF NOT EXISTS `settings` (\n  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `value` longtext COLLATE utf8mb4_unicode_ci,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`key`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "templates": "CREATE TABLE IF NOT EXISTS `templates` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `meta_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `language` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en',\n  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'MARKETING',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'APPROVED',\n  `parameter_format` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'POSITIONAL',\n  `body_text` longtext COLLATE utf8mb4_unicode_ci,\n  `variables` longtext COLLATE utf8mb4_unicode_ci,\n  `components` longtext COLLATE utf8mb4_unicode_ci,\n  `buttons` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `header_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'NONE',\n  `header_text` longtext COLLATE utf8mb4_unicode_ci,\n  `header_media_url` longtext COLLATE utf8mb4_unicode_ci,\n  `footer_text` longtext COLLATE utf8mb4_unicode_ci,\n  `rejection_reason` longtext COLLATE utf8mb4_unicode_ci,\n  `version` bigint DEFAULT '1',\n  `submitted_at` datetime DEFAULT NULL,\n  `approved_at` datetime DEFAULT NULL,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `tenant_id` bigint DEFAULT '1',\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "tenants": "CREATE TABLE IF NOT EXISTS `tenants` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `timezone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Kolkata',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "unified_order_items": "CREATE TABLE IF NOT EXISTS `unified_order_items` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `order_id` bigint NOT NULL,\n  `item_id` bigint NOT NULL,\n  `variant_id` bigint DEFAULT NULL,\n  `item_title` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `variant_title` longtext COLLATE utf8mb4_unicode_ci,\n  `quantity` bigint NOT NULL DEFAULT '1',\n  `unit_price` double NOT NULL,\n  `tax_amount` double DEFAULT '0',\n  `total_price` double NOT NULL,\n  `special_instructions` longtext COLLATE utf8mb4_unicode_ci,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "unified_orders": "CREATE TABLE IF NOT EXISTS `unified_orders` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `entity_id` bigint NOT NULL,\n  `order_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `domain` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `customer_name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `customer_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `customer_email` longtext COLLATE utf8mb4_unicode_ci,\n  `source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'CHAT_LINK',\n  `link_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `check_in_date` longtext COLLATE utf8mb4_unicode_ci,\n  `check_out_date` longtext COLLATE utf8mb4_unicode_ci,\n  `table_number` longtext COLLATE utf8mb4_unicode_ci,\n  `appointment_slot` longtext COLLATE utf8mb4_unicode_ci,\n  `shipping_address_json` longtext COLLATE utf8mb4_unicode_ci,\n  `subtotal` double NOT NULL DEFAULT '0',\n  `tax_total` double NOT NULL DEFAULT '0',\n  `discount_total` double DEFAULT '0',\n  `grand_total` double NOT NULL DEFAULT '0',\n  `currency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `order_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',\n  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'UNPAID',\n  `payment_method` longtext COLLATE utf8mb4_unicode_ci,\n  `payment_reference` longtext COLLATE utf8mb4_unicode_ci,\n  `notes` longtext COLLATE utf8mb4_unicode_ci,\n  `metadata_json` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '{}',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "users": "CREATE TABLE IF NOT EXISTS `users` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `password_hash` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `role` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'USER',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',\n  `assigned_phone_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `last_login_at` datetime DEFAULT NULL,\n  `tenant_id` bigint DEFAULT '1',\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "waba_phone_numbers": "CREATE TABLE IF NOT EXISTS `waba_phone_numbers` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `display_name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `phone_number` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `phone_number_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `waba_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `quality_rating` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'GREEN',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'VERIFIED',\n  `is_default` bigint DEFAULT '0',\n  `registered_by` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `access_token` longtext COLLATE utf8mb4_unicode_ci,\n  `token_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'PERMANENT',\n  `last_verified_at` datetime DEFAULT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "whatsapp_flows": "CREATE TABLE IF NOT EXISTS `whatsapp_flows` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` longtext COLLATE utf8mb4_unicode_ci,\n  `meta_flow_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',\n  `categories` text COLLATE utf8mb4_unicode_ci,\n  `flow_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `json_version` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '3.1',\n  `data_api_version` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '3.0',\n  `endpoint_uri` longtext COLLATE utf8mb4_unicode_ci,\n  `preview_url` longtext COLLATE utf8mb4_unicode_ci,\n  `validation_errors` longtext COLLATE utf8mb4_unicode_ci,\n  `sync_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'LOCAL',\n  `last_sync_at` datetime DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "whatsapp_messages": "CREATE TABLE IF NOT EXISTS `whatsapp_messages` (\n  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tenant_id` bigint DEFAULT '1',\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone_number_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `recipient_phone` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `direction` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'OUTBOUND',\n  `message_type` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `template_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `template_name` longtext COLLATE utf8mb4_unicode_ci,\n  `template_category` longtext COLLATE utf8mb4_unicode_ci,\n  `message_body` longtext COLLATE utf8mb4_unicode_ci,\n  `components_json` longtext COLLATE utf8mb4_unicode_ci,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'SENT',\n  `meta_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `error_code` longtext COLLATE utf8mb4_unicode_ci,\n  `error_message` longtext COLLATE utf8mb4_unicode_ci,\n  `estimated_cost` double DEFAULT '0',\n  `currency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `delivered_at` datetime DEFAULT NULL,\n  `read_at` datetime DEFAULT NULL,\n  `failed_at` datetime DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  KEY `idx_wa_messages_meta_id` (`meta_message_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "whatsapp_usage_ledger": "CREATE TABLE IF NOT EXISTS `whatsapp_usage_ledger` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint DEFAULT '1',\n  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `phone_number_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `meta_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `recipient_phone` longtext COLLATE utf8mb4_unicode_ci,\n  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'MARKETING',\n  `unit_cost` double DEFAULT '0',\n  `currency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',\n  `billing_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'ESTIMATED',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "conversation_flows": "CREATE TABLE IF NOT EXISTS `conversation_flows` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `uuid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `property_id` bigint DEFAULT NULL,\n  `phone_number_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `category` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'HOSPITALITY_ENQUIRY',\n  `trigger_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'KEYWORD_MATCH',\n  `trigger_keywords_json` text COLLATE utf8mb4_unicode_ci,\n  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',\n  `published_version_id` bigint DEFAULT NULL,\n  `current_draft_version_id` bigint DEFAULT NULL,\n  `is_default` tinyint NOT NULL DEFAULT '0',\n  `priority` int NOT NULL DEFAULT '10',\n  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_flows_uuid` (`uuid`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "conversation_flow_versions": "CREATE TABLE IF NOT EXISTS `conversation_flow_versions` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `flow_id` bigint NOT NULL,\n  `version_number` int NOT NULL,\n  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',\n  `nodes_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `transitions_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `variables_json` longtext COLLATE utf8mb4_unicode_ci,\n  `validation_report_json` longtext COLLATE utf8mb4_unicode_ci,\n  `changelog` text COLLATE utf8mb4_unicode_ci,\n  `published_at` datetime DEFAULT NULL,\n  `published_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_flow_version` (`flow_id`, `version_number`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "conversation_flow_templates": "CREATE TABLE IF NOT EXISTS `conversation_flow_templates` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `slug` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `industry` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'HOSPITALITY',\n  `category` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BOOKING',\n  `nodes_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `transitions_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `variables_json` longtext COLLATE utf8mb4_unicode_ci,\n  `is_system` tinyint NOT NULL DEFAULT '1',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_flow_template_slug` (`slug`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "conversation_flow_sessions": "CREATE TABLE IF NOT EXISTS `conversation_flow_sessions` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `session_key` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `property_id` bigint DEFAULT '1',\n  `channel` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WHATSAPP',\n  `sender_phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `flow_id` bigint NOT NULL,\n  `flow_version_id` bigint NOT NULL,\n  `current_node_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `session_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',\n  `collected_data_json` longtext COLLATE utf8mb4_unicode_ci,\n  `last_interaction_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `expires_at` datetime DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_flow_session_key` (`session_key`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "conversation_flow_events": "CREATE TABLE IF NOT EXISTS `conversation_flow_events` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `session_id` bigint NOT NULL,\n  `flow_id` bigint NOT NULL,\n  `flow_version_id` bigint NOT NULL,\n  `node_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `node_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `event_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `payload_json` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_flow_events_session` (`session_id`),\n  KEY `idx_flow_events_flow` (`flow_id`, `created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "flow_message_templates": "CREATE TABLE IF NOT EXISTS `flow_message_templates` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `property_id` bigint DEFAULT NULL,\n  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `category` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CONVERSATION',\n  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `variables_json` text COLLATE utf8mb4_unicode_ci,\n  `buttons_json` text COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_flow_msg_tpl_code` (`tenant_id`, `code`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "crm_pipelines": "CREATE TABLE IF NOT EXISTS `crm_pipelines` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `slug` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `industry_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `stages_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `custom_fields_schema` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `active_status` tinyint(1) DEFAULT '1',\n  `delete_status` tinyint(1) DEFAULT '0',\n  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_crm_pipelines_tenant` (`tenant_id`, `delete_status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "crm_records": "CREATE TABLE IF NOT EXISTS `crm_records` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `pipeline_id` bigint NOT NULL,\n  `contact_phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `contact_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `contact_email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `stage_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `lead_score` int DEFAULT '0',\n  `deal_value` double DEFAULT '0',\n  `tags_json` longtext COLLATE utf8mb4_unicode_ci,\n  `assigned_user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `custom_attributes` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `source_flow_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `source_session_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `active_status` tinyint(1) DEFAULT '1',\n  `delete_status` tinyint(1) DEFAULT '0',\n  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_crm_records_tenant_pipeline_stage` (`tenant_id`, `pipeline_id`, `stage_key`),\n  KEY `idx_crm_records_tenant_phone` (`tenant_id`, `contact_phone`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "workflow_triggers": "CREATE TABLE IF NOT EXISTS `workflow_triggers` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `phone_number_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `flow_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `trigger_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `trigger_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `match_config_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `secret_token` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `priority` int DEFAULT '100',\n  `active_status` tinyint(1) DEFAULT '1',\n  `delete_status` tinyint(1) DEFAULT '0',\n  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `uniq_workflow_triggers_key` (`trigger_key`),\n  KEY `idx_workflow_triggers_lookup` (`tenant_id`, `trigger_type`, `active_status`, `delete_status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "workflow_scheduled_jobs": "CREATE TABLE IF NOT EXISTS `workflow_scheduled_jobs` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` int NOT NULL DEFAULT '1',\n  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `flow_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `resume_node_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `resume_handle` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT 'default',\n  `job_type` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'DELAY_RESUME',\n  `cancel_on_reply` tinyint(1) DEFAULT '1',\n  `run_at` datetime NOT NULL,\n  `status` varchar(24) COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',\n  `attempts` int DEFAULT '0',\n  `last_error` longtext COLLATE utf8mb4_unicode_ci,\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_workflow_jobs_status_run` (`status`, `run_at`),\n  KEY `idx_workflow_jobs_session` (`session_id`, `status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "inapp_experiences": "CREATE TABLE IF NOT EXISTS `inapp_experiences` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `slug` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `domain_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CUSTOM',\n  `business_entity_id` bigint DEFAULT NULL,\n  `crm_pipeline_id` bigint DEFAULT NULL,\n  `assigned_phone_number_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `entry_screen_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'welcome',\n  `theme_json` longtext COLLATE utf8mb4_unicode_ci,\n  `features_json` longtext COLLATE utf8mb4_unicode_ci,\n  `business_hours_json` longtext COLLATE utf8mb4_unicode_ci,\n  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',\n  `active_status` tinyint(1) NOT NULL DEFAULT '1',\n  `delete_status` tinyint(1) NOT NULL DEFAULT '0',\n  `created_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `updated_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_inapp_exp_slug` (`slug`),\n  KEY `idx_inapp_exp_tenant` (`tenant_id`, `delete_status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "inapp_screens": "CREATE TABLE IF NOT EXISTS `inapp_screens` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `experience_id` bigint NOT NULL,\n  `screen_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `subtitle` text COLLATE utf8mb4_unicode_ci,\n  `screen_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `config_json` longtext COLLATE utf8mb4_unicode_ci,\n  `navigation_rules_json` longtext COLLATE utf8mb4_unicode_ci,\n  `display_order` int NOT NULL DEFAULT '0',\n  `active_status` tinyint(1) NOT NULL DEFAULT '1',\n  `delete_status` tinyint(1) NOT NULL DEFAULT '0',\n  `created_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `updated_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_inapp_screen_key` (`experience_id`, `screen_key`),\n  KEY `idx_inapp_screen_tenant` (`tenant_id`, `experience_id`, `delete_status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "inapp_form_fields": "CREATE TABLE IF NOT EXISTS `inapp_form_fields` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `screen_id` bigint NOT NULL,\n  `field_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `placeholder` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',\n  `input_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `options_json` longtext COLLATE utf8mb4_unicode_ci,\n  `validation_rules_json` longtext COLLATE utf8mb4_unicode_ci,\n  `crm_field_mapping` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `display_order` int NOT NULL DEFAULT '0',\n  `active_status` tinyint(1) NOT NULL DEFAULT '1',\n  `delete_status` tinyint(1) NOT NULL DEFAULT '0',\n  `created_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `updated_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_inapp_field_key` (`screen_id`, `field_key`),\n  KEY `idx_inapp_field_tenant` (`tenant_id`, `screen_id`, `delete_status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "inapp_sessions": "CREATE TABLE IF NOT EXISTS `inapp_sessions` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `experience_id` bigint NOT NULL,\n  `session_token` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `visitor_phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `visitor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `visitor_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `current_screen_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'welcome',\n  `navigation_stack_json` longtext COLLATE utf8mb4_unicode_ci,\n  `state_data_json` longtext COLLATE utf8mb4_unicode_ci,\n  `crm_record_id` bigint DEFAULT NULL,\n  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',\n  `last_activity_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `expires_at` datetime DEFAULT NULL,\n  `active_status` tinyint(1) NOT NULL DEFAULT '1',\n  `delete_status` tinyint(1) NOT NULL DEFAULT '0',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_inapp_session_token` (`session_token`),\n  KEY `idx_inapp_session_exp` (`tenant_id`, `experience_id`, `status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "inapp_rate_negotiations": "CREATE TABLE IF NOT EXISTS `inapp_rate_negotiations` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `experience_id` bigint NOT NULL,\n  `session_id` bigint DEFAULT NULL,\n  `catalog_item_id` bigint DEFAULT NULL,\n  `item_title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `quantity` int NOT NULL DEFAULT '1',\n  `base_unit_price` decimal(12,2) NOT NULL DEFAULT '0.00',\n  `customer_offer_price` decimal(12,2) NOT NULL DEFAULT '0.00',\n  `agent_counter_price` decimal(12,2) DEFAULT NULL,\n  `approved_final_price` decimal(12,2) DEFAULT NULL,\n  `notes` text COLLATE utf8mb4_unicode_ci,\n  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_AGENT',\n  `assigned_user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `valid_until` datetime DEFAULT NULL,\n  `active_status` tinyint(1) NOT NULL DEFAULT '1',\n  `delete_status` tinyint(1) NOT NULL DEFAULT '0',\n  `created_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `updated_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_inapp_neg_session` (`session_id`),\n  KEY `idx_inapp_neg_exp` (`tenant_id`, `experience_id`, `status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "inapp_call_requests": "CREATE TABLE IF NOT EXISTS `inapp_call_requests` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `tenant_id` bigint NOT NULL DEFAULT '1',\n  `experience_id` bigint NOT NULL,\n  `session_id` bigint DEFAULT NULL,\n  `visitor_phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `visitor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `call_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INSTANT_CALLBACK',\n  `topic` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',\n  `preferred_slot_at` datetime DEFAULT NULL,\n  `sla_deadline_at` datetime DEFAULT NULL,\n  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'QUEUED',\n  `assigned_user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `call_notes` text COLLATE utf8mb4_unicode_ci,\n  `active_status` tinyint(1) NOT NULL DEFAULT '1',\n  `delete_status` tinyint(1) NOT NULL DEFAULT '0',\n  `created_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `updated_by` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT 'system',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_inapp_call_session` (`session_id`),\n  KEY `idx_inapp_call_exp` (`tenant_id`, `experience_id`, `status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
};

const INDEXES = [
  "CREATE INDEX idx_recipients_campaign ON campaign_recipients (campaign_id)",
  "CREATE INDEX idx_recipients_status ON campaign_recipients (campaign_id, status)",
  "CREATE INDEX idx_recipients_meta_msg_id ON campaign_recipients (meta_message_id)",
  "CREATE INDEX idx_recipients_pending_batch ON campaign_recipients (campaign_id, status, id)",
  "CREATE INDEX idx_campaigns_status_scheduled ON campaigns (status, scheduled_at)",
  "CREATE INDEX idx_campaigns_user ON campaigns (user_id)",
  "CREATE INDEX idx_templates_name ON templates (name(191))",
  "CREATE INDEX idx_templates_meta_id ON templates (meta_id(191))",
  "CREATE INDEX idx_templates_category ON templates (category(191))",
  "CREATE INDEX idx_templates_status ON templates (status(191))",
  "CREATE INDEX idx_replies_phone ON customer_replies (from_phone(64))",
  "CREATE INDEX idx_replies_campaign ON customer_replies (campaign_id)",
  "CREATE INDEX idx_replies_received ON customer_replies (received_at)",
  "CREATE INDEX idx_replies_is_read ON customer_replies (is_read)",
  "CREATE INDEX idx_customer_replies_user ON customer_replies (user_id)",
  "CREATE INDEX idx_customer_replies_flow ON customer_replies (flow_id)",
  "CREATE INDEX idx_customer_replies_link ON customer_replies (link_id)",
  "CREATE INDEX idx_replies_context_msg ON customer_replies (context_message_id)",
  "CREATE INDEX idx_users_email ON users (email)",
  "CREATE INDEX idx_users_role ON users (role)",
  "CREATE INDEX idx_waba_phone_id ON waba_phone_numbers (phone_number_id)",
  "CREATE INDEX idx_wa_messages_meta_id ON whatsapp_messages (meta_message_id)",
  "CREATE INDEX idx_wa_messages_recipient ON whatsapp_messages (recipient_phone(64), created_at)",
  "CREATE INDEX idx_wa_messages_campaign ON whatsapp_messages (campaign_id)",
  "CREATE INDEX idx_wa_usage_campaign ON whatsapp_usage_ledger (campaign_id)",
  "CREATE INDEX idx_wa_usage_category ON whatsapp_usage_ledger (category(64), created_at)",
  "CREATE INDEX idx_chat_links_slug ON chat_links (slug)",
  "CREATE INDEX idx_chat_links_tenant ON chat_links (tenant_id, status)",
  "CREATE INDEX idx_chat_links_phone ON chat_links (phone_number(64))",
  "CREATE INDEX idx_auto_booking_user ON automated_booking_dispatches (user_id)",
  "CREATE INDEX idx_contacts_tenant_phone ON contacts (tenant_id, phone_e164(64))",
  "CREATE INDEX idx_room_types_tenant_prop ON room_types (tenant_id, property_id)",
  "CREATE INDEX idx_room_inventory_daily ON room_inventory_daily (room_type_id, inventory_date)",
  "CREATE INDEX idx_enquiries_tenant_status ON booking_enquiries (tenant_id, status, created_at)",
  "CREATE INDEX idx_quotes_enquiry ON quotes (enquiry_id)",
  "CREATE INDEX idx_quote_items_quote ON quote_items (quote_id)",
  "CREATE INDEX idx_entities_tenant_domain ON business_entities (tenant_id, domain(64))",
  "CREATE INDEX idx_entities_slug ON business_entities (slug)",
  "CREATE INDEX idx_cat_entity ON catalog_categories (entity_id)",
  "CREATE INDEX idx_items_entity ON catalog_items (entity_id, item_type(64))",
  "CREATE INDEX idx_items_sku ON catalog_items (sku(64))",
  "CREATE INDEX idx_variants_item ON catalog_item_variants (item_id)",
  "CREATE INDEX idx_inv_date ON daily_inventory_matrix (item_id, inventory_date)",
  "CREATE INDEX idx_inv_entity_date ON daily_inventory_matrix (entity_id, inventory_date)",
  "CREATE INDEX idx_orders_entity ON unified_orders (entity_id, created_at)",
  "CREATE INDEX idx_orders_customer ON unified_orders (customer_phone(64))",
  "CREATE INDEX idx_orders_status ON unified_orders (order_status, payment_status)",
  "CREATE INDEX idx_order_items_order ON unified_order_items (order_id)",
  "CREATE INDEX idx_beneficiaries_entity ON merchant_payout_beneficiaries (entity_id)",
  "CREATE INDEX idx_payout_entity ON merchant_payout_ledger (entity_id, status)",
  "CREATE INDEX idx_flows_user ON whatsapp_flows (user_id)",
  "CREATE INDEX idx_flows_meta_id ON whatsapp_flows (meta_flow_id)",
  "CREATE INDEX idx_flow_tokens_token ON flow_tokens (token(191))",
  "CREATE INDEX idx_flow_tokens_phone ON flow_tokens (clean_phone(64))",
  "CREATE INDEX idx_flow_tokens_flow ON flow_tokens (flow_id)",
  "CREATE INDEX idx_flow_responses_flow ON flow_responses (flow_id)",
  "CREATE INDEX idx_flow_responses_phone ON flow_responses (clean_phone(64))",
  "CREATE INDEX idx_flow_responses_wa_msg ON flow_responses (wa_message_id(191))",
  "CREATE INDEX idx_session_key ON hospitality_chat_sessions (session_key)",
  "CREATE INDEX idx_conv_flows_tenant ON conversation_flows (tenant_id, status)",
  "CREATE INDEX idx_conv_flows_phone_line ON conversation_flows (tenant_id, phone_number_id, status)",
  "CREATE INDEX idx_conv_flows_trigger ON conversation_flows (tenant_id, trigger_type, is_default)",
  "CREATE INDEX idx_workflow_triggers_line ON workflow_triggers (tenant_id, phone_number_id, active_status, delete_status)",
  "CREATE INDEX idx_conv_flow_versions_flow ON conversation_flow_versions (flow_id, version_number)",
  "CREATE INDEX idx_conv_flow_sessions_phone ON conversation_flow_sessions (sender_phone(32), session_status)",
  "CREATE INDEX idx_conv_flow_events_session ON conversation_flow_events (session_id)",
  "CREATE INDEX idx_conv_flow_events_flow ON conversation_flow_events (flow_id, created_at)",
  "CREATE INDEX idx_flow_msg_tpl_tenant ON flow_message_templates (tenant_id, code)",
  "CREATE INDEX idx_inapp_exp_tenant ON inapp_experiences (tenant_id, delete_status)",
  "CREATE INDEX idx_inapp_screen_tenant ON inapp_screens (tenant_id, experience_id, delete_status)",
  "CREATE INDEX idx_inapp_field_tenant ON inapp_form_fields (tenant_id, screen_id, delete_status)",
  "CREATE INDEX idx_inapp_session_exp ON inapp_sessions (tenant_id, experience_id, status)",
  "CREATE INDEX idx_inapp_neg_exp ON inapp_rate_negotiations (tenant_id, experience_id, status)",
  "CREATE INDEX idx_inapp_call_exp ON inapp_call_requests (tenant_id, experience_id, status)"
];

function runColumnMigrations(db) {
  // Ensure waba_phone_numbers has access_token, token_type, last_verified_at
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
  } catch (e) {}

  // Ensure chat_links has custom_fields
  try {
    const clCols = db.prepare("DESCRIBE chat_links").all().map(c => c.Field);
    if (!clCols.includes("custom_fields")) {
      db.exec("ALTER TABLE chat_links ADD COLUMN custom_fields TEXT NULL");
    }
  } catch (e) {}

  // Ensure customer_replies has extra tracking columns
  try {
    const crCols = db.prepare("DESCRIBE customer_replies").all().map(c => c.Field);
    if (!crCols.includes("reply_text")) db.exec("ALTER TABLE customer_replies ADD COLUMN reply_text TEXT NULL");
    if (!crCols.includes("reply_sent_at")) db.exec("ALTER TABLE customer_replies ADD COLUMN reply_sent_at DATETIME NULL");
    if (!crCols.includes("reply_status")) db.exec("ALTER TABLE customer_replies ADD COLUMN reply_status VARCHAR(64) NULL");
    if (!crCols.includes("user_id")) db.exec("ALTER TABLE customer_replies ADD COLUMN user_id VARCHAR(255) NULL");
    if (!crCols.includes("media_url")) db.exec("ALTER TABLE customer_replies ADD COLUMN media_url TEXT NULL");
    if (!crCols.includes("media_type")) db.exec("ALTER TABLE customer_replies ADD COLUMN media_type VARCHAR(64) NULL");
    if (!crCols.includes("media_caption")) db.exec("ALTER TABLE customer_replies ADD COLUMN media_caption TEXT NULL");
    if (!crCols.includes("flow_id")) db.exec("ALTER TABLE customer_replies ADD COLUMN flow_id VARCHAR(255) NULL");
    if (!crCols.includes("flow_response_id")) db.exec("ALTER TABLE customer_replies ADD COLUMN flow_response_id BIGINT NULL");
    if (!crCols.includes("link_id")) db.exec("ALTER TABLE customer_replies ADD COLUMN link_id VARCHAR(255) NULL");
    if (!crCols.includes("source")) db.exec("ALTER TABLE customer_replies ADD COLUMN source VARCHAR(64) DEFAULT 'WHATSAPP'");
  } catch (e) {}

  // Ensure inventory_date is VARCHAR(32) on daily matrix tables for proper indexing
  try {
    db.exec("ALTER TABLE room_inventory_daily MODIFY COLUMN inventory_date VARCHAR(32) NOT NULL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE daily_inventory_matrix MODIFY COLUMN inventory_date VARCHAR(32) NOT NULL");
  } catch (e) {}

  // Ensure whatsapp_flows validation_errors and categories support arbitrary JSON payload sizes
  try {
    db.exec("ALTER TABLE whatsapp_flows MODIFY COLUMN validation_errors LONGTEXT NULL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE whatsapp_flows MODIFY COLUMN categories TEXT NULL");
  } catch (e) {}

  // Ensure conversation_flows and workflow_triggers have phone_number_id for multi-line routing
  try {
    const cfCols = db.prepare("DESCRIBE conversation_flows").all().map(c => c.Field);
    if (!cfCols.includes("phone_number_id")) {
      db.exec("ALTER TABLE conversation_flows ADD COLUMN phone_number_id VARCHAR(64) NULL AFTER property_id");
    }
  } catch (e) {}

  try {
    const wtCols = db.prepare("DESCRIBE workflow_triggers").all().map(c => c.Field);
    if (!wtCols.includes("phone_number_id")) {
      db.exec("ALTER TABLE workflow_triggers ADD COLUMN phone_number_id VARCHAR(64) NULL AFTER tenant_id");
    }
  } catch (e) {}
}

function seedDefaults(db, config) {
  // 1. Settings
  try {
    const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
    const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");

    const defaults = [
      ["WHATSAPP_API_TOKEN", config.WHATSAPP_API_TOKEN || ""],
      ["WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID || ""],
      ["DEFAULT_COUNTRY_CODE", config.DEFAULT_COUNTRY_CODE || "91"],
      ["BROADCAST_DELAY_MS", String(config.BROADCAST_DELAY_MS || 250)],
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
      ["WHATSAPP_FLOWS_ENABLED", "false"]
    ];

    for (const [k, v] of defaults) {
      if (!getSetting.get(k)) {
        setSetting.run(k, v);
      }
    }

    // Sync live Meta credentials from .env if DB has placeholder or short test token
    const dbToken = getSetting.get("WHATSAPP_API_TOKEN")?.value;
    if (config.WHATSAPP_API_TOKEN && config.WHATSAPP_API_TOKEN.length > 50) {
      if (!dbToken || dbToken.length < 50 || dbToken.includes("placeholder") || dbToken.startsWith("EAAX_")) {
        setSetting.run("WHATSAPP_API_TOKEN", config.WHATSAPP_API_TOKEN);
      }
    }

    if (config.WHATSAPP_PHONE_NUMBER_ID) {
      const dbPhoneId = getSetting.get("WHATSAPP_PHONE_NUMBER_ID")?.value;
      if (!dbPhoneId || dbPhoneId === "your_phone_number_id") {
        setSetting.run("WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID);
      }
      try {
        db.prepare("UPDATE waba_phone_numbers SET is_default = 1 WHERE phone_number_id = ?").run(config.WHATSAPP_PHONE_NUMBER_ID);
      } catch (e) {}
    }
  } catch (e) {}

  // 2. Default Meta Templates
  try {
    const templateCount = db.prepare("SELECT COUNT(*) as count FROM templates").get()?.count || 0;
    if (templateCount === 0) {
      const insertTpl = db.prepare(`
        INSERT INTO templates (
          id, name, meta_id, language, category, status, parameter_format,
          body_text, variables, components, buttons
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

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
  } catch (e) {}

  // 3. Default Starter WhatsApp Flows
  try {
    const flowCount = db.prepare("SELECT COUNT(*) as count FROM whatsapp_flows").get()?.count || 0;
    if (flowCount === 0) {
      const primaryAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
      const adminId = primaryAdmin?.id || "system";
      try {
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
      } catch (err) {}
    }

    // Ensure default published hospitality booking flow is present and ready
    try {
      const existingBookingFlow = db.prepare("SELECT id FROM whatsapp_flows WHERE id = 'flow_hospitality_booking' OR name = 'KonkanTrip Stay & Booking Flow'").get();
      if (!existingBookingFlow) {
        const { RESORT_BOOKING_TEMPLATE } = require("../services/flowStarterTemplates");
        db.prepare(`
          INSERT INTO whatsapp_flows (
            id, user_id, name, description, meta_flow_id, status, categories,
            flow_json, json_version, data_api_version, sync_status, created_at, updated_at
          ) VALUES (
            'flow_hospitality_booking',
            'system',
            'KonkanTrip Stay & Booking Flow',
            'Capture guest stay dates, party size, room preference, and contact details with instant quotation eligibility.',
            '887766554433221',
            'PUBLISHED',
            '["LEAD_GENERATION", "APPOINTMENT_BOOKING"]',
            ?,
            '3.1',
            '3.0',
            'SYNCED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(JSON.stringify(RESORT_BOOKING_TEMPLATE.flow_json));
      }
    } catch (bookingFlowErr) {}
  } catch (e) {}

  // 4. Default Tenant & Property
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
        INSERT INTO properties (
          id, tenant_id, name, city, timezone, inventory_mode, status,
          description, property_type, phone, email, website, address,
          district, state, postal_code, publication_status, created_at
        ) VALUES (
          1, 1, 'KonkanTrip Beach Resort & Spa', 'Alibaug, Maharashtra', 'Asia/Kolkata', 'MANUAL', 'ACTIVE',
          'Premier seaside resort offering private pool villas, coconut cottages, authentic coastal dining, and direct beach access.',
          'RESORT', '919307382030', 'reservations@konkantrip.com', 'https://konkantrip.com', 'Nagaon Beach Road, Alibaug',
          'Raigad', 'Maharashtra', '402204', 'PUBLISHED', CURRENT_TIMESTAMP
        )
      `).run();
    }
  } catch (e) {}

  // 5. Default Room Types & 30-Day Inventory
  try {
    const roomCount = db.prepare("SELECT COUNT(*) as count FROM room_types").get()?.count || 0;
    if (roomCount === 0) {
      const insertRoom = db.prepare(`
        INSERT INTO room_types (
          id, tenant_id, property_id, name, room_code, room_size, bed_type,
          max_adults, max_children, max_occupancy, standard_occupancy,
          base_rate, view_type, description, active
        ) VALUES (?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      insertRoom.run(1, "Deluxe Sea View Room", "DLX-VIL", 480, "1 King Bed", 2, 1, 3, 2, 4500.00, "Sea View", "King-sized bed with ocean view private balcony & breakfast");
      insertRoom.run(2, "Luxury Coconut Cottage", "COT-GRD", 380, "1 Queen Bed", 3, 2, 3, 2, 6500.00, "Garden View", "Spacious detached garden cottage with patio and open-air rain shower");
      insertRoom.run(3, "Family Ocean Suite", "PREM-VIL", 620, "1 King Bed + 1 Daybed", 4, 2, 4, 2, 8500.00, "Ocean Front", "Two-bedroom inter-connected suite with panoramic sea terrace");

      const insertInv = db.prepare(`
        INSERT IGNORE INTO room_inventory_daily (tenant_id, room_type_id, inventory_date, available_qty, base_rate, is_closed)
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
  } catch (e) {}

  // 6. Default Chat Links
  try {
    const linkCount = db.prepare("SELECT COUNT(*) as count FROM chat_links").get()?.count || 0;
    if (linkCount === 0) {
      let defaultPhone = "918766590634";
      let defaultPhoneId = "1510764325447375";
      try {
        const ph = db.prepare("SELECT phone_number, phone_number_id FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1").get();
        if (ph) {
          defaultPhone = ph.phone_number;
          defaultPhoneId = ph.phone_number_id;
        }
      } catch (e) {}

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
  } catch (e) {}

  // 7. Multi-Industry Business Entities & Catalog Items
  try {
    const entityCount = db.prepare("SELECT COUNT(*) as count FROM business_entities").get()?.count || 0;
    if (entityCount === 0) {
      const insertEntity = db.prepare(`
        INSERT INTO business_entities (
          id, tenant_id, domain, name, legal_name, slug, tagline, description,
          phone_e164, email, city, state, currency, timezone, tax_identifier,
          opening_time, closing_time, checkin_time, checkout_time, status
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'Asia/Kolkata', ?, ?, ?, ?, ?, 'ACTIVE')
      `);

      insertEntity.run(
        1, 'HOSPITALITY', 'KonkanTrip Beach Resort & Spa', 'KonkanTrip Hospitality LLP', 'konkantrip-resort',
        'Boutique Beachfront Stays & Ocean Villas', 'Luxury beachfront villas and cottages with direct access to Alibaug beach.',
        '919307382030', 'reservations@konkantrip.com', 'Alibaug', 'Maharashtra', '27AAACK1234M1Z5',
        '07:00', '23:00', '14:00', '11:00'
      );

      insertEntity.run(
        2, 'DINING', 'Konkan Wave Cafe & Beach Bar', 'KonkanTrip Hospitality LLP', 'konkan-wave-cafe',
        'Authentic Malvani Flavours, Wood-fired Pizza & Sunset Cocktails', 'Open-air seaside dining with fresh local seafood, artisanal pizzas and barista coffee.',
        '919307382030', 'dining@konkantrip.com', 'Alibaug', 'Maharashtra', '27AAACK1234M1Z5',
        '08:00', '23:30', null, null
      );

      const insertCat = db.prepare(`
        INSERT INTO catalog_categories (id, tenant_id, entity_id, name, slug, description, sort_order)
        VALUES (?, 1, ?, ?, ?, ?, ?)
      `);
      insertCat.run(1, 1, 'Luxury Sea Villas', 'luxury-sea-villas', 'Oceanfront detached villas with private terrace', 1);
      insertCat.run(2, 1, 'Garden Cottages', 'garden-cottages', 'Quiet cottages surrounded by coconut groves', 2);
      insertCat.run(3, 2, 'Fresh Catch Seafood', 'fresh-catch', 'Locally caught fish and crab prepared Malvani style', 1);
      insertCat.run(4, 2, 'Wood-Fired Pizza & Pasta', 'wood-fired-pizza', 'Hand-stretched sourdough pizzas', 2);
      insertCat.run(5, 2, 'Beverages & Coolers', 'beverages-coolers', 'Solkadhi, fresh juices and specialty coffee', 3);

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

      const insertFood = db.prepare(`
        INSERT INTO catalog_items (
          id, tenant_id, entity_id, category_id, item_type, title, slug, sku,
          short_description, base_price, tax_rate, dietary_flag, spice_level,
          prep_time_minutes, is_sold_out_today, is_active, sort_order
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      insertFood.run(4, 2, 3, 'FOOD', 'Authentic Surmai Fish Thali', 'surmai-fish-thali', 'DISH-SURMAI-01', 'Fresh Kingfish fry, Malvani curry, 2 bhakris, tisrya masala & solkadhi', 480.0, 5.0, 'NON_VEG', 2, 20, 0, 1);
      insertFood.run(5, 2, 3, 'FOOD', 'Butter Garlic Prawns (Tawa)', 'butter-garlic-prawns', 'DISH-PRAWN-02', 'Jumbo Arabian sea prawns tossed in golden garlic and compound butter', 420.0, 5.0, 'NON_VEG', 1, 15, 0, 2);
      insertFood.run(6, 2, 4, 'FOOD', 'Artisanal Margherita Pizza (12")', 'margherita-pizza', 'DISH-PIZZA-01', 'San Marzano tomato sauce, fresh buffalo mozzarella, fresh basil', 380.0, 5.0, 'VEG', 0, 12, 0, 3);
      insertFood.run(7, 2, 5, 'FOOD', 'Chilled Kokum Solkadhi Cooler', 'kokum-solkadhi', 'BEV-SOLKADHI-01', 'Hand-extracted coconut milk with kokum, garlic, and fresh green chili', 110.0, 5.0, 'VEGAN', 1, 5, 0, 4);

      const insertMatrix = db.prepare(`
        INSERT IGNORE INTO daily_inventory_matrix (
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
        insertMatrix.run(1, dateStr, 4, 8500.0);
        insertMatrix.run(2, dateStr, 2, 12500.0);
        insertMatrix.run(3, dateStr, 6, 5200.0);
      }
    }
  } catch (e) {}

  // 8. Hospitality Metadata (Rate Plans, Tax Rules, Facilities, Policies, FAQs)
  try {
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

    const taxCount = Number(db.prepare("SELECT COUNT(*) as count FROM hospitality_tax_rules").get()?.count || 0);
    if (taxCount === 0) {
      const insertTax = db.prepare(`
        INSERT INTO hospitality_tax_rules (tenant_id, property_id, tax_name, percentage, min_slab_rate, max_slab_rate, is_active)
        VALUES (1, 1, ?, ?, ?, ?, 1)
      `);
      insertTax.run('GST 12%', 12.0, 0, 7500);
      insertTax.run('GST 18%', 18.0, 7501, 999999);
    }

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
  } catch (e) {}

  // 9. Assign unassigned records to primary administrator
  try {
    const primaryAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
    if (primaryAdmin && primaryAdmin.id) {
      const adminId = primaryAdmin.id;
      db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
      db.prepare("UPDATE automated_booking_contacts SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(adminId);
    }
  } catch (e) {}

  // 10. Conversation Flow & Automation Studio Seeds
  try {
    const { seedFlowsAndTemplates } = require('../services/conversationFlowSeeds');
    seedFlowsAndTemplates(db);
  } catch (flowSeedErr) {
    console.warn("[Database] Notice on seeding conversation flow templates:", flowSeedErr.message);
  }

  // 11. Seed Default Dynamic CRM Pipelines
  try {
    const pipelineCount = db.prepare("SELECT COUNT(*) as count FROM crm_pipelines WHERE tenant_id = 1 AND delete_status = 0").get()?.count || 0;
    if (pipelineCount === 0) {
      const insertPipeline = db.prepare(`
        INSERT INTO crm_pipelines (
          tenant_id, name, slug, industry_type, stages_json, custom_fields_schema, active_status, delete_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      // 1. B2B Sales Pipeline
      insertPipeline.run(
        1,
        "B2B Sales Pipeline",
        "b2b-sales-pipeline",
        "B2B_SALES",
        JSON.stringify([
          { key: "NEW_LEAD", label: "New Lead", color: "#3B82F6", order: 1 },
          { key: "MQL", label: "Marketing Qualified (MQL)", color: "#8B5CF6", order: 2 },
          { key: "SQL", label: "Sales Qualified (SQL)", color: "#6366F1", order: 3 },
          { key: "DEMO_BOOKED", label: "Demo Booked", color: "#F59E0B", order: 4 },
          { key: "PROPOSAL_SENT", label: "Proposal Sent", color: "#EC4899", order: 5 },
          { key: "WON", label: "Closed Won", color: "#10B981", order: 6 },
          { key: "LOST", label: "Closed Lost", color: "#EF4444", order: 7 }
        ]),
        JSON.stringify([
          { key: "company_name", label: "Company Name", type: "TEXT", required: true },
          { key: "team_size", label: "Team Size", type: "TEXT" },
          { key: "monthly_budget", label: "Monthly Budget (₹)", type: "NUMBER" },
          { key: "decision_maker", label: "Decision Maker", type: "TEXT" },
          { key: "demo_slot", label: "Demo Slot", type: "DATETIME" }
        ])
      );

      // 2. Lead Generation Pipeline
      insertPipeline.run(
        1,
        "Lead Generation Pipeline",
        "lead-generation-pipeline",
        "LEAD_GEN",
        JSON.stringify([
          { key: "NEW", label: "New Prospect", color: "#3B82F6", order: 1 },
          { key: "ENGAGED", label: "Engaged in Chat", color: "#06B6D4", order: 2 },
          { key: "QUALIFIED", label: "Qualified Lead", color: "#10B981", order: 3 },
          { key: "NURTURING", label: "Nurturing Drip", color: "#8B5CF6", order: 4 },
          { key: "CONVERTED", label: "Converted Customer", color: "#059669", order: 5 },
          { key: "UNQUALIFIED", label: "Unqualified / Disqualified", color: "#6B7280", order: 6 }
        ]),
        JSON.stringify([
          { key: "city", label: "City", type: "TEXT" },
          { key: "service_interest", label: "Service Interest", type: "TEXT" },
          { key: "timeline", label: "Timeline", type: "TEXT" },
          { key: "ad_source", label: "Ad / Campaign Source", type: "TEXT" },
          { key: "lead_notes", label: "Lead Notes", type: "TEXTAREA" }
        ])
      );

      // 3. Universal Booking Pipeline
      insertPipeline.run(
        1,
        "Universal Booking Pipeline",
        "universal-booking-pipeline",
        "BOOKING",
        JSON.stringify([
          { key: "INQUIRY", label: "Booking Inquiry", color: "#3B82F6", order: 1 },
          { key: "AVAILABILITY_CHECKED", label: "Availability Checked", color: "#06B6D4", order: 2 },
          { key: "QUOTED", label: "Quotation Sent", color: "#F59E0B", order: 3 },
          { key: "PAYMENT_PENDING", label: "Payment Pending", color: "#EC4899", order: 4 },
          { key: "CONFIRMED", label: "Booking Confirmed", color: "#10B981", order: 5 },
          { key: "COMPLETED", label: "Stay/Service Completed", color: "#059669", order: 6 },
          { key: "CANCELLED", label: "Cancelled", color: "#EF4444", order: 7 }
        ]),
        JSON.stringify([
          { key: "entity_id", label: "Property / Business Entity ID", type: "NUMBER" },
          { key: "catalog_item_id", label: "Room / Service Item ID", type: "NUMBER" },
          { key: "booking_date", label: "Check-in / Booking Date", type: "DATE" },
          { key: "checkout_date", label: "Check-out Date", type: "DATE" },
          { key: "guest_or_slot_count", label: "Guests / Slots", type: "NUMBER" },
          { key: "quote_total", label: "Estimated Quote Total", type: "NUMBER" }
        ])
      );
    }
  } catch (crmErr) {
    console.warn("[Database] Notice on seeding CRM pipelines:", crmErr.message);
  }
}

function initSchema(db, config) {
  try {
    // 1. Temporarily disable foreign key checks during batch table creation
    try { db.exec("SET FOREIGN_KEY_CHECKS = 0;"); } catch (e) {}

    // 2. Create all 49 tables if not exist
    const tableNames = Object.keys(TABLE_SCHEMAS);
    for (const tbl of tableNames) {
      try {
        db.exec(TABLE_SCHEMAS[tbl]);
      } catch (err) {
        console.warn(`[Database] Notice on creating table ${tbl}:`, err.message);
      }
    }

    try { db.exec("SET FOREIGN_KEY_CHECKS = 1;"); } catch (e) {}

    // 3. Create performance and unique indexes
    for (const idxSql of INDEXES) {
      try {
        db.exec(idxSql);
      } catch (err) {
        // Ignored if duplicate index or already exists
      }
    }

    // 4. Run incremental column migrations
    runColumnMigrations(db);

    // 5. Seed initial defaults & metadata
    seedDefaults(db, config);

    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
    if (userCount === 0) {
      console.log("[Security] Platform initialized with 0 users. First user to register will be designated Master Administrator.");
    }

    console.log(`[Database] Schema validation complete: ${tableNames.length} tables verified & ready.`);
  } catch (fatalErr) {
    console.error("[Database] Critical error initializing schema:", fatalErr.message);
    throw fatalErr;
  }
}

module.exports = {
  TABLE_SCHEMAS,
  INDEXES,
  runColumnMigrations,
  seedDefaults,
  initSchema
};
