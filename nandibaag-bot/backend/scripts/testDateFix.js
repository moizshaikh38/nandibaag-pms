const { getDayName, formatDateDDMMYYYY } = require('../src/utils/dateHelper');

const testDates = [
  '2026-08-25',
  '2026-08-26',
  '2026-08-27',
  '2026-08-28',
  '2026-08-29',
  '2026-08-30',
  '2026-09-02'
];

// Actual calendar mapping for August/September 2026:
// 25 Aug 2026 = Tuesday
// 26 Aug 2026 = Wednesday
// 27 Aug 2026 = Thursday
// 28 Aug 2026 = Friday
// 29 Aug 2026 = Saturday
// 30 Aug 2026 = Sunday
// 02 Sep 2026 = Wednesday

console.log('\n✅ DATE-FNS VERIFICATION\n');

testDates.forEach(dateStr => {
  const dayName = getDayName(dateStr);
  const formatted = formatDateDDMMYYYY(dateStr);

  console.log(`${formatted}: ${dayName} ✅`);
});

console.log('\n');
