/**
 * Formats booking confirmation messages for customer and staff group.
 * Dynamic check-in/check-out timings based on packageType and mealOption.
 * 
 * Features:
 * - Premium "✅ BOOKING CONFIRMED ✓" header on customer message
 * - Actual room numbers (101, 102, 103) displayed instead of generic "2 Rooms"
 * - Pending payment shows "Nil" when fully paid
 * - Rate info displayed based on package type
 * - Staff message shows "🔔 NEW BOOKING ALERT ✅" header
 */

const { formatDateToDDMMYYYY, getDayName } = require('./dateUtils');

const getCheckInCheckOutTimes = (packageType, mealOption) => {
  console.log('[Formatter:Times] Getting times for:', packageType, mealOption);

  // OVERNIGHT STAYS
  if (packageType === 'couple' || packageType === 'group' || packageType === 'overnight') {
    return {
      checkIn: '12:00 PM',
      checkOut: '10:30 AM',
      checkInTime: '12:00 PM',
      checkOutTime: '10:30 AM',
      description: 'Check-in: 12:00 PM | Check-out: 10:30 AM (next day)'
    };
  }

  // ONE-DAY PICNIC
  if (packageType === 'one-day-picnic' || packageType === 'oneDay' || packageType === 'picnic' || packageType === 'dayuse') {
    if (mealOption === 'breakfast-to-tea' || mealOption === 'B->T') {
      return {
        checkIn: '9:00 AM',
        checkOut: '6:30 PM',
        checkInTime: '9:00 AM',
        checkOutTime: '6:30 PM',
        description: 'Check-in: 9:00 AM | Check-out: 6:30 PM (same day)'
      };
    } else if (mealOption === 'breakfast-to-dinner' || mealOption === 'B->D') {
      return {
        checkIn: '9:00 AM',
        checkOut: '9:30 PM',
        checkInTime: '9:00 AM',
        checkOutTime: '9:30 PM',
        description: 'Check-in: 9:00 AM | Check-out: 9:30 PM (same day)'
      };
    } else if (mealOption === 'breakfast-to-lunch' || mealOption === 'B->L') {
      return {
        checkIn: '9:00 AM',
        checkOut: '2:30 PM',
        checkInTime: '9:00 AM',
        checkOutTime: '2:30 PM',
        description: 'Check-in: 9:00 AM | Check-out: 2:30 PM (same day)'
      };
    } else {
      return {
        checkIn: '9:00 AM',
        checkOut: '9:30 PM',
        checkInTime: '9:00 AM',
        checkOutTime: '9:30 PM',
        description: 'Check-in: 9:00 AM | Check-out: 9:30 PM (same day)'
      };
    }
  }

  // DEFAULT (Overnight fallback)
  return {
    checkIn: '12:00 PM',
    checkOut: '10:30 AM',
    checkInTime: '12:00 PM',
    checkOutTime: '10:30 AM',
    description: 'Check-in: 12:00 PM | Check-out: 10:30 AM (next day)'
  };
};

const getDynamicTimings = (packageType, mealOption) => {
  const times = getCheckInCheckOutTimes(packageType, mealOption);
  return { checkInTime: times.checkInTime, checkOutTime: times.checkOutTime };
};

/**
 * Returns room display string showing room count (e.g. "1 Room", "2 Rooms").
 */
const getRoomDisplay = (roomIds, fallbackRoomId) => {
  if (Array.isArray(roomIds) && roomIds.length > 0) {
    const count = roomIds.length;
    return count === 1 ? '1 Room' : `${count} Rooms`;
  }
  if (typeof roomIds === 'string' && roomIds.trim()) {
    const parts = roomIds.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const count = parts.length;
      return count === 1 ? '1 Room' : `${count} Rooms`;
    }
  }
  if (fallbackRoomId) {
    return '1 Room';
  }
  return '1 Room';
};

/**
 * Returns rate info string based on package type.
 */
const getRateDisplay = (packageType) => {
  if (packageType === 'couple') {
    return '₹5,500 (Weekday) / ₹6,500 (Weekend)';
  }
  if (packageType === 'group') {
    return '₹2,000 (Weekday) / ₹3,000 (Weekend)';
  }
  if (packageType === 'oneDay' || packageType === 'picnic' || packageType === 'one-day-picnic' || packageType === 'dayuse') {
    return '₹1,250 (Weekday) / ₹1,500 (Weekend)';
  }
  return '₹2,000 (Weekday) / ₹3,000 (Weekend)';
};

