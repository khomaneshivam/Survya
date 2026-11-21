const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const inappService = require("../src/services/inapp/inappExperienceService");
const { validateFormSubmission } = require("../src/services/inapp/inappValidator");

describe("In-App Experience Studio Test Suite", () => {
  const tenantId = 1;
  const createdBy = "test_suite_runner";

  after(() => {
    // Cleanup any created test experiences
    db.prepare("DELETE FROM inapp_form_fields WHERE screen_id IN (SELECT id FROM inapp_screens WHERE experience_id IN (SELECT id FROM inapp_experiences WHERE created_by = ?))").run(createdBy);
    db.prepare("DELETE FROM inapp_screens WHERE experience_id IN (SELECT id FROM inapp_experiences WHERE created_by = ?)").run(createdBy);
    db.prepare("DELETE FROM inapp_experiences WHERE created_by = ?").run(createdBy);
  });

  test("1. Database Schema Parity: All 6 In-App Studio tables exist with correct audit columns", () => {
    const requiredTables = [
      "inapp_experiences",
      "inapp_screens",
      "inapp_form_fields",
      "inapp_sessions",
      "inapp_rate_negotiations",
      "inapp_call_requests"
    ];

    for (const tbl of requiredTables) {
      const info = db.prepare(`DESCRIBE ${tbl}`).all();
      assert.ok(info.length > 0, `Table ${tbl} must exist`);

      const colNames = info.map(c => c.Field);
      assert.ok(colNames.includes("id"), `${tbl} must have 'id'`);
      assert.ok(colNames.includes("tenant_id"), `${tbl} must have 'tenant_id'`);
      assert.ok(colNames.includes("active_status"), `${tbl} must have 'active_status'`);
      assert.ok(colNames.includes("delete_status"), `${tbl} must have 'delete_status'`);
      assert.ok(colNames.includes("created_at"), `${tbl} must have 'created_at'`);
      assert.ok(colNames.includes("updated_at"), `${tbl} must have 'updated_at'`);
    }
  });

  test("2. Experience CRUD, Unique Slug Generator & Status Transitions", () => {
    // Create
    const exp = inappService.createExperience({
      name: "Luxury Beachfront Villas Test",
      domain_type: "HOSPITALITY",
      theme_json: { primaryColor: "#059669" }
    }, tenantId, createdBy);

    assert.ok(exp.id, "Experience ID should be generated");
    assert.equal(exp.domain_type, "HOSPITALITY");
    assert.equal(exp.status, "DRAFT");
    assert.equal(exp.active_status, 1);
    assert.equal(exp.delete_status, 0);
    assert.ok(exp.slug.includes("luxury-beachfront-villas-test"), "Slug should be URL friendly");

    // Duplicate name slug collision test
    const exp2 = inappService.createExperience({
      name: "Luxury Beachfront Villas Test",
      domain_type: "HOSPITALITY"
    }, tenantId, createdBy);
    assert.notEqual(exp.slug, exp2.slug, "Duplicate names should produce unique slugs");

    // Update
    const updated = inappService.updateExperience(exp.id, {
      name: "Luxury Beachfront Villas (Updated)",
      theme_json: { primaryColor: "#10B981" }
    }, tenantId, createdBy);
    assert.equal(updated.name, "Luxury Beachfront Villas (Updated)");

    // Status transition
    const pubStatus = inappService.updateExperienceStatus(exp.id, "PUBLISHED", tenantId, createdBy);
    assert.equal(pubStatus.status, "PUBLISHED");

    // Fetch by slug
    const fetched = inappService.getExperienceBySlug(exp.slug, tenantId);
    assert.ok(fetched, "Should find experience by slug");
    assert.equal(fetched.id, exp.id);

    // Soft delete
    const delResult = inappService.deleteExperience(exp.id, tenantId, createdBy);
    assert.equal(delResult.success, true);

    const recheck = inappService.getExperienceById(exp.id, tenantId);
    assert.equal(recheck, null, "Soft-deleted experience should not be returned by getExperienceById");

    const list = inappService.listExperiences(tenantId, { search: "Luxury Beachfront Villas" });
    const foundDeleted = list.some(e => e.id === exp.id);
    assert.equal(foundDeleted, false, "Soft-deleted experience should be excluded from list");
  });

  test("3. Screens & Form Fields CRUD, Reordering and Cascading Soft-Delete", () => {
    const exp = inappService.createExperience({
      name: "Multi-Screen Test Flow",
      domain_type: "SERVICES"
    }, tenantId, createdBy);

    // Create 3 screens
    const s1 = inappService.createScreen(exp.id, {
      screen_key: "welcome_screen",
      title: "Welcome Page",
      screen_type: "HERO_WELCOME",
      display_order: 1
    }, tenantId, createdBy);

    const s2 = inappService.createScreen(exp.id, {
      screen_key: "intake_form",
      title: "Intake Form",
      screen_type: "DYNAMIC_FORM",
      display_order: 2
    }, tenantId, createdBy);

    const s3 = inappService.createScreen(exp.id, {
      screen_key: "confirm_screen",
      title: "Confirmation",
      screen_type: "CONFIRMATION",
      display_order: 3
    }, tenantId, createdBy);

    assert.equal(s1.screen_key, "welcome_screen");
    assert.equal(s2.screen_type, "DYNAMIC_FORM");

    // Reorder screens
    inappService.reorderScreens(exp.id, [s3.id, s1.id, s2.id], tenantId);
    const screens = inappService.listScreens(exp.id, tenantId);
    assert.equal(screens[0].id, s3.id);
    assert.equal(screens[1].id, s1.id);
    assert.equal(screens[2].id, s2.id);

    // Create Form Fields on s2
    const f1 = inappService.createFormField(s2.id, {
      field_key: "user_name",
      label: "Your Name",
      input_type: "TEXT",
      validation_rules_json: { required: true, minLength: 2 },
      display_order: 1
    }, tenantId, createdBy);

    const f2 = inappService.createFormField(s2.id, {
      field_key: "user_phone",
      label: "Phone Number",
      input_type: "PHONE",
      validation_rules_json: { required: true, phone_e164: true },
      display_order: 2
    }, tenantId, createdBy);

    assert.equal(f1.field_key, "user_name");
    assert.equal(f2.input_type, "PHONE");

    // Reorder Form Fields
    inappService.reorderFormFields(s2.id, [f2.id, f1.id], tenantId);
    const fields = inappService.listFormFields(s2.id, tenantId);
    assert.equal(fields[0].id, f2.id);
    assert.equal(fields[1].id, f1.id);

    // Cascaded Soft-Delete: delete s2
    inappService.deleteScreen(s2.id, tenantId, createdBy);
    const activeScreens = inappService.listScreens(exp.id, tenantId);
    assert.equal(activeScreens.some(s => s.id === s2.id), false);

    const activeFields = inappService.listFormFields(s2.id, tenantId);
    assert.equal(activeFields.length, 0, "Fields of soft-deleted screen should also be soft-deleted");
  });

  test("4. 4 Domain Starter Packs: Hospitality, Retail, B2B Sales & Services", () => {
    // 1. Hospitality
    const hosp = inappService.seedStarterExperience("HOSPITALITY", tenantId, createdBy);
    assert.ok(hosp.id);
    assert.equal(hosp.domain_type, "HOSPITALITY");
    assert.ok(hosp.screens.length >= 6, "Hospitality should seed at least 6 multi-turn screens");
    const hospIntake = hosp.screens.find(s => s.screen_key === "guest_intake");
    assert.ok(hospIntake, "Hospitality must have guest_intake screen");
    assert.ok(hospIntake.fields.length >= 6, "Hospitality intake form must have at least 6 fields");

    // 2. Retail
    const retail = inappService.seedStarterExperience("RETAIL", tenantId, createdBy);
    assert.ok(retail.id);
    assert.equal(retail.domain_type, "RETAIL");
    assert.ok(retail.screens.length >= 5, "Retail should seed at least 5 screens");
    const retailDelivery = retail.screens.find(s => s.screen_key === "delivery_form");
    assert.ok(retailDelivery);
    assert.ok(retailDelivery.fields.some(f => f.field_key === "pincode"));

    // 3. B2B Sales
    const b2b = inappService.seedStarterExperience("B2B_SALES", tenantId, createdBy);
    assert.ok(b2b.id);
    assert.equal(b2b.domain_type, "B2B_SALES");
    const b2bQual = b2b.screens.find(s => s.screen_key === "qualification_form");
    assert.ok(b2bQual);
    assert.ok(b2bQual.fields.some(f => f.field_key === "work_email"));

    // 4. Services
    const svc = inappService.seedStarterExperience("SERVICES", tenantId, createdBy);
    assert.ok(svc.id);
    assert.equal(svc.domain_type, "SERVICES");
    const svcAppt = svc.screens.find(s => s.screen_key === "appointment_form");
    assert.ok(svcAppt);
    assert.ok(svcAppt.fields.some(f => f.field_key === "appointment_date"));
  });

  test("5. Shared Database-Driven Form Validation Engine (Universal In-App Rules)", () => {
    const testFields = [
      {
        field_key: "name",
        label: "Guest Name",
        input_type: "TEXT",
        validation_rules_json: JSON.stringify({ required: true, minLength: 3, maxLength: 50 })
      },
      {
        field_key: "email",
        label: "Email Address",
        input_type: "EMAIL",
        validation_rules_json: JSON.stringify({ required: true, email: true })
      },
      {
        field_key: "phone",
        label: "WhatsApp Phone",
        input_type: "PHONE",
        validation_rules_json: JSON.stringify({ required: true, phone_e164: true })
      },
      {
        field_key: "check_in",
        label: "Check-in Date",
        input_type: "DATE",
        validation_rules_json: JSON.stringify({ required: true, date_min_today: true })
      },
      {
        field_key: "check_out",
        label: "Check-out Date",
        input_type: "DATE",
        validation_rules_json: JSON.stringify({ required: true, date_after_field: "check_in" })
      },
      {
        field_key: "adults",
        label: "Adults",
        input_type: "NUMBER",
        validation_rules_json: JSON.stringify({ required: true, min: 1, max: 8 })
      },
      {
        field_key: "pincode",
        label: "PIN Code",
        input_type: "TEXT",
        validation_rules_json: JSON.stringify({ required: true, regex: "^[1-9][0-9]{5}$", errorMessage: "Enter valid 6-digit Indian PIN" })
      },
      {
        field_key: "price_range",
        label: "Budget Range",
        input_type: "PRICE_RANGE",
        validation_rules_json: JSON.stringify({ required: false, price_range: true })
      }
    ];

    // Case A: Missing required values
    const resA = validateFormSubmission(testFields, {});
    assert.equal(resA.isValid, false);
    assert.ok(resA.fieldErrors.name);
    assert.ok(resA.fieldErrors.email);
    assert.ok(resA.fieldErrors.phone);
    assert.ok(resA.fieldErrors.check_in);
    assert.ok(resA.fieldErrors.check_out);

    // Case B: Invalid formats (bad email, bad phone, minLength violation, past date, inverted date_after_field)
    const today = new Date().toISOString().split("T")[0];
    const resB = validateFormSubmission(testFields, {
      name: "Al", // minLength 3
      email: "not-an-email",
      phone: "123", // not 10-15 digits
      check_in: "2020-01-01", // past date
      check_out: "2020-01-01", // check_out not after check_in
      adults: 0, // min 1
      pincode: "ABCDEF" // regex failure
    });

    assert.equal(resB.isValid, false);
    assert.ok(resB.fieldErrors.name.includes("at least 3 characters"));
    assert.ok(resB.fieldErrors.email.includes("valid email address"));
    assert.ok(resB.fieldErrors.phone.includes("valid 10-15 digit phone"));
    assert.ok(resB.fieldErrors.check_in.includes("cannot be in the past"));
    assert.ok(resB.fieldErrors.check_out.includes("must be after"));
    assert.ok(resB.fieldErrors.adults.includes("at least 1"));
    assert.equal(resB.fieldErrors.pincode, "Enter valid 6-digit Indian PIN");

    // Case C: Valid submission with cross-field dates
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const dayAfterTomorrow = new Date(Date.now() + 172800000).toISOString().split("T")[0];

    const resC = validateFormSubmission(testFields, {
      name: "Rohan Verma",
      email: "rohan@example.com",
      phone: "919876543210",
      check_in: tomorrow,
      check_out: dayAfterTomorrow,
      adults: "3",
      pincode: "400001",
      price_range: { min: 2500, max: 7500 }
    });

    assert.equal(resC.isValid, true);
    assert.equal(Object.keys(resC.fieldErrors).length, 0);
    assert.equal(resC.normalizedValues.adults, 3);
    assert.equal(resC.normalizedValues.phone, "919876543210");
    assert.equal(resC.normalizedValues.price_range.min, 2500);
    assert.equal(resC.normalizedValues.price_range.max, 7500);
  });

  test("6. QR Code Generation for In-App Experience Link", () => {
    const exp = inappService.createExperience({
      name: "QR Code Sharing Test",
      domain_type: "HOSPITALITY"
    }, tenantId, createdBy);

    const qrResult = inappService.getExperienceQrCode(exp.id, tenantId);
    assert.ok(qrResult.qr_svg.includes("<svg"), "QR SVG must contain <svg tag");
    assert.ok(qrResult.share_url.includes(`/x/${exp.slug}`), "Share URL must contain /x/:slug");
    assert.equal(qrResult.slug, exp.slug);
  });
});
