const crypto = require("crypto");
const { db } = require("../config/database");
const { sanitizePreviewGraph, simulateBrowserPreview } = require("./flowPreviewSandbox");

const DEFAULT_EXPIRY_HOURS = 24;
const MAX_EXPIRY_HOURS = 24 * 7;
const MIN_EXPIRY_HOURS = 1;
const PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

class FlowPreviewError extends Error {
  constructor(message, { code = "FLOW_PREVIEW_ERROR", statusCode = 400, publicMessage = "Preview is unavailable." } = {}) {
    super(message);
    this.name = "FlowPreviewError";
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

function mysqlUtcDate(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function apiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const utcValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const parsed = new Date(utcValue);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stableTokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOpaqueToken() {
  // 32 random bytes encode to a 43-character base64url value. It contains no
  // routing, phone, tenant, or flow information and is safe in a hash path.
  return crypto.randomBytes(32).toString("base64url");
}

function generatePreviewId() {
  return `preview_${crypto.randomBytes(12).toString("hex")}`;
}

function normalizeExpiryHours(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_EXPIRY_HOURS;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < MIN_EXPIRY_HOURS || hours > MAX_EXPIRY_HOURS) {
    throw new FlowPreviewError(
      `Preview expiry must be between ${MIN_EXPIRY_HOURS} and ${MAX_EXPIRY_HOURS} hours.`,
      { code: "INVALID_PREVIEW_EXPIRY" }
    );
  }
  return Math.round(hours * 4) / 4;
}

function normalizeTitle(value, fallback) {
  const title = String(value || fallback || "Flow preview").replace(/\0/g, "").trim();
  return title.slice(0, 255) || "Flow preview";
}

function audit(tenantId, userId, action, targetId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenantId, userId || null, action, String(targetId), JSON.stringify(details || {}));
  } catch (_) {
    // The preview lifecycle remains usable if audit storage is unavailable.
  }
}

function assertFlowId(flowId) {
  const parsed = Number(flowId);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new FlowPreviewError("A valid conversation flow is required.", { code: "INVALID_FLOW_ID" });
  }
  return parsed;
}

function draftSnapshotForFlow(flowId, tenantId) {
  const parsedFlowId = assertFlowId(flowId);
  const flow = db.prepare(`
    SELECT
      f.id, f.tenant_id, f.name, f.description, f.property_id,
      v.id AS version_id, v.status AS version_status,
      v.nodes_json, v.transitions_json
    FROM conversation_flows f
    JOIN conversation_flow_versions v ON v.id = f.current_draft_version_id
    WHERE f.id = ?
      AND f.tenant_id = ?
      AND COALESCE(f.delete_status, 0) = 0
      AND f.status != 'ARCHIVED'
    LIMIT 1
  `).get(parsedFlowId, Number(tenantId || 1));

  if (!flow) {
    throw new FlowPreviewError("Conversation flow not found.", { code: "FLOW_NOT_FOUND", statusCode: 404 });
  }
  if (String(flow.version_status || "").toUpperCase() !== "DRAFT") {
    throw new FlowPreviewError(
      "Save an unpublished draft before creating a browser preview link.",
      { code: "DRAFT_REQUIRED" }
    );
  }

  let graph;
  try {
    graph = sanitizePreviewGraph({
      name: flow.name,
      description: flow.description,
      nodes: parseJson(flow.nodes_json, []),
      transitions: parseJson(flow.transitions_json, [])
    });
  } catch (error) {
    throw new FlowPreviewError(error.message || "The draft cannot be used for a browser preview.", {
      code: "INVALID_DRAFT_GRAPH"
    });
  }

  return { flow, graph };
}

function adminPreviewRecord(row, token = null) {
  const record = {
    id: row.id,
    flowId: Number(row.flow_id),
    flowVersionId: Number(row.flow_version_id),
    title: row.title || "Flow preview",
    tokenPrefix: row.token_prefix,
    status: row.status,
    expiresAt: apiDate(row.expires_at),
    createdAt: apiDate(row.created_at),
    lastAccessedAt: apiDate(row.last_accessed_at),
    revokedAt: apiDate(row.revoked_at),
    browserOnly: true,
    tokenAvailableOnlyAtCreation: true
  };

  if (token) {
    record.token = token;
    record.browserPath = `/#flow-preview/${token}`;
  }
  return record;
}

