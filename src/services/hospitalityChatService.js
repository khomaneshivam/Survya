const { db, getSetting } = require("../config/database");
const configService = require("./hospitalityConfigService");
const availabilityService = require("./hospitalityAvailabilityService");
const pricingService = require("./hospitalityPricingService");

/**
 * -------------------------------------------------------------------------
 * SARVYA HOSPITALITY DETERMINISTIC CHAT & MESSAGING ENGINE
 *
 * Implements 12 controlled actions with deterministic responses.
 * Enforces INFORMATION-ONLY constraint:
 *   - NEVER confirm bookings
 *   - NEVER hold/reserve inventory
 *   - NEVER take payments
 *   - All quotes explicitly marked "Estimated Price Quote (Subject to Staff Confirmation)"
 * -------------------------------------------------------------------------
 */

/**
 * 1. search_properties
 */
function searchProperties({ query = "", destination = "", type = "", tenantId = null }) {
  let sql = `
    SELECT id, tenant_id, name, property_type, district, state, address, primary_image_url, cover_image_url, currency
    FROM properties
    WHERE publication_status = 'PUBLISHED' AND COALESCE(delete_status, 0) = 0
  `;
  const params = [];
  if (tenantId) {
    sql += ` AND tenant_id = ?`;
    params.push(Number(tenantId));
  }

  if (query) {
    sql += ` AND (name LIKE ? OR description LIKE ? OR address LIKE ? OR district LIKE ?)`;
    const qStr = `%${query}%`;
    params.push(qStr, qStr, qStr, qStr);
  }
  if (destination) {
    sql += ` AND (district LIKE ? OR state LIKE ? OR address LIKE ?)`;
    const dStr = `%${destination}%`;
    params.push(dStr, dStr, dStr);
  }
  if (type) {
    sql += ` AND property_type = ?`;
    params.push(type);
  }

  sql += ` ORDER BY id ASC LIMIT 10`;
  const properties = db.prepare(sql).all(...params);

  // Build WhatsApp text
  let waText = `🏨 *Found ${properties.length} Available Property(ies)*\n\n`;
  properties.forEach((p, idx) => {
    waText += `*${idx + 1}. ${p.name}* (${p.property_type || "Resort"})\n`;
    waText += `📍 ${p.district || ""}${p.district && p.state ? ", " : ""}${p.state || ""}\n`;
    waText += `_Reply with property number or name for room options and rates._\n\n`;
  });

  return {
    action: "search_properties",
    count: properties.length,
    properties,
    whatsapp_text: waText.trim(),
    web_cards: properties.map(p => ({
      type: "property_summary",
      property_id: p.id,
      title: p.name,
      subtitle: `${p.district || ""}, ${p.state || ""}`,
      image_url: p.primary_image_url || p.cover_image_url,
      badges: [p.property_type || "Resort"]
    }))
  };
}

/**
 * 2. get_property_details
 */
function getPropertyDetails({ propertyId = 1, tenantId = 1 }) {
  const prop = configService.getPublishedProperty(propertyId, tenantId);
  if (!prop) {
    return {
      action: "get_property_details",
      found: false,
      whatsapp_text: "⚠️ Sorry, details for this property are currently unavailable or under review."
    };
  }

  const facilities = configService.listFacilities(propertyId, tenantId).filter(f => f.is_active);

  let waText = `🌴 *${prop.name}*\n`;
  if (prop.description) waText += `${prop.description}\n\n`;
  waText += `📍 *Location*: ${prop.address || ""}, ${prop.district || ""}, ${prop.state || ""} ${prop.postal_code || ""}\n`;
  waText += `⏰ *Check-In*: ${prop.check_in_time || "14:00"} | *Check-Out*: ${prop.check_out_time || "11:00"}\n`;
  if (prop.phone) waText += `📞 *Reservations*: ${prop.phone}\n`;
  if (prop.email) waText += `✉️ *Email*: ${prop.email}\n`;
  if (facilities.length > 0) {
    waText += `\n✨ *Key Facilities*: ${facilities.slice(0, 6).map(f => f.name).join(", ")}\n`;
  }
  waText += `\n_Ask for "rooms", "amenities", "policies", or provide dates for availability and price estimates._`;

  return {
    action: "get_property_details",
    found: true,
    property: prop,
    whatsapp_text: waText,
    web_cards: [{
      type: "property_detail",
      property_id: prop.id,
      name: prop.name,
      description: prop.description,
      address: `${prop.address || ""}, ${prop.district || ""}`,
      check_in: prop.check_in_time,
      check_out: prop.check_out_time,
      primary_image_url: prop.primary_image_url || prop.cover_image_url,
      facilities: facilities.map(f => f.name)
    }]
  };
}

