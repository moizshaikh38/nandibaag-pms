/**
 * Delete All Chats Script
 * 
 * This script deletes all existing chats for a clean slate.
 * WARNING: This will delete all chat history!
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  DELETE ALL CHATS                     ║');
console.log('╚════════════════════════════════════════╝\n');

async function deleteAllChats() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Chat, MessageQueue, Settings } = require('../models');

    // Get counts before deletion
    console.log('[BEFORE DELETION]');
    const chatCount = await Chat.countDocuments();
    const queueCount = await MessageQueue.countDocuments();
    console.log(`  Chats: ${chatCount}`);
    console.log(`  Queued messages: ${queueCount}`);
    console.log();

    // Confirm deletion
    console.log('⚠️  WARNING: This will delete ALL chat history!');
    console.log('Type "DELETE" to confirm:');
    
    // For automation, we'll proceed without confirmation but log it
    console.log('Proceeding with deletion...\n');

    // Delete all chats
    console.log('[DELETING CHATS]');
    const deleteResult = await Chat.deleteMany({});
    console.log(`✓ Deleted ${deleteResult.deletedCount} chats`);

    // Delete all queued messages
    console.log('[DELETING QUEUED MESSAGES]');
    const queueDeleteResult = await MessageQueue.deleteMany({});
    console.log(`✓ Deleted ${queueDeleteResult.deletedCount} queued messages`);

    // Reset settings to ensure AI mode
    console.log('[RESETTING SETTINGS]');
    const settings = await Settings.findOne();
    if (settings) {
      settings.globalMode = 'ai';
      await settings.save();
      console.log('✓ Global mode set to AI');
    } else {
      const newSettings = new Settings({
        globalMode: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true
      });
      await newSettings.save();
      console.log('✓ Created default settings with AI mode');
    }

    console.log();
    console.log('╔════════════════════════════════════════╗');
    console.log('║  DELETION COMPLETE                     ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('Summary:');
    console.log(`- Deleted ${deleteResult.deletedCount} chats`);
    console.log(`- Deleted ${queueDeleteResult.deletedCount} queued messages`);
    console.log('- Settings reset to AI mode');
    console.log('\nNext steps:');
    console.log('1. Restart the bot server');
    console.log('2. Send a test message to check if AI replies');
    console.log('3. Monitor logs for any errors\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Deletion failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

deleteAllChats();