function markExpiredForFlow(flowId, tenantId) {
  db.prepare(`
    UPDATE flow_preview_links
    SET status = 'EXPIRED'
    WHERE flow_id = ? AND tenant_id = ?
      AND status = 'ACTIVE' AND expires_at <= UTC_TIMESTAMP()
  `).run(flowId, tenantId);
}

function createPreviewLink({ flowId, tenantId = 1, user = null, title, expiresInHours } = {}) {
  const normalizedTenantId = Number(tenantId || 1);
  const { flow, graph } = draftSnapshotForFlow(flowId, normalizedTenantId);
  const expiryHours = normalizeExpiryHours(expiresInHours);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
  const previewTitle = normalizeTitle(title, graph.title);
  const createdBy = String(user?.id || user?.name || "").slice(0, 64) || null;

  // A link token is stored only as a SHA-256 hash. It is returned once on
  // creation to an authenticated administrator and cannot be recovered later.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = generatePreviewId();
    const token = generateOpaqueToken();
    const tokenHash = stableTokenHash(token);
    try {
      db.prepare(`
        INSERT INTO flow_preview_links (
          id, tenant_id, flow_id, flow_version_id, token_hash, token_prefix,
          title, graph_json, status, expires_at, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, CURRENT_TIMESTAMP)
      `).run(
        id,
        normalizedTenantId,
        flow.id,
        flow.version_id,
        tokenHash,
        token.slice(0, 10),
        previewTitle,
        JSON.stringify({ ...graph, title: previewTitle }),
        mysqlUtcDate(expiresAt),
        createdBy
      );

      audit(normalizedTenantId, user?.id, "CREATE_FLOW_BROWSER_PREVIEW", id, {
        flowId: flow.id,
        flowVersionId: flow.version_id,
        expiresAt: mysqlUtcDate(expiresAt),
        browserOnly: true
      });

      return adminPreviewRecord({
        id,
        flow_id: flow.id,
        flow_version_id: flow.version_id,
        title: previewTitle,
        token_prefix: token.slice(0, 10),
        status: "ACTIVE",
        expires_at: mysqlUtcDate(expiresAt),
        created_at: new Date(),
        last_accessed_at: null,
        revoked_at: null
      }, token);
    } catch (error) {
      // Collision is extraordinarily unlikely, but retry only for the unique
      // token hash. All other database failures must remain visible.
      if (attempt === 2 || !/duplicate|unique/i.test(String(error?.message || ""))) throw error;
    }
  }

  throw new FlowPreviewError("Could not create a secure preview token.", { code: "TOKEN_CREATION_FAILED", statusCode: 500 });
}

