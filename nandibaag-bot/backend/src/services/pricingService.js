/**
 * Pricing Service for Nandibaag Resort
 * Calculates authoritative pricing for bookings and returns both raw machine-readable data
 * and a formatted human-readable WhatsApp summary block.
 */

/**
 * Checks if a given date is a Weekend.
 * Weekend is strictly Saturday (6) and Sunday (0).
 * Friday (5) is ALWAYS a Weekday.
 * 
 * @param {Date|string|number} dateInput 
 * @returns {boolean}
 */
function isWeekend(dateInput) {
  const date = new Date(dateInput);
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Format a Date object or string to ordinal format e.g. "1st Aug", "15th Dec"
 */
function formatDateShort(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  
  let suffix = 'th';
  if (day === 1 || day === 21 || day === 31) suffix = 'st';
  else if (day === 2 || day === 22) suffix = 'nd';
  else if (day === 3 || day === 23) suffix = 'rd';

  return `${day}${suffix} ${month}`;
}

/**
 * Calculates pricing for a stay.
 * 
 * Rates:
 * 1. COUPLE STAY (guestCount <= 2 or stayType === 'couple'):
 *    - Weekdays (Mon-Fri): ₹2,500/night
 *    - Weekends (Sat-Sun): ₹3,500/night
 * 
 * 2. FAMILY / GROUP STAY (guestCount >= 3 or stayType === 'group'):
 *    - Weekdays (Mon-Fri): ₹2,000/person/night
 *    - Weekends (Sat-Sun): ₹2,400/person/night
 * 
 * 3. ONE DAY PICNIC (stayType === 'picnic'):
 *    - ₹1,200/person (12 PM - 8 PM, no overnight room stay)
 * 
 * @param {Date|string} checkInInput - Check-in date
 * @param {Date|string} checkOutInput - Check-out date
 * @param {number} guestCount - Number of guests
 * @param {string} stayTypeHint - 'couple', 'group', 'picnic', or 'auto'
 * @returns {object} { raw, formatted }
 */
function calculatePricing(checkInInput, checkOutInput, guestCount = 2, stayTypeHint = 'auto') {
  const checkInDate = new Date(checkInInput);
  let checkOutDate = checkOutInput ? new Date(checkOutInput) : null;
  
  const numGuests = Math.max(1, parseInt(guestCount, 10) || 2);
  
  // Determine stay type
  let stayType = stayTypeHint;
  if (stayType === 'auto' || !stayType) {
    if (numGuests <= 2) stayType = 'couple';
    else stayType = 'group';
  }

  // Handle Picnic
  if (stayType === 'picnic') {
    const ratePerPerson = 1200;
    const grandTotal = numGuests * ratePerPerson;
    const dateStr = formatDateShort(checkInDate) || 'Selected Date';
    
    return {
      raw: {
        stayType: 'picnic',
        guestCount: numGuests,
        totalNights: 0,
        weekdayNights: 0,
        weekdayRate: 0,
        weekdayTotal: 0,
        weekendNights: 0,
        weekendRate: 0,
        weekendTotal: 0,
        grandTotal
      },
      formatted: `✓ BOOKING SUMMARY
━━━━━━━━━━━━━━━━━━
📅 Date: ${dateStr} (12 PM - 8 PM Picnic)
👥 Guests: ${numGuests} ${numGuests === 1 ? 'person' : 'people'}

PRICING BREAKDOWN:
• One Day Picnic: ${numGuests} @ ₹${ratePerPerson.toLocaleString('en-IN')}/person = ₹${grandTotal.toLocaleString('en-IN')}
━━━━━━━━━━━━━━━━━━
💰 TOTAL: ₹${grandTotal.toLocaleString('en-IN')}
✓ All meals & activities included`
    };
  }

  // Default checkOutDate if missing or invalid (1 night stay)
  if (!checkOutDate || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
    checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkOutDate.getDate() + 1);
  }

  // Count weekday nights vs weekend nights
  let weekdayNights = 0;
  let weekendNights = 0;
  
  const cur = new Date(checkInDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(checkOutDate);
  end.setHours(0, 0, 0, 0);

  while (cur < end) {
    if (isWeekend(cur)) {
      weekendNights++;
    } else {
      weekdayNights++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  const totalNights = weekdayNights + weekendNights;

  let weekdayRate = 0;
  let weekendRate = 0;
  let weekdayTotal = 0;
  let weekendTotal = 0;

  if (stayType === 'couple') {
    weekdayRate = 2500; // per couple/night
    weekendRate = 3500; // per couple/night
    weekdayTotal = weekdayNights * weekdayRate;
    weekendTotal = weekendNights * weekendRate;
  } else {
    // group
    weekdayRate = 2000; // per person/night
    weekendRate = 2400; // per person/night
    weekdayTotal = weekdayNights * numGuests * weekdayRate;
    weekendTotal = weekendNights * numGuests * weekendRate;
  }

  const grandTotal = weekdayTotal + weekendTotal;

  const inStr = formatDateShort(checkInDate);
  const outStr = formatDateShort(checkOutDate);
  const dateRangeFormatted = `${inStr}-${outStr} (${totalNights} ${totalNights === 1 ? 'night' : 'nights'})`;

  const breakdownLines = [];
  if (weekdayNights > 0) {
    if (stayType === 'couple') {
      breakdownLines.push(`• Weekdays (Mon-Fri): ${weekdayNights} ${weekdayNights === 1 ? 'night' : 'nights'} @ ₹${weekdayRate.toLocaleString('en-IN')}/night = ₹${weekdayTotal.toLocaleString('en-IN')}`);
    } else {
      breakdownLines.push(`• Weekdays (Mon-Fri): ${weekdayNights} ${weekdayNights === 1 ? 'night' : 'nights'} @ ₹${weekdayRate.toLocaleString('en-IN')}/night = ₹${weekdayTotal.toLocaleString('en-IN')}`);
    }
  }
  if (weekendNights > 0) {
    if (stayType === 'couple') {
      breakdownLines.push(`• Weekends (Sat-Sun): ${weekendNights} ${weekendNights === 1 ? 'night' : 'nights'} @ ₹${weekendRate.toLocaleString('en-IN')}/night = ₹${weekendTotal.toLocaleString('en-IN')}`);
    } else {
      breakdownLines.push(`• Weekends (Sat-Sun): ${weekendNights} ${weekendNights === 1 ? 'night' : 'nights'} @ ₹${weekendRate.toLocaleString('en-IN')}/night = ₹${weekendTotal.toLocaleString('en-IN')}`);
    }
  }

  const formatted = `✓ BOOKING SUMMARY
━━━━━━━━━━━━━━━━━━
📅 Dates: ${dateRangeFormatted}
👥 Guests: ${numGuests} ${numGuests === 1 ? 'person' : 'people'}

PRICING BREAKDOWN:
${breakdownLines.join('\n')}
━━━━━━━━━━━━━━━━━━
💰 TOTAL: ₹${grandTotal.toLocaleString('en-IN')}
✓ All meals & amenities included`;

  return {
    raw: {
      stayType,
      guestCount: numGuests,
      totalNights,
      weekdayNights,
      weekdayRate,
      weekdayTotal,
      weekendNights,
      weekendRate,
      weekendTotal,
      grandTotal
    },
    formatted
  };
}

module.exports = {
  isWeekend,
  calculatePricing,
  formatDateShort
};
