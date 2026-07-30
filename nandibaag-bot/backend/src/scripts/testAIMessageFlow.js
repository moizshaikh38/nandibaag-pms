/**
 * AI Message Flow Test Script
 * 
 * This script tests the complete AI message flow to identify where
 * the process might be failing.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('\n╔════════════════════════════════════════╗');
console.log('║  AI MESSAGE FLOW TEST                 ║');
console.log('╚════════════════════════════════════════╝\n');

async function testAIMessageFlow() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://moizsh786786_db_user:RvSja2R0ytcXg6QZ@cluster0.ly5dxxy.mongodb.net/nandibaag-pms?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    const { Chat, Settings } = require('../models');
    const { getAIResponse } = require('../services/aiService');

    // Test 1: Check Settings
    console.log('[TEST 1] Settings Check');
    const settings = await Settings.findOne();
    if (settings) {
      console.log('✓ Settings found');
      console.log('  - Global Mode:', settings.globalMode);
      console.log('  - WhatsApp Numbers:', settings.whatsappNumbers?.length || 0);
    } else {
      console.log('⚠️  No settings found');
    }
    console.log();

    // Test 2: Test AI Response Generation
    console.log('[TEST 2] AI Response Generation');
    const testChat = {
      messages: [
        { sender: 'customer', text: 'Hello', timestamp: new Date() }
      ],
      language: 'hinglish',
      bookingStage: 'none',
      bookingDraft: {}
    };

    const testMessage = 'Namaste, I want to book a room for 2 people';
    
    try {
      console.log('  Calling getAIResponse...');
      const aiReply = await getAIResponse(testChat, testMessage, settings || {});
      
      if (aiReply) {
        console.log('✓ AI Response generated successfully');
        console.log('  Response:', aiReply.substring(0, 100) + '...');
      } else {
        console.log('✗ AI Response is null/empty');
      }
    } catch (error) {
      console.log('✗ AI Response generation failed:', error.message);
      console.log('  Error details:', error.stack);
    }
    console.log();

    // Test 3: Check Recent Chats
    console.log('[TEST 3] Recent Chat Analysis');
    const recentChats = await Chat.find()
      .sort({ lastMessageAt: -1 })
      .limit(5);
    
    console.log(`  Found ${recentChats.length} recent chats`);
    
    for (const chat of recentChats) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      console.log(`  - Phone: ${chat.customerPhone}`);
      console.log(`    Mode: ${chat.mode}`);
      console.log(`    Language: ${chat.language}`);
      console.log(`    Stage: ${chat.bookingStage}`);
      console.log(`    Last message: ${lastMessage?.sender} - "${lastMessage?.text?.substring(0, 30)}..."`);
      console.log(`    Message count: ${chat.messages.length}`);
      console.log(`    Last activity: ${chat.lastMessageAt}`);
      console.log();
    }

    // Test 4: Check for Error Patterns
    console.log('[TEST 4] Error Pattern Analysis');
    const chatsWithIssues = await Chat.find({
      $or: [
        { messages: { $size: 1 } }, // Only customer message, no bot reply
        { 'messages.sender': 'customer', lastMessageAt: { $lt: new Date(Date.now() - 300000) } } // Customer message > 5 min ago
      ]
    }).sort({ lastMessageAt: -1 }).limit(5);

    console.log(`  Found ${chatsWithIssues.length} chats with potential issues`);
    
    for (const chat of chatsWithIssues) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (lastMessage?.sender === 'customer') {
        const timeSinceMessage = Date.now() - new Date(chat.lastMessageAt).getTime();
        console.log(`  - Phone: ${chat.customerPhone}`);
        console.log(`    Unanswered customer message ${Math.round(timeSinceMessage / 1000)}s ago`);
        console.log(`    Message: "${lastMessage?.text?.substring(0, 50)}..."`);
        console.log();
      }
    }

    console.log('╔════════════════════════════════════════╗');
    console.log('║  TEST COMPLETE                          ║');
    console.log('╚════════════════════════════════════════╝\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testAIMessageFlow();