/**
 * 3. get_room_categories
 */
function getRoomCategories({ propertyId = 1, tenantId = 1 }) {
  const categories = configService.listRoomCategories(propertyId, tenantId).filter(c => c.active && c.status === "ACTIVE");
  const prop = configService.getPublishedProperty(propertyId, tenantId);

  let waText = `🛏️ *Available Room Categories at ${prop ? prop.name : "Our Property"}*\n\n`;

  categories.forEach((cat, idx) => {
    waText += `*${idx + 1}. ${cat.name}*\n`;
    waText += `• 📐 Size: ${cat.room_size} ${cat.size_unit} | 🛏️ Bed: ${cat.bed_type}\n`;
    waText += `• 👥 Standard: ${cat.standard_occupancy} Guests (Max: ${cat.max_occupancy})\n`;
    waText += `• 💰 Base Rate: ₹${Number(cat.base_rate).toLocaleString("en-IN")}/night + taxes\n`;
    if (cat.view_type) waText += `• 🌅 View: ${cat.view_type}\n`;
    waText += `\n`;
  });
  waText += `_Reply with a room name or specify dates to check real-time availability and an itemized price estimate._`;

  return {
    action: "get_room_categories",
    count: categories.length,
    categories,
    whatsapp_text: waText.trim(),
    web_cards: categories.map(cat => ({
      type: "room_category_card",
      room_type_id: cat.id,
      name: cat.name,
      size: `${cat.room_size} ${cat.size_unit}`,
      bed_type: cat.bed_type,
      max_occupancy: cat.max_occupancy,
      base_rate: cat.base_rate,
      image_url: cat.primary_image_url,
      view_type: cat.view_type
    }))
  };
}

/**
 * 4. get_room_details
 */
function getRoomDetails({ propertyId = 1, roomTypeId, tenantId = 1 }) {
  const room = configService.getRoomCategoryById(roomTypeId, propertyId, tenantId);
  if (!room) {
    return {
      action: "get_room_details",
      found: false,
      whatsapp_text: "⚠️ Room category not found."
    };
  }

  let waText = `🛏️ *${room.name}*\n`;
  if (room.description) waText += `${room.description}\n\n`;
  waText += `• 📐 *Room Size*: ${room.room_size} ${room.size_unit}\n`;
  waText += `• 🛏️ *Bedding*: ${room.bed_type} (${room.bed_count || 1} bed(s))\n`;
  waText += `• 👥 *Occupancy*: Standard ${room.standard_occupancy} Adults, Max ${room.max_occupancy} Guests\n`;
  waText += `• 🌅 *View*: ${room.view_type || "Garden View"}\n`;
  waText += `• 🚿 *Bathrooms*: ${room.bathroom_count || 1}\n`;
  waText += `• 🚭 *Smoking*: ${room.smoking_policy === "NON_SMOKING" ? "Non-Smoking Room" : "Smoking Allowed"}\n`;
  if (room.extra_adult_price) {
    waText += `• ➕ Extra Adult: ₹${Number(room.extra_adult_price).toLocaleString("en-IN")}/night\n`;
  }
  if (room.amenities && room.amenities.length > 0) {
    waText += `\n✨ *Room Amenities*: ${room.amenities.join(", ")}\n`;
  }
  waText += `\n_Provide your check-in & check-out dates to get an estimated quote for this room._`;

  return {
    action: "get_room_details",
    found: true,
    room,
    whatsapp_text: waText,
    web_cards: [{
      type: "room_deep_spec",
      room_type_id: room.id,
      name: room.name,
      amenities: room.amenities,
      specs: {
        size: `${room.room_size} ${room.size_unit}`,
        bed: room.bed_type,
        occupancy: `Standard ${room.standard_occupancy}, Max ${room.max_occupancy}`,
        view: room.view_type
      },
      image_url: room.primary_image_url
    }]
  };
}

