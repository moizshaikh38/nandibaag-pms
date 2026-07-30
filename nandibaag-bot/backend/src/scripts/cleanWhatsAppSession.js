/**
 * Clean WhatsApp Session Script
 * 
 * This script completely cleans WhatsApp session data to force fresh QR generation.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  CLEAN WHATSAPP SESSION                 ║');
console.log('╚════════════════════════════════════════╝\n');

async function cleanWhatsAppSession() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Settings, BaileysAuth } = require('../models');

    // Step 1: Clear database auth data
    console.log('[STEP 1] Clearing database auth data');
    const authDeleteResult = await BaileysAuth.deleteMany({});
    console.log(`✓ Deleted ${authDeleteResult.deletedCount} auth records`);

    // Step 2: Clear WhatsApp numbers from settings
    console.log('[STEP 2] Clearing WhatsApp numbers from settings');
    const settings = await Settings.findOne();
    if (settings) {
      const beforeCount = settings.whatsappNumbers?.length || 0;
      settings.whatsappNumbers = [];
      await settings.save();
      console.log(`✓ Cleared ${beforeCount} WhatsApp numbers from settings`);
    } else {
      console.log('⚠️  No settings found');
    }
    console.log();

    // Step 3: Clear local session files
    console.log('[STEP 3] Clearing local session files');
    const sessionPaths = [
      path.join(__dirname, '../../sessions'),
      path.join(__dirname, '../../.wwebjs_auth_session'),
      path.join(__dirname, '../../.wwebjs_cache')
    ];

    for (const sessionPath of sessionPaths) {
      try {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log(`✓ Deleted: ${sessionPath}`);
        } else {
          console.log(`  (Not found: ${sessionPath})`);
        }
      } catch (error) {
        console.log(`⚠️  Could not delete ${sessionPath}: ${error.message}`);
      }
    }
    console.log();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  SESSION CLEANING COMPLETE             ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('SUMMARY:');
    console.log('- Database auth records cleared');
    console.log('- WhatsApp numbers removed from settings');
    console.log('- Local session files deleted');
    console.log('\nNEXT STEPS:');
    console.log('1. Restart the server: npm run dev');
    console.log('2. QR code should generate fresh');
    console.log('3. Scan QR code with your WhatsApp');
    console.log('4. Bot should connect successfully\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Cleaning failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

cleanWhatsAppSession();