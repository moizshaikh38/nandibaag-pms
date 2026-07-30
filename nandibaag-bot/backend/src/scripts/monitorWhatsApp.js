/**
 * WhatsApp Connection Monitor Script
 * 
 * This script monitors the WhatsApp connection status and provides
 * real-time diagnostics for disconnection issues.
 * 
 * Usage: node src/scripts/monitorWhatsApp.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  WHATSAPP CONNECTION MONITOR          ║');
console.log('╚════════════════════════════════════════╝\n');

async function monitorConnection() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Settings } = require('../models');
    
    console.log('[MONITOR] Starting real-time connection monitoring...');
    console.log('[MONITOR] Press Ctrl+C to stop\n');

    // Monitor every 10 seconds
    setInterval(async () => {
      try {
        const settings = await Settings.findOne();
        if (!settings || !Array.isArray(settings.whatsappNumbers)) {
          console.log('[MONITOR] No WhatsApp sessions configured');
          return;
        }

        const timestamp = new Date().toLocaleTimeString();
        console.log(`\n[${timestamp}] Status Check:`);

        for (const numberConfig of settings.whatsappNumbers) {
          const sessionId = numberConfig.label || numberConfig.number;
          const status = numberConfig.status;
          const isActive = numberConfig.isActive;
          const connectedAt = numberConfig.connectedAt;

          console.log(`  Session: ${sessionId}`);
          console.log(`    Status: ${status}`);
          console.log(`    Active: ${isActive}`);
          console.log(`    Connected At: ${connectedAt ? new Date(connectedAt).toLocaleString() : 'Never'}`);
          
          // Alert if disconnected
          if (status === 'disconnected' || status === 'auth_failed') {
            console.log(`    ⚠️  ALERT: Session is DISCONNECTED`);
          } else if (status === 'connecting') {
            console.log(`    ⏳ INFO: Session is connecting...`);
          } else if (status === 'connected') {
            // Calculate uptime
            if (connectedAt) {
              const uptime = Date.now() - new Date(connectedAt).getTime();
              const uptimeMinutes = Math.round(uptime / 60000);
              console.log(`    ✓ Connected for ${uptimeMinutes} minutes`);
            }
          }
        }
      } catch (error) {
        console.error('[MONITOR] Error checking status:', error.message);
      }
    }, 10000); // Every 10 seconds

  } catch (error) {
    console.error('Monitor failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n[MONITOR] Stopping monitor...');
  mongoose.disconnect().then(() => {
    console.log('[MONITOR] Stopped');
    process.exit(0);
  });
});

monitorConnection();