/**
 * 5. get_room_images
 */
function getRoomImages({ propertyId = 1, roomTypeId, tenantId = 1 }) {
  const images = configService.listRoomImages(roomTypeId, tenantId);
  const room = configService.getRoomCategoryById(roomTypeId, propertyId, tenantId);

  let waText = `📸 *Photographs of ${room ? room.name : "Room"}* (${images.length} photos)\n\n`;
  images.forEach((img, idx) => {
    waText += `${idx + 1}. ${img.caption || "Room view"}: ${img.image_url}\n`;
  });
  if (images.length === 0) {
    waText = `📸 *${room ? room.name : "Room"}*: No additional photos uploaded yet. Base image: ${room?.primary_image_url || "N/A"}`;
  }

  return {
    action: "get_room_images",
    room_type_id: roomTypeId,
    count: images.length,
    images,
    whatsapp_text: waText.trim(),
    web_cards: images.map(img => ({
      type: "room_image",
      url: img.image_url,
      caption: img.caption,
      alt_text: img.alt_text,
      is_primary: !!img.is_primary
    }))
  };
}

/**
 * 5b. get_property_gallery
 * Returns all property & villa photographs structured into categories for instant customer viewing.
 */
function getPropertyGallery({ propertyId = 1, tenantId = 1 }) {
  const galleryData = configService.getPropertyGallery(propertyId, tenantId);
  const prop = galleryData.property;
  const photos = galleryData.all_photos || [];

  let waText = `🖼️ *Photo Gallery - ${prop.name}*\n`;
  waText += `Explore our beachfront resort, amenities, and luxury villas (${photos.length} photos):\n\n`;

  const categoriesMap = {};
  photos.forEach(p => {
    const cat = p.category || "Resort & Amenities";
    if (!categoriesMap[cat]) categoriesMap[cat] = [];
    categoriesMap[cat].push(p);
  });

  Object.entries(categoriesMap).forEach(([catName, items]) => {
    waText += `📸 *${catName}* (${items.length} photos)\n`;
    items.slice(0, 2).forEach(it => {
      waText += `• ${it.caption || catName}: ${it.image_url}\n`;
    });
    waText += `\n`;
  });

  waText += `_Tap "View Images of the Property" in chat or reply with a room name for detailed specs and booking rates._`;

  return {
    action: "get_property_gallery",
    interactive_type: "property_gallery",
    found: true,
    property: prop,
    total_photos: photos.length,
    photos,
    gallery_data: galleryData,
    whatsapp_text: waText.trim(),
    web_cards: [{
      type: "property_gallery",
      property_id: prop.id,
      property_name: prop.name,
      total_photos: photos.length,
      photos
    }]
  };
}

/**
 * 6. check_room_availability
 */
