/**
 * Layer 8: Real Headless Chromium Browser E2E Verification
 * Exercises actual compiled React app (`frontend/dist`) served by Express (`server.js`)
 * backed by isolated MySQL (`whatsapp_bulk_test`) via Chrome DevTools Protocol (CDP).
 * Zero external network calls, zero live WhatsApp messages.
 */
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");

const { db, initializeDatabase } = require("../src/config/database");
const { app } = require("../server");

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function launchBrowserCdp() {
  const chromePath = findChromeBinary();
  if (!chromePath) return null;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "survya-cdp-"));
  const proc = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const wsBrowserUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Chrome DevTools WS URL")), 15000);
    let stderrBuf = "";
    proc.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString();
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early with code ${code}: ${stderrBuf}`));
    });
  });

  const u = new URL(wsBrowserUrl);
  const targetsRes = await fetch(`http://${u.host}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error("No Chrome page target found");
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const exceptions = [];

  ws.addEventListener("message", (evt) => {
    const msg = JSON.parse(String(evt.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      exceptions.push(msg.params?.exceptionDetails?.text || "Uncaught browser exception");
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");

  async function evalJs(expression) {
    const res = await send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Eval error");
    }
    return res.result?.value;
  }

  async function waitForText(text, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await evalJs(`return (document.body?.innerText || "").includes(${JSON.stringify(text)});`);
      if (found) return true;
      await new Promise((r) => setTimeout(r, 120));
    }
    const snippet = await evalJs(`return (document.body?.innerText || "").slice(0, 500);`);
    throw new Error(`Timed out waiting for text "${text}". Current body snippet: ${snippet}`);
  }

  async function clickButtonByText(text) {
    const ok = await evalJs(`
      const els = Array.from(document.querySelectorAll('button, [role="button"], a'));
      const target = els.find((el) => (el.innerText || "").trim().includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.click();
      return true;
    `);
    assert.equal(ok, true, `Expected clickable element containing "${text}"`);
  }

  async function setInputValue(selector, value) {
    const ok = await evalJs(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `);
    assert.equal(ok, true, `Expected input element matching "${selector}"`);
  }

  return {
    exceptions,
    navigate: async (url) => {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 350));
    },
    evalJs,
    waitForText,
    clickButtonByText,
    setInputValue,
    close: async () => {
      try { ws.close(); } catch {}
      try { proc.kill("SIGKILL"); } catch {}
      await new Promise((r) => setTimeout(r, 250));
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
  };
}

describe("Layer 8: Real Headless Browser E2E Verification", { concurrency: 1 }, () => {
  const ts = Date.now();
  const ownerEmail = `browser_owner_${ts}@clinic.internal`;
  const empEmail = `browser_emp_${ts}@clinic.internal`;
  const ownerPass = "BrowserOwner!123";
  const empPass = "BrowserEmp!123";

  let server = null;
  let baseUrl = "";
  let browser = null;
  let createdTenantId = null;

  before(async () => {
    initializeDatabase();
    // Ensure at least one prior user exists so browser registration provisions an isolated TRIAL workspace
    db.prepare(`
      INSERT IGNORE INTO users (id, tenant_id, name, email, phone, password_hash, role, status)
      VALUES (?, 1, 'Seed Guard Admin', 'seed_guard_browser@survya.local', '919900000088', 'hash', 'SUPER_ADMIN', 'ACTIVE')
    `).run(`seed_guard_${ts}`);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
    try {
      const ownerRow = db.prepare("SELECT id, tenant_id FROM users WHERE email = ?").get(ownerEmail);
      const tid = createdTenantId || ownerRow?.tenant_id;
      if (tid && Number(tid) > 1) {
        for (const tbl of [
          "inapp_sessions",
          "inapp_form_fields",
          "inapp_screens",
          "inapp_experiences",
          "conversation_flows",
          "pricing_rules",
          "catalog_addons",
          "catalog_addon_groups",
          "catalog_items",
          "catalog_categories",
          "business_entities",
          "master_categories",
          "master_locations",
          "master_units",
          "master_tax_slabs",
          "master_payment_modes",
          "crm_pipelines",
          "tenant_subscriptions",
          "tenant_user_memberships"
        ]) {
          try { db.prepare(`DELETE FROM ${tbl} WHERE tenant_id = ?`).run(tid); } catch {}
        }
        try { db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM tenants WHERE id = ?").run(tid); } catch {}
      }
      db.prepare("DELETE FROM users WHERE email IN (?, ?)").run(ownerEmail, empEmail);
      db.prepare("DELETE FROM users WHERE id = ?").run(`seed_guard_${ts}`);
    } catch {}
  });

  test("Browser E2E: Live Registration -> Team Invite in UI -> Flow Builder Render -> Employee Role Isolation", async (t) => {
    if (!fs.existsSync(path.join(__dirname, "..", "frontend", "dist", "index.html"))) {
      t.skip("frontend/dist/index.html missing — run frontend build first");
      return;
    }

    browser = await launchBrowserCdp();
    if (!browser) {
      t.skip("No headless Chrome/Edge binary available on host");
      return;
    }

    // 1. Open compiled React app & register new business workspace owner in real Chrome
    await browser.navigate(`${baseUrl}/`);
    await browser.waitForText("Launch Workspace");
    await browser.clickButtonByText("Launch Workspace");
    await browser.waitForText("Create SARVYA Account");

    await browser.evalJs(`
      const sel = document.querySelector('#regDomain');
      if (sel) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'CLINIC_HEALTH');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await browser.setInputValue("#regName", "Dr Kavita BrowserOwner");
    await browser.setInputValue("#regBizName", "Kavita Health Clinic");
    await browser.setInputValue("#regEmail", ownerEmail);
    await browser.setInputValue("#regPhone", "+919822334455");
    await browser.setInputValue("#regPwd", ownerPass);
    await browser.clickButtonByText("Create Workspace Account");

    await browser.waitForText("Team & Settings");

    // Verify Trial Clinic workspace sees Clinic suite in sidebar & does not see locked Hospitality rate calendar
    const ownerSidebarText = await browser.evalJs(`return document.querySelector('aside')?.innerText || document.body.innerText;`);
    assert.equal(ownerSidebarText.includes("Clinic & Appointments"), true, "Clinic user must see Clinic & Appointments in sidebar");
    assert.equal(ownerSidebarText.includes("Hospitality"), false, "TRIAL Clinic user must not see Hospitality module");

    // Verify backend MySQL persisted the new isolated tenant, primary_domain & OWNER membership
    const dbOwner = db.prepare("SELECT id, role, tenant_id FROM users WHERE email = ?").get(ownerEmail);
    assert.ok(dbOwner && dbOwner.tenant_id > 1, "Browser registration must create isolated tenant > 1");
    createdTenantId = dbOwner.tenant_id;
    assert.equal(dbOwner.role, "USER");
    const dbTenant = db.prepare("SELECT primary_domain FROM tenants WHERE id = ?").get(createdTenantId);
    assert.equal(dbTenant?.primary_domain, "CLINIC_HEALTH");
    const dbMem = db.prepare("SELECT role FROM tenant_user_memberships WHERE tenant_id = ? AND user_id = ?").get(createdTenantId, dbOwner.id);
    assert.equal(dbMem?.role, "OWNER");

    // 2. Navigate to Team & Settings -> Team & Access -> Invite Employee via live React modal
    await browser.clickButtonByText("Team & Settings");
    await browser.waitForText("Team & Access");
    await browser.clickButtonByText("Team & Access");
    await browser.waitForText("Invite Member");
    await browser.clickButtonByText("Invite Member");
    await browser.waitForText("Invite Workspace Member");

    const filledModal = await browser.evalJs(`
      const form = Array.from(document.querySelectorAll('form')).find((f) => f.innerText.includes('Temporary Password'));
      if (!form) return false;
      const inputs = form.querySelectorAll('input');
      const setVal = (el, val) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setVal(inputs[0], "Browser FrontDesk Emp");
      setVal(inputs[1], ${JSON.stringify(empEmail)});
      setVal(inputs[2], "919822334466");
      setVal(inputs[3], ${JSON.stringify(empPass)});
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.click();
      return true;
    `);
    assert.equal(filledModal, true);

    await browser.waitForText("Browser FrontDesk Emp");
    const dbEmp = db.prepare("SELECT id, tenant_id, role FROM users WHERE email = ?").get(empEmail);
    assert.ok(dbEmp && Number(dbEmp.tenant_id) === Number(createdTenantId));
    assert.equal(dbEmp.role, "USER");

    // 3. Open Flow Builder via live Sidebar click & confirm clean render (no TDZ/null errors)
    await browser.clickButtonByText("Flow Builder");
    await browser.waitForText("Flows Directory");

    // 3b. Open Catalog & Menu + 4-Mode Availability & Slots -> verify pre-built clinic items & zero DataTable React crash
    await browser.clickButtonByText("Catalog & Menu");
    await browser.waitForText("4-Mode Availability & Slots");
    const itemsTabText = await browser.evalJs(`return document.body.innerText || '';`);
    assert.equal(itemsTabText.includes("Unable to display"), false, "Catalog items view must render without React ErrorBoundary crash");
    await browser.clickButtonByText("4-Mode Availability & Slots");
    await browser.waitForText("Live Stock & Inventory Capacity");
    await browser.waitForText("AVAILABLE BALANCE");
    const rowCount = await browser.evalJs(`return document.querySelectorAll('.sarvya-table tbody tr').length;`);
    assert.ok(rowCount >= 1, "Expected seeded clinic rows rendered inside Availability DataTable");
    const catBodyText = await browser.evalJs(`return document.body.innerText || '';`);
    assert.equal(catBodyText.includes("Unable to display"), false, "Catalog Availability DataTable must render without React ErrorBoundary crash");

    // 4. Sign out and sign in as the Employee via live Login form -> confirm RBAC UI gating
    await browser.evalJs(`
      const btn = document.querySelector('button[aria-label="Sign out"]');
      if (btn) btn.click();
    `);
    await browser.waitForText("Sign in instead");
    await browser.clickButtonByText("Sign in instead");
    await browser.waitForText("Work Email");

    await browser.setInputValue("#loginEmail", empEmail);
    await browser.setInputValue("#loginPwd", empPass);
    await browser.evalJs(`document.querySelector('form button[type="submit"]').click();`);
    await browser.waitForText("My Account");

    const empSidebarText = await browser.evalJs(`return document.querySelector('aside')?.innerText || document.body.innerText;`);
    assert.equal(empSidebarText.includes("System Admin Panel"), false, "Employee must not see System Admin Panel");
    assert.equal(empSidebarText.includes("Payouts & Settlements"), false, "Employee must not see Payouts & Settlements");
    assert.equal(empSidebarText.includes("In-App Studio"), false, "Employee must not see Workspace Controls");

    await browser.clickButtonByText("My Account");
    await browser.waitForText("My Profile");
    const empSettingsText = await browser.evalJs(`return document.querySelector('main')?.innerText || "";`);
    assert.equal(empSettingsText.includes("Team & Access"), false, "Employee must not see Team & Access settings tab");
    assert.equal(empSettingsText.includes("Billing & GST Invoices"), false, "Employee must not see Billing settings tab");

    assert.equal(browser.exceptions.length, 0, `Unexpected browser JS exceptions: ${browser.exceptions.join(" | ")}`);
  });
});