function listPreviewLinks(flowId, tenantId = 1) {
  const parsedFlowId = assertFlowId(flowId);
  const normalizedTenantId = Number(tenantId || 1);
  // Scope the listing to an existing flow, so IDs cannot enumerate another
  // tenant's records even if a route caller were incorrectly wired later.
  const flow = db.prepare(`
    SELECT id FROM conversation_flows
    WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
  `).get(parsedFlowId, normalizedTenantId);
  if (!flow) throw new FlowPreviewError("Conversation flow not found.", { code: "FLOW_NOT_FOUND", statusCode: 404 });

  markExpiredForFlow(parsedFlowId, normalizedTenantId);
  const links = db.prepare(`
    SELECT id, flow_id, flow_version_id, token_prefix, title, status,
           expires_at, created_at, last_accessed_at, revoked_at
    FROM flow_preview_links
    WHERE flow_id = ? AND tenant_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(parsedFlowId, normalizedTenantId).map(row => adminPreviewRecord(row));
  return { links };
}

function revokePreviewLink({ previewLinkId, tenantId = 1, user = null } = {}) {
  const id = String(previewLinkId || "").trim();
  if (!/^preview_[a-f0-9]{24}$/i.test(id)) {
    throw new FlowPreviewError("A valid preview link is required.", { code: "INVALID_PREVIEW_LINK_ID" });
  }
  const normalizedTenantId = Number(tenantId || 1);
  const existing = db.prepare(`
    SELECT id, flow_id, flow_version_id, token_prefix, title, status,
           expires_at, created_at, last_accessed_at, revoked_at
    FROM flow_preview_links
    WHERE id = ? AND tenant_id = ?
  `).get(id, normalizedTenantId);
  if (!existing) {
    throw new FlowPreviewError("Preview link not found.", { code: "PREVIEW_LINK_NOT_FOUND", statusCode: 404 });
  }

  if (existing.status === "ACTIVE") {
    db.prepare(`
      UPDATE flow_preview_links
      SET status = 'REVOKED', revoked_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'
    `).run(id, normalizedTenantId);
  }
  const revoked = db.prepare(`
    SELECT id, flow_id, flow_version_id, token_prefix, title, status,
           expires_at, created_at, last_accessed_at, revoked_at
    FROM flow_preview_links
    WHERE id = ? AND tenant_id = ?
  `).get(id, normalizedTenantId);

  audit(normalizedTenantId, user?.id, "REVOKE_FLOW_BROWSER_PREVIEW", id, {
    flowId: existing.flow_id,
    previousStatus: existing.status,
    browserOnly: true
  });
  return adminPreviewRecord(revoked || { ...existing, status: "REVOKED" });
}

function assertPreviewToken(token) {
  const normalized = String(token || "").trim();
  if (!PREVIEW_TOKEN_PATTERN.test(normalized)) {
    throw new FlowPreviewError("Preview is unavailable.", {
      code: "PREVIEW_UNAVAILABLE",
      statusCode: 404,
      publicMessage: "Preview is unavailable."
    });
  }
  return normalized;
}

function activePreviewForToken(token) {
  const normalizedToken = assertPreviewToken(token);
  const tokenHash = stableTokenHash(normalizedToken);

  // This public lookup is intentionally read-only. Expiration is evaluated in
  // the query itself rather than written back here, so previewing can never
  // mutate production data or establish any server-side simulator state.
  const row = db.prepare(`
    SELECT p.id, p.flow_id, p.flow_version_id, p.title, p.graph_json, p.expires_at
    FROM flow_preview_links p
    JOIN conversation_flows f ON f.id = p.flow_id AND f.tenant_id = p.tenant_id
    WHERE p.token_hash = ?
      AND p.status = 'ACTIVE'
      AND p.expires_at > UTC_TIMESTAMP()
      AND COALESCE(f.delete_status, 0) = 0
      AND f.status != 'ARCHIVED'
    LIMIT 1
  `).get(tokenHash);
  if (!row) {
    throw new FlowPreviewError("Preview is unavailable.", {
      code: "PREVIEW_UNAVAILABLE",
      statusCode: 404,
      publicMessage: "Preview is unavailable."
    });
  }

  let graph;
  try {
    // Re-sanitize the persisted snapshot before every public response. This
    // protects public data even if a legacy row was inserted outside this API.
    graph = sanitizePreviewGraph(parseJson(row.graph_json, {}));
  } catch (_) {
    throw new FlowPreviewError("Preview is unavailable.", {
      code: "PREVIEW_UNAVAILABLE",
      statusCode: 404,
      publicMessage: "Preview is unavailable."
    });
  }

  return { row, graph };
}

function publicPreviewPayload(graph, expiresAt) {
  return {
    preview: {
      title: graph.title,
      description: graph.description,
      expiresAt: apiDate(expiresAt),
      mode: "BROWSER_ONLY_DRY_RUN"
    },
    graph: {
      schemaVersion: graph.schemaVersion,
      title: graph.title,
      description: graph.description,
      startNodeId: graph.startNodeId,
      nodes: graph.nodes,
      transitions: graph.transitions
    },
    safety: {
      browserOnly: true,
      dryRun: true,
      outboundMessaging: false,
      externalRequests: false,
      persistence: false,
      codeExecution: false,
      notice: "This preview never sends WhatsApp messages or invokes Meta, webhooks, AI, CRM, or live integrations."
    }
  };
}

function getPublicPreview(token) {
  const { row, graph } = activePreviewForToken(token);
  return publicPreviewPayload(graph, row.expires_at);
}

function simulatePublicPreview({ token, input, selectedOptionId, state } = {}) {
  const { row, graph } = activePreviewForToken(token);
  const simulation = simulateBrowserPreview(graph, {
    input,
    selectedOptionId,
    state
  });
  return {
    preview: {
      title: graph.title,
      expiresAt: apiDate(row.expires_at),
      mode: "BROWSER_ONLY_DRY_RUN"
    },
    simulation
  };
}

module.exports = {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  MIN_EXPIRY_HOURS,
  PREVIEW_TOKEN_PATTERN,
  FlowPreviewError,
  createPreviewLink,
  listPreviewLinks,
  revokePreviewLink,
  getPublicPreview,
  simulatePublicPreview,
  // Exported for mock-only unit tests and endpoint-contract assertions.
  stableTokenHash,
  generateOpaqueToken
};
