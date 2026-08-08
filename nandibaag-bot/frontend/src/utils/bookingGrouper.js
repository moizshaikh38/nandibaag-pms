/**
 * Groups bookings by check-in date (formatted as "DD MMMM YYYY", e.g. "08 August 2026")
 * and sorts date groups in ascending order (earliest dates first).
 *
 * @param {Array} bookings Array of booking objects
 * @param {'asc' | 'desc'} [sortOrder='asc'] Date sort order
 * @returns {Array<{ isoDateKey: string, formattedDate: string, rawDate: Date, bookings: Array }>}
 */
export const groupBookingsByDate = (bookings = [], sortOrder = 'asc') => {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return [];
  }

  const grouped = {};

  bookings.forEach(booking => {
    const rawCheckIn = booking.checkInDate || booking.date;
    const dateObj = rawCheckIn ? new Date(rawCheckIn) : new Date();

    // Key format: YYYY-MM-DD for reliable date sorting
    const isoDateKey = dateObj.toISOString().split('T')[0];

    // Pretty display format: "08 August 2026"
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

  // Sort dates (ascending by default: earliest dates first)
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const diff = new Date(a) - new Date(b);
    return sortOrder === 'desc' ? -diff : diff;
  });

  return sortedKeys.map(key => grouped[key]);
};
