const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Chat, Lead, Booking, Settings } = require('../models');
const { getSessionStatus, getAllSessionsStatus } = require('../services/whatsappService');
const { getModelHealthLast1Hour } = require('../services/aiService');

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Dashboard summary statistics
 */
router.get('/stats', verifyToken, async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Total chats today
    const chatsToday = await Chat.countDocuments({
      createdAt: { $gte: todayStart }
    });
    
    // Hot leads count — only count hot leads for active, non-archived chats
    const activeChatIds = await Chat.find({ isArchived: false }).distinct('_id');
    const hotLeadsCount = await Lead.countDocuments({
      chatId: { $in: activeChatIds },
      status: 'hot'
    });
    
    // AI failure count last 24h (this would need to be tracked separately, using placeholder)
    const aiFailuresLast24h = 0; // TODO: Implement AI failure tracking
    
    // Active WhatsApp sessions count
    const settings = await Settings.findOne();
    const whatsappNumbers = settings?.whatsappNumbers || [];
    const sessionStatuses = getAllSessionsStatus(whatsappNumbers);
    const activeSessions = Object.values(sessionStatuses).filter(status => status === 'connected').length;
    
    // Confirmed bookings count (active confirmed/checked-in/checked-out)
    const confirmedBookingsCount = await Booking.countDocuments({
      status: { $in: ['confirmed', 'checked_in', 'checked_out'] }
    });

    // Bookings this week
    const bookingsThisWeek = await Booking.countDocuments({
      createdAt: { $gte: weekStart },
      status: { $ne: 'cancelled' }
    });
    
    // Total chats (all time)
    const totalChats = await Chat.countDocuments({ isArchived: false });
    
    // Total active non-cancelled bookings
    const totalBookings = await Booking.countDocuments({ status: { $ne: 'cancelled' } });
    
    // Conversion rate
    const conversionRate = totalChats > 0 ? (confirmedBookingsCount / totalChats * 100).toFixed(1) : 0;
    
    res.json({
      success: true,
      stats: {
        chatsToday,
        hotLeadsCount,
        confirmedBookingsCount,
        aiFailuresLast24h,
        activeSessions,
        bookingsThisWeek,
        totalChats,
        totalBookings,
        conversionRate,
        modelHealthLast1Hour: getModelHealthLast1Hour()
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET dashboard stats for last 2 days
router.get('/last-2-days-stats', async (req, res) => {
  try {
    console.log('[Dashboard:Stats] Fetching last 2 days data...');
    
    // Calculate date range
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    console.log('[Dashboard:Stats] Period:', {
      from: twoDaysAgo.toISOString(),
      to: now.toISOString()
    });
    
    // Query 1: Total chats in last 2 days
    const chatsCount = await Chat.countDocuments({
      createdAt: { $gte: twoDaysAgo, $lte: now }
    });
    
    console.log('[Dashboard:Stats] Chats count:', chatsCount);
    
    // Query 2: Hot leads in last 2 days
    const hotLeadsCount = await Lead.countDocuments({
      createdAt: { $gte: twoDaysAgo, $lte: now },
      status: 'hot'
    });
    
    console.log('[Dashboard:Stats] Hot leads count:', hotLeadsCount);
    
    // Query 3: Bookings in last 2 days
    const bookingsCount = await Booking.countDocuments({
      createdAt: { $gte: twoDaysAgo, $lte: now },
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
    });
    
    console.log('[Dashboard:Stats] Bookings count:', bookingsCount);
    
    res.json({
      success: true,
      chatsCount,
      hotLeadsCount,
      bookingsCount,
      periodStart: twoDaysAgo.toISOString(),
      periodEnd: now.toISOString(),
      lastUpdated: now.toISOString()
    });
    
  } catch (error) {
    console.error('[Dashboard:Stats] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET detailed list of hot leads (last 2 days)
router.get('/last-2-days-hot-leads', async (req, res) => {
  try {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    const hotLeads = await Lead.find({
      createdAt: { $gte: twoDaysAgo, $lte: now },
      status: 'hot'
    })
    .select('_id chatId score status createdAt')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
    
    // Enrich with chat/phone details
    const enrichedLeads = await Promise.all(
      hotLeads.map(async (lead) => {
        const chat = await Chat.findById(lead.chatId)
          .select('customerName customerPhone')
          .lean();
        
        return {
          ...lead,
          customerName: chat?.customerName || 'Unknown',
          customerPhone: chat?.customerPhone || 'N/A',
          chatId: lead.chatId
        };
      })
    );
    
    console.log('[Dashboard:HotLeads] Enriched with phone numbers:', enrichedLeads.length);
    
    res.json({
      success: true,
      hotLeads: enrichedLeads,
      count: enrichedLeads.length
    });
    
  } catch (error) {
    console.error('[Dashboard:HotLeads] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET detailed list of chats (last 2 days)
router.get('/last-2-days-chats', async (req, res) => {
  try {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    const chats = await Chat.find({
      createdAt: { $gte: twoDaysAgo, $lte: now }
    })
    .select('_id customerName customerPhone bookingStage createdAt lastMessageAt messages')
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .lean();
    
    res.json({
      success: true,
      chats,
      count: chats.length
    });
    
  } catch (error) {
    console.error('[Dashboard:Chats] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET detailed list of bookings (last 2 days)
router.get('/last-2-days-bookings', async (req, res) => {
  try {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    const bookings = await Booking.find({
      createdAt: { $gte: twoDaysAgo, $lte: now },
      status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }
    })
    .select('customerName customerPhone dates totalAmount status createdAt')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
    
    res.json({
      success: true,
      bookings,
      count: bookings.length
    });
    
  } catch (error) {
    console.error('[Dashboard:Bookings] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST manual reset (clear cache if any)
router.post('/refresh-stats', async (req, res) => {
  try {
    console.log('[Dashboard:Refresh] Manual refresh triggered');
    // Since we're using real-time queries, just return fresh data
    res.json({
      success: true,
      message: 'Stats refreshed',
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Dashboard:Refresh] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
