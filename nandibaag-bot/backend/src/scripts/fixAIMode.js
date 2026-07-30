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
    
    if (chatsInHumanMode > 0) {
      console.log('\n  Changing all chats to AI mode...');
      await Chat.updateMany({ mode: 'human' }, { mode: 'ai' });
      console.log('✓ All chats changed to AI mode');
    }
    console.log();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  AI MODE FIX COMPLETE                  ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('Next steps:');
    console.log('1. Restart the bot server');
    console.log('2. Users will now get AI responses automatically');
    console.log('3. You can still switch specific chats to human mode from dashboard\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Fix failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixAIMode();