const { db } = require("../../config/database");
const inappRuntimeService = require("./inappRuntimeService");
const inappSseManager = require("./inappSseManager");
const crmPipelineService = require("../crmPipelineService");

/**
 * In-App Call, Direct Dial & Callback Engine with IST Business Hours Evaluation
 */

/**
 * Evaluate business hours in Asia/Kolkata and return call availability
 */
function getCallAvailability(slug) {
  const { experience } = inappRuntimeService.getPublicExperience(slug);
  const businessHours = experience.businessHours || {};
  const phone = experience.assignedPhoneNumberId || "919307382030";

  // Calculate current IST Time
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  });

  const parts = istFormatter.formatToParts(now);
  const dayName = (parts.find(p => p.type === "weekday")?.value || "Monday").toLowerCase();
  const hour = parts.find(p => p.type === "hour")?.value || "12";
  const minute = parts.find(p => p.type === "minute")?.value || "00";
  const currentIstTime = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

  // Evaluate day schedule
  const daySchedule = businessHours.days?.[dayName] || {
    isOpen: true,
    open: businessHours.defaultOpen || "09:00",
    close: businessHours.defaultClose || "21:00"
  };

  const isConfiguredOpen = daySchedule.isOpen !== false;
  const isWithinHours = currentIstTime >= (daySchedule.open || "09:00") && currentIstTime <= (daySchedule.close || "21:00");
  const isOpenNow = isConfiguredOpen && isWithinHours;

  // Generate next available slots
  const nextAvailableSlots = [
    "Today 4:00 PM – 5:00 PM",
    "Today 6:00 PM – 7:00 PM",
    "Tomorrow 10:00 AM – 11:00 AM",
    "Tomorrow 2:00 PM – 3:00 PM"
  ];

  const callbackSlaMinutes = Number(experience.features?.callbackSlaMinutes) || 5;

  return {
    isOpenNow,
    currentIstTime,
    dayName,
    directDialPhone: phone,
    whatsappCallUrl: `https://wa.me/${phone}`,
    nextAvailableSlots,
    callbackSlaMinutes
  };
}

/**
 * Customer requests an instant callback, schedules a call, or logs a direct dial
 */
