const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  NANDIBAAG BOT DIAGNOSTIC TEST         ║');
console.log('╚════════════════════════════════════════╝\n');

async function runDiagnostics() {
  // Test 1: Database connection
  console.log('[TEST 1] Database Connection');
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Database connected\n');
  } catch (error) {
    console.log('✗ Database failed:', error.message, '\n');
    process.exit(1);
  }

  // Test 2: Collections exist
  console.log('[TEST 2] Collections');
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('✓ Collections:', collectionNames.join(', '), '\n');
    
    // Check for required collections
    const requiredCollections = ['chats', 'messagequeues', 'settings', 'users'];
    const missingCollections = requiredCollections.filter(c => !collectionNames.includes(c));
    if (missingCollections.length > 0) {
      console.log('⚠️  Missing collections:', missingCollections.join(', '), '\n');
    }
  } catch (error) {
    console.log('✗ Collection check failed:', error.message, '\n');
  }

  // Test 3: Environment
  console.log('[TEST 3] Environment');
  console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? '✓ Set' : '✗ Missing');
  console.log('RESORT_CONTACT_1:', process.env.RESORT_CONTACT_1 || '✗ Missing');
  console.log('MONGODB_URI:', process.env.MONGO_URI ? '✓ Set' : '✗ Missing');
  console.log('PORT:', process.env.PORT || '✗ Missing (default: 7000)', '\n');

  // Test 4: Model verification
  console.log('[TEST 4] Model Verification');
  try {
    const Chat = require('../models/Chat');
    const MessageQueue = require('../models/MessageQueue');
    const Settings = require('../models/Settings');
    console.log('✓ Chat model loaded');
    console.log('✓ MessageQueue model loaded');
    console.log('✓ Settings model loaded\n');
  } catch (error) {
    console.log('✗ Model loading failed:', error.message, '\n');
  }

  // Test 5: Service verification
  console.log('[TEST 5] Service Verification');
  try {
    const whatsappService = require('../services/whatsappService');
    const messageHandler = require('../services/messageHandler');
    const aiService = require('../services/aiService');
    console.log('✓ whatsappService loaded');
    console.log('✓ messageHandler loaded');
    console.log('✓ aiService loaded\n');
  } catch (error) {
    console.log('✗ Service loading failed:', error.message, '\n');
  }

  // Test 6: Settings check
  console.log('[TEST 6] Settings Check');
  try {
    const { Settings } = require('../models');
    const settings = await Settings.findOne();
    if (settings) {
      console.log('✓ Settings found');
      console.log('  - Global Mode:', settings.globalMode);
      console.log('  - WhatsApp Numbers:', settings.whatsappNumbers?.length || 0);
      console.log('  - Follow-up Enabled:', settings.followUpEnabled);
    } else {
      console.log('⚠️  No settings found (will be created on server start)\n');
    }
    console.log();
  } catch (error) {
    console.log('✗ Settings check failed:', error.message, '\n');
  }

  console.log('╔════════════════════════════════════════╗');
  console.log('║  DIAGNOSTICS COMPLETE                  ║');
  console.log('╚════════════════════════════════════════╝\n');

  await mongoose.disconnect();
  process.exit(0);
}

runDiagnostics().catch(error => {
  console.error('Diagnostic test failed:', error);
  process.exit(1);
});