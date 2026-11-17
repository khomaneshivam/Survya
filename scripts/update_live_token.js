const { setSetting, getSetting } = require('../src/config/database');
const fs = require('fs');

const liveToken = 'EAAVWCZCMBPqEBTB8JrdQ5fyMBELkFzkfd2VwWw6QGe6W8kiF8hi3dDX36OCekg3c1jxe5RD4IBCXIky5Mxfp5ezjOaaZBCzParx2KrNTw9GNdYXnBC3yGlF66iQ1p7i5wAkoZCjkiM0eiE4AfbGNysjnBZAhgxGOIGiHuhVHNbIBcdEieQW8lKoAbG4LsAZDZD';
const livePhoneId = '1510764325447375';

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
