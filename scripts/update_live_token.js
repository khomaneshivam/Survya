const { setSetting, getSetting } = require('../src/config/database');
const fs = require('fs');

const liveToken = process.argv[2] || process.env.WHATSAPP_API_TOKEN;
const livePhoneId = process.argv[3] || process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!liveToken || !livePhoneId) {
  console.error("Error: WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be provided.");
  console.error("Usage: node scripts/update_live_token.js <WHATSAPP_API_TOKEN> <WHATSAPP_PHONE_NUMBER_ID>");
  process.exit(1);
}

setSetting('WHATSAPP_API_TOKEN', liveToken);
setSetting('WHATSAPP_PHONE_NUMBER_ID', livePhoneId);

console.log('Updated DB settings successfully!');
console.log('WHATSAPP_API_TOKEN:', getSetting('WHATSAPP_API_TOKEN').substring(0, 25) + '...');
console.log('WHATSAPP_PHONE_NUMBER_ID:', getSetting('WHATSAPP_PHONE_NUMBER_ID'));

// Also update .env file
let envContent = '';
if (fs.existsSync('.env')) {
  envContent = fs.readFileSync('.env', 'utf-8');
}

const lines = envContent.split('\n');
let foundToken = false;
let foundPhoneId = false;

const updatedLines = lines.map(line => {
  if (line.startsWith('WHATSAPP_API_TOKEN=')) {
    foundToken = true;
    return 'WHATSAPP_API_TOKEN=' + liveToken;
  }
  if (line.startsWith('WHATSAPP_PHONE_NUMBER_ID=')) {
    foundPhoneId = true;
    return 'WHATSAPP_PHONE_NUMBER_ID=' + livePhoneId;
  }
  return line;
});

if (!foundToken) {
  updatedLines.push('WHATSAPP_API_TOKEN=' + liveToken);
}
if (!foundPhoneId) {
  updatedLines.push('WHATSAPP_PHONE_NUMBER_ID=' + livePhoneId);
}

fs.writeFileSync('.env', updatedLines.join('\n'));
console.log('Updated .env successfully!');
