const { getDayName, formatDateDDMMYYYY, isWeekday, buildDateRangeTable, getTodayIST } = require('../src/utils/dateHelper');
const { calculateBookingPrice } = require('../src/services/pricingService');

const verifyDates = () => {
  console.log('\n═════════════════════════════════════════════════════════');
  console.log('🔍 VERIFYING DATE CALCULATIONS & PRICING');
  console.log('═════════════════════════════════════════════════════════\n');

  // Test dates
  const testDates = [
    '2026-08-28',
    '2026-08-29',
    '2026-08-30',
    '2026-08-31',
    '2026-09-01'
  ];

  console.log('📅 TESTING SPECIFIC DATES:\n');

  testDates.forEach(dateStr => {
    const date = new Date(dateStr);
    const dayName = getDayName(date);
    const formatted = formatDateDDMMYYYY(date);
    const weekday = isWeekday(date);
    const type = weekday ? 'WEEKDAY' : 'WEEKEND';

    console.log(`${formatted} = ${dayName} (${type})`);

    // Verify against known values
    const expectedDays = {
      '2026-08-28': 'Friday',
      '2026-08-29': 'Saturday',
      '2026-08-30': 'Sunday',
      '2026-08-31': 'Monday',
      '2026-09-01': 'Tuesday'
    };

    if (expectedDays[dateStr] && dayName !== expectedDays[dateStr]) {
      console.log(`  ❌ ERROR: Expected ${expectedDays[dateStr]}, got ${dayName}`);
    } else {
      console.log(`  ✅ CORRECT`);
    }
  });

  // Test date range table
  console.log('\n📊 DATE RANGE TABLE (Aug 28 - Sep 5):\n');

  const start = new Date('2026-08-28');
  const end = new Date('2026-09-05');

  const table = buildDateRangeTable(start, end);
  console.log(table);

  // Test today
  console.log('\n📌 TODAY (IST):\n');
  const today = getTodayIST();
  console.log(`Date: ${today.dateStr}`);
  console.log(`Day: ${today.dayName}`);

  // Test Pricing Calculation for Aug 28-30 (6 adults, 2 kids)
  console.log('\n💰 TESTING PRICING CALCULATION (Aug 28-30, 6 Adults, 2 Kids):\n');
  const pricingResult = calculateBookingPrice('2026-08-28', '2026-08-30', 'group', 6, 2);
  console.log('Total Price:', pricingResult.totalPrice);
  console.log('Nights:', pricingResult.nights);
  console.log('Breakdown:', JSON.stringify(pricingResult.breakdown, null, 2));

  console.log('\n═════════════════════════════════════════════════════════\n');
};

verifyDates();
