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
 * 
 * NOTE: All date/day-of-week calculations delegate to dateHelper.js (single source of truth).
 */

const dateHelper = require('./dateHelper');

/**
 * Parses a date input into a local Date object without timezone shift.
 * Delegates to dateHelper.normalizeDate().
 */
function parseLocalDate(dateInput) {
  return dateHelper.normalizeDate(dateInput);
}

/**
 * Checks if a given date is a Weekend.
 * Weekend = Friday (5), Saturday (6), Sunday (0).
 * Delegates to dateHelper.isWeekend().
 */
function isWeekend(dateInput) {
  const result = dateHelper.isWeekend(dateInput);
  const dayName = getDayName(dateInput);
  console.log(`[WeekendCheck] ${dateInput} (${dayName}) = ${result}`);
  return result;
}

/**
 * Checks if a given date is a Weekday.
 * Weekday = Monday (1), Tuesday (2), Wednesday (3), Thursday (4).
 * Delegates to dateHelper.isWeekday().
 */
function isWeekday(dateInput) {
  const result = dateHelper.isWeekday(dateInput);
  const dayName = getDayName(dateInput);
  console.log(`[WeekdayCheck] ${dateInput} (${dayName}) = ${result}`);
  return result;
}

/**
 * Format a Date object or string to ordinal format e.g. "1st Aug", "15th Dec"
 */
