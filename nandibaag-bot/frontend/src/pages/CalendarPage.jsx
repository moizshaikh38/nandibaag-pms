import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  RefreshCw,
  Bed
} from 'lucide-react';

const STATUS_COLORS = {
  confirmed: 'bg-green-100 text-green-800 border-green-300',
  checked_in: 'bg-blue-100 text-blue-800 border-blue-300',
  checked_out: 'bg-purple-100 text-purple-800 border-purple-300',
  no_show: 'bg-gray-200 text-gray-700 border-gray-300'
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const res = await api.get('/pms/bookings', {
        params: {
          dateFrom: firstDay.toISOString().split('T')[0],
          dateTo: lastDay.toISOString().split('T')[0],
          limit: 200
        }
      });
      setBookings(res.data.bookings || []);
    } catch (error) {
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [currentYear, currentMonth]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
    setSelectedDate(null);
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(null);
  };

  // Build a map: dateKey -> bookings on that date (overlapping check-in/check-out)
  const bookingsByDate = {};
  for (const b of bookings) {
    const checkIn = b.checkInDate ? new Date(b.checkInDate) : null;
    const checkOut = b.checkOutDate ? new Date(b.checkOutDate) : null;
    if (!checkIn) continue;

    const start = new Date(Math.max(checkIn.getTime(), new Date(currentYear, currentMonth, 1).getTime()));
    const end = checkOut
      ? new Date(Math.min(checkOut.getTime(), new Date(currentYear, currentMonth + 1, 0).getTime()))
      : start;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!bookingsByDate[key]) bookingsByDate[key] = [];
      bookingsByDate[key].push(b);
    }
  }

  // Calendar grid
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const selectedDateBookings = selectedDate ? (bookingsByDate[selectedDate] || []) : [];

  return (
    <div className="p-4 pb-20 md:pb-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarIcon size={28} className="text-whatsapp" />
            Occupancy Calendar
          </h1>
          <button onClick={fetchBookings} className="p-2 text-gray-600 hover:text-whatsapp transition-colors" title="Refresh">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Month Navigation */}
        <div className="bg-white rounded-lg shadow mb-4">
          <div className="flex items-center justify-between p-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </h2>
              <button onClick={goToToday} className="text-xs text-whatsapp hover:text-whatsapp-light mt-1">
                Today
              </button>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 border-t">
            {DAY_NAMES.map(day => (
              <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2 uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7 border-t">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="min-h-[70px] md:min-h-[90px] border-r border-b border-gray-100 bg-gray-50" />;
                }

                const dateKey = formatDateKey(currentYear, currentMonth, day);
                const dayBookings = bookingsByDate[dateKey] || [];
                const isToday = dateKey === todayKey;
                const isSelected = dateKey === selectedDate;

                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                    className={`min-h-[70px] md:min-h-[90px] border-r border-b border-gray-100 p-1 text-left transition-colors hover:bg-gray-50 ${
                      isSelected ? 'bg-green-50 ring-2 ring-whatsapp ring-inset' : ''
                    } ${isToday ? 'bg-whatsapp/5' : ''}`}
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${
                      isToday ? 'bg-whatsapp text-white' : 'text-gray-700'
                    }`}>
                      {day}
                    </span>
                    {dayBookings.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayBookings.slice(0, 3).map((b, i) => (
                          <div
                            key={b._id}
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate border ${
                              STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {b.customerName?.split(' ')[0] || b.customerPhone?.slice(-4)}
                          </div>
                        ))}
                        {dayBookings.length > 3 && (
                          <div className="text-[10px] text-gray-500 px-1">
                            +{dayBookings.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, classes]) => (
            <span key={status} className={`inline-flex items-center px-2 py-1 rounded border ${classes}`}>
              {status.replace('_', ' ')}
            </span>
          ))}
        </div>

        {/* Selected Date Detail */}
        {selectedDate && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-800 mb-3">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })}
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({selectedDateBookings.length} booking{selectedDateBookings.length !== 1 ? 's' : ''})
              </span>
            </h3>
            {selectedDateBookings.length === 0 ? (
              <p className="text-gray-500 text-sm">No bookings on this date</p>
            ) : (
              <div className="space-y-2">
                {selectedDateBookings.map((b) => {
                  const roomInfo = b.room;
                  const guestCount = (b.adults || 0) + (b.kids || []).length;
                  const statusColor = STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-700';
                  return (
                    <div key={b._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Bed size={16} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-gray-800 text-sm">{b.customerName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor}`}>
                            {b.status?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                          <span>{b.customerPhone}</span>
                          <span>{roomInfo ? `Room ${roomInfo.roomNumber}` : 'No room'}</span>
                          <span>{guestCount} guest{guestCount !== 1 ? 's' : ''}</span>
                          {b.totalAmount > 0 && <span className="font-medium">₹{b.totalAmount.toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