function requestCall(slug, {
  sessionToken,
  visitorPhone,
  visitorName,
  callType = "INSTANT_CALLBACK",
  topic = "General Inquiry",
  preferredSlotAt
} = {}) {
  const { experience } = inappRuntimeService.getPublicExperience(slug);

  if (!visitorPhone) {
    const err = new Error("visitorPhone is required to request a callback");
    err.statusCode = 400;
    throw err;
  }

  const cleanPhone = String(visitorPhone).replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    const err = new Error("Enter a valid 10-15 digit phone number");
    err.statusCode = 400;
    throw err;
  }

  let sessionId = null;
  if (sessionToken) {
    const session = db.prepare("SELECT id FROM inapp_sessions WHERE session_token = ? AND delete_status = 0").get(sessionToken);
    sessionId = session?.id || null;
  }

  const validCallType = ["DIRECT_DIAL", "INSTANT_CALLBACK", "SCHEDULED_CALL"].includes(callType)
    ? callType
    : "INSTANT_CALLBACK";

  // Calculate SLA deadline for instant callbacks (5 mins)
  let slaDeadlineSql = "NULL";
  if (validCallType === "INSTANT_CALLBACK") {
    slaDeadlineSql = "DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)";
  }

  const res = db.prepare(`
    INSERT INTO inapp_call_requests (
      tenant_id, experience_id, session_id, visitor_phone, visitor_name,
      call_type, topic, preferred_slot_at, sla_deadline_at, status,
      active_status, delete_status, created_by, updated_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ${slaDeadlineSql}, 'QUEUED',
      1, 0, 'VISITOR', 'VISITOR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    experience.tenant_id || 1,
    experience.id,
    sessionId,
    cleanPhone,
    visitorName || "Customer",
    validCallType,
    topic || "In-App Callback",
    preferredSlotAt || null
  );

  const callId = res.lastInsertRowid;
  const callRequest = db.prepare("SELECT * FROM inapp_call_requests WHERE id = ?").get(callId);

  // If CRM pipeline is linked, upsert CRM record
  if (experience.crmPipelineId) {
    try {
      crmPipelineService.createRecord({
        tenantId: experience.tenant_id || 1,
        pipelineId: experience.crmPipelineId,
        contactPhone: cleanPhone,
        contactName: visitorName || "In-App Visitor",
        stageKey: "NEW_LEAD",
        tags: ["INAPP_CALLBACK", experience.slug, validCallType],
        customAttributes: {
          call_id: callId,
          call_type: validCallType,
          topic,
          preferred_slot_at: preferredSlotAt || null,
          experience_name: experience.name
        },
        sourceSessionId: sessionId
      });
    } catch (crmErr) {
      console.warn("[inappCallService] CRM record error:", crmErr.message);
    }
  }

  // Broadcast alert to Staff Inbox
  inappSseManager.notifyStaff("inapp:call", {
    callId,
    callType: validCallType,
    visitorPhone: cleanPhone,
    visitorName: visitorName || "Customer",
    topic,
    status: "QUEUED",
    slaDeadlineAt: callRequest.sla_deadline_at,
    experienceName: experience.name
  });

  return {
    success: true,
    data: callRequest,
    message: validCallType === "INSTANT_CALLBACK"
      ? "Callback requested! Our concierge will call you within 5 minutes."
      : "Call request scheduled successfully."
  };
}

/**
 * AGENT API: List call requests for tenant
 */
function listCalls(tenantId = 1, { status, experienceId, phone, limit = 50 } = {}) {
  let query = `
    SELECT c.*, e.name as experience_name, e.slug as experience_slug,
           s.session_token
    FROM inapp_call_requests c
    JOIN inapp_experiences e ON e.id = c.experience_id
    LEFT JOIN inapp_sessions s ON s.id = c.session_id
    WHERE c.tenant_id = ? AND c.delete_status = 0
  `;
  const params = [tenantId];

  if (phone) {
    const cleanPhone = String(phone).replace(/\D/g, "");
    query += " AND (c.visitor_phone LIKE ? OR c.visitor_phone = ?)";
    params.push(`%${cleanPhone}%`, cleanPhone);
  }

  if (status && status !== "ALL") {
    query += " AND c.status = ?";
    params.push(status);
  }

  if (experienceId) {
    query += " AND c.experience_id = ?";
    params.push(experienceId);
  }

  query += " ORDER BY c.created_at DESC LIMIT ?";
  params.push(Number(limit));

  return db.prepare(query).all(...params);
}

/**
 * AGENT API: Update call status & notes
 */
function updateCallStatus(tenantId = 1, callId, {
  status = "CALLED",
  callNotes,
  assignedUserId,
  userId = "agent"
} = {}) {
  const row = db.prepare(`
    SELECT c.*, s.session_token
    FROM inapp_call_requests c
    LEFT JOIN inapp_sessions s ON s.id = c.session_id
    WHERE c.id = ? AND c.tenant_id = ? AND c.delete_status = 0
  `).get(callId, tenantId);

  if (!row) {
    const err = new Error("Call request not found");
    err.statusCode = 404;
    throw err;
  }

  db.prepare(`
    UPDATE inapp_call_requests
    SET status = ?,
        call_notes = COALESCE(?, call_notes),
        assigned_user_id = COALESCE(?, assigned_user_id),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    status,
    callNotes || null,
    assignedUserId || null,
    userId,
    callId
  );

  const updated = db.prepare("SELECT * FROM inapp_call_requests WHERE id = ?").get(callId);

  // Push real-time SSE event to customer if online
  if (row.session_token) {
    inappSseManager.sendToVisitor(row.session_token, "call_status_updated", {
      callId,
      status,
      callNotes,
      updatedAt: updated.updated_at
    });
  }

  return {
    success: true,
    data: updated
  };
}

module.exports = {
  getCallAvailability,
  requestCall,
  listCalls,
  updateCallStatus
};
