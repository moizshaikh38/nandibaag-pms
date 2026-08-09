const groupBookingsWithTotals = (bookings) => {
  const sorted = [...bookings].sort(
    (a, b) => (a.rawCheckIn || new Date(a.checkInDate || a.date).getTime()) - (b.rawCheckIn || new Date(b.checkInDate || b.date).getTime())
  );

  const grouped = {};

  sorted.forEach((booking) => {
    const rawDate = booking.checkInDate || booking.date;
    const dateObj = rawDate ? new Date(rawDate) : new Date();
    const dateKey = dateObj.toLocaleDateString('en-GB'); // dd/mm/yyyy

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        date: dateKey,
        bookings: [],
        totals: {
          amount: 0,
          advance: 0,
          pending: 0,
          adults: 0,
          children: 0,
          members: 0,
          count: 0
        }
      };
    }

    const advance = Number(booking.advance ?? booking.advancePaid ?? booking.advancePayment ?? 0);
    const amount = Number(booking.totalAmount || 0);
    const pending = Math.max(0, amount - advance);
    const adults = Number(booking.adults ?? booking.guestComposition?.adults ?? 0);
    const children = Number(booking.children ?? booking.guestComposition?.children ?? 0);

    grouped[dateKey].bookings.push(booking);
    grouped[dateKey].totals.amount += amount;
    grouped[dateKey].totals.advance += advance;
    grouped[dateKey].totals.pending += pending;
    grouped[dateKey].totals.adults += adults;
    grouped[dateKey].totals.children += children;
    grouped[dateKey].totals.members += (adults + children);
    grouped[dateKey].totals.count += 1;
  });

  const groupedArray = Object.values(grouped);

  const grandTotal = groupedArray.reduce(
    (acc, day) => {
      acc.amount += day.totals.amount;
      acc.advance += day.totals.advance;
      acc.pending += day.totals.pending;
      acc.adults += day.totals.adults;
      acc.children += day.totals.children;
      acc.members += day.totals.members;
      acc.count += day.totals.count;
      return acc;
    },
    { amount: 0, advance: 0, pending: 0, adults: 0, children: 0, members: 0, count: 0 }
  );

  return { groupedArray, grandTotal };
};

function runTestSubtotalsSuite() {
  console.log('====================================================');
  console.log('      RUNNING DAILY SUBTOTALS & GRAND TOTAL SUITE   ');
  console.log('====================================================\n');

  const mockBookings = [
    {
      _id: 'b1',
      customerName: 'Rahul Sharma',
      customerPhone: '+919876543210',
      checkInDate: '2026-08-15T00:00:00.000Z',
      packageType: 'couple',
      guestComposition: { adults: 2, children: 1 },
      totalAmount: 5500,
      advancePaid: 2000,
      roomIds: ['101']
    },
    {
      _id: 'b2',
      customerName: 'Priya Verma',
      customerPhone: '+919876543211',
      checkInDate: '2026-08-15T00:00:00.000Z',
      packageType: 'group',
      guestComposition: { adults: 6, children: 2 },
      totalAmount: 18000,
      advancePaid: 5000,
      roomIds: ['103', '104']
    },
    {
      _id: 'b3',
      customerName: 'Amit Patel',
      customerPhone: '+919876543212',
      checkInDate: '2026-08-16T00:00:00.000Z',
      packageType: 'oneDay',
      guestComposition: { adults: 10, children: 0 },
      totalAmount: 12500,
      advancePaid: 0,
      roomIds: ['105']
    }
  ];

  // TEST 1: Grouping and Daily Subtotals
  console.log('--- TEST 1: groupBookingsWithTotals() Grouping ---');
  const { groupedArray, grandTotal } = groupBookingsWithTotals(mockBookings);
  
  console.log('Grouped Date Buckets:', groupedArray.map(g => g.date));
  console.log('Group 1 Totals (15/08/2026):', groupedArray[0].totals);
  console.log('Group 2 Totals (16/08/2026):', groupedArray[1].totals);

  if (groupedArray.length !== 2) {
    throw new Error(`Expected 2 date groups, got ${groupedArray.length}`);
  }

  // Check group 1 (15/08/2026)
  const g1 = groupedArray[0];
  if (g1.totals.count !== 2) throw new Error('Expected 2 bookings in group 1');
  if (g1.totals.amount !== 23500) throw new Error(`Expected total amount 23500, got ${g1.totals.amount}`);
  if (g1.totals.advance !== 7000) throw new Error(`Expected advance 7000, got ${g1.totals.advance}`);
  if (g1.totals.pending !== 16500) throw new Error(`Expected pending 16500, got ${g1.totals.pending}`);
  if (g1.totals.adults !== 8) throw new Error(`Expected adults 8, got ${g1.totals.adults}`);
  if (g1.totals.children !== 3) throw new Error(`Expected children 3, got ${g1.totals.children}`);
  if (g1.totals.members !== 11) throw new Error(`Expected members 11, got ${g1.totals.members}`);
  console.log('TEST 1 RESULT: ✅ PASS');

  // TEST 2: Grand Total Verification
  console.log('\n--- TEST 2: Grand Total Calculation ---');
  console.log('Grand Total:', grandTotal);

  if (grandTotal.count !== 3) throw new Error('Expected grand total count 3');
  if (grandTotal.amount !== 36000) throw new Error(`Expected grand total amount 36000, got ${grandTotal.amount}`);
  if (grandTotal.advance !== 7000) throw new Error(`Expected grand total advance 7000, got ${grandTotal.advance}`);
  if (grandTotal.pending !== 29000) throw new Error(`Expected grand total pending 29000, got ${grandTotal.pending}`);
  if (grandTotal.adults !== 18) throw new Error(`Expected grand total adults 18, got ${grandTotal.adults}`);
  if (grandTotal.children !== 3) throw new Error(`Expected grand total children 3, got ${grandTotal.children}`);
  if (grandTotal.members !== 21) throw new Error(`Expected grand total members 21, got ${grandTotal.members}`);
  console.log('TEST 2 RESULT: ✅ PASS');

  // TEST 3: Zero Advance Case (Pending = Full Amount)
  console.log('\n--- TEST 3: Zero Advance Case (Pending = Full Amount) ---');
  const g2 = groupedArray[1];
  if (g2.totals.advance !== 0) throw new Error('Expected 0 advance in group 2');
  if (g2.totals.pending !== 12500) throw new Error(`Expected 12500 pending in group 2, got ${g2.totals.pending}`);
  console.log('TEST 3 RESULT: ✅ PASS');

  console.log('\n====================================================');
  console.log('                 SUMMARY OF TESTS                   ');
  console.log('====================================================');
  console.log('TEST 1 (Date Grouping & Daily Subtotals): ✅ PASS');
  console.log('TEST 2 (Grand Total Sums): ✅ PASS');
  console.log('TEST 3 (Zero Advance Case Handling): ✅ PASS\n');
}

runTestSubtotalsSuite();
