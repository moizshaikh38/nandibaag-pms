import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatDMY } from '../utils/formatters';
import toast from 'react-hot-toast';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  X,
  User,
  Info,
  CheckCircle,
  AlertTriangle,
  Grid3x3,
  Bed,
  PlusCircle,
  Home,
  Check,
  RefreshCw,
  Zap,
  PhoneCall,
  DollarSign,
  Loader,
  RotateCcw
} from 'lucide-react';

export default function AvailabilityPage() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [grid, setGrid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());
  const [bookingRoomId, setBookingRoomId] = useState(null); // ID of room being booked in 1 click
  const [unbookingRoomId, setUnbookingRoomId] = useState(null);

  // Book Entire Series Modal State
  const [showSeriesModal, setShowSeriesModal] = useState(null); // stores series object
  const [seriesForm, setSeriesForm] = useState({
    checkInDate: todayStr,
    checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    guestName: '',
    guestPhone: '+91',
    adults: 10,
    totalAmount: 15000
  });
  const [isSubmittingSeries, setIsSubmittingSeries] = useState(false);

  // Compute checkInDate and checkOutDate automatically from selectedDate for single room actions
  const checkInDate = selectedDate;
  const checkOutDate = new Date(new Date(selectedDate).getTime() + 86400000).toISOString().split('T')[0];

  const handleNavigateDate = (days) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const handlePresetDate = (daysAhead) => {
    const target = new Date();
    target.setDate(target.getDate() + daysAhead);
    setSelectedDate(target.toISOString().split('T')[0]);
  };

  const handlePresetWeekend = () => {
    const target = new Date();
    const day = target.getDay();
    const daysUntilSat = (6 - day + 7) % 7;
    target.setDate(target.getDate() + (daysUntilSat === 0 && day === 6 ? 0 : daysUntilSat));
    setSelectedDate(target.toISOString().split('T')[0]);
  };

  const fetchGrid = async () => {
    try {
      setLoading(true);
      const res = await api.get('/availability/grid', {
        params: { checkInDate, checkOutDate }
      });
      setGrid(res.data.grid || []);
    } catch (error) {
      toast.error('Failed to load room availability');
    } finally {
      setLoading(false);
    }
  };

  const handleUnbookRoom = async (room, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to unbook Room ${room.roomNumber}?`)) return;

    setUnbookingRoomId(room._id);
    try {
      await api.post(`/pms/rooms/${room._id}/unbook`, { checkInDate, checkOutDate });
      toast.success(`🔓 Room ${room.roomNumber} unbooked successfully!`);
      await fetchGrid();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to unbook Room ${room.roomNumber}`);
    } finally {
      setUnbookingRoomId(null);
    }
  };

  useEffect(() => {
    fetchGrid();
  }, [selectedDate]);

  useEffect(() => {
    if (!socket) return;
    const handleGridUpdate = () => {
      fetchGrid();
    };

    socket.on('availability:updated', handleGridUpdate);
    socket.on('inventory:updated', handleGridUpdate);
    socket.on('room:status_updated', handleGridUpdate);
    socket.on('pms:booking_created', handleGridUpdate);
    socket.on('booking:created', handleGridUpdate);

    return () => {
      socket.off('availability:updated', handleGridUpdate);
      socket.off('inventory:updated', handleGridUpdate);
      socket.off('room:status_updated', handleGridUpdate);
      socket.off('pms:booking_created', handleGridUpdate);
      socket.off('booking:created', handleGridUpdate);
    };
  }, [socket, selectedDate]);

  /**
   * INSTANT 1-CLICK ZERO-MODAL BOOKING FOR SINGLE ROOM:
   */
  const handleInstantOneClickBooking = async (room) => {
    if (room.status !== 'available') {
      toast.error(`Room ${room.roomNumber} is already booked.`);
      return;
    }

    setBookingRoomId(room._id);
    try {
      await api.post('/pms/bookings/manual', {
        guestName: `Walk-in Guest (Room ${room.roomNumber})`,
        guestPhone: '+919257657665',
        bookingType: 'couple',
        checkInDate,
        checkOutDate,
        adults: room.capacity || 2,
        totalAmount: 3500,
        roomIds: [room._id]
      });

      toast.success(`⚡ Room ${room.roomNumber} booked instantly & synced everywhere!`);
      await fetchGrid();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to book Room ${room.roomNumber}`);
    } finally {
      setBookingRoomId(null);
    }
  };

  /**
   * BOOK ENTIRE SERIES HANDLERS:
   */
  const handleOpenSeriesModal = (series) => {
    setShowSeriesModal(series);
    const availableRoomsInSeries = (series.rooms || []).filter(r => r.status === 'available');
    const totalCap = availableRoomsInSeries.reduce((sum, r) => sum + (r.capacity || 4), 0);

    setSeriesForm({
      checkInDate: selectedDate,
      checkOutDate: new Date(new Date(selectedDate).getTime() + 86400000).toISOString().split('T')[0],
      guestName: `Group Booking (${series.name})`,
      guestPhone: '+91',
      adults: totalCap || 10,
      totalAmount: availableRoomsInSeries.length * 3000 || 12000
    });
  };

  const handleConfirmSeriesBooking = async () => {
    if (!showSeriesModal) return;
    const availableRoomsInSeries = (showSeriesModal.rooms || []).filter(r => r.status === 'available');

    if (availableRoomsInSeries.length === 0) {
      toast.error(`No available rooms in ${showSeriesModal.name} for selected dates.`);
      return;
    }

    if (!seriesForm.guestName.trim() || !seriesForm.guestPhone.trim()) {
      toast.error('Guest name and phone number are required');
      return;
    }

    setIsSubmittingSeries(true);
    try {
      const roomIds = availableRoomsInSeries.map(r => r._id);
      await api.post('/pms/bookings/manual', {
        guestName: seriesForm.guestName,
        guestPhone: seriesForm.guestPhone,
        bookingType: 'group',
        checkInDate: seriesForm.checkInDate,
        checkOutDate: seriesForm.checkOutDate,
        adults: Number(seriesForm.adults) || roomIds.length * 2,
        totalAmount: Number(seriesForm.totalAmount) || roomIds.length * 3000,
        roomIds
      });

      toast.success(`🎉 Entire ${showSeriesModal.name} booked (${roomIds.length} rooms) & synced everywhere!`);
      setShowSeriesModal(null);
      fetchGrid();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to book ${showSeriesModal.name}`);
    } finally {
      setIsSubmittingSeries(false);
    }
  };

  let totalAvailable = 0;
  let totalBooked = 0;
  grid.forEach(series => {
    (series.rooms || []).forEach(r => {
      if (r.status === 'available') totalAvailable++;
      if (r.status === 'booked') totalBooked++;
    });
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner */}
      <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <Grid3x3 className="text-emerald-600" size={22} />
            <span>Instant 1-Click Room & Series Availability Grid</span>
          </h1>
          <p className="text-xs text-slate-500">
            Book individual cottages or book entire room series in 1 click. Syncs in real-time across Dashboard, PMS, and WhatsApp!
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-200">
            <CheckCircle size={15} />
            <span>Available: <strong>{totalAvailable}</strong></span>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-200">
            <Home size={15} />
            <span>Booked: <strong>{totalBooked}</strong></span>
          </div>
        </div>
      </div>

      {/* Mobile-Optimized Calendar Date Picker */}
      <div className="glass-card p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
        
        {/* Main Date Navigation & Touch Trigger */}
        <div className="flex items-center justify-between gap-2 w-full md:w-auto">
          {/* Previous Day */}
          <button
            type="button"
            onClick={() => handleNavigateDate(-1)}
            className="p-2.5 sm:p-3 bg-slate-100 hover:bg-emerald-100 active:scale-95 text-slate-700 hover:text-emerald-900 rounded-xl transition-all shadow-2xs flex items-center justify-center shrink-0"
            title="Previous Day"
            aria-label="Previous Day"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Interactive Date Picker Box (Tapping ANYWHERE opens native phone calendar) */}
          <div 
            onClick={(e) => {
              const input = e.currentTarget.querySelector('input[type="date"]');
              if (input && typeof input.showPicker === 'function') {
                try { input.showPicker(); } catch (err) {}
              }
            }}
            className="relative flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-950 px-3.5 py-2.5 rounded-xl border border-emerald-300 shadow-2xs cursor-pointer transition-all active:scale-[0.99] group overflow-hidden"
          >
            <CalendarIcon size={18} className="text-emerald-700 group-hover:scale-110 transition-transform shrink-0" />
            
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-emerald-800 hidden sm:inline">Date:</span>
              <span className="text-xs sm:text-sm font-bold text-emerald-950 font-mono tracking-tight bg-white/90 px-2 py-0.5 rounded-lg border border-emerald-200/80 shadow-2xs">
                {formatDMY(selectedDate)}
              </span>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-200/60 px-1.5 py-0.5 rounded-md capitalize shrink-0">
                {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
            </div>

            {/* Native Date Input overlaid 100% across the container */}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              title="Change Date"
            />
          </div>

          {/* Next Day */}
          <button
            type="button"
            onClick={() => handleNavigateDate(1)}
            className="p-2.5 sm:p-3 bg-slate-100 hover:bg-emerald-100 active:scale-95 text-slate-700 hover:text-emerald-900 rounded-xl transition-all shadow-2xs flex items-center justify-center shrink-0"
            title="Next Day"
            aria-label="Next Day"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Quick Date Presets (Scrollable Touch Bar on Mobile) */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => handlePresetDate(0)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${
              selectedDate === todayStr ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => handlePresetDate(1)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 ${
              selectedDate === new Date(Date.now() + 86400000).toISOString().split('T')[0] ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={handlePresetWeekend}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl whitespace-nowrap active:scale-95"
          >
            This Weekend
          </button>
          <button
            type="button"
            onClick={() => handlePresetDate(7)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl whitespace-nowrap active:scale-95"
          >
            +1 Week
          </button>
          <button
            type="button"
            onClick={fetchGrid}
            className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors ml-auto md:ml-1 shrink-0"
            title="Refresh Grid"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Series & Rooms Grid */}
      {loading ? (
        <div className="py-16 text-center space-y-3 glass-card rounded-2xl">
          <RefreshCw size={32} className="animate-spin text-emerald-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Fetching live cottage availability...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grid.map((series) => {
            const seriesRooms = (series.rooms || []).filter(r => 
              !searchQuery || r.roomNumber.toLowerCase().includes(searchQuery.toLowerCase())
            );
            const availableCountInSeries = seriesRooms.filter(r => r.status === 'available').length;

            return (
              <div key={series._id} className="glass-card rounded-2xl p-5 bg-white border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <Home size={18} className="text-emerald-700" />
                    <h3 className="font-display font-bold text-base text-slate-800">{series.name}</h3>
                    <span className="text-xs text-slate-500">({availableCountInSeries}/{seriesRooms.length} Available)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleOpenSeriesModal(series)}
                      disabled={availableCountInSeries === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-all hover:scale-105"
                      title={`Book all ${availableCountInSeries} available rooms in ${series.name}`}
                    >
                      <Zap size={14} />
                      <span>Book Entire {series.name}</span>
                    </button>

                    <span className="hidden md:inline text-xs text-slate-500">
                      Capacities: <strong>2 - 22 guests</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {seriesRooms.map((room) => {
                    const isAvailable = room.status === 'available';
                    const isBookingThisRoom = bookingRoomId === room._id;
                    const isUnbookingThisRoom = unbookingRoomId === room._id;

                    return (
                      <div
                        key={room._id}
                        onClick={() => {
                          if (isAvailable && !isBookingThisRoom) {
                            handleInstantOneClickBooking(room);
                          }
                        }}
                        className={`p-3.5 rounded-xl border transition-all select-none space-y-2 relative overflow-hidden group ${
                          isAvailable
                            ? 'bg-emerald-50/80 hover:bg-emerald-600 hover:text-white text-emerald-900 border-emerald-300 hover:scale-[1.04] hover:shadow-md cursor-pointer'
                            : 'bg-amber-50 text-amber-950 border-amber-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-base">
                            Room {room.roomNumber}
                          </span>

                          {isBookingThisRoom ? (
                            <Loader size={16} className="animate-spin text-emerald-700 group-hover:text-white" />
                          ) : isAvailable ? (
                            <span className="text-[10px] bg-emerald-700 group-hover:bg-white group-hover:text-emerald-900 text-white font-bold px-2 py-0.5 rounded-full transition-colors flex items-center gap-1">
                              <Zap size={10} />
                              <span>1-Click</span>
                            </span>
                          ) : (
                            <button
                              onClick={(e) => handleUnbookRoom(room, e)}
                              disabled={isUnbookingThisRoom}
                              className="text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded-full transition-all flex items-center gap-1 shadow-xs hover:scale-105"
                              title="Unbook / Cancel this room"
                            >
                              {isUnbookingThisRoom ? (
                                <Loader size={10} className="animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw size={10} />
                                  <span>Unbook</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="opacity-80">Cap: {room.capacity}</span>
                          <span className={`font-semibold capitalize text-[10px] px-2 py-0.5 rounded-full ${
                            isAvailable
                              ? 'bg-emerald-200 group-hover:bg-emerald-800 group-hover:text-white text-emerald-950'
                              : 'bg-amber-200 text-amber-950'
                          }`}>
                            {isAvailable ? 'Available' : 'Booked'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Book Entire Series Modal */}
      {showSeriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-md w-full p-6 space-y-4 bg-white animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800 flex items-center gap-2">
                <Zap size={18} className="text-emerald-600" />
                <span>Book Entire {showSeriesModal.name}</span>
              </h3>
              <button onClick={() => setShowSeriesModal(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="bg-emerald-50 text-emerald-900 p-3.5 rounded-xl text-xs space-y-1 border border-emerald-200">
              <p className="font-semibold">Series: <strong>{showSeriesModal.name}</strong></p>
              <p className="text-[11px] opacity-90">
                Available Rooms to Book: <strong>{(showSeriesModal.rooms || []).filter(r => r.status === 'available').length} of {(showSeriesModal.rooms || []).length} rooms</strong>
              </p>
            </div>

            {/* Date Range Selector formatted as DD/MM/YYYY */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">From Date (Check-in)</label>
                <div className="space-y-1">
                  <input
                    type="date"
                    value={seriesForm.checkInDate}
                    onChange={(e) => setSeriesForm(prev => ({ ...prev, checkInDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] font-mono text-emerald-900 font-bold block bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {formatDMY(seriesForm.checkInDate)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">To Date (Check-out)</label>
                <div className="space-y-1">
                  <input
                    type="date"
                    value={seriesForm.checkOutDate}
                    onChange={(e) => setSeriesForm(prev => ({ ...prev, checkOutDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] font-mono text-emerald-900 font-bold block bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {formatDMY(seriesForm.checkOutDate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guest / Group Name</label>
                <input
                  type="text"
                  value={seriesForm.guestName}
                  onChange={(e) => setSeriesForm(prev => ({ ...prev, guestName: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guest WhatsApp Phone</label>
                <input
                  type="text"
                  value={seriesForm.guestPhone}
                  onChange={(e) => setSeriesForm(prev => ({ ...prev, guestPhone: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Guests</label>
                  <input
                    type="number"
                    value={seriesForm.adults}
                    onChange={(e) => setSeriesForm(prev => ({ ...prev, adults: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Package Amount (₹)</label>
                  <input
                    type="number"
                    value={seriesForm.totalAmount}
                    onChange={(e) => setSeriesForm(prev => ({ ...prev, totalAmount: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSeriesModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSeriesBooking}
                disabled={isSubmittingSeries}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
              >
                {isSubmittingSeries ? 'Booking Series...' : `Confirm Book Entire ${showSeriesModal.name}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
