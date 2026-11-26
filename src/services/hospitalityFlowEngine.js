const crypto = require("crypto");
const { db, getSetting } = require("../config/database");
const configService = require("./hospitalityConfigService");
const availabilityService = require("./hospitalityAvailabilityService");
const pricingService = require("./hospitalityPricingService");
const chatService = require("./hospitalityChatService");
const enquiryService = require("./enquiryService");
const quotationService = require("./quotationService");
const broadcastEngine = require("./broadcastEngine");

/**
 * Default customizable intake fields for hospitality chat links
 */
const DEFAULT_HOSPITALITY_INTAKE_FIELDS = [
  {
    id: "check_in",
    label: "Check-in Date",
    type: "date",
    required: true,
    enabled: true,
    placeholder: "Select check-in date"
  },
  {
    id: "check_out",
    label: "Check-out Date",
    type: "date",
    required: true,
    enabled: true,
    placeholder: "Select check-out date"
  },
  {
    id: "total_guests",
    label: "Total Guests",
    type: "number",
    min: 1,
    max: 20,
    defaultValue: 2,
    required: true,
    enabled: true,
    placeholder: "Number of guests"
  },
  {
    id: "room_preference",
    label: "Preferred Room Category",
    type: "select",
    options: ["Any Available Room", "Deluxe Sea View Room", "Luxury Coconut Cottage", "Family Ocean Suite"],
    required: false,
    enabled: false,
    placeholder: "Select preferred room"
  },
  {
    id: "special_requests",
    label: "Special Requests / Occasion",
    type: "text",
    required: false,
    enabled: false,
    placeholder: "e.g., Anniversary, Ground floor preference"
  }
];

function formatDateStr(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Constructs an interactive In-Chat Meta-Flow Card payload for stay criteria data collection.
 */
function generateInChatFlowPayload(propertyId = 1, link = null, tenantId = 1, roomTypes = []) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;

  const tmrw = new Date(today);
  tmrw.setDate(today.getDate() + 1);
  const tmrwStr = formatDateStr(tmrw);

  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 3);
  const dayAfterStr = formatDateStr(dayAfter);

  const roomCategoryOptions = ["Any Available Room", ...roomTypes.map(r => r.name)];

  let linkFields = [];
  if (link?.custom_fields) {
    if (Array.isArray(link.custom_fields)) {
      linkFields = link.custom_fields;
    } else {
      try {
        const parsed = JSON.parse(link.custom_fields);
        if (Array.isArray(parsed)) linkFields = parsed;
      } catch (e) {}
    }
  }

  const fields = [
    {
      id: "check_in",
      label: "Check-in Date",
      type: "date",
      required: true,
      min: todayStr,
      defaultValue: tmrwStr
    },
    {
      id: "check_out",
      label: "Check-out Date",
      type: "date",
      required: true,
      min: tmrwStr,
      defaultValue: dayAfterStr
    },
    {
      id: "total_guests",
      label: "Total Guests",
      type: "number",
      min: 1,
      max: 20,
      defaultValue: 2,
      required: true
    },
    {
      id: "room_preference",
      label: "Preferred Room Category",
      type: "select",
      options: roomCategoryOptions,
      defaultValue: "Any Available Room",
      required: false
    }
  ];

  linkFields.forEach(cf => {
    if (cf.enabled !== false && !["check_in", "check_out", "total_guests", "room_preference"].includes(cf.id)) {
      fields.push({
        id: cf.id,
        label: cf.label,
        type: cf.type || "text",
        placeholder: cf.placeholder || `Enter ${cf.label}`,
        options: cf.options || [],
        required: Boolean(cf.required),
        defaultValue: cf.defaultValue || ""
      });
    }
  });

  return {
    interactive_type: "in_chat_flow",
    flow_id: "flow_hospitality_stay_intake",
    flow_title: "Plan Your Stay & Check Rates",
    flow_description: "Please share your dates and party size to check real-time availability and itemized prices.",
    status: "PENDING",
    fields,
    submit_label: "Check Real-Time Availability & Rates ➔"
  };
}

/**
 * Natural language date parsing utility supporting standard Indian & international formats:
 * - "20 Nov to 23 Nov", "20th Nov - 23rd Nov", "20/11/2026 to 23/11/2026", "2026-11-20 to 2026-11-23"
 * - "tomorrow for 2 nights", "next weekend", "this Friday for 2 nights"
 */
