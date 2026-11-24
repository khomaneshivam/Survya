const { db, getSetting, setSetting } = require("../config/database");

const ALLOWED_PROVIDERS = new Set(["GEMINI", "OPENAI"]);
const MAX_MODEL_LENGTH = 160;
const MAX_INSTRUCTIONS_LENGTH = 6000;
const MAX_API_KEY_LENGTH = 8192;

const DEFAULT_RULES = Object.freeze({
  requireStepApproval: true,
  requireApiReview: true,
  requireMockTests: true,
  requireSandboxPreview: true,
  allowAutoPublish: false,
  allowRuntimeCodeChanges: false,
  instructions: ""
});

function getBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function readRules() {
  const raw = getSetting("AI_FLOW_BUILDER_RULES");
  if (!raw) return { ...DEFAULT_RULES };

  try {
    const stored = JSON.parse(raw);
    return {
      // Review gates are platform safety controls. Administrators can tailor
      // instructions, but cannot turn a generated flow into an ungated flow.
      requireStepApproval: true,
      requireApiReview: true,
      requireMockTests: true,
      requireSandboxPreview: true,
      // These safeguards are intentionally immutable from the admin UI.
      allowAutoPublish: false,
      allowRuntimeCodeChanges: false,
      instructions: typeof stored.instructions === "string"
        ? stored.instructions.slice(0, MAX_INSTRUCTIONS_LENGTH)
        : ""
    };
  } catch (_) {
    return { ...DEFAULT_RULES };
  }
}

function getCredentialStatus(provider) {
  const settingKey = provider === "OPENAI" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
  const environmentKey = provider === "OPENAI" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
  const savedCredential = getSetting(settingKey);
  const environmentCredential = process.env[environmentKey];

  return {
    configured: Boolean(savedCredential || environmentCredential),
    source: savedCredential ? "platform setting" : environmentCredential ? "environment" : "not configured"
  };
}

function getSafeConfig() {
  const storedProvider = String(getSetting("AI_PROVIDER") || "GEMINI").trim().toUpperCase();
  const provider = ALLOWED_PROVIDERS.has(storedProvider) ? storedProvider : "GEMINI";
  const configuredModel = getSetting(provider === "OPENAI" ? "OPENAI_MODEL" : "GEMINI_MODEL");
  const enabled = getBoolean(getSetting("AI_FLOW_BUILDER_ENABLED"), false);

  return {
    enabled,
    provider,
    model: String(configuredModel || (provider === "OPENAI" ? "gpt-4o-mini" : "gemini-1.5-flash")),
    credential: getCredentialStatus(provider),
    rules: readRules(),
    safety: {
      autoPublish: false,
      runtimeCodeChanges: false,
      liveMessageDispatch: false
    }
  };
}

function recordAudit(req, config) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      req.user?.tenant_id || 1,
      req.user?.id || null,
      "UPDATE_AI_FLOW_BUILDER_CONFIG",
      "AI_FLOW_BUILDER",
      JSON.stringify({
        enabled: config.enabled,
        provider: config.provider,
        model: config.model,
        credentialConfigured: config.credential.configured,
        rules: {
          requireStepApproval: config.rules.requireStepApproval,
          requireApiReview: config.rules.requireApiReview,
          requireMockTests: config.rules.requireMockTests,
          requireSandboxPreview: config.rules.requireSandboxPreview,
          hasInstructions: Boolean(config.rules.instructions)
        }
      }),
      req.ip || null
    );
  } catch (error) {
    // Audit logging must never make a safe configuration update unavailable.
    console.warn("[AI Flow Builder] Could not write audit log:", error.message);
  }
}

function getAiFlowBuilderConfig(req, res) {
  try {
    return res.json({ success: true, data: getSafeConfig() });
  } catch (error) {
    console.error("[AI Flow Builder] Could not load configuration:", error);
    return res.status(500).json({ success: false, message: "Could not load AI flow builder configuration." });
  }
}

function updateAiFlowBuilderConfig(req, res) {
  try {
    const body = req.body || {};
    const current = getSafeConfig();
    const provider = body.provider === undefined
      ? current.provider
      : String(body.provider).trim().toUpperCase();

    if (!ALLOWED_PROVIDERS.has(provider)) {
      return res.status(400).json({ success: false, message: "Provider must be GEMINI or OPENAI." });
    }

    const model = body.model === undefined ? current.model : String(body.model).trim();
    if (!model || model.length > MAX_MODEL_LENGTH) {
      return res.status(400).json({ success: false, message: `Model is required and must be at most ${MAX_MODEL_LENGTH} characters.` });
    }

    const suppliedRules = body.rules && typeof body.rules === "object" ? body.rules : {};
    const instructions = suppliedRules.instructions === undefined
      ? current.rules.instructions
      : String(suppliedRules.instructions).trim();
    if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
      return res.status(400).json({ success: false, message: `Flow-builder instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters.` });
    }

    const apiKey = body.apiKey === undefined ? "" : String(body.apiKey).trim();
    if (apiKey.length > MAX_API_KEY_LENGTH) {
      return res.status(400).json({ success: false, message: "API key is too long." });
    }

    const rules = {
      // Not accepted from the client: these remain hard safety boundaries.
      requireStepApproval: true,
      requireApiReview: true,
      requireMockTests: true,
      requireSandboxPreview: true,
      allowAutoPublish: false,
      allowRuntimeCodeChanges: false,
      instructions
    };

    setSetting("AI_PROVIDER", provider);
    setSetting(provider === "OPENAI" ? "OPENAI_MODEL" : "GEMINI_MODEL", model);
    setSetting("AI_FLOW_BUILDER_ENABLED", String(getBoolean(body.enabled, current.enabled)));
    setSetting("AI_FLOW_BUILDER_RULES", JSON.stringify(rules));

    // The value is encrypted by the settings layer and is never returned.
    if (apiKey && !apiKey.includes("••••")) {
      setSetting(provider === "OPENAI" ? "OPENAI_API_KEY" : "GEMINI_API_KEY", apiKey);
    }

    const safeConfig = getSafeConfig();
    recordAudit(req, safeConfig);
    return res.json({
      success: true,
      message: "AI flow builder configuration saved. Generated flows remain draft-only until separately approved.",
      data: safeConfig
    });
  } catch (error) {
    console.error("[AI Flow Builder] Could not save configuration:", error);
    return res.status(500).json({ success: false, message: "Could not save AI flow builder configuration." });
  }
}

module.exports = {
  getAiFlowBuilderConfig,
  updateAiFlowBuilderConfig,
  getSafeConfig,
  DEFAULT_RULES
};