function checkRoomAvailabilityAction({ propertyId = 1, roomTypeId, checkInDate, checkOutDate, quantity = 1, tenantId = 1 }) {
  const result = availabilityService.checkRoomAvailability(propertyId, roomTypeId, checkInDate, checkOutDate, quantity, tenantId);
  const room = configService.getRoomCategoryById(roomTypeId, propertyId, tenantId);

  let statusEmoji = "✅";
  let statusText = "Available";
  if (result.status === "LIMITED_AVAILABILITY") {
    statusEmoji = "⚡";
    statusText = "Limited Availability";
  } else if (result.status === "UNAVAILABLE") {
    statusEmoji = "❌";
    statusText = "Sold Out / Unavailable";
  }

  let waText = `${statusEmoji} *Availability Status: ${statusText}*\n`;
  waText += `🏨 Room: *${room ? room.name : "Selected Room"}*\n`;
  waText += `📅 Dates: *${checkInDate}* to *${checkOutDate}* (${result.nights} Night(s))\n`;
  waText += `🔢 Quantity Requested: ${quantity} room(s)\n`;
  if (result.is_available) {
    waText += `\nRooms are currently available for these dates! Reply "Quote" or "Rates" to calculate your estimated total.`;
  } else {
    waText += `\n⚠️ We could not accommodate ${quantity} room(s) for the entire selected stay. Please try different dates or ask about alternative room categories.`;
  }

  return {
    action: "check_room_availability",
    result,
    whatsapp_text: waText,
    web_cards: [{
      type: "availability_badge",
      is_available: result.is_available,
      status: result.status,
      nights: result.nights,
      min_sellable: result.min_sellable
    }]
  };
}

/**
 * 7. calculate_property_quote
 */
function calculatePropertyQuoteAction({
  propertyId = 1,
  roomTypeId,
  ratePlanId = null,
  checkInDate,
  checkOutDate,
  adults = 2,
  children = 0,
  rooms = 1,
  tenantId = 1
}) {
  const quote = pricingService.calculateQuote({
    propertyId,
    roomTypeId,
    ratePlanId,
    checkInDate,
    checkOutDate,
    adults,
    children,
    rooms,
    tenantId
  });

  // Construct clear WhatsApp quotation with MANDATORY disclaimer
  let waText = `🧾 *Estimated Price Quote*\n`;
  waText += `_Quote Ref: ${quote.quote_id}_\n\n`;
  waText += `🏨 *Property*: ${quote.property.name}\n`;
  waText += `🛏️ *Room*: ${quote.room_category.name} (${quote.reservation_specs.rooms} room(s))\n`;
  waText += `🍽️ *Plan*: ${quote.rate_plan.name} (${quote.rate_plan.code})\n`;
  waText += `📅 *Dates*: ${quote.reservation_specs.check_in} to ${quote.reservation_specs.check_out} (${quote.reservation_specs.nights} night(s))\n`;
  waText += `👥 *Guests*: ${quote.reservation_specs.adults} Adult(s)${quote.reservation_specs.children > 0 ? `, ${quote.reservation_specs.children} Child(ren)` : ""}\n\n`;

  waText += `💵 *Price Summary*:\n`;
  waText += `• Room Charges: ₹${quote.pricing_summary.base_room_charges.toLocaleString("en-IN")}\n`;
  if (quote.pricing_summary.extra_guest_charges > 0) {
    waText += `• Extra Guest Charges: ₹${quote.pricing_summary.extra_guest_charges.toLocaleString("en-IN")}\n`;
  }
  waText += `• Subtotal: ₹${quote.pricing_summary.subtotal_before_tax.toLocaleString("en-IN")}\n`;
  waText += `• ${quote.pricing_summary.taxes.tax_name}: ₹${quote.pricing_summary.taxes.total_tax.toLocaleString("en-IN")}\n`;
  waText += `💰 *Estimated Total*: *₹${quote.pricing_summary.estimated_grand_total.toLocaleString("en-IN")}*\n\n`;

  if (quote.occupancy_warning) {
    waText += `⚠️ *Note*: ${quote.occupancy_warning}\n\n`;
  }

  // MANDATORY DOMAIN DISCLAIMER
  waText += `📌 *IMPORTANT NOTICE*:\n`;
  waText += `_${quote.disclaimer}_\n\n`;
  waText += `To proceed with your reservation, our reservations team will gladly assist you. Reply *"Connect to staff"* to speak with our front desk.`;

  return {
    action: "calculate_property_quote",
    quote,
    whatsapp_text: waText,
    web_cards: [{
      type: "price_quote_card",
      quote_id: quote.quote_id,
      grand_total: quote.pricing_summary.estimated_grand_total,
      currency: quote.pricing_summary.currency,
      disclaimer: quote.disclaimer,
      is_binding: false,
      breakdown: quote.pricing_summary
    }]
  };
}

