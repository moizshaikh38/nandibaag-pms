/**
 * Test WhatsApp Initialization Script
 * 
 * This script tests WhatsApp initialization without server dependency
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  TEST WHATSAPP INITIALIZATION          ║');
console.log('╚════════════════════════════════════════╝\n');

async function testWhatsAppInit() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Settings } = require('../models');

    console.log('[TEST 1] Check Current Settings');
    const settings = await Settings.findOne();
    if (settings) {
      console.log('  Global Mode:', settings.globalMode);
      console.log('  WhatsApp Numbers:', settings.whatsappNumbers?.length || 0);
      
      if (settings.whatsappNumbers?.length > 0) {
        settings.whatsappNumbers.forEach(num => {
          console.log(`    - ${num.label || num.number}: ${num.status}`);
        });
      }
    } else {
      console.log('  No settings found');
    }
    console.log();

    console.log('[TEST 2] Check Auth State');
    const { BaileysAuth } = require('../models');
    const authCount = await BaileysAuth.countDocuments();
    console.log('  Auth records in DB:', authCount);
    console.log();

    console.log('[TEST 3] Environment Check');
    console.log('  Node version:', process.version);
    console.log('  Platform:', process.platform);
    console.log('  Architecture:', process.arch);
    console.log();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  TEST COMPLETE                          ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('RECOMMENDATIONS:');
    console.log('1. Start server with: npm run dev');
    console.log('2. Watch for QR code in terminal');
    console.log('3. If QR still not showing, run: npm run clean-whatsapp');
    console.log('4. Then restart server again\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testWhatsAppInit();
