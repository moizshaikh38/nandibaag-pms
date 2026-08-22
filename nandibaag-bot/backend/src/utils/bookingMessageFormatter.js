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
  switch (packageType) {
    case 'couple':
    case 'group':
    case 'overnight':
      return {
        checkIn: '12:00 pm',
        checkOut: '10:30 am',
        checkInTime: '12:00 PM',
        checkOutTime: '10:30 AM'
      };
    
    case 'oneDay':
    case 'picnic':
    case 'one-day-picnic':
    case 'dayuse':
      switch (mealOption) {
        case 'B->D':
        case 'breakfast-to-dinner':
          return {
            checkIn: '9:00 am',
            checkOut: '9:30 pm',
            checkInTime: '09:00 AM',
            checkOutTime: '9:30 PM'
          };
        case 'B->T':
        case 'breakfast-to-tea':
          return {
            checkIn: '9:00 am',
            checkOut: '6:30 pm',
            checkInTime: '09:00 AM',
            checkOutTime: '6:30 PM'
          };
        case 'B->L':
        case 'breakfast-to-lunch':
          return {
            checkIn: '9:00 am',
            checkOut: '2:30 pm',
            checkInTime: '09:00 AM',
            checkOutTime: '2:30 PM'
          };
        default:
          return {
            checkIn: '9:00 am',
            checkOut: '9:30 pm',
            checkInTime: '09:00 AM',
            checkOutTime: '9:30 PM'
          };
      }
    
    default:
      return {
        checkIn: '12:00 pm',
        checkOut: '10:30 am',
        checkInTime: '12:00 PM',
        checkOutTime: '10:30 AM'
      };
  }
};

const getDynamicTimings = (packageType, mealOption) => {
  const times = getCheckInCheckOutTimes(packageType, mealOption);
  return { checkInTime: times.checkInTime, checkOutTime: times.checkOutTime };
};

/**
 * Returns room display string from roomIds array.
 * e.g. [101, 102, 103] → "101, 102, 103"
 * Empty/null → "Will be assigned at check-in"
 */
const getRoomDisplay = (roomIds, fallbackRoomId) => {
  if (Array.isArray(roomIds) && roomIds.length > 0) {
    return roomIds.join(', ');
  }
  if (typeof roomIds === 'string' && roomIds.trim()) {
    return roomIds.trim();
  }
  if (fallbackRoomId) {
    return String(fallbackRoomId);
  }
  return 'Will be assigned at check-in';
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

  const bookedByName = booking.bookedBy?.name || 'Staff';
  const roomDisplay = getRoomDisplay(booking.roomIds, booking.roomId);
  const rateDisplay = getRateDisplay(booking.packageType);

  const { checkInTime, checkOutTime } = getDynamicTimings(booking.packageType, booking.mealOption);

  console.log('[Message:Formatter] Package:', booking.packageType, 'Timings:', checkInTime, '-', checkOutTime);

  const message = `✅ BOOKING CONFIRMED ✓

Name: ${booking.customerName}
Check In Date: ${checkInDateStr}
Check In Day: ${checkInDay}
Check Out Date: ${checkOutDateStr}
Check Out Day: ${checkOutDay}
Members: ${totalMembers}
Room: ${roomDisplay}
Total Payment: ₹${totalAmount.toLocaleString('en-IN')}
Advance Payment: ₹${advancePaid.toLocaleString('en-IN')}
Pending Payment: ${pendingDisplay}
Contact No.: ${booking.customerPhone}
Booked by: ${bookedByName}

Note:
⏳ Check in: ${checkInTime}
⏳ Check out: ${checkOutTime}
Lunch time: 1:30 to 2:30 pm
Hi-tea time: 5:30 to 6:30 pm
Dinner time: 8:30 to 9:30 pm
Breakfast time: 9:00 to 10:30 am

Activities timing
Kayaking and Rope Cycling
9:00 am to 1:30 pm
3:00 pm to 5:30 pm

DOLLERS CAFE TIMING
12:00 PM TO 12:00 AM
${booking.notes ? `\nSpecial Notes: ${booking.notes}` : ''}
Thank you for booking with Nandibaag Resort! 🙏`;

  return message;
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
