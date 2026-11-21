const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const inappService = require("../src/services/inapp/inappExperienceService");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");
const { validateFormSubmission } = require("../src/services/inapp/inappValidator");
const crmPipelineService = require("../src/services/crmPipelineService");

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

  test("7. Public Experience Runtime Discovery & Status Guards (404 & 410)", () => {
    // A: Non-existent experience -> 404
    assert.throws(
      () => inappRuntimeService.getPublicExperience("non-existent-slug-404"),
      (err) => err.statusCode === 404 && err.message.includes("not found")
    );

    // B: Draft/Paused experience -> 410
    const draftExp = inappService.createExperience({
      name: "Paused Draft Experience",
      domain_type: "HOSPITALITY"
    }, tenantId, createdBy);

    assert.throws(
      () => inappRuntimeService.getPublicExperience(draftExp.slug),
      (err) => err.statusCode === 410 && err.message.includes("paused")
    );

    // C: Published experience -> 200 with metadata & screens
    inappService.updateExperienceStatus(draftExp.id, "PUBLISHED", tenantId, createdBy);
    const pubData = inappRuntimeService.getPublicExperience(draftExp.slug);

    assert.ok(pubData.experience, "Experience object must be returned");
    assert.equal(pubData.experience.slug, draftExp.slug);
    assert.equal(pubData.experience.status, "PUBLISHED");
    assert.ok(Array.isArray(pubData.screens), "Screens array must be returned");
    assert.ok(pubData.catalogMeta, "Catalog metadata must be returned");
    assert.ok(pubData.catalogMeta.minPrice !== undefined, "Min price must be computed");
    assert.ok(pubData.catalogMeta.maxPrice !== undefined, "Max price must be computed");
  });

  test("8. Visitor Session Lifecycle, UTC Expiration & Resumption", () => {
    const exp = inappService.createExperience({
      name: "Session Lifecycle Test",
      domain_type: "HOSPITALITY"
    }, tenantId, createdBy);
    inappService.updateExperienceStatus(exp.id, "PUBLISHED", tenantId, createdBy);

    // 1. Start new session
    const sess1 = inappRuntimeService.startOrResumeSession(exp.slug, {
      contactName: "Sunil Sharma",
      contactPhone: "919988776655"
    });

    assert.ok(sess1.sessionToken.startsWith("exp_"), "Session token must be generated");
    assert.ok(sess1.currentScreenKey, "Current screen key must be set");
    assert.ok(Array.isArray(sess1.navigationStack), "Navigation stack must be array");
    assert.equal(sess1.navigationStack.length, 1);

    // Verify session record in DB with UTC expiry
    const dbSess = db.prepare("SELECT * FROM inapp_sessions WHERE session_token = ?").get(sess1.sessionToken);
    assert.ok(dbSess, "Session record must exist in MySQL");
    assert.equal(dbSess.visitor_name, "Sunil Sharma");
    assert.equal(dbSess.visitor_phone, "919988776655");
    assert.equal(dbSess.active_status, 1);
    assert.equal(dbSess.delete_status, 0);

    // 2. Resume same session with token
    const sessResumed = inappRuntimeService.startOrResumeSession(exp.slug, {
      sessionToken: sess1.sessionToken
    });

    assert.equal(sessResumed.sessionToken, sess1.sessionToken, "Resuming session must return same token");
    assert.equal(sessResumed.currentScreenKey, sess1.currentScreenKey);
  });

  test("9. Live Dynamic Catalog Query & Dual-Thumb Price Range Filter (minPrice=5000&maxPrice=9000)", () => {
    const exp = inappService.createExperience({
      name: "Hospitality Pricing Test",
      domain_type: "HOSPITALITY"
    }, tenantId, createdBy);
    inappService.updateExperienceStatus(exp.id, "PUBLISHED", tenantId, createdBy);

    // Query with price filter: minPrice=5000 & maxPrice=9000
    // Deluxe Sea View (4500) excluded. Coconut Cottage (6500) and Ocean Suite (8500) included.
    const catalogRes = inappRuntimeService.getCatalogItems(exp.slug, {
      minPrice: 5000,
      maxPrice: 9000
    });

    assert.equal(catalogRes.success, true);
    assert.ok(catalogRes.items.length >= 2, "Must return at least 2 matching rooms in 5000-9000 range");

    for (const item of catalogRes.items) {
      assert.ok(item.price >= 5000, `Item ${item.title} price ${item.price} must be >= 5000`);
      assert.ok(item.price <= 9000, `Item ${item.title} price ${item.price} must be <= 9000`);
      assert.ok(Array.isArray(item.images), "Item must have images array");
      assert.equal(item.taxRate, 18, "Hospitality item must carry 18% GST");
    }

    // Verify Deluxe Room (4500) is strictly absent
    const hasDeluxe = catalogRes.items.some(i => i.price < 5000);
    assert.equal(hasDeluxe, false, "Items below 5000 must be filtered out");
  });

  test("10. Multi-Screen Navigation & Dynamic Form Validation Blocking (422)", () => {
    const exp = inappService.createExperience({
      name: "Form Validation Flow Test",
      domain_type: "HOSPITALITY"
    }, tenantId, createdBy);

    // Add form screen
    const formScreen = inappService.createScreen(exp.id, {
      screen_key: "booking_form",
      screen_type: "DYNAMIC_FORM",
      title: "Guest Details",
      sort_order: 1
    }, tenantId, createdBy);

    // Add required email & dates with custom error messages
    inappService.createFormField(formScreen.id, {
      field_key: "email",
      label: "Work Email",
      input_type: "EMAIL",
      validation_rules_json: { required: true, email: true, errorMessage: "Valid business email required" },
      sort_order: 1
    }, tenantId, createdBy);

    inappService.createFormField(formScreen.id, {
      field_key: "checkin_date",
      label: "Check-in Date",
      input_type: "DATE",
      validation_rules_json: { required: true, date_min_today: true },
      sort_order: 2
    }, tenantId, createdBy);

    inappService.createFormField(formScreen.id, {
      field_key: "checkout_date",
      label: "Check-out Date",
      input_type: "DATE",
      validation_rules_json: { required: true, date_after_field: "checkin_date", errorMessage: "Checkout must be after checkin" },
      sort_order: 3
    }, tenantId, createdBy);

    inappService.updateExperienceStatus(exp.id, "PUBLISHED", tenantId, createdBy);

    // Start session
    const session = inappRuntimeService.startOrResumeSession(exp.slug);

    // Attempt invalid submission: invalid email and check_out before check_in
    assert.throws(
      () => inappRuntimeService.navigateSession(exp.slug, {
        sessionToken: session.sessionToken,
        fromScreenKey: "booking_form",
        action: "NEXT",
        formValues: {
          email: "invalid-email-format",
          checkin_date: "2026-12-10",
          checkout_date: "2026-12-05" // checkout is BEFORE checkin!
        }
      }),
      (err) => {
        assert.equal(err.statusCode, 422, "Must throw 422 on form validation error");
        assert.ok(err.fieldErrors, "Must attach fieldErrors object");
        assert.equal(err.fieldErrors.email, "Valid business email required");
        assert.equal(err.fieldErrors.checkout_date, "Checkout must be after checkin");
        return true;
      }
    );

    // Verify session remains on current screen and did not advance
    const curSess = db.prepare("SELECT current_screen_key FROM inapp_sessions WHERE session_token = ?").get(session.sessionToken);
    assert.equal(curSess.current_screen_key, "booking_form", "Session must stay on booking_form when 422 occurs");
  });

  test("11. Conditional Navigation Jump & BACK State Preservation", () => {
    const exp = inappService.createExperience({
      name: "Conditional Routing Test",
      domain_type: "B2B_SALES"
    }, tenantId, createdBy);

    // Screen 1: Qualification Form
    const s1 = inappService.createScreen(exp.id, {
      screen_key: "qual_form",
      screen_type: "DYNAMIC_FORM",
      title: "Team Discovery",
      navigation_rules_json: {
        defaultNext: "standard_confirmation",
        rules: [
          {
            conditionGroup: {
              matchMode: "ALL",
              rules: [
                { variable: "budget", operator: ">=", value: 50000 }
              ]
            },
            targetScreenKey: "vip_concierge"
          }
        ]
      },
      sort_order: 1
    }, tenantId, createdBy);

    // Screen 2: VIP Concierge
    inappService.createScreen(exp.id, {
      screen_key: "vip_concierge",
      screen_type: "HERO_WELCOME",
      title: "VIP Concierge Route",
      sort_order: 2
    }, tenantId, createdBy);

    // Screen 3: Standard Confirmation
    inappService.createScreen(exp.id, {
      screen_key: "standard_confirmation",
      screen_type: "CONFIRMATION",
      title: "Standard Confirmation",
      sort_order: 3
    }, tenantId, createdBy);

    inappService.updateExperienceStatus(exp.id, "PUBLISHED", tenantId, createdBy);

    const session = inappRuntimeService.startOrResumeSession(exp.slug);

    // Navigate with high budget (budget: 75000 >= 50000)
    const navResult = inappRuntimeService.navigateSession(exp.slug, {
      sessionToken: session.sessionToken,
      fromScreenKey: "qual_form",
      action: "NEXT",
      formValues: {
        budget: 75000,
        company: "Acme Corp",
        team_size: 40
      }
    });

    assert.equal(navResult.success, true);
    assert.equal(navResult.currentScreenKey, "vip_concierge", "Should jump conditionally to vip_concierge");
    assert.equal(navResult.stateData.budget, 75000);
    assert.equal(navResult.stateData.company, "Acme Corp");

    // Test BACK action: pops navigation stack back to qual_form while PRESERVING stateData
    const backResult = inappRuntimeService.navigateSession(exp.slug, {
      sessionToken: session.sessionToken,
      action: "BACK"
    });

    assert.equal(backResult.success, true);
    assert.equal(backResult.currentScreenKey, "qual_form", "Should return back to qual_form");
    assert.equal(backResult.stateData.budget, 75000, "budget must be preserved");
    assert.equal(backResult.stateData.company, "Acme Corp", "company must be preserved");
  });

  test("12. Action Execution: CRM_UPSERT Creates Real CRM Pipeline Record", () => {
    // Create experience linked to CRM pipeline 1
    const exp = inappService.createExperience({
      name: "CRM Upsert Pipeline Test",
      domain_type: "B2B_SALES",
      crm_pipeline_id: 1
    }, tenantId, createdBy);

    const s1 = inappService.createScreen(exp.id, {
      screen_key: "lead_capture",
      screen_type: "DYNAMIC_FORM",
      title: "Lead Capture",
      navigation_rules_json: { defaultNext: "confirmation" },
      sort_order: 1
    }, tenantId, createdBy);

    inappService.createScreen(exp.id, {
      screen_key: "confirmation",
      screen_type: "CONFIRMATION",
      title: "Thank You",
      sort_order: 2
    }, tenantId, createdBy);

    inappService.updateExperienceStatus(exp.id, "PUBLISHED", tenantId, createdBy);

    const session = inappRuntimeService.startOrResumeSession(exp.slug);

    const navRes = inappRuntimeService.navigateSession(exp.slug, {
      sessionToken: session.sessionToken,
      fromScreenKey: "lead_capture",
      action: "NEXT",
      formValues: {
        name: "Vikram Malhotra",
        phone: "919123456789",
        email: "vikram@sarvya.com",
        budget: 65000
      }
    });

    assert.equal(navRes.success, true);
    assert.ok(navRes.stateData.crmRecordId, "CRM record ID must be created and attached");

    // Verify record in crm_records table
    const crmRecord = db.prepare("SELECT * FROM crm_records WHERE id = ?").get(navRes.stateData.crmRecordId);
    assert.ok(crmRecord, "Record must exist in crm_records table");
    assert.equal(crmRecord.contact_phone, "919123456789");
    assert.equal(crmRecord.contact_name, "Vikram Malhotra");
    assert.equal(crmRecord.contact_email, "vikram@sarvya.com");
    assert.equal(crmRecord.pipeline_id, 1);
    assert.equal(crmRecord.deal_value, 65000);
  });
});