/**
 * 8. get_rate_plan_details
 */
function getRatePlanDetailsAction({ propertyId = 1, tenantId = 1 }) {
  const plans = pricingService.listRatePlans(propertyId, tenantId).filter(p => p.is_active);

  let waText = `🍽️ *Available Meal & Rate Plans*\n\n`;
  plans.forEach((p, idx) => {
    waText += `*${idx + 1}. ${p.name} (${p.code})*\n`;
    if (p.description) waText += `• Inclusions: ${p.description}\n`;
    if (p.cancellation_policy) waText += `• Cancellation: ${p.cancellation_policy}\n`;
    waText += `• Type: ${p.is_refundable ? "Refundable" : "Non-refundable"}\n\n`;
  });
  waText += `_Include your preferred plan code (e.g. EP, CP, MAP) when requesting rates._`;

  return {
    action: "get_rate_plan_details",
    count: plans.length,
    plans,
    whatsapp_text: waText.trim()
  };
}

/**
 * 9. get_property_facilities
 */
function getPropertyFacilitiesAction({ propertyId = 1, category = null, tenantId = 1 }) {
  const facilities = configService.listFacilities(propertyId, tenantId, category).filter(f => f.is_active);
  const prop = configService.getPublishedProperty(propertyId, tenantId);

  let waText = `✨ *Resort Facilities & Amenities at ${prop ? prop.name : "Property"}*\n\n`;
  facilities.forEach(f => {
    waText += `• *${f.name}* [${f.category || "General"}]`;
    if (f.operational_hours) waText += ` (${f.operational_hours})`;
    if (f.description) waText += `: ${f.description}`;
    waText += `\n`;
  });

  return {
    action: "get_property_facilities",
    count: facilities.length,
    facilities,
    whatsapp_text: waText.trim()
  };
}

/**
 * 10. get_property_policy
 */
function getPropertyPolicyAction({ propertyId = 1, policyType = null, tenantId = 1 }) {
  const policies = configService.listPolicies(propertyId, tenantId);

  if (policyType) {
    const matched = policies.find(p => p.policy_type.toLowerCase() === policyType.toLowerCase());
    if (matched) {
      return {
        action: "get_property_policy",
        policy: matched,
        whatsapp_text: `📋 *${matched.title || matched.policy_type} Policy*\n\n${matched.content}`
      };
    }
  }

  let waText = `📋 *Property Policies*\n\n`;
  policies.forEach(p => {
    waText += `*${p.title || p.policy_type}*\n${p.content}\n\n`;
  });

  return {
    action: "get_property_policy",
    count: policies.length,
    policies,
    whatsapp_text: waText.trim()
  };
}

/**
 * 11. get_property_faq
 */
function getPropertyFaqAction({ propertyId = 1, question = "", tenantId = 1 }) {
  const faqs = configService.listFaqs(propertyId, tenantId);

  let filtered = faqs;
  if (question) {
    const qLower = question.toLowerCase();
    filtered = faqs.filter(f => f.question.toLowerCase().includes(qLower) || (f.keywords && f.keywords.toLowerCase().includes(qLower)));
    if (filtered.length === 0) filtered = faqs.slice(0, 5); // fallback to top 5
  }

  let waText = `❓ *Frequently Asked Questions*\n\n`;
  filtered.forEach((f, idx) => {
    waText += `*Q: ${f.question}*\n`;
    waText += `A: ${f.answer}\n\n`;
  });

  return {
    action: "get_property_faq",
    count: filtered.length,
    faqs: filtered,
    whatsapp_text: waText.trim()
  };
}

/**
 * 12. request_human_handoff
 * Strictly routes the customer to human staff without confirming bookings or holding inventory
 */
