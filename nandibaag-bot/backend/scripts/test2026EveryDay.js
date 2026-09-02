const { getDayName } = require('../src/utils/dateHelper');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const test2026EveryDay = () => {
  console.log('\nTESTING EVERY DAY OF 2026 (365 days)');
  console.log('='.repeat(60));

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failedDates = [];

  // Generate every day of 2026 and verify using JavaScript's native Date.getDay()
  // which is timezone-independent for UTC midnight dates
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(2026, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      totalTests++;
      const dateStr = '2026-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');

      // Ground truth: JavaScript native Date for 2026 dates
      const nativeDate = new Date(2026, month, day);
      const expectedDay = DAY_NAMES[nativeDate.getDay()];

      const calculatedDay = getDayName(dateStr);

      if (calculatedDay === expectedDay) {
        passedTests++;
      } else {
        failedTests++;
        failedDates.push({ date: dateStr, expected: expectedDay, got: calculatedDay });
      }
    }
  }

  console.log('Total days tested: ' + totalTests);
  console.log('Passed: ' + passedTests);
  console.log('Failed: ' + failedTests);

  if (failedTests > 0) {
    console.log('\nFAILED DATES:');
    failedDates.forEach(f => {
      console.log('  ' + f.date + ': Got "' + f.got + '", Expected "' + f.expected + '"');
    });
    console.log('\nDATE CALCULATION IS BROKEN!');
  } else {
    console.log('\nALL 365 DATES CORRECT!');
  }
  console.log('='.repeat(60));
  process.exit(failedTests === 0 ? 0 : 1);
};

test2026EveryDay();
