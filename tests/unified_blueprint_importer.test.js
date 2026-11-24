/**
 * Unified Industry Blueprint Importer & Business Profile Test Suite
 * Tests full-suite industry onboarding: ERP master seeding, entity/property creation,
 * catalog items & pricing rules, pre-wired WhatsApp flow generation, profile customization,
 * and tenant isolation under TZ=Asia/Kolkata.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../src/config/database');
const universalCatalogService = require('../src/services/universal/universalCatalogService');

test('Unified Blueprint Importer: Full Industry Suite Provisioning & Profile Customization', async (t) => {
  const testTenantId = 99801;
  const testUserId = 1;

  // Cleanup helper
  const cleanupTenant = (tenantId) => {
    db.prepare('DELETE FROM catalog_pricing_rules WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM catalog_addons WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM catalog_addon_groups WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM catalog_item_media WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM catalog_items WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM conversation_flow_events WHERE flow_id IN (SELECT id FROM conversation_flows WHERE tenant_id = ?)').run(tenantId);
    db.prepare('DELETE FROM conversation_flow_sessions WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM conversation_flows WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM flow_global_settings WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM properties WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM business_entities WHERE tenant_id = ?').run(tenantId);
  };

  cleanupTenant(testTenantId);

  await t.test('1. Import Full Suite for Hospitality with Custom Brand Details', async () => {
    const importOptions = {
      sectorCode: 'HOSPITALITY',
      businessName: 'Azure Palm Luxury Resort & Spa',
      city: 'Goa',
      state: 'Goa',
      phone: '+919999888877'
    };

    const result = await universalCatalogService.importFullIndustrySuite(testTenantId, importOptions, testUserId);

    assert.ok(result.success, 'Import should succeed');
    assert.equal(result.businessName, 'Azure Palm Luxury Resort & Spa');
    assert.equal(result.sectorName, 'Hospitality & Resorts');
    assert.ok(result.entityId, 'Should create business entity ID');
    assert.ok(result.propertyId, 'Should create property ID');
    assert.ok(result.flowId, 'Should create conversation flow ID');
    assert.ok(result.itemCount > 0, 'Should seed catalog items');
    assert.ok(result.addonGroupCount > 0, 'Should seed addon groups');
    assert.ok(result.pricingRuleCount > 0, 'Should seed pricing rules');

    // Verify entity in DB
    const entity = db.prepare('SELECT * FROM business_entities WHERE tenant_id = ? AND id = ?').get(testTenantId, result.entityId);
    assert.ok(entity);
    assert.equal(entity.name, 'Azure Palm Luxury Resort & Spa');
    assert.equal(entity.phone_e164, '+919999888877');

    // Verify property in DB
    const prop = db.prepare('SELECT * FROM properties WHERE tenant_id = ? AND id = ?').get(testTenantId, result.propertyId);
    assert.ok(prop);
    assert.equal(prop.city, 'Goa');

    // Verify ERP masters seeded (tax slabs, payment modes, units, status tags)
    const taxes = db.prepare('SELECT * FROM master_tax_slabs WHERE tenant_id = ?').all(testTenantId);
    assert.ok(taxes.length > 0, 'Should have seeded tax slabs');

    const payments = db.prepare('SELECT * FROM master_payment_modes WHERE tenant_id = ?').all(testTenantId);
    assert.ok(payments.length > 0, 'Should have seeded payment modes');

    const units = db.prepare('SELECT * FROM master_units WHERE tenant_id = ?').all(testTenantId);
    assert.ok(units.length > 0, 'Should have seeded units');

    // Verify pre-wired flow status
    const flow = db.prepare('SELECT * FROM conversation_flows WHERE tenant_id = ? AND id = ?').get(testTenantId, result.flowId);
    assert.ok(flow);
    assert.ok(['PUBLISHED', 'DRAFT'].includes(flow.status), 'Generated flow should be ready');
    assert.ok(flow.name.includes('Azure Palm Luxury Resort & Spa'));
    assert.equal(flow.flow_role, 'MAIN');
  });

  await t.test('2. Retrieve Business Profile', async () => {
    const profileRes = await universalCatalogService.getBusinessProfile(testTenantId);
    assert.ok(profileRes.success, 'Profile fetch should succeed');
    const p = profileRes.profile;
    assert.equal(p.businessName, 'Azure Palm Luxury Resort & Spa');
    assert.equal(p.sector, 'HOSPITALITY');
    assert.equal(p.phone, '+919999888877');
    assert.equal(p.city, 'Goa');
    assert.equal(p.currency, 'INR');
    assert.ok(p.fallbackMessage, 'Fallback message should exist');
    assert.ok(Array.isArray(p.menuKeywords), 'Menu keywords should be an array');
    assert.ok(p.menuKeywords.includes('menu'));
  });

  await t.test('3. Update Business Profile with Custom Fallback and Navigation Keywords', async () => {
    const updatePayload = {
      businessName: 'Azure Palm Grand Heritage',
      sector: 'HOSPITALITY',
      phone: '+919111222333',
      email: 'concierge@azurepalm.com',
      currency: 'INR',
      city: 'South Goa',
      state: 'Goa',
      operatingHours: 'Check-in: 14:00, Check-out: 11:00',
      fallbackMessage: 'Welcome to Azure Palm! Please send *menu* to explore our suites.',
      menuKeywords: ['menu', 'suites', 'home', 'restart']
    };

    const updateRes = await universalCatalogService.updateBusinessProfile(testTenantId, updatePayload, testUserId);
    assert.ok(updateRes.success, 'Update profile should succeed');

    // Re-fetch and verify persistence
    const recheckRes = await universalCatalogService.getBusinessProfile(testTenantId);
    assert.ok(recheckRes.success);
    const updated = recheckRes.profile;
    assert.equal(updated.businessName, 'Azure Palm Grand Heritage');
    assert.equal(updated.phone, '+919111222333');
    assert.equal(updated.email, 'concierge@azurepalm.com');
    assert.equal(updated.city, 'South Goa');
    assert.equal(updated.fallbackMessage, 'Welcome to Azure Palm! Please send *menu* to explore our suites.');
    assert.deepEqual(updated.menuKeywords, ['menu', 'suites', 'home', 'restart']);

    // Check settings sync via getSetting
    const { getSetting } = require('../src/config/database');
    assert.equal(getSetting('BOT_BUSINESS_NAME'), 'Azure Palm Grand Heritage');
    assert.equal(getSetting('BOT_HANDOFF_PHONE'), '+919111222333');
  });

  await t.test('4. Tenant Isolation: Separate Workspace Isolation', async () => {
    const otherTenantId = 99802;

    cleanupTenant(otherTenantId);

    // Import Clinic suite for other tenant
    const otherResult = await universalCatalogService.importFullIndustrySuite(otherTenantId, {
      sectorCode: 'CLINIC_HEALTH',
      businessName: 'Apex Care Dental Clinic',
      city: 'Pune'
    }, testUserId);

    assert.ok(otherResult.success);

    // Verify other tenant profile
    const otherProfile = await universalCatalogService.getBusinessProfile(otherTenantId);
    assert.equal(otherProfile.profile.businessName, 'Apex Care Dental Clinic');
    assert.equal(otherProfile.profile.sector, 'CLINIC_HEALTH');

    // Re-verify testTenantId profile remains untouched
    const mainProfile = await universalCatalogService.getBusinessProfile(testTenantId);
    assert.equal(mainProfile.profile.businessName, 'Azure Palm Grand Heritage');
    assert.equal(mainProfile.profile.sector, 'HOSPITALITY');

    cleanupTenant(otherTenantId);
  });

  cleanupTenant(testTenantId);
});
