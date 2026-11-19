const { interpolateTemplate, getPath } = require('../expressionEvaluator');

/**
 * Validates a target URL against SSRF vulnerabilities.
 * Throws explicit descriptive error if address is private, loopback, or metadata.
 */
function validateUrlSecurity(urlStr) {
  if (!urlStr) throw new Error('Empty URL provided');
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (e) {
    throw new Error(`Invalid URL format: ${urlStr}`);
  }

  const host = (parsed.hostname || '').toLowerCase().trim();

  // Loopback / localhost
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    throw new Error('Loopback and local addresses are blocked');
  }

  // AWS / GCP / Azure link-local metadata service
  if (host === '169.254.169.254' || host.startsWith('169.254.')) {
    throw new Error('Cloud provider instance metadata endpoints are strictly prohibited');
  }

  // IPv4 Private subnets
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
    throw new Error('Private network IP ranges are blocked');
  }

  const m172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m172) {
    const octet = Number(m172[1]);
    if (octet >= 16 && octet <= 31) {
      throw new Error('Private network IP ranges are blocked');
    }
  }

  return true;
}

/**
 * Checks whether an IP or hostname is private, loopback, or cloud-metadata (SSRF Guard)
 */
function isBlockedHost(hostname) {
  try {
    validateUrlSecurity(`http://${hostname}`);
    return false;
  } catch (e) {
    return true;
  }
}

/**
 * 11. External HTTP Webhook / REST API Node Executor (HTTP_WEBHOOK, API_INTEGRATION)
 */
async function execute(node, context) {
  const { session = {}, dryRun = false, variableContext } = context;
  const config = node.config || node.data || {};
  const evalContext = variableContext || session;

  const rawUrl = config.url || '';
  const method = (config.method || 'POST').toUpperCase();
  const interpolatedUrl = interpolateTemplate(rawUrl, evalContext);

  if (!interpolatedUrl) {
    return {
      action: 'CONTINUE',
      nextHandle: 'failure',
      traceNote: 'Webhook URL is missing or empty [Handle: failure]'
    };
  }

  // SSRF Protection
  let parsedUrl;
  try {
    parsedUrl = new URL(interpolatedUrl);
  } catch (e) {
    return {
      action: 'CONTINUE',
      nextHandle: 'failure',
      traceNote: `Invalid Webhook URL format: "${interpolatedUrl}" [Handle: failure]`
    };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      action: 'CONTINUE',
      nextHandle: 'failure',
      traceNote: `SSRF Block: Disallowed protocol "${parsedUrl.protocol}". Only HTTP/HTTPS allowed.`
    };
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    return {
      action: 'CONTINUE',
      nextHandle: 'failure',
      traceNote: `SSRF Block: Access to private/loopback/cloud metadata host "${parsedUrl.hostname}" is strictly prohibited.`
    };
  }

  // Interpolate headers and body
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'SARVYA-Workflow-Engine/2.0'
  };
  if (config.headers && typeof config.headers === 'object') {
    for (const [k, v] of Object.entries(config.headers)) {
      headers[k] = interpolateTemplate(String(v), evalContext);
    }
  }

  let body = undefined;
  if (method !== 'GET' && method !== 'HEAD' && config.body) {
    body = typeof config.body === 'string'
      ? interpolateTemplate(config.body, evalContext)
      : JSON.stringify(config.body);
  }

  // Simulator Mode: NEVER make live external HTTP calls
  if (dryRun) {
    const mockResponse = config.mockResponse || {
      ok: true,
      status: 'simulated_success',
      data: {
        booking_url: 'https://example.com/checkout/demo-123',
        lead_id: 'EXT-LEAD-99',
        calendar_slots: ['Tomorrow 11:00 AM', 'Tomorrow 3:00 PM', 'Day after 2:00 PM']
      }
    };

    const updatedData = {};
    const mappings = Array.isArray(config.responseMappings) ? config.responseMappings : [];
    for (const mapping of mappings) {
      if (mapping.jsonPath && mapping.mapToVariable) {
        const val = getPath(mockResponse, mapping.jsonPath);
        if (val !== undefined) updatedData[mapping.mapToVariable] = val;
      }
    }

    return {
      success: true,
      mock: true,
      responseStatus: 200,
      action: 'CONTINUE',
      nextHandle: 'success',
      updatedData,
      traceNote: `[Simulated] HTTP ${method} to ${interpolatedUrl} succeeded (Zero network cost) [Handle: success]`
    };
  }

  // Live Mode: Perform HTTP request with timeout & size limits
  try {
    const response = await fetch(interpolatedUrl, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(8000)
    });

    const text = await response.text();
    if (text.length > 256 * 1024) {
      throw new Error(`Response size (${Math.round(text.length / 1024)} KB) exceeded 256 KB safety limit.`);
    }

    let json = {};
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    const updatedData = {
      'api.response': json,
      'api.status': response.status
    };

    const mappings = Array.isArray(config.responseMappings) ? config.responseMappings : [];
    for (const mapping of mappings) {
      if (mapping.jsonPath && mapping.mapToVariable) {
        const val = getPath(json, mapping.jsonPath);
        if (val !== undefined) updatedData[mapping.mapToVariable] = val;
      }
    }

    const handle = response.ok ? 'success' : 'failure';
    return {
      action: 'CONTINUE',
      nextHandle: handle,
      updatedData,
      traceNote: `HTTP ${method} to ${parsedUrl.hostname} completed with status ${response.status} [Handle: ${handle}]`
    };
  } catch (err) {
    return {
      action: 'CONTINUE',
      nextHandle: 'failure',
      traceNote: `HTTP ${method} request failed: ${err.message} [Handle: failure]`
    };
  }
}

module.exports = { execute, isBlockedHost, validateUrlSecurity };
