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
      notes: notes || '',
      createdBy: 'staff',
      status: 'confirmed'
    });
    
    await booking.save();
    
    console.log('[Booking:Manual] Booking created:', booking._id);

    // Auto-send confirmation messages to Customer and Staff Group
    try {
      const {
        formatBookingMessageForCustomer,
        formatBookingMessageForStaffGroup
      } = require('../utils/bookingMessageFormatter');
      const { sendMessageViaChannel } = require('../services/channelManager');

      console.log('[Booking:AutoSend] Sending confirmation messages...');
      
      const customerMessage = formatBookingMessageForCustomer(booking);
      const staffGroupMessage = formatBookingMessageForStaffGroup(booking);
      
      console.log('[Booking:AutoSend] Customer message formatted');
      console.log('[Booking:AutoSend] Staff message formatted');
      
      let customerSMSSent = false;
      let staffGroupSent = false;

      // 1. Send to CUSTOMER (Phone)
      try {
        const customerSent = await sendMessageViaChannel(booking.customerPhone, customerMessage, 'fast2sms');
        if (customerSent) {
          customerSMSSent = true;
          console.log('[Booking:AutoSend] ✅ Message sent to customer:', booking.customerPhone);
        } else {
          console.log('[Booking:AutoSend] ⚠️ Customer message delivery attempted for:', booking.customerPhone);
        }
      } catch (smsError) {
        console.error('[Booking:AutoSend] ❌ Failed to send customer SMS:', smsError.message);
      }
      
      // 2. Send to STAFF GROUP
      const staffGroupNumber = process.env.STAFF_GROUP_NUMBER;
      
      if (staffGroupNumber) {
        try {
          const groupSent = await sendMessageViaChannel(staffGroupNumber, staffGroupMessage, 'fast2sms');
          if (groupSent) {
            staffGroupSent = true;
            console.log('[Booking:AutoSend] ✅ Message sent to staff group:', staffGroupNumber);
          } else {
            console.log('[Booking:AutoSend] ⚠️ Staff group message delivery attempted for:', staffGroupNumber);
          }
        } catch (groupError) {
          console.error('[Booking:AutoSend] ❌ Failed to send staff group message:', groupError.message);
        }
      } else {
        console.warn('[Booking:AutoSend] ⚠️ Staff group number not configured in .env');
      }

      booking.messagesSent = {
        customerSMS: customerSMSSent,
        staffGroup: staffGroupSent,
        sentAt: new Date()
      };
      await booking.save();
      
    } catch (messageError) {
      console.error('[Booking:AutoSend] Error formatting/sending messages:', messageError.message);
    }
    
    res.json({
      success: true,
      booking,
      message: 'Booking created and confirmation messages sent'
    });
    
  } catch (error) {
    console.error('[Booking:Manual] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
