const crypto = require("crypto");
const { db } = require("../../config/database");
const { buildTranscriptFromScreen } = require("./transcriptHelper");

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "").trim()).digest("hex");
}

function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

/**
 * Issues a cryptographically random opaque continuation token.
 * Plaintext token is returned ONLY to the authorized issuing caller (e.g., WhatsApp dispatcher).
 * Database persists ONLY the SHA-256 hash + safe lookup prefix.
 */
function issueContinuationToken({
  tenantId = 1,
  experienceId,
  flowSessionId = null,
  inappSessionId = null,
  contactPhone = null,
  channelSource = "WHATSAPP",
  scope = "CUSTOMER_SESSION",
  ttlMinutes = 30,
  isSingleUse = true
} = {}) {
  const numericTenantId = Number(tenantId) || 1;
  if (!experienceId) {
    throw new Error("experienceId is required to issue continuation token");
  }

  const rawToken = `ct_${crypto.randomBytes(24).toString("base64url")}`;
  const tokenHash = hashToken(rawToken);
  const tokenPrefix = rawToken.slice(0, 10);
  const safeTtl = Math.max(1, Math.min(1440, Number(ttlMinutes) || 30));

  const res = db.prepare(`
    INSERT INTO experience_continuation_tokens (
      tenant_id, experience_id, flow_session_id, inapp_session_id,
      token_hash, token_prefix, contact_phone, channel_source, scope,
      is_single_use, expires_at, created_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), UTC_TIMESTAMP()
    )
  `).run(
    numericTenantId,
    Number(experienceId),
    flowSessionId || null,
    inappSessionId || null,
    tokenHash,
    tokenPrefix,
    contactPhone ? String(contactPhone).trim() : null,
    String(channelSource || "WHATSAPP").toUpperCase(),
    String(scope || "CUSTOMER_SESSION").toUpperCase(),
    isSingleUse ? 1 : 0,
    safeTtl
  );

  return {
    id: res.lastInsertRowid,
    continuationToken: rawToken,
    tokenPrefix,
    expiresInMinutes: safeTtl,
    isSingleUse: Boolean(isSingleUse)
  };
}

/**
 * Redeems an opaque continuation token for the requested published experience slug.
 * Enforces: hash match, tenant & experience match, revocation check, expiry check, atomic single-use redemption.
 * Returns a short-lived customer session token bound strictly to that session & experience.
 */