function parseNaturalDates(text, referenceDate = new Date()) {
  if (!text || typeof text !== "string") return null;
  const clean = text.trim();
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const monthsMap = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  // 1. ISO format: YYYY-MM-DD to YYYY-MM-DD
  const isoRangeMatch = clean.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-|till|until)\s*(\d{4}-\d{2}-\d{2})/i);
  if (isoRangeMatch) {
    const cin = new Date(isoRangeMatch[1] + "T00:00:00");
    const cout = new Date(isoRangeMatch[2] + "T00:00:00");
    if (!isNaN(cin.getTime()) && !isNaN(cout.getTime()) && cout > cin) {
      return {
        check_in: isoRangeMatch[1],
        check_out: isoRangeMatch[2],
        nights: Math.round((cout - cin) / (1000 * 60 * 60 * 24))
      };
    }
  }

  // 2. Day/Month/Year or Day-Month: e.g. "20/11/2026 to 23/11/2026" or "20-11-2026 to 23-11-2026"
  const dmyRangeMatch = clean.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\s*(?:to|-|till|until)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/i);
  if (dmyRangeMatch) {
    const curYear = today.getFullYear();
    const y1 = dmyRangeMatch[3] ? parseInt(dmyRangeMatch[3], 10) : curYear;
    const y2 = dmyRangeMatch[6] ? parseInt(dmyRangeMatch[6], 10) : curYear;
    const cin = new Date(y1, parseInt(dmyRangeMatch[2], 10) - 1, parseInt(dmyRangeMatch[1], 10));
    const cout = new Date(y2, parseInt(dmyRangeMatch[5], 10) - 1, parseInt(dmyRangeMatch[4], 10));
    if (!isNaN(cin.getTime()) && !isNaN(cout.getTime()) && cout > cin) {
      return {
        check_in: formatDateStr(cin),
        check_out: formatDateStr(cout),
        nights: Math.round((cout - cin) / (1000 * 60 * 60 * 24))
      };
    }
  }

  // 3. Named month range: "20 Nov to 23 Nov" or "20th Nov - 23rd Nov" or "20 to 23 Nov"
  const namedRangeMatch = clean.match(/(\d{1,2})(?:st|nd|rd|th)?\s*([a-zA-Z]+)?\s*(?:to|-|till|until)\s*(\d{1,2})(?:st|nd|rd|th)?\s*([a-zA-Z]+)(?:\s*(\d{4}))?/i);
  if (namedRangeMatch) {
    const d1 = parseInt(namedRangeMatch[1], 10);
    const d2 = parseInt(namedRangeMatch[3], 10);
    const mStr2 = (namedRangeMatch[4] || "").toLowerCase();
    const mStr1 = (namedRangeMatch[2] || namedRangeMatch[4] || "").toLowerCase();
    const m1 = monthsMap[mStr1];
    const m2 = monthsMap[mStr2];

    if (m1 !== undefined && m2 !== undefined && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
      let curYear = today.getFullYear();
      if (namedRangeMatch[5]) {
        curYear = parseInt(namedRangeMatch[5], 10);
      }
      let cin = new Date(curYear, m1, d1);
      let cout = new Date(curYear, m2, d2);
      // If cin is earlier than today and no year specified, assume next year
      if (!namedRangeMatch[5] && cin < today) {
        cin.setFullYear(curYear + 1);
        cout.setFullYear(curYear + 1);
      }
      if (cout > cin) {
        return {
          check_in: formatDateStr(cin),
          check_out: formatDateStr(cout),
          nights: Math.round((cout - cin) / (1000 * 60 * 60 * 24))
        };
      }
    }
  }

  // 4. Relative: "tomorrow for 2 nights" or "tomorrow"
  if (/\btomorrow\b/i.test(clean)) {
    const nightsMatch = clean.match(/for\s*(\d+)\s*nights?/i);
    const nights = nightsMatch ? parseInt(nightsMatch[1], 10) : 1;
    const cin = new Date(today);
    cin.setDate(today.getDate() + 1);
    const cout = new Date(cin);
    cout.setDate(cin.getDate() + nights);
    return {
      check_in: formatDateStr(cin),
      check_out: formatDateStr(cout),
      nights
    };
  }

  // 5. Relative: "this weekend" or "next weekend"
  if (/\b(?:this\s+)?weekend\b/i.test(clean) || /\bnext\s+weekend\b/i.test(clean)) {
    const isNext = /\bnext\b/i.test(clean);
    const dayOfWeek = today.getDay(); // 0 is Sunday, 5 is Friday
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0 && dayOfWeek !== 5) daysUntilFriday = 7;
    if (isNext) daysUntilFriday += 7;

    const cin = new Date(today);
    cin.setDate(today.getDate() + daysUntilFriday);
    const cout = new Date(cin);
    cout.setDate(cin.getDate() + 2); // Friday to Sunday (2 nights)
    return {
      check_in: formatDateStr(cin),
      check_out: formatDateStr(cout),
      nights: 2
    };
  }

  return null;
}

/**
 * Extract party size (adults, children, rooms) from message
 */
function parsePartySize(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();

  let adults = 2;
  let children = 0;
  let rooms = 1;

  const adultMatch = lower.match(/(\d+)\s*(?:adults?|grown-ups?|people|persons?|pax)/i);
  if (adultMatch) {
    adults = Math.max(1, parseInt(adultMatch[1], 10));
  } else {
    const guestMatch = lower.match(/(\d+)\s*guests?/i);
    if (guestMatch) {
      adults = Math.max(1, parseInt(guestMatch[1], 10));
    }
  }

  const childMatch = lower.match(/(\d+)\s*(?:child(?:ren)?|kids?)/i);
  if (childMatch) {
    children = parseInt(childMatch[1], 10);
  }

  const roomMatch = lower.match(/(\d+)\s*rooms?/i);
  if (roomMatch) {
    rooms = Math.max(1, parseInt(roomMatch[1], 10));
  }

  return { adults, children, rooms, total_guests: adults + children };
}

/**
 * Match room category name from customer text
 */
