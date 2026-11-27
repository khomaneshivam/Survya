const dns = require('dns');
const net = require('net');
const { interpolateTemplate, getPath } = require('../expressionEvaluator');

function normalizeIpString(rawIp) {
  const ip = String(rawIp || '').toLowerCase().trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) return mapped;
  }
  return ip;
}

function checkIpBlockedReason(rawIp) {
  const ip = normalizeIpString(rawIp);
  if (!ip) return 'Loopback and local addresses are blocked';

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 127 || a === 0) return 'Loopback and local addresses are blocked';
    if (a === 169 && b === 254) return 'Cloud provider instance metadata endpoints are strictly prohibited';
    if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return 'Private network IP ranges are blocked';
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return 'Private network IP ranges are blocked';
    }
    return null;
  }

  if (net.isIPv6(ip)) {
    if (ip === '::1' || ip === '::' || /^0+:0+:0+:0+:0+:0+:0+:[01]$/.test(ip)) {
      return 'Loopback and local addresses are blocked';
    }
    if (ip.startsWith('fe80:') || ip.startsWith('fe90:') || ip.startsWith('fea0:') || ip.startsWith('feb0:')) {
      return 'Private network IP ranges are blocked';
    }
    if (/^f[cd][0-9a-f]{2}:/i.test(ip)) {
      return 'Private network IP ranges are blocked';
    }
    // ::ffff:hex mapped IPv4
    if (ip.startsWith('::ffff:')) {
      return 'Private network IP ranges are blocked';
    }
  }
  return null;
}

/**
 * Validates a target URL synchronously against SSRF vulnerabilities.
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

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Disallowed protocol: ${parsed.protocol}`);
  }

  const host = (parsed.hostname || '').toLowerCase().trim().replace(/^\[|\]$/g, '');

  // Loopback / internal suffixes
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localdomain')
  ) {
    throw new Error('Loopback and local addresses are blocked');
  }

  if (host === 'metadata.google.internal' || host === 'metadata') {
    throw new Error('Cloud provider instance metadata endpoints are strictly prohibited');
  }

  // Integer / octal / hex obfuscated IPv4 hostnames (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^0[0-7]+\./.test(host)) {
    throw new Error('Private network IP ranges are blocked');
  }

  const ipReason = checkIpBlockedReason(host);
  if (ipReason) {
    throw new Error(ipReason);
  }

  return true;
}

/**
 * Async SSRF Guard verifying resolved DNS A/AAAA records before outbound HTTP fetch.
 */
async function validateResolvedUrlSecurity(urlStr, dnsLookupFn = dns.promises.lookup, { allowUnresolvedTestDomain = false } = {}) {
  validateUrlSecurity(urlStr);
  const parsed = new URL(urlStr);
  const host = (parsed.hostname || '').toLowerCase().trim().replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return true;

  try {
    const records = await dnsLookupFn(host, { all: true });
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error(`DNS lookup returned no addresses for ${host}`);
    }
    for (const rec of records) {
      const reason = checkIpBlockedReason(rec.address);
      if (reason) {
        throw new Error(`DNS resolved to blocked address (${rec.address}): ${reason}`);
      }
    }
  } catch (err) {
    if (
      allowUnresolvedTestDomain &&
      process.env.NODE_ENV === 'test' &&
      /\.(test|example)$/i.test(host) &&
      (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN')
    ) {
      return true;
    }
    throw err;
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

  // Simulator / Sandbox Mode: NEVER make live external HTTP calls
  let isSandboxTenant = Boolean(context.isSandbox || context.isSimulation || context.transportSimulation);
  if (!isSandboxTenant && context.tenantId) {
    try {
      const { db } = require('../../../config/database');
      const trow = db.prepare('SELECT is_sandbox FROM tenants WHERE id = ? LIMIT 1').get(Number(context.tenantId));
      if (Number(trow?.is_sandbox) === 1) isSandboxTenant = true;
    } catch (_) {}
  }

  if (dryRun || isSandboxTenant) {
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

  // Live Mode: Verify DNS resolution & perform HTTP request with no auto-redirect
  try {
    await validateResolvedUrlSecurity(interpolatedUrl, dns.promises.lookup, { allowUnresolvedTestDomain: true });
    const response = await fetch(interpolatedUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000)
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        action: 'CONTINUE',
        nextHandle: 'failure',
        traceNote: `SSRF Block: HTTP redirects (${response.status}) are prohibited on outbound webhooks [Handle: failure]`
      };
    }

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

module.exports = {
  execute,
  isBlockedHost,
  validateUrlSecurity,
  validateResolvedUrlSecurity,
  checkIpBlockedReason
};
