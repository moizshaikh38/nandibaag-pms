import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Plus,
  Search,
  RefreshCw,
  X,
  XCircle,
  CheckCircle,
  ArrowRightLeft,
  CalendarDays,
  LogIn,
  LogOut,
  UserX,
  VolumeX,
  Volume2,
  AlertTriangle,
  Filter,
  Bed,
  Phone,
  Users
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  pending_payment: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Payment' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
  checked_in: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Checked In' },
  checked_out: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Checked Out' },
  no_show: { bg: 'bg-gray-200', text: 'text-gray-800', label: 'No Show' }
};

const BOOKING_TYPE_LABELS = { couple: 'Couple', group: 'Group', picnic: 'Picnic' };

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', search: '', date: '' });

  // Modals
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [moveModal, setMoveModal] = useState(null);
  const [moveRooms, setMoveRooms] = useState([]);
  const [selectedMoveRoom, setSelectedMoveRoom] = useState(null);
  const [moveWarning, setMoveWarning] = useState(null);
  const [moveConfirmWarning, setMoveConfirmWarning] = useState(false);
  const [moveRoomCheckStatus, setMoveRoomCheckStatus] = useState({}); // roomId -> { checking, available }
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [rescheduleDates, setRescheduleDates] = useState({ newCheckInDate: '', newCheckOutDate: '' });
  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    guestName: '', guestPhone: '', guestAddress: '', guestIdProofType: '',
    bookingType: 'group', checkInDate: '', checkOutDate: '', adults: 2, kids: [],
    totalAmount: 0, priceBreakdown: '', specialRequests: '', roomId: ''
  });
  const [manualRooms, setManualRooms] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchBookings = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      if (filters.date) params.append('date', filters.date);
      const res = await api.get(`/pms/bookings?${params}`);
      setBookings(res.data.bookings || []);
    } catch (error) {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBookings(); }, [filters.status, filters.date]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchBookings();
  };

  // ── Actions ──

  const handleCancel = async (bookingId) => {
    setSubmitting(true);
    try {
      await api.patch(`/pms/bookings/${bookingId}/cancel`, { reason: cancelReason });
      toast.success('Booking cancelled');
      setCancelModal(null);
      setCancelReason('');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (bookingId, newStatus) => {
    try {
      await api.patch(`/pms/bookings/${bookingId}/status`, { status: newStatus });
      toast.success(`Status updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleStopMessages = async (bookingId) => {
    try {
      const res = await api.patch(`/pms/bookings/${bookingId}/stop-messages`);
      toast.success(res.data.messagesStopped ? 'Messages stopped' : 'Messages resumed');
      // Optimistic update
      setBookings(prev => prev.map(b => b._id === bookingId ? { ...b, messagesStopped: res.data.messagesStopped } : b));
    } catch (error) {
      toast.error('Failed to toggle messages');
    }
  };

  const openMoveRoom = async (booking) => {
    setMoveModal(booking);
    setSelectedMoveRoom(null);
    setMoveWarning(null);
    setMoveConfirmWarning(false);
    setMoveRoomCheckStatus({});
    try {
      const res = await api.get(`/pms/bookings/${booking._id}/available-rooms`);
      setMoveRooms(res.data.rooms || []);
    } catch {
      toast.error('Failed to load available rooms');
    }
  };

  const selectMoveRoom = async (room, guestCount) => {
    setSelectedMoveRoom(room);
    if (room.capacity < guestCount) {
      setMoveWarning(`Guest count (${guestCount}) exceeds room capacity (${room.capacity})`);
      setMoveConfirmWarning(false);
    } else {
      setMoveWarning(null);
      setMoveConfirmWarning(false);
    }

    // Live availability check
    setMoveRoomCheckStatus(prev => ({ ...prev, [room.roomId]: { checking: true, available: null } }));
    try {
      const res = await api.get(`/pms/bookings/${moveModal._id}/check-room/${room.roomId}`);
      setMoveRoomCheckStatus(prev => ({ ...prev, [room.roomId]: { checking: false, available: res.data.available } }));
    } catch {
      setMoveRoomCheckStatus(prev => ({ ...prev, [room.roomId]: { checking: false, available: null } }));
    }
  };

  const handleMoveRoom = async () => {
    if (!selectedMoveRoom) { toast.error('Select a room'); return; }
    if (moveWarning && !moveConfirmWarning) { setMoveConfirmWarning(true); return; }
    setSubmitting(true);
    try {
      const res = await api.patch(`/pms/bookings/${moveModal._id}/move-room`, { newRoomId: selectedMoveRoom.roomId });
      if (res.data.warning) toast(res.data.warning, { icon: '⚠️', duration: 4000 });
      else toast.success('Room moved successfully');
      setMoveModal(null);
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to move room');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDates.newCheckInDate || !rescheduleDates.newCheckOutDate) {
      toast.error('Both dates are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/pms/bookings/${rescheduleModal._id}/reschedule`, rescheduleDates);
      toast.success('Booking rescheduled');
      setRescheduleModal(null);
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reschedule');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchManualRooms = async (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return;
    try {
      const res = await api.get('/availability/rooms', { params: { checkInDate: checkIn, checkOutDate: checkOut } });
      setManualRooms(res.data.rooms || []);
    } catch {
      setManualRooms([]);
    }
  };

  const handleManualBooking = async () => {
    if (!manualForm.guestName.trim() || !manualForm.guestPhone.trim()) {
      toast.error('Guest name and phone are required');
      return;
    }
    if (!manualForm.checkInDate || !manualForm.checkOutDate) {
      toast.error('Check-in and check-out dates are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/pms/bookings/manual', {
        ...manualForm,
        adults: parseInt(manualForm.adults) || 1,
        totalAmount: parseFloat(manualForm.totalAmount) || 0,
        roomId: manualForm.roomId || null,
        guestIdProofType: manualForm.guestIdProofType || null
      });
      if (res.data.warning) toast(res.data.warning, { icon: '⚠️' });
      else toast.success('Manual booking created');
      setManualModal(false);
      resetManualForm();
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const resetManualForm = () => {
    setManualForm({
      guestName: '', guestPhone: '', guestAddress: '', guestIdProofType: '',
      bookingType: 'group', checkInDate: '', checkOutDate: '', adults: 2, kids: [],
      totalAmount: 0, priceBreakdown: '', specialRequests: '', roomId: ''
    });
    setManualRooms([]);
  };

  // Group move rooms by series
  const groupedMoveRooms = moveRooms.reduce((acc, room) => {
    const series = room.seriesName || 'Other';
    if (!acc[series]) acc[series] = [];
    acc[series].push(room);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-4 pb-20 md:pb-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 md:pb-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">Bookings</h1>
          <div className="flex items-center gap-2">
            <button onClick={fetchBookings} className="p-2 text-gray-600 hover:text-whatsapp transition-colors" title="Refresh">
              <RefreshCw size={20} />
            </button>
            <button
              onClick={() => setManualModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-whatsapp text-white rounded-lg hover:bg-whatsapp-light transition-colors"
            >
              <Plus size={18} />
              Add Manual
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-3 mb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name or phone..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
                />
              </div>
            </form>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
            >
              <option value="">All Status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
            />
          </div>
        </div>

        {/* Bookings List */}
        {bookings.length === 0 ? (
          <div className="text-center py-16">
            <Bed size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-lg">No bookings found</p>
            <p className="text-gray-400 text-sm mt-1">
              {filters.status || filters.search || filters.date
                ? 'Try adjusting your filters or clearing them to see all bookings.'
                : 'Bookings will appear here once bot conversations are confirmed or you create a manual booking.'}
            </p>
            {!filters.status && !filters.search && !filters.date && (
              <button
                onClick={() => setManualModal(true)}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-whatsapp text-white rounded-lg hover:bg-whatsapp-light transition-colors"
              >
                <Plus size={18} />
                Add Manual Booking
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => {
              const roomInfo = b.room;
              const guestCount = (b.adults || 0) + (b.kids || []).length;
              return (
                <div key={b._id} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-800">{b.customerName}</h3>
                          <StatusBadge status={b.status} />
                          {b.messagesStopped && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                              <VolumeX size={10} className="mr-1" /> Muted
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Phone size={12} /> {b.customerPhone}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {BOOKING_TYPE_LABELS[b.bookingType] || b.bookingType}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        <CalendarDays size={14} className="text-gray-400" />
                        <span>{b.date || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users size={14} className="text-gray-400" />
                        <span>{guestCount} guest{guestCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Bed size={14} className="text-gray-400" />
                        <span>{roomInfo ? `Room ${roomInfo.roomNumber}` : 'No room'}</span>
                      </div>
                      {b.totalAmount > 0 && (
                        <span className="font-medium">₹{b.totalAmount.toLocaleString()}</span>
                      )}
                    </div>

                    {/* Quick Actions */}
                    {b.status !== 'cancelled' && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                        {/* Status quick actions */}
                        {b.status === 'confirmed' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(b._id, 'checked_in')}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                              title="Check In"
                            >
                              <LogIn size={12} /> Check In
                            </button>
                            <button
                              onClick={() => handleStatusChange(b._id, 'no_show')}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                              title="No Show"
                            >
                              <UserX size={12} /> No Show
                            </button>
                          </>
                        )}
                        {b.status === 'checked_in' && (
                          <button
                            onClick={() => handleStatusChange(b._id, 'checked_out')}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                            title="Check Out"
                          >
                            <LogOut size={12} /> Check Out
                          </button>
                        )}

                        {/* Room actions */}
                        {b.roomBookingId && (
                          <>
                            <button
                              onClick={() => openMoveRoom(b)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                              title="Move Room"
                            >
                              <ArrowRightLeft size={12} /> Move
                            </button>
                            <button
                              onClick={() => {
                                setRescheduleModal(b);
                                setRescheduleDates({ newCheckInDate: '', newCheckOutDate: '' });
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                              title="Reschedule"
                            >
                              <CalendarDays size={12} /> Reschedule
                            </button>
                          </>
                        )}

                        {/* Stop Messages toggle */}
                        <button
                          onClick={() => handleStopMessages(b._id)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                            b.messagesStopped
                              ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                          title={b.messagesStopped ? 'Resume messages' : 'Stop messages'}
                        >
                          {b.messagesStopped ? <Volume2 size={12} /> : <VolumeX size={12} />}
                          {b.messagesStopped ? 'Resume' : 'Mute'}
                        </button>

                        {/* Cancel */}
                        <button
                          onClick={() => { setCancelModal(b); setCancelReason(''); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors ml-auto"
                          title="Cancel"
                        >
                          <XCircle size={12} /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={24} />
              <h3 className="text-lg font-semibold">Cancel Booking</h3>
            </div>
            <p className="text-gray-600 mb-4">Cancel booking for {cancelModal.customerName}?</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleCancel(cancelModal._id)} disabled={submitting}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                {submitting ? 'Cancelling...' : 'Cancel Booking'}
              </button>
              <button onClick={() => setCancelModal(null)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">
                Keep
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Room Modal */}
      {moveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Move Room</h3>
              <button onClick={() => setMoveModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {moveRooms.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No available rooms for these dates</p>
            ) : (
              <div className="space-y-3 mb-4">
                {Object.entries(groupedMoveRooms).map(([series, rooms]) => (
                  <div key={series}>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{series}</h4>
                    <div className="space-y-2">
                      {rooms.map((room) => {
                        const guestCount = (moveModal.adults || 0) + (moveModal.kids || []).length;
                        const isUndersized = room.capacity < guestCount;
                        const isSelected = selectedMoveRoom?.roomId === room.roomId;
                        const check = moveRoomCheckStatus[room.roomId];
                        const isBooked = check && check.available === false;
                        return (
                          <button
                            key={room.roomId}
                            onClick={() => !isBooked && selectMoveRoom(room, guestCount)}
                            disabled={isBooked}
                            className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                              isBooked
                                ? 'border-red-300 bg-red-50 opacity-70 cursor-not-allowed'
                                : isSelected ? 'border-whatsapp bg-green-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {/* Live status bar for selected room */}
                            {isSelected && check && (
                              <div className={`mb-2 px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                                check.checking ? 'bg-gray-100 text-gray-500' :
                                check.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {check.checking ? (
                                  <><RefreshCw size={12} className="animate-spin" /> Checking availability...</>
                                ) : check.available ? (
                                  <><CheckCircle size={12} /> Available for these dates</>
                                ) : (
                                  <><XCircle size={12} /> Already Booked — select another room</>
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Room {room.roomNumber}</span>
                                {isSelected && !check?.checking && check?.available !== false && (
                                  <CheckCircle size={16} className="text-whatsapp" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isUndersized && <span className="text-xs text-amber-600">Under capacity</span>}
                                <span className="text-sm text-gray-500">Cap: {room.capacity}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {moveWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle size={16} />
                  <span className="text-sm font-medium">{moveWarning}</span>
                </div>
                {moveConfirmWarning && <p className="text-xs text-amber-700 mt-1">Click again to confirm.</p>}
              </div>
            )}
            {/* Live availability confirmation bar */}
            {selectedMoveRoom && moveRoomCheckStatus[selectedMoveRoom.roomId] && (
              <div className={`p-3 rounded-lg border mb-4 ${
                moveRoomCheckStatus[selectedMoveRoom.roomId].checking ? 'bg-gray-50 border-gray-200' :
                moveRoomCheckStatus[selectedMoveRoom.roomId].available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {moveRoomCheckStatus[selectedMoveRoom.roomId].checking ? (
                    <><RefreshCw size={16} className="animate-spin text-gray-500" /><span className="text-sm text-gray-600">Verifying Room {selectedMoveRoom.roomNumber}...</span></>
                  ) : moveRoomCheckStatus[selectedMoveRoom.roomId].available ? (
                    <><CheckCircle size={16} className="text-green-600" /><span className="text-sm font-medium text-green-700">Room {selectedMoveRoom.roomNumber} is available for these dates</span></>
                  ) : (
                    <><XCircle size={16} className="text-red-600" /><span className="text-sm font-medium text-red-700">Room {selectedMoveRoom.roomNumber} is no longer available</span></>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleMoveRoom} disabled={submitting || !selectedMoveRoom || (moveRoomCheckStatus[selectedMoveRoom?.roomId]?.available === false)}
                className="flex-1 bg-whatsapp text-white py-2 rounded-lg hover:bg-whatsapp-light transition-colors disabled:opacity-50">
                {submitting ? 'Moving...' : moveConfirmWarning ? 'Confirm Move' : 'Move Room'}
              </button>
              <button onClick={() => setMoveModal(null)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Reschedule Booking</h3>
              <button onClick={() => setRescheduleModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Check-in Date</label>
                <input
                  type="date"
                  value={rescheduleDates.newCheckInDate}
                  onChange={(e) => setRescheduleDates({ ...rescheduleDates, newCheckInDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Check-out Date</label>
                <input
                  type="date"
                  value={rescheduleDates.newCheckOutDate}
                  onChange={(e) => setRescheduleDates({ ...rescheduleDates, newCheckOutDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={handleReschedule} disabled={submitting}
                  className="flex-1 bg-whatsapp text-white py-2 rounded-lg hover:bg-whatsapp-light transition-colors disabled:opacity-50">
                  {submitting ? 'Rescheduling...' : 'Reschedule'}
                </button>
                <button onClick={() => setRescheduleModal(null)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Booking Modal */}
      {manualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Manual Booking</h3>
              <button onClick={() => { setManualModal(false); resetManualForm(); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
                  <input type="text" value={manualForm.guestName}
                    onChange={(e) => setManualForm({ ...manualForm, guestName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input type="text" value={manualForm.guestPhone}
                    onChange={(e) => setManualForm({ ...manualForm, guestPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Booking Type</label>
                  <select value={manualForm.bookingType}
                    onChange={(e) => setManualForm({ ...manualForm, bookingType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp">
                    <option value="couple">Couple</option>
                    <option value="group">Group</option>
                    <option value="picnic">Picnic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
                  <input type="number" min="1" value={manualForm.adults}
                    onChange={(e) => setManualForm({ ...manualForm, adults: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date</label>
                  <input type="date" value={manualForm.checkInDate}
                    onChange={(e) => {
                      setManualForm({ ...manualForm, checkInDate: e.target.value });
                      fetchManualRooms(e.target.value, manualForm.checkOutDate);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Date</label>
                  <input type="date" value={manualForm.checkOutDate}
                    onChange={(e) => {
                      setManualForm({ ...manualForm, checkOutDate: e.target.value });
                      fetchManualRooms(manualForm.checkInDate, e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                  <input type="number" min="0" value={manualForm.totalAmount}
                    onChange={(e) => setManualForm({ ...manualForm, totalAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input type="text" value={manualForm.guestAddress}
                    onChange={(e) => setManualForm({ ...manualForm, guestAddress: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                <textarea value={manualForm.specialRequests} rows={2}
                  onChange={(e) => setManualForm({ ...manualForm, specialRequests: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp" />
              </div>
              {manualRooms.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Room (optional)</label>
                  <select value={manualForm.roomId}
                    onChange={(e) => setManualForm({ ...manualForm, roomId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp">
                    <option value="">Skip assignment</option>
                    {manualRooms.map((r) => (
                      <option key={r.roomId} value={r.roomId}>
                        Room {r.roomNumber} ({r.seriesName}, Cap: {r.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={handleManualBooking} disabled={submitting}
                  className="flex-1 bg-whatsapp text-white py-2.5 rounded-lg hover:bg-whatsapp-light transition-colors disabled:opacity-50 font-medium">
                  {submitting ? 'Creating...' : 'Create Booking'}
                </button>
                <button onClick={() => { setManualModal(false); resetManualForm(); }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2.5 rounded-lg hover:bg-gray-300 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