function matchRoomCategory(text, roomTypes = []) {
  if (!text || !Array.isArray(roomTypes) || roomTypes.length === 0) return null;
  const clean = String(text).trim().toLowerCase();

  // 1. Direct index match: "1", "room 1", "option 1", "select 1", "choice 2", "book 1"
  const numMatch = clean.match(/(?:^|\b(?:option|room|choice|select|book)\s*)(\d+)(?:\b|$)/i);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < roomTypes.length) {
      return roomTypes[idx];
    }
  }

  // 2. Exact or substring match against room name
  for (const rt of roomTypes) {
    const rtName = (rt.name || "").toLowerCase();
    const rtCode = (rt.room_code || "").toLowerCase();
    if (clean === rtName || clean === rtCode) return rt;
    if (clean.includes(rtName) || rtName.includes(clean)) return rt;

    // Keyword tokens
    if (/deluxe/i.test(clean) && /deluxe/i.test(rtName)) return rt;
    if (/cottage/i.test(clean) && /cottage/i.test(rtName)) return rt;
    if (/suite/i.test(clean) && /suite/i.test(rtName)) return rt;
    if (/villa/i.test(clean) && /villa/i.test(rtName)) return rt;
  }

  return null;
}

/**
 * Database Session Management
 */
function getSessionKey(channel, phone, propertyId = 1) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  return `${channel.toUpperCase()}_${cleanPhone}_${propertyId}`;
}

function getSession(sessionKey) {
  try {
    const row = db.prepare("SELECT * FROM hospitality_chat_sessions WHERE session_key = ?").get(sessionKey);
    if (!row) return null;
    let sessionData = {};
    try {
      sessionData = row.session_data ? JSON.parse(row.session_data) : {};
    } catch (e) {}
    return {
      ...row,
      sessionData
    };
  } catch (e) {
    return null;
  }
}

function saveSession({ sessionKey, channel, tenantId, propertyId, linkId, phone, guestName, currentStep, sessionData }) {
  try {
    const dataStr = JSON.stringify(sessionData || {});
    db.prepare(`
      INSERT INTO hospitality_chat_sessions (
        session_key, channel, tenant_id, property_id, link_id, phone, guest_name, current_step, session_data, last_interaction_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        current_step = VALUES(current_step),
        guest_name = COALESCE(VALUES(guest_name), guest_name),
        session_data = VALUES(session_data),
        last_interaction_at = CURRENT_TIMESTAMP
    `).run(
      sessionKey,
      channel,
      tenantId || 1,
      propertyId || 1,
      linkId || null,
      phone,
      guestName || null,
      currentStep || "IDLE",
      dataStr
    );
  } catch (e) {
    console.warn("[HospitalityFlowEngine] saveSession notice:", e.message);
  }
}

function resetSession(sessionKey) {
  try {
    db.prepare("DELETE FROM hospitality_chat_sessions WHERE session_key = ?").run(sessionKey);
  } catch (e) {}
}

/**
 * -------------------------------------------------------------------------
 * MAIN CONVERSATION DISPATCHER
 * -------------------------------------------------------------------------
 */
