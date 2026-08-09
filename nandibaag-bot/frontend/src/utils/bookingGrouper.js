export const groupBookingsWithTotals = (bookings = []) => {
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

export const groupBookingsByDate = (bookings = [], order = 'asc') => {
  const groups = {};

  bookings.forEach((booking) => {
    const rawDate = booking.checkInDate || booking.date;
    const dateObj = rawDate ? new Date(rawDate) : new Date();
    const dateKey = dateObj.toLocaleDateString('en-GB');

    if (!groups[dateKey]) {
      groups[dateKey] = {
        date: dateKey,
        rawTime: dateObj.getTime(),
        bookings: []
      };
    }
    groups[dateKey].bookings.push(booking);
  });

  const sortedGroups = Object.values(groups).sort((a, b) => {
    return order === 'asc' ? a.rawTime - b.rawTime : b.rawTime - a.rawTime;
  });

  return sortedGroups;
};
