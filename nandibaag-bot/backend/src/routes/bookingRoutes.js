const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Booking } = require('../models');

const router = express.Router();

/**
 * GET /api/bookings
 * List bookings with status filter
 */
router.get('/', async (req, res, next) => {
  try {
    console.log('[Bookings:GetAll] Fetching all bookings');
    const { status } = req.query;
    
    const query = {};
    if (status && ['draft', 'pending_payment', 'confirmed', 'cancelled', 'checked_in', 'checked_out'].includes(status)) {
      query.status = status;
    }
    
    const bookings = await Booking.find(query)
      .sort({ checkInDate: -1, createdAt: -1 })
      .populate('chatId', 'customerPhone customerName')
      .lean();
    
    console.log('[Bookings:GetAll] Found:', bookings.length, 'bookings');
    
    res.json({
      success: true,
      bookings,
      count: bookings.length
    });
  } catch (error) {
    console.error('[Bookings:GetAll] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * PATCH /api/bookings/:id/status
 * Update booking status manually
 */
router.patch('/:id/status', verifyToken, async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!status || !['draft', 'pending_payment', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    res.json({
      success: true,
      booking
    });
  } catch (error) {
    next(error);
  }
});
let staffList = [
  { name: 'Kadambari', id: 'staff_1' },
  { name: 'Ravi', id: 'staff_2' },
  { name: 'Priti', id: 'staff_3' },
  { name: 'Mansi', id: 'staff_4' }
];

// GET all staff names
router.get('/staff-names', async (req, res) => {
  try {
    console.log('[Staff:Get] Fetching all staff names');
    res.json({
      success: true,
      staffNames: staffList
    });
  } catch (error) {
    console.error('[Staff:Get] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST add new staff name
router.post('/staff-names', async (req, res) => {
  try {
    const { name } = req.body;
    console.log('[Staff:Add] Adding staff:', name);
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Staff name required' 
      });
    }
    
    const newStaff = {
      name: name.trim(),
      id: 'staff_' + Date.now()
    };
    
    staffList.push(newStaff);
    console.log('[Staff:Add] New staff created:', newStaff);
    
    res.json({
      success: true,
      staff: newStaff,
      staffNames: staffList
    });
  } catch (error) {
    console.error('[Staff:Add] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE staff name
router.delete('/staff-names/:staffId', async (req, res) => {
  try {
    const { staffId } = req.params;
    console.log('[Staff:Delete] Deleting staff:', staffId);
    
    staffList = staffList.filter(s => s.id !== staffId);
    
    res.json({
      success: true,
      message: 'Staff deleted',
      deletedId: staffId,
      staffNames: staffList
    });
  } catch (error) {
    console.error('[Staff:Delete] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create booking with all new fields
router.post('/manual-booking', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      checkInDate,
      checkOutDate,
      packageType,
      guestComposition,
      bookedBy,
      staffNames,
      totalAmount,
      notes
    } = req.body;
    
    console.log('[Booking:Manual] Creating booking:', {
      customerName,
      packageType,
      guestComposition,
      bookedBy,
      notes: notes?.slice(0, 50)
    });
    
    // Validation
    if (!customerName || !customerPhone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer name and phone required' 
      });
    }

    if (!packageType || !['couple', 'group', 'oneDay', 'picnic'].includes(packageType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid package type' 
      });
    }
    
    if (!guestComposition?.adults || guestComposition.adults < 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Adults count required (min 1)' 
      });
    }
    
    if (!bookedBy?.name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booked by staff name required' 
      });
    }

    const checkIn = checkInDate ? new Date(checkInDate) : new Date();
    const checkOut = checkOutDate ? new Date(checkOutDate) : new Date(checkIn.getTime() + 86400000);
    const dateStr = checkIn.toISOString().split('T')[0];

    const sessionId = req.body.sessionId || null;

    // Multi-room handling & final real-time availability check
    const roomIds = Array.isArray(req.body.roomIds) 
      ? req.body.roomIds.filter(Boolean)
      : (req.body.roomId ? [req.body.roomId] : []);

    if (roomIds.length > 0) {
      const { checkMultipleRoomsAvailable } = require('../services/availabilityService');
      const availabilityCheck = await checkMultipleRoomsAvailable(
        roomIds,
        checkIn,
        checkOut,
        sessionId
      );

      if (!availabilityCheck.available) {
        console.warn('[Booking:Manual] ❌ Room availability conflict:', availabilityCheck.reason);
        return res.status(400).json({
          success: false,
          error: availabilityCheck.reason,
          conflicts: availabilityCheck.conflicts
        });
      } else {
        console.log('[Booking:Manual] ✅ All selected rooms available:', roomIds.join(', '));
      }
    }
    
    // Create booking
    const booking = new Booking({
      customerName,
      customerPhone,
      date: dateStr,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      bookingType: packageType === 'oneDay' ? 'picnic' : packageType,
      packageType,
      mealOption: req.body.mealOption || (packageType === 'oneDay' ? 'B->D' : null),
      guestComposition: {
        adults: Number(guestComposition.adults) || 2,
        children: Number(guestComposition.children) || 0
      },
      adults: Number(guestComposition.adults) || 2,
      bookedBy: {
        name: bookedBy.name,
        staffId: bookedBy.staffId || ''
      },
      staffNames: staffNames || staffList,
      advancePayment: Number(req.body.advancePayment || req.body.advancePaid) || 0,
      advancePaid: Number(req.body.advancePaid || req.body.advancePayment) || 0,
      remainingPayment: Number(req.body.remainingPayment) || Math.max(0, (Number(totalAmount) || 0) - (Number(req.body.advancePaid || req.body.advancePayment) || 0)),
      totalAmount: Number(totalAmount) || 0,
      roomId: roomIds.join(', ') || req.body.roomId || '',
      roomIds: roomIds,
      notes: notes || '',
      createdBy: 'staff',
      status: 'confirmed'
    });
    
    await booking.save();
    console.log('[Booking:Manual] Booking created:', booking._id);

    // Confirm temporary room reservations (convert active -> confirmed)
    if (sessionId) {
      try {
        const { confirmReservation } = require('../services/reservationService');
        await confirmReservation(sessionId, checkIn, checkOut);
      } catch (resErr) {
        console.error('[Booking:Reservation] Error confirming reservation:', resErr.message);
      }
    }

    // Broadcast booking_created event to all connected socket clients
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('booking_created', {
          roomIds,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          customerName,
          message: `${customerName} booked ${roomIds.length} room(s)`
        });
        console.log('[Socket:Broadcast] booking_created event sent');
      }
    } catch (_) {}

    // ─── AUTO-SEND CONFIRMATION MESSAGES ────────────────────────────
    // Sends formatted booking confirmation to Customer (WhatsApp) and Staff Group
    let customerMsgSent = false;
    let staffGroupSent = false;

    try {
      const {
        formatBookingMessageForCustomer,
        formatBookingMessageForStaffGroup
      } = require('../utils/bookingMessageFormatter');
      const { sendMessageViaChannel } = require('../services/channelManager');
      const whatsappService = require('../services/whatsappService');

      console.log('[Booking:MSG] ══════════════════════════════════════════');
      console.log('[Booking:MSG] Preparing to send confirmation messages');
      console.log('[Booking:MSG] Customer phone:', booking.customerPhone);
      console.log('[Booking:MSG] Booking ID:', booking._id);

      const customerMessage = formatBookingMessageForCustomer(booking);
      const staffGroupMessage = formatBookingMessageForStaffGroup(booking);

      console.log('[Booking:MSG] ✅ Messages formatted successfully');
      console.log('[Booking:MSG] Customer message length:', customerMessage.length);
      console.log('[Booking:MSG] Customer message preview:', customerMessage.substring(0, 150));

      // ─── SEND TO CUSTOMER ──────────────────────────────────────
      console.log('[Booking:MSG] ─── Sending to CUSTOMER ───');
      
      // Strategy: Try WhatsApp Web (Baileys) first → fast2sms → direct Baileys
      // Baileys is the primary connected channel for this bot
      
      // Attempt 1: WhatsApp Web via channelManager
      try {
        const sent = await sendMessageViaChannel(booking.customerPhone, customerMessage, 'whatsapp-web');
        if (sent) {
          customerMsgSent = true;
          console.log('[Booking:MSG] ✅ ATTEMPT 1 SUCCESS: WhatsApp Web sent to customer:', booking.customerPhone);
        } else {
          console.log('[Booking:MSG] ⚠️ ATTEMPT 1: WhatsApp Web returned false (session may not be ready)');
        }
      } catch (wa1Error) {
        console.error('[Booking:MSG] ❌ ATTEMPT 1 WhatsApp Web error:', wa1Error.message);
      }

      // Attempt 2: fast2sms channel (if FAST2SMS_API_KEY configured)
      if (!customerMsgSent) {
        try {
          const sent = await sendMessageViaChannel(booking.customerPhone, customerMessage, 'fast2sms');
          if (sent) {
            customerMsgSent = true;
            console.log('[Booking:MSG] ✅ ATTEMPT 2 SUCCESS: Fast2SMS sent to customer:', booking.customerPhone);
          } else {
            console.log('[Booking:MSG] ⚠️ ATTEMPT 2: Fast2SMS returned false (API key may be missing)');
          }
        } catch (sms2Error) {
          console.error('[Booking:MSG] ❌ ATTEMPT 2 Fast2SMS error:', sms2Error.message);
        }
      }

      // Attempt 3: Direct Baileys sendMessage (last resort — tries ANY active session)
      if (!customerMsgSent) {
        try {
          const sent = await whatsappService.sendMessage('primary', booking.customerPhone, customerMessage);
          if (sent) {
            customerMsgSent = true;
            console.log('[Booking:MSG] ✅ ATTEMPT 3 SUCCESS: Direct Baileys sent to customer');
          } else {
            console.log('[Booking:MSG] ❌ ATTEMPT 3: Direct Baileys also failed (no active WhatsApp session — message queued)');
          }
        } catch (wa3Error) {
          console.error('[Booking:MSG] ❌ ATTEMPT 3 Direct Baileys error:', wa3Error.message);
        }
      }

      if (!customerMsgSent) {
        console.error('[Booking:MSG] ❌❌❌ ALL 3 ATTEMPTS FAILED for customer:', booking.customerPhone);
        console.error('[Booking:MSG] DIAGNOSIS: Check if WhatsApp Web (Baileys) QR code has been scanned and session is active.');
        console.error('[Booking:MSG] DIAGNOSIS: Check if FAST2SMS_API_KEY is set in .env');
      }

      // ─── SEND TO STAFF GROUP ───────────────────────────────────
      const staffGroupNumber = process.env.STAFF_GROUP_NUMBER;
      console.log('[Booking:MSG] ─── Sending to STAFF GROUP ───');
      console.log('[Booking:MSG] Staff group number:', staffGroupNumber || 'NOT SET in .env');

      if (staffGroupNumber) {
        try {
          const groupSent = await sendMessageViaChannel(staffGroupNumber, staffGroupMessage, 'whatsapp-web');
          if (groupSent) {
            staffGroupSent = true;
            console.log('[Booking:MSG] ✅ Sent to staff group via WhatsApp');
          } else {
            // Try fast2sms fallback
            const groupSent2 = await sendMessageViaChannel(staffGroupNumber, staffGroupMessage, 'fast2sms');
            if (groupSent2) {
              staffGroupSent = true;
              console.log('[Booking:MSG] ✅ Sent to staff group via Fast2SMS');
            } else {
              console.log('[Booking:MSG] ⚠️ Staff group message failed both channels');
            }
          }
        } catch (groupError) {
          console.error('[Booking:MSG] ❌ Failed to send staff group message:', groupError.message);
        }
      } else {
        console.warn('[Booking:MSG] ⚠️ STAFF_GROUP_NUMBER not set in .env — skipping staff notification');
      }

      // Track message status on booking
      booking.messagesSent = {
        customerSMS: customerMsgSent,
        staffGroup: staffGroupSent,
        sentAt: new Date()
      };
      try { await booking.save(); } catch (_) {}

      console.log('[Booking:MSG] ══════════════════════════════════════════');
      console.log('[Booking:MSG] RESULT: Customer:', customerMsgSent ? '✅ SENT' : '❌ FAILED', '| Staff:', staffGroupSent ? '✅ SENT' : '❌ FAILED');

    } catch (messageError) {
      console.error('[Booking:MSG] ❌ FATAL: Error in formatting/sending block:', messageError.message);
      console.error('[Booking:MSG] Stack:', messageError.stack);
    }

    res.json({
      success: true,
      booking,
      messagesSent: { customerSMS: customerMsgSent, staffGroup: staffGroupSent },
      message: customerMsgSent ? 'Booking created and confirmation sent' : 'Booking created (message delivery pending)'
    });
    
  } catch (error) {
    console.error('[Booking:Manual] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