function formatDateShort(dateInput) {
  const d = parseLocalDate(dateInput);
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
 * Get day label for a date (e.g. "Friday").
 * Delegates to dateHelper.getDayName().
 */
function getDayName(dateInput) {
  return dateHelper.getDayName(dateInput);
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
function calculatePricing(checkInInput, checkOutInput, adultCountOrGuestCount = 2, kidsOrStayType = [], stayTypeHint = 'auto', options = {}) {
  const checkInDate = parseLocalDate(checkInInput);
  let checkOutDate = checkOutInput ? parseLocalDate(checkOutInput) : null;

  let adultCount = 2;
  let kids = [];
  let stayType = stayTypeHint;
  let mealOption = options?.mealOption || 'breakfast_dinner';
  let mealRate = options?.mealRate;

  if (typeof adultCountOrGuestCount === 'object' && adultCountOrGuestCount !== null) {
    adultCount = adultCountOrGuestCount.adults || adultCountOrGuestCount.guestCount || 2;
    kids = Array.isArray(adultCountOrGuestCount.kids) ? adultCountOrGuestCount.kids : [];
    if (adultCountOrGuestCount.stayType) stayType = adultCountOrGuestCount.stayType;
    if (adultCountOrGuestCount.mealOption) mealOption = adultCountOrGuestCount.mealOption;
    if (adultCountOrGuestCount.mealRate) mealRate = adultCountOrGuestCount.mealRate;
  } else {
    adultCount = Math.max(1, parseInt(adultCountOrGuestCount, 10) || 2);
    if (Array.isArray(kidsOrStayType)) {
      kids = kidsOrStayType;
    } else if (typeof kidsOrStayType === 'string' && kidsOrStayType !== 'auto') {
      stayType = kidsOrStayType;
    }
  }

  const numGuests = adultCount + kids.length;

  // Determine stay type
  if (stayType === 'auto' || !stayType) {
    if (adultCount <= 2 && numGuests <= 4) stayType = 'couple';
    else stayType = 'group';
  }

  // Handle Picnic
  if (stayType === 'picnic') {
    const isWknd = isWeekend(checkInDate);
    let ratePerPerson = 1250;
    if (isWknd) {
      ratePerPerson = (mealOption === 'breakfast_tea' || mealOption === '1000' || mealOption === '1250_tea') ? 1250 : 1500;
    } else {
      ratePerPerson = (mealOption === 'breakfast_tea' || mealOption === '1000') ? 1000 : 1250;
    }
    const mealLabel = (ratePerPerson === 1000 || ratePerPerson === 1250 && (mealOption === 'breakfast_tea' || mealOption === '1000')) ? 'Breakfast to High Tea' : 'Breakfast to Dinner';
    const grandTotal = numGuests * ratePerPerson;
    const dateStr = formatDateShort(checkInDate) || 'Selected Date';
    const dayName = getDayName(checkInDate);
    
    return {
      raw: {
        stayType: 'picnic',
        mealOption,
        mealRate: ratePerPerson,
        guestCount: numGuests,
        adultCount,
        coupleCount: Math.ceil(adultCount / 2),
        kids,
        totalNights: 0,
        weekdayNights: 0,
        weekdayRate: 0,
        weekdayTotal: 0,
        weekendNights: 0,
        weekendRate: 0,
        weekendTotal: 0,
        grandTotal
      },
      formatted: `✅ BOOKING QUOTE / SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 DATE:
${dateStr} (${dayName}) — Day Picnic

👥 GUESTS:
${numGuests} ${numGuests === 1 ? 'Person' : 'People'}

🏨 PACKAGE:
DAY PICNIC (${mealLabel})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICING BREAKDOWN:
- Day Picnic (${mealLabel}): ${numGuests} × ₹${ratePerPerson.toLocaleString('en-IN')} = ₹${grandTotal.toLocaleString('en-IN')}

────────────────────────────
TOTAL: ₹${grandTotal.toLocaleString('en-IN')}

✓ Includes: ${ratePerPerson === 1000 || (ratePerPerson === 1250 && mealOption === 'breakfast_tea') ? 'Breakfast + Lunch + High Tea + Activities' : 'Breakfast + Lunch + High Tea + Dinner + Activities'}
✓ Vegetarian only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All details taken ✅
Hamari team aapse jald hi connect karegi for booking 😊`
    };
  }

  // Default checkOutDate if missing or invalid (1 night stay)
  if (!checkOutDate || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
    checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkOutDate.getDate() + 1);
  }

  const coupleCount = Math.ceil(adultCount / 2);

  function getKidCost(kid, isWknd) {
    const kidAge = typeof kid === 'object' ? (kid?.age !== undefined ? Number(kid.age) : 5) : Number(kid || 5);
    if (kidAge <= 5) return 0;
    if (kidAge >= 6 && kidAge <= 10) return 1000;
    if (kidAge >= 11 && kidAge <= 15) return 1500;
    return isWknd ? 3000 : 2000;
  }

  // Count weekday nights vs weekend nights and build per-night breakdown
  let weekdayNights = 0;
  let weekendNights = 0;
  const nightBreakdown = [];
  let grandTotal = 0;
  let weekdayTotal = 0;
  let weekendTotal = 0;

  const cur = new Date(checkInDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(checkOutDate);
  end.setHours(0, 0, 0, 0);

  while (cur < end) {
    const dayName = getDayName(cur);
    const dateStr = formatDateShort(cur);
    const weekend = isWeekend(cur);

    let roomRate = 0;
    let adultNightTotal = 0;

    if (stayType === 'couple') {
      roomRate = weekend ? 6500 : 5500;
      adultNightTotal = coupleCount * roomRate;
    } else {
      roomRate = weekend ? 3000 : 2000;
      adultNightTotal = adultCount * roomRate;
    }

    let kidsNightTotal = 0;
    for (const kid of kids) {
      kidsNightTotal += getKidCost(kid, weekend);
    }

    const nightTotal = adultNightTotal + kidsNightTotal;

    if (weekend) {
      weekendNights++;
      weekendTotal += nightTotal;
    } else {
      weekdayNights++;
      weekdayTotal += nightTotal;
    }

    grandTotal += nightTotal;

    nightBreakdown.push({
      dateStr,
      dayName,
      type: weekend ? 'WEEKEND' : 'WEEKDAY',
      roomRate,
      adultNightTotal,
      kidsNightTotal,
      nightTotal
    });

    cur.setDate(cur.getDate() + 1);
  }

  const totalNights = weekdayNights + weekendNights;

  const inStr = formatDateShort(checkInDate);
  const outStr = formatDateShort(checkOutDate);
  const inDayName = getDayName(checkInDate);
  const outDayName = getDayName(checkOutDate);

  // Build per-night breakdown lines
  const breakdownLines = nightBreakdown.map(n => {
    if (stayType === 'couple') {
      let line = `${n.dayName} (${n.dateStr}) - ${n.type}:\n${coupleCount} Couple${coupleCount > 1 ? 's' : ''} × ₹${n.roomRate.toLocaleString('en-IN')}`;
      if (kids.length > 0) {
        if (n.kidsNightTotal > 0) {
          line += ` + ${kids.length} Kid${kids.length > 1 ? 's' : ''} (₹${n.kidsNightTotal.toLocaleString('en-IN')})`;
        } else {
          line += ` + ${kids.length} Kid${kids.length > 1 ? 's' : ''} (FREE)`;
        }
      }
      line += ` = ₹${n.nightTotal.toLocaleString('en-IN')}`;
      return line;
    } else {
      let line = `${n.dayName} (${n.dateStr}) - ${n.type}:\n${adultCount} Adults × ₹${n.roomRate.toLocaleString('en-IN')}`;
      if (kids.length > 0) {
        if (n.kidsNightTotal > 0) {
          line += ` + ${kids.length} Kid${kids.length > 1 ? 's' : ''} (₹${n.kidsNightTotal.toLocaleString('en-IN')})`;
        } else {
          line += ` + ${kids.length} Kid${kids.length > 1 ? 's' : ''} (FREE)`;
        }
      }
      line += ` = ₹${n.nightTotal.toLocaleString('en-IN')}`;
      return line;
    }
  });

  const roomType = stayType === 'couple' ? 'COUPLE STAY' : 'GROUP STAY';
  const guestStr = `${adultCount} Adults${coupleCount > 0 && stayType === 'couple' ? ` (${coupleCount} ${coupleCount === 1 ? 'Couple' : 'Couples'})` : ''}${kids.length > 0 ? ` + ${kids.length} ${kids.length === 1 ? 'Kid' : 'Kids'}` : ''}`;

  const formatted = `✅ BOOKING QUOTE / SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 DATES:
${inStr} (${inDayName}) → ${outStr} (${outDayName})
${totalNights} Night${totalNights > 1 ? 's' : ''}

👥 GUESTS:
${guestStr}

🏨 PACKAGE:
${roomType}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICING BREAKDOWN:

${breakdownLines.join('\n\n')}

────────────────────────────
TOTAL: ₹${grandTotal.toLocaleString('en-IN')}

✓ Includes: All Meals + Activities
✓ Vegetarian only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All details taken ✅
Hamari team aapse jald hi connect karegi for booking 😊`;

  return {
    raw: {
      stayType,
      guestCount: numGuests,
      adultCount,
      coupleCount,
      kids,
      totalNights,
      weekdayNights,
      weekendNights,
      weekdayTotal,
      weekendTotal,
      grandTotal
    },
    formatted
  };
}

module.exports = {
  isWeekend,
  isWeekday,
  getDayName,
  parseLocalDate,
  calculatePricing,
  formatDateShort
};
