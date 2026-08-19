const assert = require('assert');
const http = require('http');
const express = require('express');
const whatsappService = require('../services/whatsappService');
const fast2smsService = require('../services/fast2smsService');
const channelManager = require('../services/channelManager');
const env = require('../config/env');

async function runSuite() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       Dual-Channel Independent Routing & Webhook Suite        ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let baileysCalls = 0;
  let fast2smsCalls = 0;
  let smsCalls = 0;

  // Save originals
  const origBaileysSend = whatsappService.sendMessage;
  const origBaileysGetStatus = whatsappService.getSessionStatus;
  const origBaileysGetAll = whatsappService.getAllSessionsStatus;
  const origFast2SmsSend = fast2smsService.sendMessage;
  const origFast2SmsGetStatus = fast2smsService.getStatus;
  const origFast2SmsSendSMS = fast2smsService.sendSMS;
  const origFast2SmsEnabled = env.fast2smsEnabled;

  fast2smsService.sendSMS = async () => {
    smsCalls++;
    return true;
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Baileys Only
    // -------------------------------------------------------------
    console.log('[Test 1] Baileys Connected, Fast2SMS Not Configured...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'connected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'connected' });
    whatsappService.sendMessage = async () => { baileysCalls++; return true; };
    fast2smsService.getStatus = () => 'not_configured';

    let r1 = await channelManager.sendMessageViaChannel('919876543210', 'Test 1', 'whatsapp-web');
    assert.strictEqual(r1, true);
    assert.strictEqual(baileysCalls, 1, 'Baileys should be called exactly once');
    assert.strictEqual(fast2smsCalls, 0, 'Fast2SMS should be skipped');
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 1 Passed: Baileys only called.\n');

    // -------------------------------------------------------------
    // Test 2: Fast2SMS Only
    // -------------------------------------------------------------
    console.log('[Test 2] Baileys Disconnected, Fast2SMS Configured...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'disconnected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'disconnected' });
    whatsappService.sendMessage = async () => { baileysCalls++; return false; };
    fast2smsService.getStatus = () => 'connected';
    fast2smsService.sendMessage = async () => { fast2smsCalls++; return true; };

    let r2 = await channelManager.sendMessageViaChannel('919876543210', 'Test 2', 'all');
    assert.strictEqual(r2, true);
    assert.strictEqual(baileysCalls, 0, 'Baileys should be skipped when disconnected');
    assert.strictEqual(fast2smsCalls, 1, 'Fast2SMS should be called');
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 2 Passed: Fast2SMS only called.\n');

    // -------------------------------------------------------------
    // Test 3: Both Available -> Both Called Concurrently
    // -------------------------------------------------------------
    console.log('[Test 3] Both Channels Connected...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'connected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'connected' });
    whatsappService.sendMessage = async () => { baileysCalls++; return true; };
    fast2smsService.getStatus = () => 'connected';
    fast2smsService.sendMessage = async () => { fast2smsCalls++; return true; };

    let r3 = await channelManager.sendMessageViaChannel('919876543210', 'Test 3', 'all');
    assert.strictEqual(r3, true);
    assert.strictEqual(baileysCalls, 1, 'Baileys should be called');
    assert.strictEqual(fast2smsCalls, 1, 'Fast2SMS should be called independently');
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 3 Passed: Both channels called independently.\n');

    // -------------------------------------------------------------
    // Test 4: Baileys Fails + Fast2SMS Succeeds -> Overall Success
    // -------------------------------------------------------------
    console.log('[Test 4] Baileys Fails, Fast2SMS Succeeds...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'connected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'connected' });
    whatsappService.sendMessage = async () => { baileysCalls++; return false; };
    fast2smsService.getStatus = () => 'connected';
    fast2smsService.sendMessage = async () => { fast2smsCalls++; return true; };

    let r4 = await channelManager.sendMessageViaChannel('919876543210', 'Test 4', 'all');
    assert.strictEqual(r4, true);
    assert.strictEqual(baileysCalls, 1, 'Baileys was attempted');
    assert.strictEqual(fast2smsCalls, 1, 'Fast2SMS was attempted');
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 4 Passed: Baileys fail + Fast2SMS success returns overall true.\n');

    // -------------------------------------------------------------
    // Test 5: Fast2SMS Fails + Baileys Succeeds -> Overall Success
    // -------------------------------------------------------------
    console.log('[Test 5] Fast2SMS Fails, Baileys Succeeds...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'connected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'connected' });
    whatsappService.sendMessage = async () => { baileysCalls++; return true; };
    fast2smsService.getStatus = () => 'connected';
    fast2smsService.sendMessage = async () => { fast2smsCalls++; return false; };

    let r5 = await channelManager.sendMessageViaChannel('919876543210', 'Test 5', 'all');
    assert.strictEqual(r5, true);
    assert.strictEqual(baileysCalls, 1, 'Baileys was attempted');
    assert.strictEqual(fast2smsCalls, 1, 'Fast2SMS was attempted');
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 5 Passed: Fast2SMS fail + Baileys success returns overall true.\n');

    // -------------------------------------------------------------
    // Test 6: Both Fail / Unavailable -> False, No SMS
    // -------------------------------------------------------------
    console.log('[Test 6] Both Unavailable / Disconnected...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'disconnected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'disconnected' });
    fast2smsService.getStatus = () => 'not_configured';

    let r6 = await channelManager.sendMessageViaChannel('919876543210', 'Test 6', 'all');
    assert.strictEqual(r6, false);
    assert.strictEqual(baileysCalls, 0);
    assert.strictEqual(fast2smsCalls, 0);
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 6 Passed: Returns false when neither is connected, zero SMS calls.\n');

    // -------------------------------------------------------------
    // Test 7: channel === 'whatsapp-web' while Baileys disconnected
    // -------------------------------------------------------------
    console.log('[Test 7] channel = "whatsapp-web" while Baileys disconnected...');
    baileysCalls = 0; fast2smsCalls = 0; smsCalls = 0;
    env.fast2smsEnabled = true;
    whatsappService.getSessionStatus = () => 'disconnected';
    whatsappService.getAllSessionsStatus = () => ({ primary: 'disconnected' });
    whatsappService.sendMessage = async () => { baileysCalls++; return false; };
    fast2smsService.getStatus = () => 'connected';
    fast2smsService.sendMessage = async () => { fast2smsCalls++; return true; };

    let r7 = await channelManager.sendMessageViaChannel('919876543210', 'Test 7', 'whatsapp-web');
    assert.strictEqual(r7, true);
    assert.strictEqual(baileysCalls, 0, 'Baileys must NOT be called when disconnected even if channel=whatsapp-web');
    assert.strictEqual(fast2smsCalls, 1, 'Fast2SMS should still be independently considered');
    assert.strictEqual(smsCalls, 0, 'sendSMS() must NEVER be called');
    console.log('✅ Test 7 Passed: Disconnected Baileys is NOT called; Fast2SMS sends.\n');

    // -------------------------------------------------------------
    // Test 8: Fast2SMS Outgoing / Status Webhook Callback Ignored
    // -------------------------------------------------------------
    console.log('[Test 8] Fast2SMS Status / Delivery Webhook Callback Ignored...');
    const fast2smsRoutes = require('../routes/fast2smsRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/fast2sms', fast2smsRoutes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      let incomingRouted = false;
      channelManager.routeIncomingMessage = async () => { incomingRouted = true; };

      const statusPayload = {
        webhook_type: 'status_update',
        route: 'session',
        status: 'delivered',
        message_id: 'msg_12345'
      };

      const resStatus = await fetch(`http://127.0.0.1:${port}/api/fast2sms/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusPayload)
      });
      const jsonStatus = await resStatus.json();

      assert.strictEqual(resStatus.status, 200);
      assert.strictEqual(jsonStatus.status, 'ignored_status');
      assert.strictEqual(incomingRouted, false, 'Status update must NEVER route as customer incoming message');
      console.log('✅ Test 8 Passed: Fast2SMS status/delivery callback correctly ignored.\n');

      // -------------------------------------------------------------
      // Test 9: Fast2SMS Incoming Customer Message Webhook
      // -------------------------------------------------------------
      console.log('[Test 9] Fast2SMS Customer Incoming Message Webhook Routed...');
      incomingRouted = false;
      let routedMsg = null;
      let routedChannel = null;

      channelManager.routeIncomingMessage = async (msg, ch) => {
        incomingRouted = true;
        routedMsg = msg;
        routedChannel = ch;
      };

      const customerPayload = {
        webhook_type: 'incoming_message',
        route: 'whatsapp',
        status: 'received',
        from: '919876543210',
        body: 'Namaste, room booking inquiry'
      };

      const resCust = await fetch(`http://127.0.0.1:${port}/api/fast2sms/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload)
      });
      const jsonCust = await resCust.json();

      assert.strictEqual(resCust.status, 200);
      assert.strictEqual(jsonCust.status, 'ok');
      assert.strictEqual(incomingRouted, true, 'Customer message must be routed');
      assert.strictEqual(routedMsg.from, '919876543210@s.whatsapp.net');
      assert.strictEqual(routedMsg.body, 'Namaste, room booking inquiry');
      assert.strictEqual(routedChannel, 'fast2sms');
      console.log('✅ Test 9 Passed: Fast2SMS customer message routed into pipeline with source channel.\n');

    } finally {
      server.close();
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('       🎉 ALL 9 ARCHITECTURAL TESTS PASSED 100%!               ');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } finally {
    // Restore
    whatsappService.sendMessage = origBaileysSend;
    whatsappService.getSessionStatus = origBaileysGetStatus;
    whatsappService.getAllSessionsStatus = origBaileysGetAll;
    fast2smsService.sendMessage = origFast2SmsSend;
    fast2smsService.getStatus = origFast2SmsGetStatus;
    fast2smsService.sendSMS = origFast2SmsSendSMS;
    env.fast2smsEnabled = origFast2SmsEnabled;
  }
}

runSuite().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
