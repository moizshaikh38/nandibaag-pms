/**
 * Initialize WhatsApp Session Script
 * 
 * This script manually initializes a WhatsApp session to ensure
 * the bot can send and receive messages.
 */

const whatsappService = require('../services/whatsappService');
const { Settings } = require('../models');
const logger = require('../config/logger');
const { getIO } = require('../sockets');

console.log('\n╔════════════════════════════════════════╗');
console.log('║  WHATSAPP SESSION INITIALIZATION       ║');
console.log('╚════════════════════════════════════════╝\n');

async function initWhatsAppSession() {
  try {
    // Get Socket.io instance
    const io = getIO();
    whatsappService.setSocketIo(io);
    
    console.log('[STEP 1] Checking current settings');
    const settings = await Settings.findOne();
    
    if (!settings) {
      console.log('✗ No settings found. Creating default settings...');
      const newSettings = new Settings({
        globalMode: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true
      });
      await newSettings.save();
      console.log('✓ Default settings created');
    } else {
      console.log('✓ Settings found');
      console.log('  Global Mode:', settings.globalMode);
      console.log('  WhatsApp Numbers:', settings.whatsappNumbers?.length || 0);
    }
    console.log();

    console.log('[STEP 2] Initializing WhatsApp session');
    
    // Try to restart all active sessions
    console.log('  Calling restartAllActiveSessions...');
    await whatsappService.restartAllActiveSessions();
    console.log('✓ Session restart initiated');
    console.log();

    console.log('[STEP 3] Checking session status');
    
    // Wait a bit for sessions to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const allStatus = whatsappService.getAllSessionsStatus(settings?.whatsappNumbers || []);
    console.log('  Session statuses:', allStatus);
    console.log();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  INITIALIZATION COMPLETE                ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('Next steps:');
    console.log('1. Check the dashboard for QR code if needed');
    console.log('2. Scan QR code with your WhatsApp');
    console.log('3. Send a test message to verify bot responds');
    console.log('4. Monitor logs for any errors\n');

    process.exit(0);

  } catch (error) {
    console.error('Initialization failed:', error);
    logger.error('WhatsApp session initialization failed:', error);
    process.exit(1);
  }
}

initWhatsAppSession();