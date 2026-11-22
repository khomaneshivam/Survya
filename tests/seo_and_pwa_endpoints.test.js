const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');

describe('Task 5: Technical SEO & PWA Verification Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. GET /robots.txt serves valid robots directives and sitemap reference', async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(res.status, 200);

    const contentType = res.headers.get('content-type') || '';
    const cacheControl = res.headers.get('cache-control') || '';
    assert.ok(contentType.includes('text/plain'), `Content-Type should be text/plain, got ${contentType}`);
    assert.equal(cacheControl, 'public, max-age=86400');

    const body = await res.text();
    assert.ok(body.includes('User-agent: *'), 'Must declare User-agent');
    assert.ok(body.includes('Allow: /'), 'Must allow root');
    assert.ok(body.includes('Allow: /pricing'), 'Must allow pricing');
    assert.ok(body.includes('Allow: /solutions'), 'Must allow solutions');
    assert.ok(body.includes('Disallow: /api/'), 'Must disallow api');
    assert.ok(body.includes('Disallow: /admin'), 'Must disallow admin');
    assert.ok(body.includes('Disallow: /dashboard'), 'Must disallow dashboard');
    assert.ok(body.includes('Disallow: /c/'), 'Must disallow customer links');
    assert.ok(body.includes('Disallow: /x/'), 'Must disallow runtime links');
    assert.ok(body.includes('Sitemap:'), 'Must link to sitemap.xml');
    assert.ok(body.includes('/sitemap.xml'), 'Sitemap url must be valid');
  });

  test('2. GET /sitemap.xml serves valid XML sitemap with high-intent routes', async () => {
    const res = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(res.status, 200);

    const contentType = res.headers.get('content-type') || '';
    const cacheControl = res.headers.get('cache-control') || '';
    assert.ok(contentType.includes('xml'), `Content-Type should be xml, got ${contentType}`);
    assert.equal(cacheControl, 'public, max-age=86400');

    const body = await res.text();
    assert.ok(body.includes('<?xml version="1.0" encoding="UTF-8"?>'), 'Must contain xml declaration');
    assert.ok(body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Must contain urlset namespace');
    assert.ok(body.includes('</urlset>'), 'Must close urlset');

    // Key routes
    assert.ok(body.includes('<priority>1.0</priority>'), 'Root must have 1.0 priority');
    assert.ok(body.includes('/pricing'), 'Must contain pricing route');
    assert.ok(body.includes('/solutions/hospitality'), 'Must contain hospitality solution');
    assert.ok(body.includes('/solutions/b2b-sales'), 'Must contain b2b sales solution');
    assert.ok(body.includes('/solutions/clinics'), 'Must contain clinics solution');
    assert.ok(body.includes('/solutions/d2c'), 'Must contain d2c solution');
    assert.ok(body.includes('/privacy'), 'Must contain privacy route');
    assert.ok(body.includes('/terms'), 'Must contain terms route');
    assert.ok(body.includes('<lastmod>'), 'Must contain dynamic lastmod timestamp');
  });

  test('3. GET /manifest.webmanifest serves installable PWA manifest', async () => {
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(res.status, 200);

    const cacheControl = res.headers.get('cache-control') || '';
    assert.equal(cacheControl, 'no-cache, no-store, must-revalidate');

    const manifest = await res.json();
    assert.equal(manifest.name, 'SARVYA — Zero-Markup WhatsApp CRM & Automation');
    assert.equal(manifest.short_name, 'SARVYA');
    assert.equal(manifest.start_url, '/inbox');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#2563eb');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Must have icons');
  });

  test('4. GET /sw.js serves service worker with strict API/SSE bypass', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    assert.equal(res.status, 200);

    const cacheControl = res.headers.get('cache-control') || '';
    assert.equal(cacheControl, 'no-cache, no-store, must-revalidate');

    const script = await res.text();
    assert.ok(script.includes('/api'), 'Must check api bypass');
    assert.ok(script.includes('/webhook'), 'Must check webhook bypass');
    assert.ok(script.includes('/stream'), 'Must check SSE stream bypass');
  });

  test('5. GET / serves HTML with technical SEO, JSON-LD schemas, and no-cache header', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);

    const cacheControl = res.headers.get('cache-control') || '';
    assert.equal(cacheControl, 'no-cache, no-store, must-revalidate');

    const html = await res.text();

    // Head Metadata
    assert.ok(html.includes('SARVYA — Zero-Markup WhatsApp Business API CRM'), 'Must have SEO title');
    assert.ok(html.includes('name="description"'), 'Must have meta description');
    assert.ok(html.includes('rel="canonical"'), 'Must have canonical link');
    assert.ok(html.includes('rel="manifest"'), 'Must link to manifest.webmanifest');
    assert.ok(html.includes('name="theme-color" content="#2563eb"'), 'Must have theme color');

    // Structured Data Schemas
    assert.ok(html.includes('"@type": "SoftwareApplication"'), 'Must have SoftwareApplication schema');
    assert.ok(html.includes('"@type": "Organization"'), 'Must have Organization schema');
    assert.ok(html.includes('"@type": "FAQPage"'), 'Must have FAQPage schema');
  });

});
