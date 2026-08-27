import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  RefreshCw,
  Bed,
  Users,
  PhoneCall,
  PlusCircle,
  Clock,
  Sparkles,
  CheckCircle,
  TrendingUp,
  DollarSign,
  X,
  FileText
} from 'lucide-react';

const STATUS_BADGES = {
  confirmed: { bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', label: 'Confirmed', icon: CheckCircle },
  checked_in: { bg: 'bg-blue-100 text-blue-900 border-blue-300', label: 'Checked In', icon: Clock },
  checked_out: { bg: 'bg-purple-100 text-purple-900 border-purple-300', label: 'Checked Out', icon: FileText },
  cancelled: { bg: 'bg-rose-100 text-rose-900 border-rose-300', label: 'Cancelled', icon: X },
  no_show: { bg: 'bg-slate-200 text-slate-700 border-slate-300', label: 'No Show', icon: X }
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
  const socket = useSocket();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchBookings = useCallback(async () => {
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
  }, [currentYear, currentMonth]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (!socket) return;
    const handleSync = () => fetchBookings();
    socket.on('booking:created', handleSync);
    socket.on('booking:updated', handleSync);
    socket.on('availability:updated', handleSync);
    return () => {
      socket.off('booking:created', handleSync);
      socket.off('booking:updated', handleSync);
      socket.off('availability:updated', handleSync);
    };
  }, [socket, fetchBookings]);

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
    const dateKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    setSelectedDate(dateKey);
  };

  const formatDMY = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Build a map: dateKey -> bookings on that date
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

  // Calendar grid math
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedDateBookings = selectedDate ? (bookingsByDate[selectedDate] || []) : [];

  // Monthly statistics
  const totalMonthBookings = bookings.length;
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Executive Top Control Bar */}
      <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <CalendarIcon className="text-emerald-600" size={24} />
            <span>Nandibaag Resort Occupancy Calendar</span>
          </h1>
          <p className="text-xs text-slate-500">
            Real-time monthly cottage bookings, check-in schedules, and guest availability overview.
          </p>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-600" />
            <span>{totalMonthBookings} Bookings This Month</span>
          </div>

          <div className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold font-mono">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </div>

          <button
            onClick={fetchBookings}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            title="Refresh Calendar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Calendar Card */}
      <div className="glass-card rounded-2xl bg-white border border-slate-200 shadow-md overflow-hidden">
        
        {/* Month Navigation */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-300 hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center space-y-0.5">
            <h2 className="font-display text-lg font-bold tracking-wide">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h2>
            <button
              onClick={goToToday}
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline tracking-wide"
            >
              Go to Today
            </button>
          </div>

          <button
            onClick={nextMonth}
            className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-300 hover:text-white"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day Header Names */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DAY_NAMES.map(day => (
            <div key={day} className="text-center text-xs font-bold text-slate-600 py-2.5 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid Cells */}
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <RefreshCw size={28} className="animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-500">Loading monthly cottage calendar...</p>
          </div>
        ) : (
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-50/30">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="min-h-[90px] md:min-h-[110px] bg-slate-100/50" />;
              }

              const dateKey = formatDateKey(currentYear, currentMonth, day);
              const dayBookings = bookingsByDate[dateKey] || [];
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDate;

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                  className={`min-h-[90px] md:min-h-[110px] p-2 text-left transition-all relative flex flex-col justify-between hover:bg-emerald-50/50 ${
                    isSelected ? 'bg-emerald-50 ring-2 ring-emerald-600 ring-inset shadow-xs' : ''
                  } ${isToday ? 'bg-emerald-50/40 font-bold' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-lg ${
                      isToday
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : 'text-slate-700 font-semibold'
                    }`}>
                      {day}
                    </span>

                    {dayBookings.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-800 text-white font-mono">
                        {dayBookings.length}
                      </span>
                    )}
                  </div>

                  {/* Day Booking Badges */}
                  {dayBookings.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {dayBookings.slice(0, 2).map((b) => {
                        const badgeInfo = STATUS_BADGES[b.status] || STATUS_BADGES.confirmed;
                        return (
                          <div
                            key={b._id}
                            className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate font-semibold border ${badgeInfo.bg}`}
                          >
                            {b.customerName?.split(' ')[0] || 'Guest'}
                          </div>
                        );
                      })}
                      {dayBookings.length > 2 && (
                        <div className="text-[9px] font-bold text-slate-500 px-1">
                          +{dayBookings.length - 2} more
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

      {/* Selected Date Detail Drawer */}
      {selectedDate && (
        <div className="glass-card rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="font-display font-bold text-base text-slate-800 flex items-center gap-2">
                <CalendarIcon size={18} className="text-emerald-600" />
                <span>Bookings for {formatDMY(selectedDate)}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {selectedDateBookings.length} total cottage reservation{selectedDateBookings.length !== 1 ? 's' : ''} on this date.
              </p>
            </div>

            <button
              onClick={() => setSelectedDate(null)}
              className="text-xs text-slate-400 hover:text-slate-700 self-end sm:self-auto"
            >
              Close Details ✕
            </button>
          </div>

          {selectedDateBookings.length === 0 ? (
            <div className="py-8 text-center text-xs font-semibold text-slate-400 space-y-2">
              <Bed size={28} className="mx-auto text-slate-300" />
              <p>No cottage bookings scheduled for {formatDMY(selectedDate)}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedDateBookings.map((b) => {
                const badgeInfo = STATUS_BADGES[b.status] || STATUS_BADGES.confirmed;
                const Icon = badgeInfo.icon;
                const guestCount = (b.adults || 0) + (b.kids || []).length;
                const roomsDisplay = (b.roomNumbers && b.roomNumbers.length > 0) 
                  ? b.roomNumbers.join(', ') 
                  : (b.roomIds && b.roomIds.length > 0) 
                    ? b.roomIds.join(', ') 
                    : (b.roomId || (b.room?.roomNumber ? `Room ${b.room.roomNumber}` : 'TBA'));
                const roomCount = (b.roomNumbers && b.roomNumbers.length > 0) 
                  ? b.roomNumbers.length 
                  : (b.roomIds && b.roomIds.length > 0) 
                    ? b.roomIds.length 
                  : (b.roomId || b.room ? 1 : 0);

                return (
                  <div key={b._id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 hover:border-emerald-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                          {b.customerName?.charAt(0).toUpperCase() || 'G'}
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-slate-800">{b.customerName}</h4>
                          <span className="text-[10px] font-mono text-slate-500">{b.customerPhone}</span>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeInfo.bg}`}>
                        <Icon size={11} />
                        <span>{badgeInfo.label}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Cottage Rooms:</span>
                        <strong className="text-slate-800 font-semibold">Rooms: {roomsDisplay}</strong>
                        {roomCount > 1 && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold ml-1">
                            ({roomCount} rooms)
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Stay Dates:</span>
                        <strong className="text-slate-800">{formatDateDDMMYYYY(b.checkInDate)} ➔ {formatDateDDMMYYYY(b.checkOutDate)}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Guests:</span>
                        <strong className="text-slate-800">{guestCount} Guests ({b.adults || 2} Adults)</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Total Package:</span>
                        <strong className="text-emerald-800">₹{(b.totalAmount || 0).toLocaleString('en-IN')}</strong>
                      </div>
                    </div>

                    {/* Quick Call Button */}
                    <a
                      href={`tel:${b.customerPhone}`}
                      className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <PhoneCall size={13} />
                      <span>Call {b.customerName}</span>
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