function handleCustomerInquiry({
  channel = "WEB",
  phone,
  guestName = "Guest",
  text = "",
  link = null,
  intakeData = null,
  flowSubmission = null,
  tenantId = 1
}) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  const propertyId = link?.property_id || 1;
  const sessionKey = getSessionKey(channel, cleanPhone, propertyId);
  const rawText = String(text || "").trim();
  // Strip any literal unrendered {{variable}} placeholders from legacy incoming messages
  const cleanText = rawText
    .replace(/\s+for\s+\{\{date\}\}/gi, "")
    .replace(/\s+for\s+\{\{guests\}\}\s+guests/gi, "")
    .replace(/\s+for\s+\{\{guests\}\}/gi, "")
    .replace(/\{\{[a-zA-Z0-9_-]+\}\}/g, "")
    .replace(/\bfor\s+for\b/gi, "for")
    .replace(/\s{2,}/g, " ")
    .trim();
  const lower = cleanText.toLowerCase();

  // Load published property and rooms
  const property = configService.getPublishedProperty(propertyId, tenantId);
  const configuredName = getSetting ? getSetting("BOT_BUSINESS_NAME") : null;
  const propName = configuredName || property?.name || link?.welcome_title || link?.title || "Hotel Green Vally";
  const roomTypes = (configService.listRoomCategories ? configService.listRoomCategories(propertyId, tenantId) : []).filter(r => r.status === "ACTIVE" || r.active === 1);

  let session = getSession(sessionKey);

  // Effective intake criteria (from in-chat flow submission or intakeData)
  const effectiveIntake = flowSubmission?.intake_data || flowSubmission?.intakeData || intakeData;

  // If previous enquiry was already confirmed or greeting starts a new inquiry without explicit dates
  const isDefaultLinkGreeting = cleanText === link?.default_message || cleanText === link?.defaultMessage || /^(hi|hello|hey)\b.*(book a villa|book.*guests|check availability)/i.test(lower);
  if (session && (session.current_step === "ENQUIRY_CONFIRMED" || (isDefaultLinkGreeting && !effectiveIntake && !parseNaturalDates(cleanText)))) {
    resetSession(sessionKey);
    session = null;
  }

  // 1. Check for Reset / Escape keywords
  if (/\b(restart|start over|cancel|new booking|reset)\b/i.test(lower)) {
    resetSession(sessionKey);
    const flowPayload = generateInChatFlowPayload(propertyId, link, tenantId, roomTypes);
    return {
      text: `🔄 Booking session reset.\n\nPlease share your stay details below to check live rates:`,
      raw_payload: flowPayload
    };
  }

  // 1b. Check for "Change dates" / "Modify dates"
  if (/\b(change dates?|different dates?|modify dates?|new dates?|other dates?|reset dates?|select dates?)\b/i.test(lower)) {
    const flowPayload = generateInChatFlowPayload(propertyId, link, tenantId, roomTypes);
    return {
      text: `📅 *Select New Stay Dates*\n\nPlease update your check-in, check-out, and guest details below:`,
      raw_payload: flowPayload
    };
  }

  // 2. Human Concierge Handoff request
  if (/\b(call|phone|speak|talk|agent|human|manager|executive|desk|staff|someone|person|call back)\b/i.test(lower)) {
    try {
      const res = chatService.requestHumanHandoff({
        propertyId,
        customerName: guestName,
        customerPhone: cleanPhone,
        inquiryDetails: cleanText,
        tenantId
      });
      return {
        text: res.whatsapp_text,
        raw_payload: {
          interactive_type: "human_handoff",
          status: "REQUESTED"
        }
      };
    } catch (e) {}
  }

  // =========================================================================
  // CASE A: NEW INTAKE DATA PROVIDED (From In-Chat Flow Card or Landing Form)
  // =========================================================================
  if (effectiveIntake && (effectiveIntake.check_in || effectiveIntake.check_out || effectiveIntake.total_guests)) {
    const cin = effectiveIntake.check_in;
    const cout = effectiveIntake.check_out;
    const guests = Math.max(1, parseInt(effectiveIntake.total_guests || 2, 10));
    const adults = Math.max(1, parseInt(effectiveIntake.adults || guests, 10));
    const children = Math.max(0, parseInt(effectiveIntake.children || 0, 10));
    const roomPref = effectiveIntake.room_preference || null;

    const parsedDates = parseNaturalDates(`${cin} to ${cout}`);
    const finalCin = parsedDates?.check_in || cin;
    const finalCout = parsedDates?.check_out || cout;
    const nights = parsedDates?.nights || 1;

    // Check availability and calculate quotes for all room types
    const quotesList = [];
    for (const rt of roomTypes) {
      try {
        const avail = availabilityService.checkRoomAvailability(propertyId, rt.id, finalCin, finalCout, 1, tenantId);
        const isAvail = Boolean(avail.is_available ?? avail.available);
        const availCount = Number(avail.min_sellable ?? avail.available_rooms_count ?? 0);
        let quote = null;
        try {
          quote = pricingService.calculateQuote({
            propertyId,
            roomTypeId: rt.id,
            checkInDate: finalCin,
            checkOutDate: finalCout,
            adults,
            children,
            rooms: 1,
            tenantId
          });
        } catch (quoteErr) {
          console.warn(`[HospitalityFlowEngine] Quote calculation warning for room ${rt.id}:`, quoteErr.message);
        }

        quotesList.push({
          room: rt,
          available: isAvail,
          available_count: availCount,
          quote
        });
      } catch (err) {
        console.warn(`[HospitalityFlowEngine] Availability lookup warning for room ${rt.id}:`, err.message);
        quotesList.push({
          room: rt,
          available: false,
          available_count: 0,
          quote: null
        });
      }
    }

    // Collect custom fields
    const customFields = { ...(effectiveIntake.custom_fields || {}) };
    const standardKeys = new Set(["check_in", "check_out", "total_guests", "adults", "children", "room_preference", "custom_fields"]);
    for (const [k, v] of Object.entries(effectiveIntake)) {
      if (!standardKeys.has(k) && v !== undefined && v !== null && v !== "") {
        customFields[k] = v;
      }
    }

    // Check if room_preference matches a specific room
    let preferredRoom = null;
    if (roomPref && roomPref !== "Any Available Room") {
      preferredRoom = matchRoomCategory(roomPref, roomTypes);
    }

    const prefQuoteItem = preferredRoom ? quotesList.find(q => q.room.id === preferredRoom.id) : null;
    const prefIsAvail = prefQuoteItem ? Boolean(prefQuoteItem.available) : false;

    // Save state
    const sessionData = {
      check_in: finalCin,
      check_out: finalCout,
      nights,
      adults,
      children,
      total_guests: guests,
      room_preference: roomPref,
      selected_room_id: prefIsAvail ? preferredRoom?.id : null,
      selected_room_name: prefIsAvail ? preferredRoom?.name : null,
      custom_fields: customFields,
      quotesList: quotesList.map(q => ({
        room_id: q.room.id,
        room_name: q.room.name,
        available: q.available,
        available_count: q.available_count,
        total: q.quote ? q.quote.pricing_summary.estimated_grand_total : null
      }))
    };

    if (preferredRoom && prefIsAvail && prefQuoteItem?.quote) {
      sessionData.last_quote = prefQuoteItem.quote;
    }

    saveSession({
      sessionKey,
      channel,
      tenantId,
      propertyId,
      linkId: link?.id,
      phone: cleanPhone,
      guestName,
      currentStep: (preferredRoom && prefIsAvail) ? "QUOTE_PRESENTED" : "AWAITING_ROOM",
      sessionData
    });

    const anyAvailable = quotesList.some(q => q.available);

    // Build intelligent personalized WhatsApp text response
    let waText = `🏖️ *Welcome ${guestName}! Real-Time Availability & Rates*\n`;
    waText += `📅 *Dates*: ${finalCin} to ${finalCout} (${nights} night${nights > 1 ? "s" : ""})\n`;
    waText += `👥 *Guests*: ${adults} Adult(s)${children > 0 ? `, ${children} Child(ren)` : ""}\n`;
    if (preferredRoom) {
      waText += `🎯 *Preferred Room*: ${preferredRoom.name}${prefIsAvail ? "" : " *(Currently Sold Out)*"}\n`;
    }
    waText += `\nHere are the live availability details and rates for *${propName}*:\n\n`;

    if (!anyAvailable) {
      waText += `❌ *NOTICE: All room categories are currently SOLD OUT for your requested dates (${finalCin} to ${finalCout}).*\n`;
      waText += `We have no vacant rooms matching your stay duration due to high occupancy or scheduled maintenance.\n\n`;
    }

    quotesList.forEach((item, idx) => {
      const rt = item.room;
      let availBadge = "";
      if (item.available && item.available_count > 2) {
        availBadge = `✅ *Available* (${item.available_count} rooms left)`;
      } else if (item.available && item.available_count > 0) {
        availBadge = `⚠️ *Limited Availability* (Only ${item.available_count} left!)`;
      } else {
        availBadge = `❌ *Sold Out* (Unavailable for these dates)`;
      }

      const isPref = preferredRoom && preferredRoom.id === rt.id;
      const totalAmount = item.quote ? (item.quote.pricing_summary?.estimated_grand_total || 0) : ((rt.base_rate || 0) * nights);
      const avgNightly = item.quote ? Math.round((item.quote.pricing_summary?.subtotal_before_tax || totalAmount) / (nights || 1)) : (rt.base_rate || 0);

      const totalStr = `₹${totalAmount.toLocaleString("en-IN")}`;
      const perNightStr = `₹${avgNightly.toLocaleString("en-IN")}/night`;

      waText += `*${idx + 1}. ${rt.name}* ${isPref ? "*(Your Choice)* " : ""}\n`;
      waText += `• 📦 Status: ${availBadge}\n`;
      if (item.available) {
        waText += `• 💰 Total for ${nights} night(s): *${totalStr}* (approx. ${perNightStr} + taxes)\n`;
      } else {
        waText += `• 💰 Base Rate: ₹${(rt.base_rate || 0).toLocaleString("en-IN")}/night + taxes\n`;
      }
      waText += `• 📐 Size: ${rt.room_size || 350} ${rt.size_unit || "sq_ft"} | 🛏️ Bed: ${rt.bed_type || "1 King Bed"}\n`;
      waText += `• 👥 Standard: ${rt.standard_occupancy || 2} (Max: ${rt.max_occupancy || 3})\n`;
      waText += `• 🌅 View: ${rt.view_type || "Garden View"}\n\n`;
    });

    if (preferredRoom && prefIsAvail) {
      waText += `_Reply *CONFIRM* to book ${preferredRoom.name}, or reply with another room number/name to switch._\n\n`;
    } else if (preferredRoom && !prefIsAvail) {
      waText += `⚠️ *Notice*: Your preferred room (*${preferredRoom.name}*) is currently sold out for these dates. Please choose from one of the available rooms above or reply with different dates.\n\n`;
    } else if (anyAvailable) {
      const firstAvail = quotesList.find(q => q.available);
      waText += `_Reply with the room name or number (e.g. "${firstAvail?.room.name || "Deluxe"}") to confirm your booking enquiry!_\n\n`;
    } else {
      waText += `_Reply *"Change dates"* to check another date range or contact our reservations desk directly._\n\n`;
    }
    waText += `_📌 Note: Estimated Price Quote (Subject to Staff Confirmation). Does not hold inventory._`;

    return {
      text: waText.trim(),
      raw_payload: {
        interactive_type: "flow_step",
        step: "ROOM_SELECTION",
        stay_specs: {
          check_in: finalCin,
          check_out: finalCout,
          nights,
          adults,
          children
        },
        selected_room: (preferredRoom && prefIsAvail) ? {
          id: preferredRoom.id,
          name: preferredRoom.name
        } : null,
        options: quotesList.map(item => ({
          id: item.room.id,
          name: item.room.name,
          available: item.available,
          available_count: item.available_count,
          total_price: item.quote ? item.quote.pricing_summary.estimated_grand_total : null,
          nightly_rate: item.quote ? item.quote.pricing_summary.daily_average_rate : item.room.base_rate,
          image_url: item.room.primary_image_url
        }))
      }
    };
  }

  // 3. General Amenities / Facilities / Dining / Location FAQs
  // Answer question directly without discarding booking session
  const isRoomOrRateInquiry = /\b(room|rooms|villa|villas|cottage|cottages|suite|suites|rate|rates|price|pricing|tariff|types|cost|accommodat|availab|inventory|vacancy|vacant|book|stay)\b/i.test(lower);
  const isAmenityInquiry = /\b(amenities|amenity|facility|facilities|pool|swimming|wifi|wi-fi|internet|parking|beach|gym|spa)\b/i.test(lower);
  const isDiningInquiry = /\b(dining|food|restaurant|breakfast|dinner|lunch|menu|meals|cuisine|eat)\b/i.test(lower);

  const matchedRoom = matchRoomCategory(cleanText, roomTypes);

  // If customer asks for general room types, villa options, or rates without naming a specific room or dates
  if (isRoomOrRateInquiry && !matchedRoom && !parseNaturalDates(cleanText) && (!session || !session.sessionData?.check_in)) {
    const res = chatService.getRoomCategories({ propertyId, tenantId });
    let prompt = res.whatsapp_text;
    if (isAmenityInquiry) {
      const facRes = chatService.getPropertyFacilitiesAction({ propertyId, tenantId });
      if (facRes && facRes.facilities?.length > 0) {
        prompt += `\n\n✨ *Key Amenities*: ${facRes.facilities.slice(0, 4).map(f => f.name).join(", ")}`;
      }
    }
    prompt += `\n\n👇 *Please select your stay dates and guests below to check live availability & exact rates:*`;

    const flowPayload = generateInChatFlowPayload(propertyId, link, tenantId, roomTypes);

    saveSession({
      sessionKey,
      channel,
      tenantId,
      propertyId,
      linkId: link?.id,
      phone: cleanPhone,
      guestName,
      currentStep: "AWAITING_INTAKE",
      sessionData: session?.sessionData || {}
    });

    return {
      text: prompt,
      raw_payload: flowPayload
    };
  }

  if (isDiningInquiry) {
    const res = chatService.getPropertyFacilitiesAction({ propertyId, category: "DINING", tenantId });
    let prompt = res.whatsapp_text;
    if (session && session.current_step && session.current_step !== "IDLE") {
      prompt += `\n\n_By the way, we're holding your booking inquiry. Reply with dates or room choice whenever you are ready!_`;
    }
    return { text: prompt, raw_payload: null };
  }

  if (isAmenityInquiry) {
    const res = chatService.getPropertyFacilitiesAction({ propertyId, tenantId });
    let prompt = res.whatsapp_text;
    if (session && session.current_step && session.current_step !== "IDLE") {
      prompt += `\n\n_By the way, we're holding your booking inquiry. Feel free to specify your stay dates!_`;
    }
    return { text: prompt, raw_payload: null };
  }

  if (/\b(location|reach|address|direction|directions|where|map|route|ferry|mandwa|distance)\b/i.test(lower)) {
    const res = chatService.getPropertyFaqAction({ propertyId, question: "directions location reach ferry", tenantId });
    let prompt = res.whatsapp_text;
    if (session && session.current_step && session.current_step !== "IDLE") {
      prompt += `\n\n_Feel free to share your travel dates to check room availability._`;
    }
    return { text: prompt, raw_payload: null };
  }

  // =========================================================================
  // CASE B: MULTI-TURN CONVERSATION STATE MACHINE
  // =========================================================================

  // Check if user is confirming a presented quote or confirming while awaiting room (without selecting a different room)
  if (session && (session.current_step === "QUOTE_PRESENTED" || session.current_step === "AWAITING_ROOM") && !matchedRoom) {
    if (/\b(confirm|proceed|submit|please book|book this|confirm booking)\b/i.test(lower) || /^\s*book\s*$/i.test(lower) || /^\s*confirm\s*booking\s*$/i.test(lower) || lower === "yes, please book" || lower === "yes please") {
      const sData = session.sessionData || {};

      // If room was not explicitly selected yet, pick the best available room
      if (!sData.selected_room_id && Array.isArray(roomTypes) && roomTypes.length > 0) {
        const firstAvail = roomTypes.find(rt => {
          if (!sData.check_in || !sData.check_out) return true;
          const a = availabilityService.checkRoomAvailability(propertyId, rt.id, sData.check_in, sData.check_out, 1, tenantId);
          return a.is_available;
        }) || roomTypes[0];
        sData.selected_room_id = firstAvail.id;
        sData.selected_room_name = firstAvail.name;
      }

      // Final availability verification against live database
      if (sData.selected_room_id && sData.check_in && sData.check_out) {
        const finalAvail = availabilityService.checkRoomAvailability(
          propertyId,
          sData.selected_room_id,
          sData.check_in,
          sData.check_out,
          sData.rooms || 1,
          tenantId
        );
        if (!finalAvail.is_available) {
          return {
            text: `⚠️ *We apologize!* The room *${sData.selected_room_name}* is no longer available for your stay (${sData.check_in} to ${sData.check_out}) due to high occupancy or maintenance.\n\nPlease choose an alternative room category or reply *"Change dates"* to check another date range.`,
            raw_payload: {
              interactive_type: "room_sold_out",
              room_id: sData.selected_room_id,
              room_name: sData.selected_room_name
            }
          };
        }
      }

      // Create CRM Enquiry & Official Quotation
      let enquiry = null;
      let quote = null;

      try {
        enquiry = enquiryService.createEnquiry(tenantId, {
          property_id: propertyId,
          phone: cleanPhone,
          guest_name: guestName,
          check_in: sData.check_in,
          check_out: sData.check_out,
          adults: sData.adults || 2,
          children: sData.children || 0,
          rooms_requested: sData.rooms || 1,
          room_type_id: sData.selected_room_id,
          room_preference: sData.selected_room_name,
          preferences: sData.custom_fields || {},
          notes: `Web chat reservation inquiry via link '${link?.slug || "web"}'`
        }, "chat_bot");

        if (enquiry && enquiry.id) {
          const subtotal = sData.last_quote?.pricing_summary?.subtotal_before_tax || 4500;
          const avgNightly = Math.round(subtotal / (sData.nights || 1));
          quote = quotationService.createQuote(tenantId, enquiry.id, {
            currency: "INR",
            items: [
              {
                room_type_id: sData.selected_room_id,
                description: `${sData.selected_room_name} (${sData.nights} nights, ${sData.adults} adults)`,
                quantity: sData.rooms || 1,
                nights: sData.nights || 1,
                unit_rate: avgNightly,
                amount: subtotal
              }
            ],
            notes: "Estimated Price Quote generated by SARVYA Concierge Flow."
          }, "chat_bot");
        }
      } catch (err) {
        console.warn("[HospitalityFlowEngine] Enquiry creation notice:", err.message);
      }

      saveSession({
        sessionKey,
        channel,
        tenantId,
        propertyId,
        linkId: link?.id,
        phone: cleanPhone,
        guestName,
        currentStep: "ENQUIRY_CONFIRMED",
        sessionData: {
          ...sData,
          enquiry_id: enquiry?.id || null,
          quote_id: quote?.id || null
        }
      });

      let confirmText = `🎉 *Reservation Inquiry Confirmed!*\n\n`;
      confirmText += `Thank you, *${guestName}*! Your stay inquiry has been officially submitted to our front desk team.\n\n`;
      if (enquiry?.id) confirmText += `📋 *Enquiry Reference*: #ENQ-${enquiry.id}\n`;
      confirmText += `🏨 *Property*: ${propName}\n`;
      confirmText += `🛏️ *Room*: ${sData.selected_room_name}\n`;
      confirmText += `📅 *Dates*: ${sData.check_in} to ${sData.check_out} (${sData.nights} night(s))\n`;
      confirmText += `👥 *Guests*: ${sData.adults} Adult(s)${sData.children > 0 ? `, ${sData.children} Child(ren)` : ""}\n`;
      if (sData.last_quote?.pricing_summary?.estimated_grand_total) {
        confirmText += `💰 *Estimated Total*: ₹${Number(sData.last_quote.pricing_summary.estimated_grand_total).toLocaleString("en-IN")}\n`;
      }
      confirmText += `\n📞 Our reservation executive will contact you shortly on *${cleanPhone}* to assist with booking confirmation.\n\n`;
      confirmText += `_Have additional questions? Type them here anytime._`;

      return {
        text: confirmText,
        raw_payload: {
          interactive_type: "enquiry_confirmed",
          enquiry_id: enquiry?.id,
          phone: cleanPhone
        }
      };
    }
  }

  // Check if message contains dates directly
  const extractedDates = parseNaturalDates(cleanText);
  if (extractedDates) {
    const sData = session?.sessionData || {};
    sData.check_in = extractedDates.check_in;
    sData.check_out = extractedDates.check_out;
    sData.nights = extractedDates.nights;

    // Check if a room was also named in this exact message
    const roomInMsg = matchedRoom || matchRoomCategory(cleanText, roomTypes);
    if (roomInMsg) {
      sData.selected_room_id = roomInMsg.id;
      sData.selected_room_name = roomInMsg.name;
    }

    // Check if room is already selected
    if (sData.selected_room_id) {
      const avail = availabilityService.checkRoomAvailability(
        propertyId,
        sData.selected_room_id,
        sData.check_in,
        sData.check_out,
        sData.rooms || 1,
        tenantId
      );

      if (!avail.is_available) {
        // Room is sold out for these dates!
        // Show unavailable notification and suggest alternatives
        return handleCustomerInquiry({
          channel,
          phone,
          guestName,
          text: "",
          link,
          intakeData: {
            check_in: sData.check_in,
            check_out: sData.check_out,
            total_guests: sData.total_guests || 2,
            adults: sData.adults || 2,
            children: sData.children || 0,
            room_preference: sData.selected_room_name
          },
          tenantId
        });
      }

      const quote = pricingService.calculateQuote({
        propertyId,
        roomTypeId: sData.selected_room_id,
        checkInDate: sData.check_in,
        checkOutDate: sData.check_out,
        adults: sData.adults || 2,
        children: sData.children || 0,
        rooms: sData.rooms || 1,
        tenantId
      });

      sData.last_quote = quote;
      saveSession({
        sessionKey,
        channel,
        tenantId,
        propertyId,
        linkId: link?.id,
        phone: cleanPhone,
        guestName,
        currentStep: "QUOTE_PRESENTED",
        sessionData: sData
      });

      const quoteRes = chatService.calculatePropertyQuoteAction({
        propertyId,
        roomTypeId: sData.selected_room_id,
        checkInDate: sData.check_in,
        checkOutDate: sData.check_out,
        adults: sData.adults || 2,
        children: sData.children || 0,
        rooms: sData.rooms || 1,
        tenantId
      });

      const availCount = Number(avail.min_sellable ?? avail.available_rooms_count ?? 0);
      const availText = availCount <= 2
        ? `⚠️ *Limited Availability*: Only ${availCount} room(s) left in live inventory!`
        : `✅ *Live Inventory Confirmed*: ${availCount} room(s) available for your stay.`;

      return {
        text: `${availText}\n\n${quoteRes.whatsapp_text}\n\n_Reply *CONFIRM* or *BOOK* to submit this inquiry directly to our reservation desk._`,
        raw_payload: {
          interactive_type: "quote_summary",
          quote: quoteRes.quote || quote,
          available_rooms: availCount
        }
      };
    } else {
      // Room not selected yet: present available rooms for these dates
      saveSession({
        sessionKey,
        channel,
        tenantId,
        propertyId,
        linkId: link?.id,
        phone: cleanPhone,
        guestName,
        currentStep: "AWAITING_ROOM",
        sessionData: sData
      });

      return handleCustomerInquiry({
        channel,
        phone,
        guestName,
        text: "",
        link,
        intakeData: {
          check_in: sData.check_in,
          check_out: sData.check_out,
          total_guests: sData.total_guests || 2,
          adults: sData.adults || 2,
          children: sData.children || 0
        },
        tenantId
      });
    }
  }

  // Check if message matches a room selection
  if (matchedRoom) {
    const sData = session?.sessionData || {};
    sData.selected_room_id = matchedRoom.id;
    sData.selected_room_name = matchedRoom.name;

    // If dates already known, check availability and calculate quote immediately!
    if (sData.check_in && sData.check_out) {
      try {
        const avail = availabilityService.checkRoomAvailability(
          propertyId,
          matchedRoom.id,
          sData.check_in,
          sData.check_out,
          sData.rooms || 1,
          tenantId
        );

        if (!avail.is_available) {
          // Room is sold out for these dates!
          return handleCustomerInquiry({
            channel,
            phone,
            guestName,
            text: "",
            link,
            intakeData: {
              check_in: sData.check_in,
              check_out: sData.check_out,
              total_guests: sData.total_guests || 2,
              adults: sData.adults || 2,
              children: sData.children || 0,
              room_preference: matchedRoom.name
            },
            tenantId
          });
        }

        const quote = pricingService.calculateQuote({
          propertyId,
          roomTypeId: matchedRoom.id,
          checkInDate: sData.check_in,
          checkOutDate: sData.check_out,
          adults: sData.adults || 2,
          children: sData.children || 0,
          rooms: sData.rooms || 1,
          tenantId
        });

        sData.last_quote = quote;
        saveSession({
          sessionKey,
          channel,
          tenantId,
          propertyId,
          linkId: link?.id,
          phone: cleanPhone,
          guestName,
          currentStep: "QUOTE_PRESENTED",
          sessionData: sData
        });

        const quoteRes = chatService.calculatePropertyQuoteAction({
          propertyId,
          roomTypeId: matchedRoom.id,
          checkInDate: sData.check_in,
          checkOutDate: sData.check_out,
          adults: sData.adults || 2,
          children: sData.children || 0,
          rooms: sData.rooms || 1,
          tenantId
        });

        const availCount = Number(avail.min_sellable ?? avail.available_rooms_count ?? 0);
        const availText = availCount <= 2
          ? `⚠️ *Limited Availability*: Only ${availCount} room(s) remaining for your dates!`
          : `✅ *Live Inventory Confirmed*: ${availCount} room(s) available for your stay.`;

        return {
          text: `${availText}\n\n${quoteRes.whatsapp_text}\n\n_Reply *CONFIRM* or *BOOK* to submit this reservation inquiry to our front desk team!_`,
          raw_payload: {
            interactive_type: "quote_summary",
            quote: quoteRes.quote || quote,
            available_rooms: availCount
          }
        };
      } catch (e) {
        console.warn("[HospitalityFlowEngine] Quote calculation notice:", e.message);
      }
    }

    // Dates not known yet -> Prompt for dates
    saveSession({
      sessionKey,
      channel,
      tenantId,
      propertyId,
      linkId: link?.id,
      phone: cleanPhone,
      guestName,
      currentStep: "AWAITING_DATES",
      sessionData: sData
    });

    let prompt = `🛏️ Selected: *${matchedRoom.name}*\n\n`;
    prompt += `What dates are you planning to visit? (e.g. "20 Nov to 23 Nov" or "tomorrow for 2 nights")`;
    return {
      text: prompt,
      raw_payload: {
        interactive_type: "flow_step",
        step: "DATE_SELECTION",
        selected_room: matchedRoom
      }
    };
  }

  // If user asks for room categories or is in AWAITING_ROOM
  if (/\b(room|rooms|villa|villas|cottage|suite|rate|rates|price|pricing|tariff|types)\b/i.test(lower)) {
    if (session?.sessionData?.check_in && session?.sessionData?.check_out) {
      // Dates already known: calculate real-time availability and rates for these dates!
      return handleCustomerInquiry({
        channel,
        phone,
        guestName,
        text: "",
        link,
        intakeData: session.sessionData,
        tenantId
      });
    }

    // Dates not known yet: present In-Chat Flow Card to collect dates & party size
    const res = chatService.getRoomCategories({ propertyId, tenantId });
    const flowPayload = generateInChatFlowPayload(propertyId, link, tenantId, roomTypes);
    saveSession({
      sessionKey,
      channel,
      tenantId,
      propertyId,
      linkId: link?.id,
      phone: cleanPhone,
      guestName,
      currentStep: "AWAITING_INTAKE",
      sessionData: session?.sessionData || {}
    });
    return {
      text: `${res.whatsapp_text}\n\n👇 *Please select your stay dates and guests below to check live availability & exact rates:*`,
      raw_payload: flowPayload
    };
  }

  // Fallback: polite guidance with interactive In-Chat Meta Flow card
  const flowPayload = generateInChatFlowPayload(propertyId, link, tenantId, roomTypes);

  saveSession({
    sessionKey,
    channel,
    tenantId,
    propertyId,
    linkId: link?.id,
    phone: cleanPhone,
    guestName,
    currentStep: "AWAITING_INTAKE",
    sessionData: session?.sessionData || {}
  });

  const customWelcome = getSetting ? getSetting("BOT_WELCOME_MESSAGE") : null;
  let fallbackText = customWelcome
    ? customWelcome.replace(/\{\{name\}\}/gi, guestName).replace(/\{\{business_name\}\}/gi, propName)
    : `👋 Hello ${guestName}! Welcome to *${propName}*.\n\nPlease share your stay details below (dates & guests) to check real-time availability and get an instant itemized price quote! 👇`;

  return {
    text: fallbackText,
    raw_payload: flowPayload
  };
}

module.exports = {
  DEFAULT_HOSPITALITY_INTAKE_FIELDS,
  generateInChatFlowPayload,
  parseNaturalDates,
  parsePartySize,
  matchRoomCategory,
  getSessionKey,
  getSession,
  saveSession,
  resetSession,
  handleCustomerInquiry
};
