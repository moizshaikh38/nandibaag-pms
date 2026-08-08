const groupBookingsByDate = (bookings = [], sortOrder = 'asc') => {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return [];
  }

  const grouped = {};

  bookings.forEach(booking => {
    const rawCheckIn = booking.checkInDate || booking.date;
    const dateObj = rawCheckIn ? new Date(rawCheckIn) : new Date();
    const isoDateKey = dateObj.toISOString().split('T')[0];

    const formattedDate = dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    if (!grouped[isoDateKey]) {
      grouped[isoDateKey] = {
        isoDateKey,
        formattedDate,
        rawDate: dateObj,
        bookings: []
      };
    }

    grouped[isoDateKey].bookings.push(booking);
  });

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const diff = new Date(a) - new Date(b);
    return sortOrder === 'desc' ? -diff : diff;
  });

  return sortedKeys.map(key => grouped[key]);
};

function runTest() {
  console.log('====================================================');
  console.log('      RUNNING BOOKING GROUPER TEST SUITE            ');
  console.log('====================================================\n');

  const testBookings = [
    { _id: '1', customerName: 'Swati Kamble', checkInDate: '2026-08-08T00:00:00.000Z', totalAmount: 10000 },
    { _id: '2', customerName: 'Moiz Shaikh', checkInDate: '2026-08-08T00:00:00.000Z', totalAmount: 3500 },
    { _id: '3', customerName: 'Ravi Sharma', checkInDate: '2026-08-09T00:00:00.000Z', totalAmount: 24000 },
    { _id: '4', customerName: 'Aarav Mehta', checkInDate: '2026-08-10T00:00:00.000Z', totalAmount: 5000 },
    { _id: '5', customerName: 'Pooja Patel', checkInDate: '2026-08-08T00:00:00.000Z', totalAmount: 3000 }
  ];

  console.log('--- TEST 1: GROUPING & ASCENDING SORT (Earliest First) ---');
  const ascGroups = groupBookingsByDate(testBookings, 'asc');
  console.log('Group Count:', ascGroups.length);
  ascGroups.forEach(g => {
    console.log(`  📅 ${g.formattedDate.toUpperCase()} (${g.bookings.length} ${g.bookings.length === 1 ? 'booking' : 'bookings'}):`, g.bookings.map(b => b.customerName).join(', '));
  });

  const pass1 = ascGroups.length === 3 &&
                ascGroups[0].bookings.length === 3 && // 08 August
                ascGroups[1].bookings.length === 1 && // 09 August
                ascGroups[2].bookings.length === 1 && // 10 August
                ascGroups[0].formattedDate.includes('August 2026');

  console.log(`TEST 1 RESULT: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('--- TEST 2: DESCENDING SORT (Latest First) ---');
  const descGroups = groupBookingsByDate(testBookings, 'desc');
  descGroups.forEach(g => {
    console.log(`  📅 ${g.formattedDate.toUpperCase()} (${g.bookings.length} ${g.bookings.length === 1 ? 'booking' : 'bookings'}):`, g.bookings.map(b => b.customerName).join(', '));
  });

  const pass2 = descGroups.length === 3 &&
                descGroups[0].bookings[0].customerName === 'Aarav Mehta' && // 10 August first
                descGroups[2].bookings.length === 3; // 08 August last

  console.log(`TEST 2 RESULT: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('====================================================');
  console.log('                 SUMMARY OF TESTS                   ');
  console.log('====================================================');
  console.log(`TEST 1 (Ascending Date Grouping): ${pass1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`TEST 2 (Descending Date Grouping): ${pass2 ? '✅ PASS' : '❌ FAIL'}`);
}

runTest();
