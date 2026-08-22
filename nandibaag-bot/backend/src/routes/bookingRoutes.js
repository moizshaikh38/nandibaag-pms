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

    if (!packageType || !['couple', 'group', 'oneDay', 'picnic', 'one-day-picnic', 'overnight', 'dayuse'].includes(packageType)) {
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

    const sessionId = req.body.sessionId || 'resort_primary';

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
    const isPicnic = packageType === 'oneDay' || packageType === 'picnic' || packageType === 'one-day-picnic' || packageType === 'dayuse';
    const booking = new Booking({
      customerName,
      customerPhone,
      date: dateStr,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      bookingType: isPicnic ? 'picnic' : packageType,
      packageType,
      mealOption: req.body.mealOption || (isPicnic ? 'B->D' : null),
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

    // Create linked RoomBooking records for each selected room for full PMS compatibility
    if (roomIds && roomIds.length > 0) {
      const { Room, RoomBooking } = require('../models');
      for (const rId of roomIds) {
        try {
          const targetRoom = await Room.findOne({
            $or: [
              { _id: mongoose.Types.ObjectId.isValid(rId) ? rId : null },
              { number: String(rId) },
              { roomNumber: String(rId) }
            ]
          });

          if (targetRoom) {
            await RoomBooking.create({
              roomId: targetRoom._id,
              bookingId: booking._id,
              checkInDate: checkIn,
              checkOutDate: checkOut,
              status: 'confirmed'
            });
          }
        } catch (rbErr) {
          console.warn('[Booking:Manual] Could not create RoomBooking for room:', rId, rbErr.message);
        }
      }
    }

    // Confirm temporary room reservations (convert active -> confirmed)
    if (sessionId) {
      try {
        const { confirmReservation } = require('../services/reservationService');
        await confirmReservation(sessionId, checkIn, checkOut);
      } catch (resErr) {
        console.error('[Booking:Reservation] Error confirming reservation:', resErr.message);
      }
    }

    // Broadcast availability_updated and booking_created events to all connected socket clients
    try {
      const io = req.app?.get?.('io') || (require('../sockets').getIO ? require('../sockets').getIO() : null);
      if (io) {
        console.log('[Socket:Broadcast] Emitting real-time availability & booking sync events');
        const syncData = {
          roomIds: booking.roomIds,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          customerName: booking.customerName,
          bookingId: booking._id,
          action: 'booked'
        };

        io.emit('availability_updated', syncData);
        io.emit('availability:updated', syncData);
        io.emit('booking_created', syncData);
        io.emit('booking:created', syncData);
        io.emit('pms:booking_created', syncData);
      }
    } catch (ioError) {
      console.error('[Socket:Broadcast] Error:', ioError.message);
    }

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
      const { Chat } = require('../models');

      console.log('[Booking:MSG] ══════════════════════════════════════════');
      console.log('[Booking:MSG] Preparing to send confirmation messages');
      console.log('[Booking:MSG] Customer phone:', booking.customerPhone);
      console.log('[Booking:MSG] Booking ID:', booking._id);

      const customerMessage = formatBookingMessageForCustomer(booking);
      const staffGroupMessage = formatBookingMessageForStaffGroup(booking);

      console.log('[Booking:MSG] ✅ Messages formatted successfully');
      console.log('[Booking:MSG] Customer message length:', customerMessage.length);
      console.log('[Booking:MSG] Customer message preview:', customerMessage.substring(0, 150));

      const activeSessionId = sessionId || 'resort_primary';

      // Normalize recipient phone number for WhatsApp
      let cleanCustomerPhone = String(booking.customerPhone || '').replace(/[^\d]/g, '');
      if (cleanCustomerPhone.length === 10) cleanCustomerPhone = '91' + cleanCustomerPhone;

      // ─── SEND TO CUSTOMER ──────────────────────────────────────
      console.log('[Booking:MSG] ─── Sending to CUSTOMER ───');
      
      // Send to customer via available WhatsApp channels (Baileys and Fast2SMS WhatsApp)
      try {
        const sent = await sendMessageViaChannel(cleanCustomerPhone, customerMessage, 'whatsapp-web', activeSessionId);
        if (sent) {
          customerMsgSent = true;
          console.log('[Booking:MSG] ✅ WhatsApp booking confirmation sent to customer:', cleanCustomerPhone);
        } else {
          console.log('[Booking:MSG] ⚠️ WhatsApp booking confirmation queued / pending for customer:', cleanCustomerPhone);
        }
      } catch (waError) {
        console.error('[Booking:MSG] ❌ WhatsApp send error for customer:', waError.message);
      }

      // Record confirmation message in Chat history for dashboard visibility
      try {
        let chat = await Chat.findOne({
          $or: [
            { customerPhone: cleanCustomerPhone },
            { customerPhone: booking.customerPhone },
            { customerPhone: cleanCustomerPhone.slice(-10) }
          ]
        });

        if (!chat) {
          chat = new Chat({
            customerPhone: cleanCustomerPhone,
            customerName: booking.customerName,
            channel: 'whatsapp-web',
            bookingStage: 'completed',
            messages: []
          });
        }

        chat.messages.push({
          sender: 'bot',
          text: customerMessage,
          timestamp: new Date(),
          messageType: 'text',
          deliveryStatus: customerMsgSent ? 'sent' : 'pending'
        });
        chat.bookingStage = 'completed';
        chat.lastMessageAt = new Date();
        await chat.save();

        const io = req.app?.get?.('io') || (require('../sockets').getIO ? require('../sockets').getIO() : null);
        if (io) {
          io.emit('chat:updated', chat);
          io.emit('chat:new_message', {
            chatId: chat._id,
            customerPhone: cleanCustomerPhone,
            message: customerMessage,
            sender: 'bot'
          });
        }
      } catch (chatRecordErr) {
        console.warn('[Booking:MSG] Could not record confirmation message in Chat model:', chatRecordErr.message);
      }

      // ─── SEND TO STAFF GROUP ───────────────────────────────────
      const staffGroupNumber = process.env.STAFF_GROUP_NUMBER;
      console.log('[Booking:MSG] ─── Sending to STAFF GROUP ───');
      console.log('[Booking:MSG] Staff group number:', staffGroupNumber || 'NOT SET in .env');

      if (staffGroupNumber) {
        let cleanGroupNumber = String(staffGroupNumber).trim();
        try {
          const groupSent = await sendMessageViaChannel(cleanGroupNumber, staffGroupMessage, 'whatsapp-web', activeSessionId);
          if (groupSent) {
            staffGroupSent = true;
            console.log('[Booking:MSG] ✅ Sent to staff group via WhatsApp');
          } else {
            console.log('[Booking:MSG] ⚠️ Staff group message delivery failed / pending');
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
      console.log('[Booking:MSG] RESULT: Customer:', customerMsgSent ? '✅ SENT' : '⚠️ PENDING/QUEUED', '| Staff:', staffGroupSent ? '✅ SENT' : '⚠️ PENDING/QUEUED');

    } catch (messageError) {
      console.error('[Booking:MSG] ❌ FATAL: Error in formatting/sending block:', messageError.message);
      console.error('[Booking:MSG] Stack:', messageError.stack);
    }

    res.json({
      success: true,
      booking,
      messagesSent: { customerSMS: customerMsgSent, staffGroup: staffGroupSent },
      message: customerMsgSent ? 'Booking created and confirmation sent' : 'Booking created (confirmation message queued/pending)'
    });
    
  } catch (error) {
    console.error('[Booking:Manual] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