function redeemContinuationToken(slug, rawToken) {
  if (!slug || !rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    const err = new Error("Continuation token is required");
    err.statusCode = 400;
    throw err;
  }

  const exp = db.prepare(`
    SELECT * FROM inapp_experiences
    WHERE slug = ? AND delete_status = 0
  `).get(String(slug).trim());

  if (!exp) {
    const err = new Error("Experience not found");
    err.statusCode = 404;
    throw err;
  }

  if (exp.status !== "PUBLISHED" || exp.active_status !== 1) {
    const err = new Error("This experience is currently unavailable");
    err.statusCode = 410;
    throw err;
  }

  const tokenHash = hashToken(rawToken);
  const tokenRow = db.prepare(`
    SELECT * FROM experience_continuation_tokens
    WHERE token_hash = ?
  `).get(tokenHash);

  if (!tokenRow) {
    const err = new Error("Invalid continuation link. Please request a fresh link on WhatsApp.");
    err.statusCode = 401;
    throw err;
  }

  // Enforce strict tenant + experience isolation
  if (Number(tokenRow.tenant_id) !== Number(exp.tenant_id) || Number(tokenRow.experience_id) !== Number(exp.id)) {
    const err = new Error("Continuation token does not belong to this experience.");
    err.statusCode = 403;
    throw err;
  }

  if (tokenRow.revoked_at) {
    const err = new Error("This continuation link has been revoked. Please request a new one on WhatsApp.");
    err.statusCode = 401;
    throw err;
  }

  const expiryCheck = db.prepare(`
    SELECT (expires_at <= UTC_TIMESTAMP()) as is_expired
    FROM experience_continuation_tokens
    WHERE id = ?
  `).get(tokenRow.id);

  if (expiryCheck?.is_expired === 1) {
    const err = new Error("This continuation link has expired. Reply 'resume' on WhatsApp for a fresh link.");
    err.statusCode = 401;
    err.code = "CONTINUATION_TOKEN_EXPIRED";
    throw err;
  }

  // Atomic single-use redemption preventing concurrent replay races
  if (Number(tokenRow.is_single_use) === 1) {
    const claim = db.prepare(`
      UPDATE experience_continuation_tokens
      SET redeemed_at = UTC_TIMESTAMP()
      WHERE id = ?
        AND redeemed_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > UTC_TIMESTAMP()
    `).run(tokenRow.id);

    if (!claim || claim.changes === 0) {
      const err = new Error("This continuation link has already been used. Please request a fresh link on WhatsApp.");
      err.statusCode = 401;
      err.code = "CONTINUATION_TOKEN_REPLAYED";
      throw err;
    }
  } else {
    db.prepare(`
      UPDATE experience_continuation_tokens
      SET redeemed_at = COALESCE(redeemed_at, UTC_TIMESTAMP())
      WHERE id = ?
    `).run(tokenRow.id);
  }

  // Resolve or create the linked inapp_session
  let session = null;
  if (tokenRow.inapp_session_id) {
    session = db.prepare(`
      SELECT * FROM inapp_sessions
      WHERE id = ? AND tenant_id = ? AND experience_id = ? AND delete_status = 0
    `).get(tokenRow.inapp_session_id, exp.tenant_id, exp.id);
  }

  const rotatedCustomerSessionToken = `csess_${crypto.randomBytes(20).toString("hex")}`;
  const entryScreenKey = exp.entry_screen_key || "welcome";

  if (!session) {
    const initialTranscript = buildTranscriptFromScreen(exp.id, entryScreenKey);
    const ins = db.prepare(`
      INSERT INTO inapp_sessions (
        tenant_id, experience_id, flow_session_id, session_token,
        visitor_phone, current_screen_key, navigation_stack_json, state_data_json,
        transcript_json, channel_owner, optimistic_lock_version, status,
        last_activity_at, expires_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, 'SURVYA', 1, 'ACTIVE',
        UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR),
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      exp.tenant_id,
      exp.id,
      tokenRow.flow_session_id || null,
      rotatedCustomerSessionToken,
      tokenRow.contact_phone || null,
      entryScreenKey,
      JSON.stringify([entryScreenKey]),
      JSON.stringify({
        flow_session_id: tokenRow.flow_session_id || null,
        phone: tokenRow.contact_phone || null
      }),
      JSON.stringify(initialTranscript)
    );
    session = db.prepare("SELECT * FROM inapp_sessions WHERE id = ?").get(ins.lastInsertRowid);
  } else {
    // Rotate customer session token on continuation handoff & claim SURVYA ownership
    db.prepare(`
      UPDATE inapp_sessions
      SET session_token = ?,
          channel_owner = 'SURVYA',
          last_activity_at = UTC_TIMESTAMP(),
          expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rotatedCustomerSessionToken, session.id);
    session = db.prepare("SELECT * FROM inapp_sessions WHERE id = ?").get(session.id);
  }

  return {
    sessionToken: session.session_token,
    experienceSlug: exp.slug,
    channelOwner: session.channel_owner || "SURVYA",
    currentScreenKey: session.current_screen_key || entryScreenKey,
    navigationStack: safeParseJson(session.navigation_stack_json, [entryScreenKey]),
    stateData: safeParseJson(session.state_data_json, {}),
    transcript: safeParseJson(session.transcript_json, []),
    optimisticLockVersion: Number(session.optimistic_lock_version || 1),
    flowSessionId: session.flow_session_id || null
  };
}

/**
 * Revokes all unredeemed continuation tokens for a session or flow.
 */
function revokeContinuationTokens({ tenantId = 1, inappSessionId = null, flowSessionId = null } = {}) {
  if (!inappSessionId && !flowSessionId) return { revoked: 0 };
  const conditions = ["tenant_id = ?", "revoked_at IS NULL"];
  const params = [Number(tenantId) || 1];

  if (inappSessionId) {
    conditions.push("inapp_session_id = ?");
    params.push(inappSessionId);
  }
  if (flowSessionId) {
    conditions.push("flow_session_id = ?");
    params.push(flowSessionId);
  }

  const res = db.prepare(`
    UPDATE experience_continuation_tokens
    SET revoked_at = UTC_TIMESTAMP()
    WHERE ${conditions.join(" AND ")}
  `).run(...params);

  return { revoked: res?.changes || 0 };
}

module.exports = {
  hashToken,
  issueContinuationToken,
  redeemContinuationToken,
  revokeContinuationTokens
};
