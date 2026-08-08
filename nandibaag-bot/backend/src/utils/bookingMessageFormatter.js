/**
 * Formats booking confirmation messages for customer and staff group.
 */

const formatBookingMessageForCustomer = (booking) => {
  const checkInDateObj = new Date(booking.checkInDate || booking.date);
  const checkOutDateObj = new Date(booking.checkOutDate || (checkInDateObj.getTime() + 86400000));

  const checkInDateStr = checkInDateObj.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'long', 
    year: '2-digit' 
  });
  const checkInDay = checkInDateObj.toLocaleDateString('en-US', { weekday: 'long' });

  const checkOutDateStr = checkOutDateObj.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'long', 
    year: '2-digit' 
  });
  const checkOutDay = checkOutDateObj.toLocaleDateString('en-US', { weekday: 'long' });

  const adults = Number(booking.guestComposition?.adults ?? booking.adults ?? 1);
  const children = Number(booking.guestComposition?.children ?? booking.children ?? 0);
  const totalMembers = adults + children;

  const totalAmount = Number(booking.totalAmount || 0);
  const advancePaid = Number(booking.advancePaid ?? booking.advancePayment ?? 0);
  const pendingPayment = Math.max(0, totalAmount - advancePaid);

  const bookedByName = booking.bookedBy?.name || 'Staff';
  const roomInfo = booking.roomId ? `Room ${booking.roomId}` : 'Will be assigned at check-in';

  const message = `
Name: ${booking.customerName}
Check In Date: ${checkInDateStr}
Check In Day: ${checkInDay}
Check Out Date: ${checkOutDateStr}
Check Out Day: ${checkOutDay}
Members: ${totalMembers}
Room: ${roomInfo}
Total Payment: ${totalAmount}
Advance Payment: ${advancePaid}
Pending Payment: ${pendingPayment}
Contact No.: ${booking.customerPhone}
Booked by: ${bookedByName}

Note:
Check in: 09:00 am
Check out: 06:30 pm
Lunch: 1:30 - 2:30 pm
Hi-tea: 5:30 - 6:30 pm
Dinner: 8:30 - 9:30 pm
Breakfast: 9:00 - 10:30 am

Activities:
Kayaking & Rope Cycling
9:00 am - 1:30 pm | 3:00 pm - 6:00 pm

Dollers Cafe: 12:00 PM - 12:00 AM

${booking.notes ? `Special Notes: ${booking.notes}` : ''}

Thank you for booking with Nandibaag Resort!
  `.trim();

  return message;
};

const formatBookingMessageForStaffGroup = (booking) => {
  const checkInDateObj = new Date(booking.checkInDate || booking.date);
  const checkOutDateObj = new Date(booking.checkOutDate || (checkInDateObj.getTime() + 86400000));

  const checkInDateStr = checkInDateObj.toLocaleDateString('en-GB');
  const checkInDayShort = checkInDateObj.toLocaleDateString('en-US', { weekday: 'short' });

  const checkOutDateStr = checkOutDateObj.toLocaleDateString('en-GB');
  const checkOutDayShort = checkOutDateObj.toLocaleDateString('en-US', { weekday: 'short' });

  const adults = Number(booking.guestComposition?.adults ?? booking.adults ?? 1);
  const children = Number(booking.guestComposition?.children ?? booking.children ?? 0);
  const totalMembers = adults + children;

  const totalAmount = Number(booking.totalAmount || 0);
  const advancePaid = Number(booking.advancePaid ?? booking.advancePayment ?? 0);
  const pendingPayment = Math.max(0, totalAmount - advancePaid);

  const bookedByName = booking.bookedBy?.name || 'Staff';
  const roomInfo = booking.roomId ? `Room ${booking.roomId}` : 'ASSIGN AT CHECK-IN';
  const packageType = booking.packageType || booking.bookingType || 'Couple';

  const message = `
🎫 NEW BOOKING CREATED

Name: ${booking.customerName}
Contact: ${booking.customerPhone}
Check In: ${checkInDateStr} (${checkInDayShort})
Check Out: ${checkOutDateStr} (${checkOutDayShort})
Members: ${totalMembers}
Package: ${packageType}
Booked By: ${bookedByName}

💰 Payment:
Total: ₹${totalAmount}
Advance: ₹${advancePaid}
Pending: ₹${pendingPayment}

🏨 Room: ${roomInfo}

${booking.notes ? `📝 Notes: ${booking.notes}` : ''}

Status: Ready for check-in
  `.trim();

  return message;
};

module.exports = {
  formatBookingMessageForCustomer,
  formatBookingMessageForStaffGroup
};
