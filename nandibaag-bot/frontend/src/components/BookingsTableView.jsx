import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { groupBookingsWithTotals } from '../utils/bookingGrouper';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';
import '../styles/BookingsTableView.css';

const BookingsTableView = ({ bookings = [] }) => {
  const [sortColumn, setSortColumn] = useState('rawCheckIn');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterDate, setFilterDate] = useState('');

  // Format check-in/check-out times based on package type & meal option
  const getCheckTimes = (booking) => {
    let checkIn = '12:00 PM';
    let checkOut = '10:30 AM';
    
    if (booking.packageType === 'oneDay' || booking.bookingType === 'picnic') {
      checkIn = '09:00 AM';
      
      switch(booking.mealOption) {
        case 'B->D':
          checkOut = '9:30 PM';
          break;
        case 'B->T':
          checkOut = '6:30 PM';
          break;
        case 'B->L':
          checkOut = '2:30 PM';
          break;
        default:
          checkOut = '9:30 PM';
      }
    }
    
    return { checkIn, checkOut };
  };

  // Process bookings data
  const processedBookings = useMemo(() => {
    return bookings.map(booking => {
      const times = getCheckTimes(booking);
      const rawCheckInDate = booking.checkInDate || booking.date;
      const dateObj = rawCheckInDate ? new Date(rawCheckInDate) : new Date();
      const date = formatDateDDMMYYYY(dateObj); // DD/MM/YYYY
      const isoDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD for filter matching

      const adults = Number(booking.guestComposition?.adults ?? booking.adults ?? 1);
      const children = Number(booking.guestComposition?.children ?? booking.children ?? 0);
      const totalMembers = adults + children;

      const totalAmount = Number(booking.totalAmount || 0);
      const advance = Number(booking.advancePaid ?? booking.advancePayment ?? booking.advance ?? 0);
      const pending = Math.max(0, totalAmount - advance);
      const bookedByName = booking.bookedBy?.name || booking.bookedBy || 'Staff';
      const pkg = booking.packageType || booking.bookingType || 'couple';
      const meal = booking.mealOption || (pkg === 'oneDay' || pkg === 'picnic' || pkg === 'one-day-picnic' ? 'B->D' : null);

      const formatPackageType = (p, m) => {
        if (p === 'one-day-picnic' || p === 'oneDay' || p === 'picnic' || p === 'dayuse') {
          const mealText = (m === 'breakfast-to-tea' || m === 'B->T') ? 'B→T' : (m === 'B->L' ? 'B→L' : 'B→D');
          return `🎉 One-Day (${mealText})`;
        } else if (p === 'couple') {
          return '👫 Couple';
        } else if (p === 'group') {
          return '👥 Group';
        }
        return p || '👫 Couple';
      };

      const roomsDisplay = (booking.roomIds && booking.roomIds.length > 0)
        ? booking.roomIds.join(', ')
        : (booking.roomId || 'TBA');
      const roomCount = (booking.roomIds && booking.roomIds.length > 0)
        ? booking.roomIds.length
        : (booking.roomId ? 1 : 0);

      return {
        ...booking,
        date,
        isoDate,
        rawCheckIn: dateObj.getTime(),
        checkIn: times.checkIn,
        checkOut: times.checkOut,
        adults,
        children,
        totalMembers,
        totalAmount,
        advance,
        pending,
        bookedByName,
        roomsDisplay,
        roomCount,
        packageDisplay: formatPackageType(pkg, meal),
        isOneDay: (pkg === 'oneDay' || pkg === 'picnic' || pkg === 'one-day-picnic') ? '✓' : '',
        isGroup: pkg === 'group' ? '✓' : '',
        isCouple: pkg === 'couple' ? '✓' : ''
      };
    });
  }, [bookings]);

  // Filter by date if selected
  const filteredBookings = useMemo(() => {
    if (!filterDate) return processedBookings;
    return processedBookings.filter(b => b.isoDate === filterDate || b.date === filterDate);
  }, [processedBookings, filterDate]);

  // Sort bookings
  const sortedBookings = useMemo(() => {
    const sorted = [...filteredBookings].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (sortColumn === 'bookedBy.name') {
        aVal = a.bookedByName;
        bVal = b.bookedByName;
      }
      
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      return sortOrder === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
    
    return sorted;
  }, [filteredBookings, sortColumn, sortOrder]);

  // Compute daily subtotals and grand totals
  const { groupedArray, grandTotal } = useMemo(() => {
    return groupBookingsWithTotals(sortedBookings);
  }, [sortedBookings]);

  // Export to Excel spreadsheet with subtotals & grand totals
  const handleExportExcel = () => {
    console.log('[Export] Exporting', sortedBookings.length, 'bookings with subtotals to Excel');
    
    const rows = [];

    groupedArray.forEach((day) => {
      day.bookings.forEach((booking) => {
        rows.push({
          Date: day.date,
          'Customer Name': booking.customerName,
          Phone: booking.customerPhone,
          'Check-in': booking.checkIn,
          'Check-out': booking.checkOut,
          'Total (₹)': booking.totalAmount || 0,
          'Advance (₹)': booking.advance || 0,
          'Pending (₹)': booking.pending || 0,
          Adults: booking.adults || 0,
          Children: booking.children || 0,
          Members: booking.totalMembers || 0,
          'One Day': booking.isOneDay,
          Group: booking.isGroup,
          Couple: booking.isCouple,
          Room: booking.roomsDisplay,
          'Booked By': booking.bookedByName,
          Notes: booking.notes || ''
        });
      });

      // Daily subtotal row
      rows.push({
        Date: `TOTAL ${day.date} (${day.totals.count} Bookings)`,
        'Customer Name': '', Phone: '', 'Check-in': '', 'Check-out': '',
        'Total (₹)': day.totals.amount,
        'Advance (₹)': day.totals.advance,
        'Pending (₹)': day.totals.pending,
        Adults: day.totals.adults,
        Children: day.totals.children,
        Members: day.totals.members,
        'One Day': '', Group: '', Couple: '',
        Room: '', 'Booked By': '', Notes: ''
      });

      rows.push({}); // Spacer row
    });

    // Grand total row
    rows.push({
      Date: `GRAND TOTAL (${grandTotal.count} Bookings)`,
      'Customer Name': '', Phone: '', 'Check-in': '', 'Check-out': '',
      'Total (₹)': grandTotal.amount,
      'Advance (₹)': grandTotal.advance,
      'Pending (₹)': grandTotal.pending,
      Adults: grandTotal.adults,
      Children: grandTotal.children,
      Members: grandTotal.members,
      'One Day': '', Group: '', Couple: '',
      Room: '', 'Booked By': '', Notes: ''
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');

    worksheet['!cols'] = [
      { wch: 26 }, // Date / Total header
      { wch: 18 }, // Customer Name
      { wch: 15 }, // Phone
      { wch: 11 }, // Check-in
      { wch: 11 }, // Check-out
      { wch: 12 }, // Total
      { wch: 12 }, // Advance
      { wch: 12 }, // Pending
      { wch: 8 },  // Adults
      { wch: 8 },  // Children
      { wch: 12 }, // Members
      { wch: 9 },  // One Day
      { wch: 8 },  // Group
      { wch: 8 },  // Couple
      { wch: 14 }, // Room
      { wch: 14 }, // Booked By
      { wch: 25 }  // Notes
    ];

    const fileName = `Nandibaag_Bookings_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    console.log('[Export] ✅ Excel file exported with subtotals:', fileName);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const getSortIndicator = (column) => {
    if (sortColumn !== column) return ' ↕️';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="bookings-table-container">
      <div className="table-controls">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              📊 Bookings Overview (Daily Subtotals & Grand Total View)
            </h2>
            <p className="record-count">
              Showing {sortedBookings.length} of {processedBookings.length} bookings ({groupedArray.length} Dates)
            </p>
          </div>

          <div className="control-buttons flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              placeholder="Filter by date"
              className="date-filter"
            />
            
            {filterDate && (
              <button 
                onClick={() => setFilterDate('')}
                className="clear-filter-btn"
              >
                ✕ Clear Filter
              </button>
            )}
            
            <button 
              onClick={handleExportExcel}
              className="export-btn"
            >
              📥 Export to Excel
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="bookings-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('rawCheckIn')}>
                Date {getSortIndicator('rawCheckIn')}
              </th>
              <th onClick={() => handleSort('customerName')}>
                Customer {getSortIndicator('customerName')}
              </th>
              <th onClick={() => handleSort('customerPhone')}>
                Phone {getSortIndicator('customerPhone')}
              </th>
              <th onClick={() => handleSort('checkIn')}>
                Check-in {getSortIndicator('checkIn')}
              </th>
              <th onClick={() => handleSort('checkOut')}>
                Check-out {getSortIndicator('checkOut')}
              </th>
              <th onClick={() => handleSort('totalAmount')}>
                Total (₹) {getSortIndicator('totalAmount')}
              </th>
              <th onClick={() => handleSort('advance')}>
                Advance (₹) {getSortIndicator('advance')}
              </th>
              <th onClick={() => handleSort('pending')}>
                Pending (₹) {getSortIndicator('pending')}
              </th>
              <th>Adults</th>
              <th>Children</th>
              <th>Total Members</th>
              <th>One Day</th>
              <th>Group</th>
              <th>Couple</th>
              <th>Room</th>
              <th onClick={() => handleSort('bookedBy.name')}>
                Booked By {getSortIndicator('bookedBy.name')}
              </th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {groupedArray.length > 0 ? (
              <>
                {groupedArray.map((day) => (
                  <React.Fragment key={day.date}>
                    {/* INDIVIDUAL BOOKING ROWS */}
                    {day.bookings.map((booking, idx) => (
                      <tr key={booking._id || `${day.date}-${idx}`} className="booking-row">
                        <td className="date-cell">{booking.date}</td>
                        <td className="name-cell">{booking.customerName}</td>
                        <td className="phone-cell">{booking.customerPhone}</td>
                        <td className="time-cell">{booking.checkIn}</td>
                        <td className="time-cell">{booking.checkOut}</td>
                        <td className="amount-cell">₹{booking.totalAmount.toLocaleString('en-IN')}</td>
                        <td className="amount-cell positive">₹{booking.advance.toLocaleString('en-IN')}</td>
                        <td className="amount-cell negative">₹{booking.pending.toLocaleString('en-IN')}</td>
                        <td className="center">{booking.adults}</td>
                        <td className="center">{booking.children}</td>
                        <td className="center font-bold">{booking.totalMembers}</td>
                        <td className="center text-sky-600 font-bold">{booking.isOneDay}</td>
                        <td className="center text-emerald-600 font-bold">{booking.isGroup}</td>
                        <td className="center text-indigo-600 font-bold">{booking.isCouple}</td>
                        <td className="room-cell">
                          <span className="font-medium text-emerald-900">{booking.roomsDisplay}</span>
                          {booking.roomCount > 1 && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold ml-1">
                              ({booking.roomCount} rms)
                            </span>
                          )}
                        </td>
                        <td className="staff-cell">{booking.bookedByName}</td>
                        <td className="notes-cell" title={booking.notes}>
                          {booking.notes ? (booking.notes.length > 25 ? booking.notes.substring(0, 25) + '...' : booking.notes) : '-'}
                        </td>
                      </tr>
                    ))}

                    {/* DAILY SUBTOTAL ROW */}
                    <tr className="subtotal-row">
                      <td colSpan={5}>
                        <strong>TOTAL {day.date} ({day.totals.count} {day.totals.count === 1 ? 'Booking' : 'Bookings'})</strong>
                      </td>
                      <td className="amount-cell"><strong>₹{day.totals.amount.toLocaleString('en-IN')}</strong></td>
                      <td className="amount-cell positive"><strong>₹{day.totals.advance.toLocaleString('en-IN')}</strong></td>
                      <td className="amount-cell negative"><strong>₹{day.totals.pending.toLocaleString('en-IN')}</strong></td>
                      <td className="center"><strong>{day.totals.adults}</strong></td>
                      <td className="center"><strong>{day.totals.children}</strong></td>
                      <td className="center"><strong>{day.totals.members}</strong></td>
                      <td colSpan={6}></td>
                    </tr>
                  </React.Fragment>
                ))}

                {/* GRAND TOTAL ROW */}
                <tr className="grand-total-row">
                  <td colSpan={5}>
                    <strong>GRAND TOTAL ({grandTotal.count} {grandTotal.count === 1 ? 'Booking' : 'Bookings'})</strong>
                  </td>
                  <td className="amount-cell"><strong>₹{grandTotal.amount.toLocaleString('en-IN')}</strong></td>
                  <td className="amount-cell positive-grand"><strong>₹{grandTotal.advance.toLocaleString('en-IN')}</strong></td>
                  <td className="amount-cell negative-grand"><strong>₹{grandTotal.pending.toLocaleString('en-IN')}</strong></td>
                  <td className="center"><strong>{grandTotal.adults}</strong></td>
                  <td className="center"><strong>{grandTotal.children}</strong></td>
                  <td className="center"><strong>{grandTotal.members}</strong></td>
                  <td colSpan={6}></td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan="17" className="no-data">
                  No bookings found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BookingsTableView;