function requestHumanHandoff({ propertyId = 1, customerName = "", customerPhone = "", inquiryDetails = "", tenantId = 1 }) {
  const prop = configService.getPublishedProperty(propertyId, tenantId);

  // Record an enquiry in the CRM system
  let enquiryId = null;
  try {
    const res = db.prepare(`
      INSERT INTO enquiries (tenant_id, property_id, customer_name, customer_phone, channel, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'CHAT_LINK', 'NEW', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      propertyId,
      customerName || "Customer Inquiry",
      customerPhone || "N/A",
      `Automated handoff inquiry from Hospitality Chat Engine: ${inquiryDetails}`
    );
    enquiryId = res.lastInsertRowid;
  } catch (e) {}

  const configuredPhone = getSetting ? getSetting("BOT_HANDOFF_PHONE") : null;
  const configuredName = getSetting ? getSetting("BOT_BUSINESS_NAME") : null;
  const displayName = configuredName || (prop ? prop.name : "our property");
  const directPhone = configuredPhone || prop?.phone;

  let waText = `🤝 *Connecting You with Our Reservations Desk*\n\n`;
  waText += `Thank you for your inquiry regarding *${displayName}*.\n\n`;
  waText += `Our reservations staff has been alerted and will assist you directly with room availability, custom packages, and booking confirmation.\n\n`;
  if (directPhone) waText += `📞 *Direct Call*: ${directPhone}\n`;
  if (prop?.email) waText += `✉️ *Email*: ${prop.email}\n`;
  waText += `\nWe will get back to you shortly!`;

  return {
    action: "request_human_handoff",
    enquiry_id: enquiryId,
    property_contact: {
      phone: prop?.phone,
      email: prop?.email
    },
    whatsapp_text: waText,
    web_cards: [{
      type: "handoff_alert",
      title: "Reservations Desk Alerted",
      message: "Our staff has been notified of your inquiry and will reach out to finalize your stay.",
      phone: prop?.phone,
      email: prop?.email
    }]
  };
}

/**
 * Master dispatcher for conversational hospitality queries
 */
function handleHospitalityChatAction(action, payload = {}, tenantId = 1) {
  switch (action) {
    case "search_properties":
      return searchProperties({ ...payload, tenantId });
    case "get_property_details":
      return getPropertyDetails({ ...payload, tenantId });
    case "get_room_categories":
      return getRoomCategories({ ...payload, tenantId });
    case "get_room_details":
      return getRoomDetails({ ...payload, tenantId });
    case "get_room_images":
      return getRoomImages({ ...payload, tenantId });
    case "get_property_gallery":
    case "get_property_images":
      return getPropertyGallery({ ...payload, tenantId });
    case "check_room_availability":
      return checkRoomAvailabilityAction({ ...payload, tenantId });
    case "calculate_property_quote":
      return calculatePropertyQuoteAction({ ...payload, tenantId });
    case "get_rate_plan_details":
      return getRatePlanDetailsAction({ ...payload, tenantId });
    case "get_property_facilities":
      return getPropertyFacilitiesAction({ ...payload, tenantId });
    case "get_property_policy":
      return getPropertyPolicyAction({ ...payload, tenantId });
    case "get_property_faq":
      return getPropertyFaqAction({ ...payload, tenantId });
    case "request_human_handoff":
      return requestHumanHandoff({ ...payload, tenantId });
    default:
      throw new Error(`Unsupported hospitality chat action: ${action}`);
  }
}

module.exports = {
  searchProperties,
  getPropertyDetails,
  getRoomCategories,
  getRoomDetails,
  getRoomImages,
  getPropertyGallery,
  checkRoomAvailabilityAction,
  calculatePropertyQuoteAction,
  getRatePlanDetailsAction,
  getPropertyFacilitiesAction,
  getPropertyPolicyAction,
  getPropertyFaqAction,
  requestHumanHandoff,
  handleHospitalityChatAction
};

