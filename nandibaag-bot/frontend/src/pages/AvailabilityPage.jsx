import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
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
  Trash2
} from 'lucide-react';

export default function AvailabilityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Date state
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [checkInDate, setCheckInDate] = useState(today.toISOString().split('T')[0]);
  const [checkOutDate, setCheckOutDate] = useState(tomorrow.toISOString().split('T')[0]);

  // Grid data
  const [grid, setGrid] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedRoomId, setHighlightedRoomId] = useState(null);

  // Calendar widget
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarSelection, setCalendarSelection] = useState(null); // 'checkIn' or 'checkOut'

  // Booking modal
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    guestName: '',
    guestPhone: '',
    guestAddress: '',
    guestIdProofType: '',
    adults: 1,
    kids: [],
    specialRequests: ''
  });
  const [bookingLoading, setBookingLoading] = useState(false);

  // Booked room popover
  const [bookedRoomPopover, setBookedRoomPopover] = useState(null);

  // Refs for scrolling
  const roomRefs = useRef({});

  // Fetch grid data when dates change
  useEffect(() => {
    fetchGrid();
  }, [checkInDate, checkOutDate]);

  // Scroll to highlighted room
  useEffect(() => {
    if (highlightedRoomId && roomRefs.current[highlightedRoomId]) {
      roomRefs.current[highlightedRoomId].scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedRoomId(null), 2000);
    }
  }, [highlightedRoomId]);

  const fetchGrid = async () => {
    try {
      setLoading(true);
      const res = await api.get('/availability/grid', {
        params: { checkInDate, checkOutDate }
      });
      setGrid(res.data.grid);
    } catch (error) {
      toast.error('Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field, value) => {
    if (field === 'checkIn') {
      setCheckInDate(value);
      if (value >= checkOutDate) {
        const newCheckout = new Date(value);
        newCheckout.setDate(newCheckout.getDate() + 1);
        setCheckOutDate(newCheckout.toISOString().split('T')[0]);
      }
    } else {
      setCheckOutDate(value);
      if (value <= checkInDate) {
        const newCheckin = new Date(value);
        newCheckin.setDate(newCheckin.getDate() - 1);
        setCheckInDate(newCheckin.toISOString().split('T')[0]);
      }
    }
  };

  const handlePrevDay = () => {
    const newCheckin = new Date(checkInDate);
    newCheckin.setDate(newCheckin.getDate() - 1);
    const newCheckout = new Date(checkOutDate);
    newCheckout.setDate(newCheckout.getDate() - 1);
    setCheckInDate(newCheckin.toISOString().split('T')[0]);
    setCheckOutDate(newCheckout.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const newCheckin = new Date(checkInDate);
    newCheckin.setDate(newCheckin.getDate() + 1);
    const newCheckout = new Date(checkOutDate);
    newCheckout.setDate(newCheckout.getDate() + 1);
    setCheckInDate(newCheckin.toISOString().split('T')[0]);
    setCheckOutDate(newCheckout.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setCheckInDate(today.toISOString().split('T')[0]);
    setCheckOutDate(tomorrow.toISOString().split('T')[0]);
  };

  const toggleRoomSelection = (roomId) => {
    const newSelection = new Set(selectedRoomIds);
    if (newSelection.has(roomId)) {
      newSelection.delete(roomId);
    } else {
      newSelection.add(roomId);
    }
    setSelectedRoomIds(newSelection);
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    
    for (const series of grid) {
      for (const room of series.rooms) {
        if (room.roomNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            series.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          setHighlightedRoomId(room._id);
          return;
        }
      }
    }
    toast.error('Room not found');
  };

  const handleCalendarClick = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    
    if (!calendarSelection) {
      setCalendarSelection('checkIn');
      setCheckInDate(dateStr);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOutDate(nextDay.toISOString().split('T')[0]);
    } else if (calendarSelection === 'checkIn') {
      setCalendarSelection('checkOut');
      if (dateStr > checkInDate) {
        setCheckOutDate(dateStr);
      } else {
        setCheckInDate(dateStr);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        setCheckOutDate(nextDay.toISOString().split('T')[0]);
      }
    } else {
      setCalendarSelection(null);
      setShowCalendar(false);
    }
  };

  const handleBookSelected = () => {
    setShowBookingModal(true);
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setBookingLoading(true);

    try {
      const selectedRoomsArray = Array.from(selectedRoomIds);
      const totalCapacity = grid.reduce((sum, series) => {
        return sum + series.rooms
          .filter(r => selectedRoomIds.has(r._id))
          .reduce((roomSum, r) => roomSum + r.capacity, 0);
      }, 0);

      const res = await api.post('/pms/bookings/manual', {
        guestName: bookingForm.guestName,
        guestPhone: bookingForm.guestPhone,
        guestAddress: bookingForm.guestAddress || null,
        guestIdProofType: bookingForm.guestIdProofType || null,
        bookingType: 'group',
        checkInDate,
        checkOutDate,
        adults: bookingForm.adults,
        kids: bookingForm.kids || [],
        totalAmount: 0, // Will be calculated by pricing logic
        specialRequests: bookingForm.specialRequests || '',
        roomIds: selectedRoomsArray
      });

      toast.success('Booking created successfully');
      setShowBookingModal(false);
      setSelectedRoomIds(new Set());
      setBookingForm({
        guestName: '',
        guestPhone: '',
        guestAddress: '',
        guestIdProofType: '',
        adults: 1,
        kids: [],
        specialRequests: ''
      });
      
      // Refresh grid
      fetchGrid();
      
      // Navigate to bookings page
      navigate('/bookings');
    } catch (error) {
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to create booking');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
      await api.patch(`/pms/bookings/${bookingId}/cancel`, { reason: 'Cancelled from AvailabilityPage' });
      toast.success('Booking cancelled');
      setBookedRoomPopover(null);
      fetchGrid();
    } catch (error) {
      toast.error('Failed to cancel booking');
    }
  };

  const getSelectedCapacity = () => {
    return grid.reduce((sum, series) => {
      return sum + series.rooms
        .filter(r => selectedRoomIds.has(r._id))
        .reduce((roomSum, r) => roomSum + r.capacity, 0);
    }, 0);
  };

  // Calendar widget component
  const CalendarWidget = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    const isCheckIn = (date) => date.toISOString().split('T')[0] === checkInDate;
    const isCheckOut = (date) => date.toISOString().split('T')[0] === checkOutDate;
    const isInRange = (date) => {
      const d = date.toISOString().split('T')[0];
      return d > checkInDate && d < checkOutDate;
    };

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 w-72">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              const newDate = new Date(calendarDate);
              newDate.setMonth(newDate.getMonth() - 1);
              setCalendarDate(newDate);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-medium">
            {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => {
              const newDate = new Date(calendarDate);
              newDate.setMonth(newDate.getMonth() + 1);
              setCalendarDate(newDate);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="font-medium text-gray-500 py-1">{d}</div>
          ))}
          {days.map((date, i) => (
            <button
              key={i}
              onClick={() => date && handleCalendarClick(date)}
              disabled={!date}
              className={`
                py-2 rounded text-sm
                ${!date ? 'text-transparent' : ''}
                ${isCheckIn(date) ? 'bg-whatsapp text-white' : ''}
                ${isCheckOut(date) ? 'bg-whatsapp text-white' : ''}
                ${isInRange(date) ? 'bg-green-100 text-green-800' : ''}
                ${date && !isCheckIn(date) && !isCheckOut(date) && !isInRange(date) ? 'hover:bg-gray-100' : ''}
              `}
            >
              {date ? date.getDate() : ''}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setCalendarSelection(null);
            setShowCalendar(false);
          }}
          className="mt-4 w-full py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
        >
          Close
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">Room Availability</h1>
          <p className="text-sm text-gray-600">Select rooms to create a booking</p>
        </div>
      </div>

      {/* Top Controls */}
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Date Controls */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <CalendarIcon size={18} className="text-whatsapp" />
              <div>
                <label className="block text-xs font-medium text-gray-600">Check-in</label>
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => handleDateChange('checkIn', e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600">Check-out</label>
                <input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => handleDateChange('checkOut', e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handlePrevDay} className="p-2 hover:bg-gray-100 rounded">
                <ChevronLeft size={18} />
              </button>
              <button onClick={handleToday} className="px-3 py-2 text-sm font-medium hover:bg-gray-100 rounded">
                Today
              </button>
              <button onClick={handleNextDay} className="p-2 hover:bg-gray-100 rounded">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
              >
                <CalendarIcon size={16} />
                Calendar
              </button>
              {showCalendar && (
                <div className="absolute top-full left-0 mt-2 z-10">
                  <CalendarWidget />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search and Legend */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-64 bg-white rounded-lg shadow p-3 flex items-center gap-2">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search room number or series..."
              className="flex-1 px-2 py-1 text-sm focus:outline-none"
            />
            <button onClick={handleSearch} className="px-3 py-1 bg-whatsapp text-white rounded text-sm">
              Search
            </button>
          </div>
          <div className="flex items-center gap-4 bg-white rounded-lg shadow px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-xs text-gray-600">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-xs text-gray-600">Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-xs text-gray-600">Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-300 rounded"></div>
              <span className="text-xs text-gray-600">Maintenance</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp"></div>
          </div>
        ) : grid.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No rooms found
          </div>
        ) : (
          <div className="space-y-6">
            {grid.map((series) => (
              <div key={series._id} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <h3 className="font-semibold text-gray-800">{series.name}</h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {series.rooms.map((room) => {
                      const isSelected = selectedRoomIds.has(room._id);
                      const isHighlighted = highlightedRoomId === room._id;
                      
                      return (
                        <div
                          key={room._id}
                          ref={(el) => roomRefs.current[room._id] = el}
                          onClick={() => {
                            if (room.status === 'available') {
                              toggleRoomSelection(room._id);
                            } else if (room.status === 'booked') {
                              setBookedRoomPopover({ room, seriesName: series.name });
                            }
                          }}
                          className={`
                            relative rounded-lg p-3 border-2 cursor-pointer transition-all
                            ${room.status === 'available' && !isSelected ? 'border-green-500 bg-green-50 hover:bg-green-100' : ''}
                            ${room.status === 'available' && isSelected ? 'border-blue-500 bg-blue-50' : ''}
                            ${room.status === 'booked' ? 'border-red-500 bg-red-50' : ''}
                            ${room.status === 'maintenance' ? 'border-gray-300 bg-gray-100' : ''}
                            ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
                          `}
                        >
                          <div className="font-bold text-gray-800">{room.roomNumber}</div>
                          <div className="text-xs text-gray-600">Cap: {room.capacity}</div>
                          {room.status === 'booked' && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-red-700">
                              <User size={10} />
                              <span>Booked</span>
                            </div>
                          )}
                          {room.status === 'maintenance' && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                              <AlertTriangle size={10} />
                              <span>Maintenance</span>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute top-1 right-1">
                              <CheckCircle size={16} className="text-blue-500" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      {selectedRoomIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t p-4 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-800">
                {selectedRoomIds.size} room{selectedRoomIds.size !== 1 ? 's' : ''} selected
              </span>
              <span className="text-gray-600 ml-4">
                Total capacity: {getSelectedCapacity()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedRoomIds(new Set())}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Clear
              </button>
              <button
                onClick={handleBookSelected}
                className="px-6 py-2 bg-whatsapp text-white rounded-lg hover:bg-whatsapp-light font-medium"
              >
                Book Selected Rooms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowBookingModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Create Booking</h2>
              <button onClick={() => setShowBookingModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleBookingSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
                <input
                  type="text"
                  required
                  value={bookingForm.guestName}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={bookingForm.guestPhone}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={bookingForm.guestAddress}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Proof Type</label>
                <select
                  value={bookingForm.guestIdProofType}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestIdProofType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                >
                  <option value="">Select...</option>
                  <option value="aadhaar">Aadhaar</option>
                  <option value="pan">PAN</option>
                  <option value="license">Driving License</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adults *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={bookingForm.adults}
                  onChange={(e) => setBookingForm({ ...bookingForm, adults: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                <input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                <textarea
                  value={bookingForm.specialRequests}
                  onChange={(e) => setBookingForm({ ...bookingForm, specialRequests: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-whatsapp"
                  rows={2}
                />
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-600">
                  <strong>{selectedRoomIds.size}</strong> room(s) selected · Total capacity: <strong>{getSelectedCapacity()}</strong>
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingLoading}
                  className="flex-1 px-4 py-2 bg-whatsapp text-white rounded hover:bg-whatsapp-light disabled:opacity-50"
                >
                  {bookingLoading ? 'Creating...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booked Room Popover */}
      {bookedRoomPopover && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setBookedRoomPopover(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Booking Details</h3>
              <button onClick={() => setBookedRoomPopover(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            {bookedRoomPopover.room.booking && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Room</p>
                  <p className="font-medium text-gray-800">{bookedRoomPopover.seriesName} - {bookedRoomPopover.room.roomNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Guest Name</p>
                  <p className="font-medium text-gray-800">{bookedRoomPopover.room.booking.customerName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium text-gray-800">{bookedRoomPopover.room.booking.customerPhone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Check-in</p>
                  <p className="font-medium text-gray-800">{new Date(bookedRoomPopover.room.booking.checkInDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Check-out</p>
                  <p className="font-medium text-gray-800">{new Date(bookedRoomPopover.room.booking.checkOutDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium text-gray-800 capitalize">{bookedRoomPopover.room.booking.status.replace('_', ' ')}</p>
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  setBookedRoomPopover(null);
                  navigate(`/bookings/${bookedRoomPopover.room.booking.bookingId}`);
                }}
                className="flex-1 px-4 py-2 bg-whatsapp text-white rounded hover:bg-whatsapp-light"
              >
                View Booking
              </button>
              <button
                onClick={() => handleCancelBooking(bookedRoomPopover.room.booking.bookingId)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
