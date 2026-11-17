const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend', 'src');

describe('SARVYA Master UI/UX Design System Verification', () => {
  it('defines all required SARVYA color tokens and CSS cascade layers without global margin reset', () => {
    const css = fs.readFileSync(path.join(FRONTEND, 'index.css'), 'utf8');

    assert.match(css, /@layer reset, base, theme, components, utilities;/);
    assert.ok(!/\*\s*\{[^}]*(margin|padding)\s*:\s*0/m.test(css), 'Must not use global * margin/padding reset');

    const requiredHexTokens = [
      '#F5F5F6',
      '#FFFFFF',
      '#171719',
      '#67676B',
      '#96969C',
      '#E5E5E8',
      '#2876B8',
      '#B0DBF6',
      '#C3D1AC',
      '#EFB0F6',
      '#FDB1AF',
      '#8E7B7A'
    ];

    for (const hex of requiredHexTokens) {
      assert.ok(css.includes(hex), `Expected SARVYA token ${hex} in index.css`);
    }

    assert.match(css, /dialog\.sarvya-dialog:modal[\s\S]*overscroll-behavior:\s*contain/);
    assert.match(css, /dialog\.sarvya-dialog::backdrop[\s\S]*overscroll-behavior:\s*contain/);
    assert.match(css, /\.table-wrapper[\s\S]*container-type:\s*inline-size/);
  });

  it('uses native accessible <dialog>.showModal() in reusable Modal component', () => {
    const modalCode = fs.readFileSync(path.join(FRONTEND, 'components', 'ui', 'Modal.jsx'), 'utf8');
    assert.match(modalCode, /<dialog/);
    assert.match(modalCode, /\.showModal\(\)/);
    assert.ok(!/role="dialog"/.test(modalCode), 'Native <dialog> must not carry redundant role="dialog"');
  });

  it('uses accessible focusable table-wrapper and ARIA tabs in UI primitives', () => {
    const tableCode = fs.readFileSync(path.join(FRONTEND, 'components', 'ui', 'DataTable.jsx'), 'utf8');
    assert.match(tableCode, /className="table-wrapper"/);
    assert.match(tableCode, /tabIndex=\{0\}/);
    assert.match(tableCode, /role="region"/);

    const tabsCode = fs.readFileSync(path.join(FRONTEND, 'components', 'ui', 'Tabs.jsx'), 'utf8');
    assert.match(tabsCode, /role="tablist"/);
    assert.match(tabsCode, /role="tab"/);
    assert.match(tabsCode, /aria-selected=/);
  });

  it('wires all required SARVYA ecosystem modules in Sidebar and App router', () => {
    const sidebar = fs.readFileSync(path.join(FRONTEND, 'components', 'Sidebar.jsx'), 'utf8');
    const app = fs.readFileSync(path.join(FRONTEND, 'App.jsx'), 'utf8');

    for (const label of ['Overview', 'CRM', 'Forms', 'Workflows', 'Conversations', 'Campaigns', 'Chat Links', 'SARVYA AI', 'Insights', 'Connect', 'Hospitality']) {
      assert.ok(sidebar.includes(label), `Sidebar must expose "${label}"`);
    }

    for (const tabId of ['dashboard', 'enquiries', 'flows', 'automation', 'inbox', 'broadcast', 'links', 'ai', 'reports', 'connect', 'settings', 'inventory']) {
      assert.ok(app.includes(`activeTab === '${tabId}'`), `App must render module view for "${tabId}"`);
    }
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'SARVYA_CONNECT_PRD.md')), 'SARVYA_CONNECT_PRD.md must exist in docs/');
  });

  it('eliminates dark gradient banners and legacy Emerald accents from pages', () => {
    const filesToCheck = [
      'App.jsx',
      'components/Sidebar.jsx',
      'components/Topbar.jsx',
      'components/TemplateBuilderModal.jsx',
      'pages/ChatLinksPage.jsx',
      'pages/SarvyaConnectPage.jsx',
      'pages/DashboardPage.jsx',
      'pages/EnquiriesPage.jsx',
      'pages/AiAssistantPage.jsx',
      'pages/FlowsPage.jsx',
      'pages/AutomationPage.jsx',
      'pages/InventoryCalendarPage.jsx',
      'pages/SettingsPage.jsx',
      'pages/AdminPage.jsx',
      'pages/LandingPage.jsx',
      'pages/LoginPage.jsx',
      'pages/RegisterPage.jsx'
    ];

    for (const rel of filesToCheck) {
      const code = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
      assert.ok(!/linear-gradient/i.test(code), `${rel} should not contain unnecessary gradients`);
      assert.ok(!/#10B981|#059669|#128C7E/i.test(code), `${rel} should not retain legacy emerald accents`);
    }
  });
});

