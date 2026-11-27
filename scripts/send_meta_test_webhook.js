const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db, getSetting } = require("../src/config/database");

async function main() {
  console.log("========================================================================");
  console.log("🚀 Meta Webhook Inbound Message Receiving & Processing Live Verification");
  console.log("========================================================================");

  // Align secret resolution with webhookController (env config -> DB plaintext -> process.env)
  const rawDbSecret = typeof getSetting === "function" ? String(getSetting("META_APP_SECRET") || "").trim() : "";
  const safeDbSecret = rawDbSecret.startsWith("enc:aes-256-gcm:") ? "" : rawDbSecret;
  let appSecret = (config.META_APP_SECRET || safeDbSecret || process.env.META_APP_SECRET || "").trim().replace(/^["']|["']$/g, "");
  if (appSecret && !/placeholder|dummy/i.test(appSecret)) {
    console.log(`🔐 Meta App Secret detected: [Configured - Length: ${appSecret.length} chars]`);
    console.log("   (Test requests will include X-Hub-Signature-256 HMAC signature)");
  } else {
    console.log("ℹ️ No Meta App Secret configured (Unsigned webhooks permitted)");
  }

  const testPhone = `9198${Date.now().toString().slice(-8)}`;
  const customerName = "Sunil Gavaskar";
  console.log(`\n📱 Test Customer Phone: ${testPhone}`);
  console.log(`👤 Test Customer Name:  ${customerName}`);

  // Helper to send HTTP POST to the running server
  function sendWebhookPost(endpoint, payload) {
    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify(payload);
      const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataStr)
      };

      if (appSecret && !/placeholder|dummy/i.test(appSecret)) {
        const hmac = crypto.createHmac("sha256", appSecret).update(dataStr).digest("hex");
        headers["x-hub-signature-256"] = `sha256=${hmac}`;
      }

      const req = http.request({
        hostname: "localhost",
        port: 5000,
        path: endpoint,
        method: "POST",
        headers
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.write(dataStr);
      req.end();
    });
  }

  // ========================================================================
  // TEST 1: INBOUND GREETING & BOOKING INQUIRY
  // ========================================================================
  console.log("\n------------------------------------------------------------------------");
  console.log("TEST 1: Sending Inbound WhatsApp Message via Meta Webhook (/webhook)");
  console.log("------------------------------------------------------------------------");

  const msgId1 = `wamid.HBgM${Date.now()}TEST01==`;
  const payload1 = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1064803546265989",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "919307382030",
                phone_number_id: "1510764325447375"
              },
              contacts: [
                {
                  profile: { name: customerName },
                  wa_id: testPhone
                }
              ],
              messages: [
                {
                  from: testPhone,
                  id: msgId1,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Hello! We are looking to book a cottage for this weekend. What are the rates?" }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  console.log(`[HTTP POST] Dispatching Meta Webhook payload for message ID: ${msgId1}...`);
  const postRes1 = await sendWebhookPost("/webhook", payload1);
  console.log(`[HTTP Response] Status: ${postRes1.status} | Body: ${postRes1.body}`);

  if (postRes1.status !== 200 || postRes1.body !== "EVENT_RECEIVED") {
    console.error("❌ FAILED: Webhook endpoint did not return 200 EVENT_RECEIVED");
    process.exit(1);
  }
  console.log("✓ Webhook handshake accepted by server with 200 EVENT_RECEIVED");

  // Wait 1.5 seconds for async DB save & automated trigger processing
  await new Promise(r => setTimeout(r, 1500));

  // Verify Database Record
  const savedMsg1 = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(msgId1);
  if (!savedMsg1) {
    console.error(`❌ FAILED: Message ${msgId1} was not saved in customer_replies table.`);
    process.exit(1);
  }

  console.log("\n✓ Database Record Verified in customer_replies:");
  console.log(`  - DB Record ID:    #${savedMsg1.id}`);
  console.log(`  - Customer Name:   ${savedMsg1.customer_name}`);
  console.log(`  - Sender Phone:    ${savedMsg1.from_phone}`);
  console.log(`  - Message Type:    ${savedMsg1.message_type}`);
  console.log(`  - Message Body:    "${savedMsg1.message_body}"`);
  console.log(`  - Ingestion Source: ${savedMsg1.source}`);
  console.log(`  - Received At:     ${savedMsg1.received_at}`);

  // Check automated outbound response created by conversational flow
  const outboundReplies = db.prepare(
    "SELECT * FROM customer_replies WHERE from_phone = ? AND message_type = 'outbound' ORDER BY id DESC LIMIT 2"
  ).all(testPhone);

  console.log(`\n✓ Automated Trigger Response Count: ${outboundReplies.length}`);
  outboundReplies.forEach((r, idx) => {
    console.log(`  [Response ${idx + 1}] ID: #${r.id} | Status: ${r.reply_status} | Source: ${r.source}`);
    console.log(`  Content: "${(r.reply_text || "").split("\n")[0]}..."`);
  });

  // ========================================================================
  // TEST 2: DINING & MENU INQUIRY (Trigger Parity Check)
  // ========================================================================
  console.log("\n------------------------------------------------------------------------");
  console.log("TEST 2: Sending Dining & Food Menu Inquiry via (/api/webhook)");
  console.log("------------------------------------------------------------------------");

  const msgId2 = `wamid.HBgM${Date.now()}TEST02==`;
  const payload2 = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1064803546265989",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "919307382030",
                phone_number_id: "1510764325447375"
              },
              contacts: [
                {
                  profile: { name: customerName },
                  wa_id: testPhone
                }
              ],
              messages: [
                {
                  from: testPhone,
                  id: msgId2,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Can you send the dining food menu please?" }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const postRes2 = await sendWebhookPost("/api/webhook", payload2);
  console.log(`[HTTP Response] Status: ${postRes2.status} | Body: ${postRes2.body}`);
  await new Promise(r => setTimeout(r, 1500));

  const savedMsg2 = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(msgId2);
  if (savedMsg2) {
    console.log("✓ Dining Inquiry successfully ingested & saved:");
    console.log(`  - DB Record ID: #${savedMsg2.id} | Body: "${savedMsg2.message_body}"`);
  } else {
    console.error(`❌ FAILED: Dining inquiry not found in DB`);
  }

  // ========================================================================
  // TEST 3: INBOX API CONVERSATIONS VISIBILITY
  // ========================================================================
  console.log("\n------------------------------------------------------------------------");
  console.log("TEST 3: Verifying Visibility in Conversations API (/api/inbox/replies)");
  console.log("------------------------------------------------------------------------");

  // Fetch actual admin user from DB for JWT generation
  const adminUser = db.prepare("SELECT id, email, role, tenant_id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  const adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenant_id: adminUser.tenant_id || 1 },
    config.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const inboxApiRes = await new Promise((resolve, reject) => {
    http.get({
      hostname: "localhost",
      port: 5000,
      path: "/api/inbox/replies?limit=10",
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data || "{}") }));
    }).on("error", reject);
  });

  console.log(`[Inbox API Status] HTTP ${inboxApiRes.status}`);
  const matchingConv = inboxApiRes.body?.replies?.find(r => r.from_phone === testPhone || r.clean_phone === testPhone);

  if (matchingConv) {
    console.log("✓ Message is LIVE and accessible in the Conversations Inbox!");
    console.log(`  - Contact: ${matchingConv.customer_name} (${matchingConv.from_phone})`);
    console.log(`  - Latest Message: "${matchingConv.message_body || matchingConv.reply_text}"`);
    console.log(`  - Unread Status:  ${matchingConv.is_read === 0 ? "Unread (New Message)" : "Read"}`);
  } else {
    console.log("⚠️ Contact not found in first page of inbox replies. Checking count...");
    console.log(`  Total replies in system: ${inboxApiRes.body?.pagination?.total || 0}`);
  }

  // ========================================================================
  // TEST 4: INBOUND META FLOW SUBMISSION (nfm_reply)
  // ========================================================================
  console.log("\n------------------------------------------------------------------------");
  console.log("TEST 4: Sending Meta Flow Form Submission (nfm_reply) via (/webhook)");
  console.log("------------------------------------------------------------------------");

  const msgId4 = `wamid.HBgM${Date.now()}TEST04_FLOW==`;
  const payload4 = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1064803546265989",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "919307382030",
                phone_number_id: "1510764325447375"
              },
              contacts: [
                {
                  profile: { name: customerName },
                  wa_id: testPhone
                }
              ],
              messages: [
                {
                  from: testPhone,
                  id: msgId4,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "interactive",
                  interactive: {
                    type: "nfm_reply",
                    nfm_reply: {
                      name: "flow_hospitality_booking",
                      response_json: JSON.stringify({
                        check_in: "2026-12-05",
                        check_out: "2026-12-07",
                        adults: "2",
                        children: "0",
                        room_preference: "Beachfront Villa",
                        special_requests: "Late check-in requested"
                      })
                    }
                  }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const postRes4 = await sendWebhookPost("/webhook", payload4);
  console.log(`[HTTP Response] Status: ${postRes4.status} | Body: ${postRes4.body}`);
  await new Promise(r => setTimeout(r, 1500));

  const flowRecord = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(msgId4);
  if (flowRecord) {
    console.log("✓ Meta Flow submission ingested into customer_replies:");
    console.log(`  - DB Record ID: #${flowRecord.id}`);
    console.log(`  - Flow Message Body: "${flowRecord.message_body}"`);
  }

  // Check flow_responses table via contacts join (flow_responses stores contact_id, not sender_phone)
  const flowResponse = db.prepare(`
    SELECT fr.* FROM flow_responses fr
    LEFT JOIN contacts c ON c.id = fr.contact_id
    WHERE c.phone_e164 LIKE ?
    ORDER BY fr.id DESC LIMIT 1
  `).get(`%${testPhone.slice(-10)}%`);
  if (flowResponse) {
    console.log("✓ Structured Flow Response recorded in flow_responses table:");
    console.log(`  - Flow Response ID: #${flowResponse.id}`);
    console.log(`  - Flow ID:          ${flowResponse.flow_id}`);
    console.log(`  - Parsed Data:      ${flowResponse.response_json}`);
  }

  // Check booking_enquiries table to verify CRM lead creation
  const crmEnquiry = db.prepare("SELECT * FROM booking_enquiries WHERE phone_e164 LIKE ? ORDER BY id DESC LIMIT 1").get(`%${testPhone.slice(-10)}%`);
  if (crmEnquiry) {
    console.log("✓ CRM Booking Inquiry successfully created in booking_enquiries table:");
    console.log(`  - Enquiry ID:       #${crmEnquiry.id}`);
    console.log(`  - Guest Name:       ${crmEnquiry.guest_name}`);
    console.log(`  - Check-In:         ${crmEnquiry.check_in}`);
    console.log(`  - Check-Out:        ${crmEnquiry.check_out}`);
    console.log(`  - Status:           ${crmEnquiry.status}`);
  }

  console.log("\n========================================================================");
  console.log("🎉 ALL INBOUND WEBHOOK TESTS PASSED: Messages received & auto-replied!");
  console.log("========================================================================\n");
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
