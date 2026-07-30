/**
 * Fix AI Mode Script
 * 
 * This script fixes the global mode to ensure AI responds to messages.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  FIX AI MODE                           ║');
console.log('╚════════════════════════════════════════╝\n');

async function fixAIMode() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Settings, Chat } = require('../models');

    // Check current settings
    console.log('[STEP 1] Checking current settings');
    const settings = await Settings.findOne();
    
    if (!settings) {
      console.log('⚠️  No settings found, creating default settings');
      const newSettings = new Settings({
        globalMode: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true
      });
      await newSettings.save();
      console.log('✓ Created default settings with AI mode');
    } else {
      console.log(`  Current global mode: ${settings.globalMode}`);
      
      if (settings.globalMode !== 'ai') {
        console.log('  Changing global mode to AI...');
        settings.globalMode = 'ai';
        await settings.save();
        console.log('✓ Global mode changed to AI');
      } else {
        console.log('✓ Global mode is already AI');
      }
    }
    console.log();

    // Check individual chat modes
    console.log('[STEP 2] Checking individual chat modes');
    const chatsInHumanMode = await Chat.countDocuments({ mode: 'human' });
    const totalChats = await Chat.countDocuments();
    
    console.log(`  Total chats: ${totalChats}`);
    console.log(`  Chats in human mode: ${chatsInHumanMode}`);
    console.log(`  Chats in AI mode: ${totalChats - chatsInHumanMode}`);
    
    // NOTE: We DON'T automatically change individual chat modes to AI
    // Human mode chats should remain in human mode for staff handling only
    console.log('  Individual chat modes left unchanged (human mode = staff only)');
    console.log();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  AI MODE FIX COMPLETE                  ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('Summary:');
    console.log('- Global mode set to AI (new chats will use AI)');
    console.log('- Individual chat modes unchanged (human mode = staff only)');
    console.log('\nMode Behavior:');
    console.log('- AI mode: Bot responds automatically to users');
    console.log('- Human mode: Only staff can respond (AI never replies)');
    console.log('\nNext steps:');
    console.log('1. Restart the bot server');
    console.log('2. New users will get AI responses automatically');
    console.log('3. Switch specific chats to human mode from dashboard for staff handling\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Fix failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixAIMode();