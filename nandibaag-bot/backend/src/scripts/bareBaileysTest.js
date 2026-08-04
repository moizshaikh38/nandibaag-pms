const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');

async function start() {
  console.log('--- STARTING BARE BAILEYS ISOLATION TEST ---');
  const sessionPath = path.join(__dirname, '../../bare_test_session');
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[BareTest] Using Baileys version: [${version.join(', ')}] (isLatest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Desktop')
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    console.log('[BareTest] connection.update:', JSON.stringify(update));
    if (update.qr) {
      console.log('\n--- SCAN QR CODE FOR BARE TEST ---');
      qrcode.toString(update.qr, { type: 'terminal', small: true }, (err, str) => {
        if (!err && str) console.log(str);
      });
    }
    if (update.connection === 'open') {
      console.log('✅ [BareTest] CONNECTED TO WHATSAPP! Send a test message to this phone now!');
    }
  });

  sock.ev.on('messages.upsert', (m) => {
    console.log('\n🎉🎉🎉 [BareTest] messages.upsert FIRED! 🎉🎉🎉');
    console.log('[BareTest] Count:', m.messages?.length, 'Type:', m.type);
    if (m.messages && m.messages.length > 0) {
      console.log('[BareTest] Sample msg:', JSON.stringify(m.messages[0].key), 'text:', m.messages[0].message?.conversation || m.messages[0].message?.extendedTextMessage?.text);
    }
  });
}

start().catch(console.error);
