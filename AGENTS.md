# Agent Rules & Permanent Safety Directives

## 1. ABSOLUTE PROHIBITION ON DISPATCHING LIVE MESSAGES
* **NEVER SEND LIVE MESSAGES TO ANY NUMBER**:
  The AI assistant is strictly prohibited from dispatching live WhatsApp messages (including text, interactive buttons, lists, flows, media, or templates) to ANY phone number whatsoever — including real customer numbers, internal team numbers, and test numbers.
* **MOCK & SANDBOX ONLY**:
  All agent testing, verification scripts, automated tests, and diagnostics must strictly utilize in-memory mock objects, test sandbox stubs (`isSimulation: true`), or offline unit test assertions. Never trigger real Meta Graph API message endpoints (`POST /{phone_number_id}/messages`) from agent scripts or terminal runs.

## 2. PROHIBITION ON RISKY, PROHIBITED, OR COST-INCURRING APIS
* **ZERO POLICY-VIOLATING OR HARMFUL APIS**:
  Never execute APIs or commands that could violate Meta Business policies, trigger spam blocks, endanger account integrity, cause rate limits, or incur unexpected charges.
* **SAFETY FIRST**:
  If a verification or test involves outbound delivery, describe the payload, test in mock mode, and let the user perform any manual verification from their authorized dashboard.

## 3. PROHIBITION ON EXECUTING TESTS USING AI MODEL CREDITS (LAPTOP TERMINAL ONLY)
* **NEVER RUN TESTS VIA AI MODEL CREDITS**:
  The AI assistant MUST NEVER execute automated test suites (`node --test`, `npm test`, verification runners, `npm run lint`, `npm run build`, or test scripts) through AI tool calls that consume model credits or execution turns.
* **STRICTLY USER LAPTOP TERMINAL EXECUTION**:
  All test executions, migration checks, lint/build checks, and verification scripts MUST be run strictly by the user in their local laptop terminal. The AI assistant should write/fix code, tests, and documentation cleanly and provide the exact copy-pasteable laptop terminal commands for the user to execute locally.
