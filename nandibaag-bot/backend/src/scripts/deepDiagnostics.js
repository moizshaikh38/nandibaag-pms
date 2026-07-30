/**
 * Deep Diagnostics Script
 * 
 * This script performs comprehensive diagnostics to identify why AI replies
 * are not being sent to users.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  DEEP DIAGNOSTICS                      ║');
console.log('╚════════════════════════════════════════╝\n');

async function runDeepDiagnostics() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Settings, Chat, MessageQueue } = require('../models');

    // Test 1: Environment Variables
    console.log('[TEST 1] Environment Variables');
    console.log('  OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? '✓ Set' : '✗ Missing');
    console.log('  MONGODB_URI:', process.env.MONGODB_URI ? '✓ Set' : '✗ Missing');
    console.log('  PORT:', process.env.PORT || '7000 (default)');
    console.log('  NODE_ENV:', process.env.NODE_ENV || 'development');
    console.log();

    // Test 2: Settings Configuration
    console.log('[TEST 2] Settings Configuration');
    const settings = await Settings.findOne();
    if (settings) {
      console.log('  ✓ Settings found');
      console.log('    Global Mode:', settings.globalMode);
      console.log('    WhatsApp Numbers:', settings.whatsappNumbers?.length || 0);
      console.log('    Follow-up Enabled:', settings.followUpEnabled);
      console.log('    OpenRouter Model Override:', settings.openRouterModelOverride || 'None');
      
      if (settings.globalMode !== 'ai') {
        console.log('    ⚠️  WARNING: Global mode is not AI!');
      }
    } else {
      console.log('  ✗ No settings found');
    }
    console.log();

    // Test 3: Database State
    console.log('[TEST 3] Database State');
    const chatCount = await Chat.countDocuments();
    const queueCount = await MessageQueue.countDocuments();
    console.log('  Total Chats:', chatCount);
    console.log('  Queued Messages:', queueCount);
    console.log();

    // Test 4: AI Service Test
    console.log('[TEST 4] AI Service Test');
    try {
      const { getAIResponse } = require('../services/aiService');
      
      const testChat = {
        messages: [
          { sender: 'customer', text: 'Hello', timestamp: new Date() }
        ],
        language: 'hinglish',
        bookingStage: 'none',
        bookingDraft: {}
      };

      const testMessage = 'Namaste, I want to book a room';
      
      console.log('  Testing AI response generation...');
      const aiReply = await getAIResponse(testChat, testMessage, settings || {});
      
      if (aiReply) {
        console.log('  ✓ AI Response generated successfully');
        console.log('    Response length:', aiReply.length);
        console.log('    Response preview:', aiReply.substring(0, 50) + '...');
      } else {
        console.log('  ✗ AI Response is null/empty');
      }
    } catch (error) {
      console.log('  ✗ AI Service test failed:', error.message);
    }
    console.log();

    // Test 5: WhatsApp Service Check
    console.log('[TEST 5] WhatsApp Service Check');
    try {
      const whatsappService = require('../services/whatsappService');
      console.log('  ✓ WhatsApp service loaded');
      
      // Check if there are active sessions
      const activeSessions = whatsappService.activeSockets?.size || 0;
      console.log('    Active sessions:', activeSessions);
      
      if (settings && settings.whatsappNumbers?.length > 0) {
        console.log('    Configured numbers:', settings.whatsappNumbers.length);
        settings.whatsappNumbers.forEach(num => {
          console.log(`      - ${num.label || num.number}: ${num.status}`);
        });
      }
    } catch (error) {
      console.log('  ✗ WhatsApp service check failed:', error.message);
    }
    console.log();

    // Test 6: Message Handler Check
    console.log('[TEST 6] Message Handler Check');
    try {
      const messageHandler = require('../services/messageHandler');
      console.log('  ✓ Message handler loaded');
      console.log('    handleMessage function:', typeof messageHandler.handleMessage);
    } catch (error) {
      console.log('  ✗ Message handler check failed:', error.message);
    }
    console.log();

    // Test 7: Configuration Files
    console.log('[TEST 7] Configuration Files');
    const fs = require('fs');
    const configFiles = [
      'src/config/env.js',
      'src/config/db.js',
      'src/config/logger.js'
    ];
    
    configFiles.forEach(file => {
      const filePath = path.join(__dirname, '../../', file);
      if (fs.existsSync(filePath)) {
        console.log(`  ✓ ${file} exists`);
      } else {
        console.log(`  ✗ ${file} missing`);
      }
    });
    console.log();

    // Test 8: Check for Common Issues
    console.log('[TEST 8] Common Issues Check');
    
    // Check if server is running
    console.log('  Checking if server can start...');
    console.log('  (Server start test skipped - would require actual server startup)');
    console.log();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  DIAGNOSTICS COMPLETE                  ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('RECOMMENDATIONS:');
    console.log('1. If AI service test failed: Check API keys and network');
    console.log('2. If WhatsApp service has no active sessions: Restart WhatsApp');
    console.log('3. If global mode is not AI: Run npm run fix-ai-mode');
    console.log('4. If message handler failed: Check messageHandler.js file');
    console.log('5. Monitor server logs for real-time error detection\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Diagnostics failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runDeepDiagnostics();