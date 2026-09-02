const { getDayName, formatDateDDMMYYYY, isWeekday } = require('../src/utils/dateHelper');

const CORRECT_2026_DATES = {
  '2026-01-01': 'Thursday', '2026-01-05': 'Monday', '2026-01-10': 'Saturday',
  '2026-01-15': 'Thursday', '2026-01-20': 'Tuesday', '2026-01-25': 'Sunday', '2026-01-31': 'Saturday',
  '2026-02-01': 'Sunday', '2026-02-05': 'Thursday', '2026-02-10': 'Tuesday',
  '2026-02-15': 'Sunday', '2026-02-20': 'Friday', '2026-02-25': 'Wednesday', '2026-02-28': 'Saturday',
  '2026-03-01': 'Sunday', '2026-03-05': 'Thursday', '2026-03-10': 'Tuesday',
  '2026-03-15': 'Sunday', '2026-03-20': 'Friday', '2026-03-25': 'Wednesday', '2026-03-31': 'Tuesday',
  '2026-04-01': 'Wednesday', '2026-04-05': 'Sunday', '2026-04-10': 'Friday',
  '2026-04-15': 'Wednesday', '2026-04-20': 'Monday', '2026-04-25': 'Saturday', '2026-04-30': 'Thursday',
  '2026-05-01': 'Friday', '2026-05-05': 'Tuesday', '2026-05-10': 'Sunday',
  '2026-05-15': 'Friday', '2026-05-20': 'Wednesday', '2026-05-25': 'Monday', '2026-05-31': 'Sunday',
  '2026-06-01': 'Monday', '2026-06-05': 'Friday', '2026-06-10': 'Wednesday',
  '2026-06-15': 'Monday', '2026-06-20': 'Saturday', '2026-06-25': 'Thursday', '2026-06-30': 'Tuesday',
  '2026-07-01': 'Wednesday', '2026-07-05': 'Sunday', '2026-07-10': 'Friday',
  '2026-07-15': 'Wednesday', '2026-07-20': 'Monday', '2026-07-25': 'Saturday', '2026-07-31': 'Friday',
  '2026-08-01': 'Saturday', '2026-08-05': 'Wednesday', '2026-08-10': 'Monday',
  '2026-08-15': 'Saturday', '2026-08-20': 'Thursday', '2026-08-25': 'Tuesday',
  '2026-08-28': 'Friday', '2026-08-29': 'Saturday', '2026-08-30': 'Sunday', '2026-08-31': 'Monday',
  '2026-09-01': 'Tuesday', '2026-09-02': 'Wednesday', '2026-09-05': 'Saturday',
  '2026-09-10': 'Thursday', '2026-09-12': 'Saturday', '2026-09-13': 'Sunday',
  '2026-09-15': 'Tuesday', '2026-09-20': 'Sunday', '2026-09-25': 'Friday', '2026-09-30': 'Wednesday',
  '2026-10-01': 'Thursday', '2026-10-05': 'Monday', '2026-10-10': 'Saturday',
  '2026-10-15': 'Thursday', '2026-10-20': 'Tuesday', '2026-10-25': 'Sunday', '2026-10-31': 'Saturday',
  '2026-11-01': 'Sunday', '2026-11-05': 'Thursday', '2026-11-10': 'Tuesday',
  '2026-11-15': 'Sunday', '2026-11-20': 'Friday', '2026-11-25': 'Wednesday', '2026-11-30': 'Monday',
  '2026-12-01': 'Tuesday', '2026-12-05': 'Saturday', '2026-12-10': 'Thursday',
  '2026-12-15': 'Tuesday', '2026-12-20': 'Sunday', '2026-12-25': 'Friday', '2026-12-31': 'Thursday'
};

const test2026 = () => {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING ALL 2026 DATES');
  console.log('='.repeat(70) + '\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failedDates = [];

  Object.entries(CORRECT_2026_DATES).forEach(([dateStr, expectedDay]) => {
    totalTests++;
    const calculatedDay = getDayName(dateStr);

    if (calculatedDay === expectedDay) {
      passedTests++;
    } else {
      failedTests++;
      failedDates.push({ date: dateStr, expected: expectedDay, got: calculatedDay });
      console.log('FAIL ' + dateStr + ': Got ' + calculatedDay + ', Expected ' + expectedDay);
    }
  });

  console.log('\n' + '-'.repeat(70));
  console.log('RESULTS');
  console.log('-'.repeat(70));
  console.log('Total dates tested: ' + totalTests);
  console.log('Passed: ' + passedTests);
  console.log('Failed: ' + failedTests);
  console.log('Success rate: ' + ((passedTests / totalTests) * 100).toFixed(1) + '%');

  if (failedTests > 0) {
    console.log('\nFAILED DATES:');
    failedDates.forEach(f => {
      console.log('  ' + f.date + ': ' + f.got + ' (should be ' + f.expected + ')');
    });
    console.log('\nDATE CALCULATION IS BROKEN');
  } else {
    console.log('\nALL DATES CORRECT!');
  }

  console.log('\n' + '='.repeat(70) + '\n');
  process.exit(failedTests === 0 ? 0 : 1);
};

test2026();