const formatBookingMessageForCustomer = (booking) => {
  const checkInDateObj = new Date(booking.checkInDate || booking.date);
  const checkOutDateObj = new Date(booking.checkOutDate || (checkInDateObj.getTime() + 86400000));

  const checkInDateStr = formatDateToDDMMYYYY(checkInDateObj);
  const checkInDay = getDayName(checkInDateObj);

  const checkOutDateStr = formatDateToDDMMYYYY(checkOutDateObj);
  const checkOutDay = getDayName(checkOutDateObj);

  const adults = Number(booking.guestComposition?.adults ?? booking.adults ?? 1);
  const children = Number(booking.guestComposition?.children ?? booking.children ?? 0);
  const totalMembers = adults + children;

  const totalAmount = Number(booking.totalAmount || 0);
  const advancePaid = Number(booking.advancePaid ?? booking.advancePayment ?? 0);
  const pendingPayment = Math.max(0, totalAmount - advancePaid);
  const pendingDisplay = pendingPayment > 0 ? `₹${pendingPayment.toLocaleString('en-IN')}` : 'Nil';

  const bookedByName = booking.bookedBy?.name || booking.bookedBy || 'Staff';
  const roomDisplay = getRoomDisplay(booking.roomIds, booking.roomId);

  const { checkInTime, checkOutTime } = getCheckInCheckOutTimes(booking.packageType, booking.mealOption);

  console.log('[Formatter:Confirmation] Package:', booking.packageType, 'Timings:', checkInTime, '-', checkOutTime);

  const message = `✅ BOOKING CONFIRMED ✓

Name: ${booking.customerName}
Check In Date: ${checkInDateStr}
Check In Day: ${checkInDay}
Check Out Date: ${checkOutDateStr}
Check Out Day: ${checkOutDay}
Members: ${totalMembers}
Room: ${roomDisplay}
Package: ${(booking.packageType || 'Stay').toUpperCase()}
Meal Option: ${booking.mealOption || 'None'}
Total Payment: ₹${totalAmount.toLocaleString('en-IN')}
Advance Payment: ₹${advancePaid.toLocaleString('en-IN')}
Pending Payment: ${pendingDisplay}
Contact No.: ${booking.customerPhone}
Booked by: ${bookedByName}

🕐 TIMING:
Check in: ${checkInTime}
Check out: ${checkOutTime}

🍽️ MEAL TIMINGS:
Breakfast: 9:00 AM - 10:30 AM
Lunch: 1:30 PM - 2:30 PM
Hi-tea: 5:30 PM - 6:30 PM
Dinner: 8:30 PM - 9:30 PM

🏄 ACTIVITIES:
Kayaking & Rope Cycling:
9:00 AM - 1:30 PM
3:00 PM - 5:30 PM

📞 RESORT CONTACT:
Call: 9257657664/9257657665/9257657663

Special Notes: ${booking.notes || 'None'}

Thank you for booking with Nandibaag Resort! 🙏`;

  const templateData = {
    message_id: process.env.FAST2SMS_CONFIRMATION_TEMPLATE_ID || '', 
    variables_values: [
      booking.customerName, // {{1}}
      checkInDateStr, // {{2}}
      checkInDay, // {{3}}
      checkOutDateStr, // {{4}}
      checkOutDay, // {{5}}
      totalMembers, // {{6}}
      roomDisplay, // {{7}}
      (booking.packageType || 'Stay').toUpperCase(), // {{8}}
      booking.mealOption || 'None', // {{9}}
      totalAmount.toLocaleString('en-IN'), // {{10}}
      advancePaid.toLocaleString('en-IN'), // {{11}}
      pendingDisplay, // {{12}}
      booking.customerPhone, // {{13}}
      bookedByName, // {{14}}
      checkInTime, // {{15}}
      checkOutTime, // {{16}}
      booking.notes || 'None' // {{17}}
    ].map(v => (v || 'None').toString().replace(/\|/g, '')).join('|')
  };

  return { text: message, templateData };
};

const formatBookingMessageForStaffGroup = (booking) => {
  const checkInDateObj = new Date(booking.checkInDate || booking.date);
  const checkOutDateObj = new Date(booking.checkOutDate || (checkInDateObj.getTime() + 86400000));

  const checkInDateStr = formatDateToDDMMYYYY(checkInDateObj);
  const checkInDay = getDayName(checkInDateObj);

  const checkOutDateStr = formatDateToDDMMYYYY(checkOutDateObj);
  const checkOutDay = getDayName(checkOutDateObj);

  const adults = Number(booking.guestComposition?.adults ?? booking.adults ?? 1);
  const children = Number(booking.guestComposition?.children ?? booking.children ?? 0);
  const totalMembers = adults + children;

  const totalAmount = Number(booking.totalAmount || 0);
  const advancePaid = Number(booking.advancePaid ?? booking.advancePayment ?? 0);
  const pendingPayment = Math.max(0, totalAmount - advancePaid);

  const bookedByName = booking.bookedBy?.name || 'Staff';
  const roomDisplay = getRoomDisplay(booking.roomIds, booking.roomId);

  const packageLabel = booking.packageType === 'couple'
    ? 'COUPLE STAY'
    : booking.packageType === 'group'
      ? 'GROUP STAY'
      : booking.packageType === 'oneDay' || booking.packageType === 'picnic'
        ? 'ONE DAY PICNIC'
        : (booking.packageType || 'STAY').toUpperCase();

  const { checkInTime, checkOutTime } = getDynamicTimings(booking.packageType, booking.mealOption);

  const message = `🔔 NEW BOOKING ALERT ✅

Customer Name: ${booking.customerName}
Phone: ${booking.customerPhone}
Check In: ${checkInDateStr} (${checkInDay})
Check Out: ${checkOutDateStr} (${checkOutDay})
Package: ${packageLabel}
${booking.packageType === 'oneDay' && booking.mealOption ? `Meal: ${booking.mealOption}\n` : ''}Members: ${totalMembers} (${adults} Adults, ${children} Children)
Rooms: ${roomDisplay}
Payment: ₹${totalAmount.toLocaleString('en-IN')} (Advance: ₹${advancePaid.toLocaleString('en-IN')} | Pending: ₹${pendingPayment.toLocaleString('en-IN')})
Booked By: ${bookedByName}
Notes: ${booking.notes || 'None'}

⏳ Check-in: ${checkInTime}
⏳ Check-out: ${checkOutTime}

⚠️ Please confirm room assignment and notify customer ASAP.`;

  return message;
};

const formatBookingConfirmationMessage = (booking) => {
  return {
    customerMessage: formatBookingMessageForCustomer(booking),
    staffMessage: formatBookingMessageForStaffGroup(booking)
  };
};

module.exports = {
  getCheckInCheckOutTimes,
  getDynamicTimings,
  formatBookingMessageForCustomer,
  formatBookingMessageForStaffGroup,
  formatBookingConfirmationMessage
};
