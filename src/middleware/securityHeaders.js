const config = require("../config/env");

/**
 * Enterprise HTTP Security Headers Middleware
 * Implements OWASP recommended security headers for production SaaS applications.
 */
function securityHeaders(req, res, next) {
  // 1. Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // 2. Prevent clickjacking by restricting framing
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // 3. Disable buggy legacy XSS auditor in modern browsers in favor of CSP
  res.setHeader("X-XSS-Protection", "0");

  // 4. Control referrer information leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // 5. Restrict access to sensitive device APIs
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), vr=(), interest-cohort=()"
  );

  // 6. Cross-Origin Opener Policy to isolate browsing context
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // 7. Strict-Transport-Security (HSTS) on HTTPS or behind proxy
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (isHttps || config.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // 8. Content Security Policy (tuned for React SPA + Meta webhook integrations)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://graph.facebook.com https://*.facebook.com https://*.loca.lt https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'"
  ];

  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));

  return next();
}

module.exports = securityHeaders;

