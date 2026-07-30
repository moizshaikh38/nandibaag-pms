/**
 * Pricing Service for Nandibaag Resort
 * Calculates authoritative pricing for bookings and returns both raw machine-readable data
 * and a formatted human-readable WhatsApp summary block.
 * 
 * PRICING RULES (as of July 2026):
 * - WEEKDAY = Mon, Tue, Wed, Thu (Mon-Thu)
 * - WEEKEND = Fri, Sat, Sun (Fri-Sun)  ← Friday IS a weekend
 * 
 * GROUP (3+ people): Weekday ₹2,000/person | Weekend ₹3,000/person
 * COUPLE (2 people): Weekday ₹5,000/couple | Weekend ₹6,500/couple
 * DAY PICNIC: ₹1,200/person (Breakfast-Dinner) | ₹1,000/person (Breakfast-Tea)
 * KIDS: Below 5 FREE | 6-10 ₹1,000 | Above 10 adult rate
 */

/**
 * Checks if a given date is a Weekend.
 * Weekend = Friday (5), Saturday (6), Sunday (0).
 * 
 * @param {Date|string|number} dateInput 
 * @returns {boolean}
 */
function isWeekend(dateInput) {
  const date = new Date(dateInput);
  const day = date.getDay();
  // Sunday = 0, Friday = 5, Saturday = 6
  return day === 0 || day === 5 || day === 6;
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
 * Get day label for a date (e.g. "Friday" or "WEEKEND"/"WEEKDAY")
 */
function getDayName(dateInput) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date(dateInput);
  return dayNames[d.getDay()];
}

/**
 * Calculates pricing for a stay.
 * 
 * Rates:
 * 1. COUPLE STAY (guestCount <= 2 or stayType === 'couple'):
 *    - Weekdays (Mon-Thu): ₹5,000/couple/night
 *    - Weekends (Fri-Sun): ₹6,500/couple/night
 * 
 * 2. FAMILY / GROUP STAY (guestCount >= 3 or stayType === 'group'):
 *    - Weekdays (Mon-Thu): ₹2,000/person/night
 *    - Weekends (Fri-Sun): ₹3,000/person/night
 * 
 * 3. ONE DAY PICNIC (stayType === 'picnic'):
 *    - ₹1,200/person (12 PM - 8 PM, Breakfast to Dinner)
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
    const dayName = getDayName(checkInDate);
    
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
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Date: ${dateStr} (${dayName}) — Day Picnic (12 PM - 8 PM)
👥 Guests: ${numGuests} ${numGuests === 1 ? 'person' : 'people'}

PRICING BREAKDOWN:
- Day Picnic: ${numGuests} × ₹${ratePerPerson.toLocaleString('en-IN')}/person = ₹${grandTotal.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 TOTAL: ₹${grandTotal.toLocaleString('en-IN')}
(Final price, NO extra charges)

✅ Includes: All meals + activities`
    };
  }

  // Default checkOutDate if missing or invalid (1 night stay)
  if (!checkOutDate || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
    checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkOutDate.getDate() + 1);
  }

  // Count weekday nights vs weekend nights and build per-night breakdown
  let weekdayNights = 0;
  let weekendNights = 0;
  const nightBreakdown = [];
  
  const cur = new Date(checkInDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(checkOutDate);
  end.setHours(0, 0, 0, 0);

  while (cur < end) {
    const dayName = getDayName(cur);
    const dateStr = formatDateShort(cur);
    const weekend = isWeekend(cur);
    
    if (weekend) {
      weekendNights++;
      nightBreakdown.push({ dateStr, dayName, type: 'WEEKEND' });
    } else {
      weekdayNights++;
      nightBreakdown.push({ dateStr, dayName, type: 'WEEKDAY' });
    }
    cur.setDate(cur.getDate() + 1);
  }

  const totalNights = weekdayNights + weekendNights;

  let weekdayRate = 0;
  let weekendRate = 0;
  let weekdayTotal = 0;
  let weekendTotal = 0;

  if (stayType === 'couple') {
    weekdayRate = 5000;  // per couple/night
    weekendRate = 6500;  // per couple/night
    weekdayTotal = weekdayNights * weekdayRate;
    weekendTotal = weekendNights * weekendRate;
  } else {
    // group
    weekdayRate = 2000;  // per person/night
    weekendRate = 3000;  // per person/night
    weekdayTotal = weekdayNights * numGuests * weekdayRate;
    weekendTotal = weekendNights * numGuests * weekendRate;
  }

  const grandTotal = weekdayTotal + weekendTotal;

  const inStr = formatDateShort(checkInDate);
  const outStr = formatDateShort(checkOutDate);
  const inDayName = getDayName(checkInDate);
  const outDayName = getDayName(checkOutDate);

  // Build per-night breakdown lines
  const breakdownLines = nightBreakdown.map(n => {
    if (stayType === 'couple') {
      const rate = n.type === 'WEEKEND' ? weekendRate : weekdayRate;
      return `- ${n.dayName} (${n.dateStr}) - ${n.type}: ₹${rate.toLocaleString('en-IN')}`;
    } else {
      const rate = n.type === 'WEEKEND' ? weekendRate : weekdayRate;
      const nightTotal = numGuests * rate;
      return `- ${n.dayName} (${n.dateStr}) - ${n.type}: ${numGuests}×₹${rate.toLocaleString('en-IN')} = ₹${nightTotal.toLocaleString('en-IN')}`;
    }
  });

  const roomType = stayType === 'couple' ? 'Couple Room' : 'Group Room';

  const formatted = `✓ BOOKING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Check-in: ${inStr} (${inDayName})
📅 Check-out: ${outStr} (${outDayName})
👥 Guests: ${numGuests} ${numGuests === 1 ? 'person' : 'people'}
🛏️ Room Type: ${roomType}

PRICING BREAKDOWN:
${breakdownLines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 TOTAL: ₹${grandTotal.toLocaleString('en-IN')}
(Final price, NO extra charges)

✅ Includes: All meals + activities
✅ Alcohol: Bring your own`;

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
