import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { formatDMY } from '../utils/formatters';
import {
  Clock,
  User,
  Phone,
  Calendar,
  Users,
  MapPin,
  CreditCard,
  CheckCircle,
  X,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Bed,
  XCircle
} from 'lucide-react';

const BOOKING_TYPE_LABELS = {
  couple: 'Couple Stay',
  group: 'Group Stay',
  picnic: 'One Day Picnic'
};

function AvailabilityBadge({ checked, confirmed }) {
  if (!checked) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Not Checked</span>;
  if (confirmed) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Available</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Unavailable</span>;
}

export default function PendingBookingsPage() {
  const navigate = useNavigate();
  const [handovers, setHandovers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Confirm booking flow
  const [selectedHandover, setSelectedHandover] = useState(null);
  const [step, setStep] = useState(1); // 1 = guest details, 2 = room assignment
  const [guestForm, setGuestForm] = useState({ guestName: '', guestPhone: '+91', guestAddress: '', guestIdProofType: '', specialRequests: '' });
  const [availableRooms, setAvailableRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [capacityWarning, setCapacityWarning] = useState(null);
  const [confirmWarning, setConfirmWarning] = useState(false);
  const [roomCheckStatus, setRoomCheckStatus] = useState({}); // roomId -> { checking, available }

  const fetchHandovers = async () => {
    try {
      const res = await api.get('/pms/pending-handovers');
      setHandovers(res.data.handovers || []);
    } catch (error) {
      toast.error('Failed to load pending handovers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHandovers();
  }, []);

  const openConfirmFlow = (handover) => {
    setSelectedHandover(handover);
    setStep(1);
    setGuestForm({
      guestName: handover.customerName || '',
      guestPhone: handover.customerPhone || '+91',
      guestAddress: '',
      guestIdProofType: '',
      specialRequests: handover.bookingDraft?.specialRequests || ''
    });
    setSelectedRoom(null);
    setCapacityWarning(null);
    setConfirmWarning(false);
  };

  const createBooking = async () => {
    if (!guestForm.guestName.trim() || !guestForm.guestPhone.trim()) {
      toast.error('Guest name and phone are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/pms/bookings', {
        chatId: selectedHandover._id,
        guestName: guestForm.guestName.trim(),
        guestPhone: guestForm.guestPhone.trim(),
        guestAddress: guestForm.guestAddress.trim() || null,
        guestIdProofType: guestForm.guestIdProofType || null,
        specialRequests: guestForm.specialRequests.trim() || null
      });
      // Store booking ID for room assignment
      setSelectedHandover(prev => ({ ...prev, _bookingId: res.data.booking._id }));
      setStep(2);
      toast.success('Booking created! Now assign a room.');
      fetchAvailableRooms(res.data.booking._id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchAvailableRooms = async (bookingId) => {
    setRoomsLoading(true);
    try {
      const res = await api.get(`/pms/bookings/${bookingId}/available-rooms`);
      setAvailableRooms(res.data.rooms || []);
    } catch (error) {
      toast.error('Failed to load available rooms');
    } finally {
      setRoomsLoading(false);
    }
  };

  const selectRoom = async (room) => {
    const guestCount = (selectedHandover.bookingDraft?.adults || 1) + (selectedHandover.bookingDraft?.kids || []).length;
    if (room.capacity < guestCount) {
      setCapacityWarning(`Guest count (${guestCount}) exceeds room capacity (${room.capacity})`);
      setConfirmWarning(false);
    } else {
      setCapacityWarning(null);
      setConfirmWarning(false);
    }
    setSelectedRoom(room);

    // Live availability check
    setRoomCheckStatus(prev => ({ ...prev, [room.roomId]: { checking: true, available: null } }));
    try {
      const bookingId = selectedHandover._bookingId;
      const res = await api.get(`/pms/bookings/${bookingId}/check-room/${room.roomId}`);
      setRoomCheckStatus(prev => ({ ...prev, [room.roomId]: { checking: false, available: res.data.available } }));
    } catch {
      setRoomCheckStatus(prev => ({ ...prev, [room.roomId]: { checking: false, available: null } }));
    }
  };

  const assignRoom = async () => {
    if (!selectedRoom) {
      toast.error('Please select a room');
      return;
    }

    if (capacityWarning && !confirmWarning) {
      setConfirmWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/pms/bookings/${selectedHandover._bookingId}/assign-room`, {
        roomId: selectedRoom.roomId
      });
      if (res.data.warning) {
        toast(res.data.warning, { icon: '⚠️', duration: 4000 });
      } else {
        toast.success('Room assigned! Booking confirmed.');
      }
      closeModal();
      fetchHandovers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign room');
    } finally {
      setSubmitting(false);
    }
  };

  const skipRoomAssignment = async () => {
    toast.success('Booking saved. Assign room later from Bookings page.');
    closeModal();
    fetchHandovers();
  };

  const closeModal = () => {
    setSelectedHandover(null);
    setStep(1);
    setSelectedRoom(null);
    setAvailableRooms([]);
    setCapacityWarning(null);
    setConfirmWarning(false);
    setRoomCheckStatus({});
  };

  // Group rooms by series
  const groupedRooms = availableRooms.reduce((acc, room) => {
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Pending Bookings</h1>
          <button onClick={fetchHandovers} className="p-2 text-gray-600 hover:text-whatsapp transition-colors" title="Refresh">
            <RefreshCw size={20} />
          </button>
        </div>

        {/* Empty state */}
        {handovers.length === 0 ? (
          <div className="text-center py-16">
            <Clock size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-lg">No pending handovers</p>
            <p className="text-gray-400 text-sm mt-1">Bot conversations that need confirmation will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {handovers.map((h) => {
              const draft = h.bookingDraft || {};
              const guestCount = (draft.adults || 0) + (draft.kids || []).length;
              return (
                <div
                  key={h._id}
                  className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                  onClick={() => openConfirmFlow(h)}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-800 text-lg">
                          {h.customerName || 'Unknown Guest'}
                        </h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Phone size={12} /> {h.customerPhone}
                        </p>
                      </div>
                      <AvailabilityBadge checked={draft.availabilityChecked} confirmed={draft.availabilityConfirmed} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Bed size={14} className="text-gray-400" />
                        <span>{BOOKING_TYPE_LABELS[draft.bookingType] || draft.bookingType}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-gray-400" />
                        <span>{guestCount} guest{guestCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{draft.date || 'No date'}</span>
                      </div>
                      {draft.calculatedPrice > 0 && (
                        <div className="flex items-center gap-2">
                          <CreditCard size={14} className="text-gray-400" />
                          <span>₹{draft.calculatedPrice.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {draft.suggestedCombination && (
                      <div className="mt-3 px-3 py-2 bg-blue-50 rounded text-sm text-blue-700">
                        Room preference: {draft.suggestedCombination}
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-2 bg-gray-50 border-t flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {h.lastMessageAt ? formatDMY(h.lastMessageAt) : ''}
                    </span>
                    <span className="text-whatsapp text-sm font-medium flex items-center gap-1">
                      Confirm Booking <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Booking Modal */}
      {selectedHandover && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b z-10">
              <div>
                <h3 className="text-lg font-semibold">
                  {step === 1 ? 'Confirm Booking' : 'Assign Room'}
                </h3>
                <p className="text-sm text-gray-500">Step {step} of 2</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              {/* Step 1: Guest Details */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
                    <input
                      type="text"
                      value={guestForm.guestName}
                      onChange={(e) => setGuestForm({ ...guestForm, guestName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                    <input
                      type="text"
                      value={guestForm.guestPhone}
                      onChange={(e) => setGuestForm({ ...guestForm, guestPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address (optional)</label>
                    <input
                      type="text"
                      value={guestForm.guestAddress}
                      onChange={(e) => setGuestForm({ ...guestForm, guestAddress: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ID Proof Type (optional)</label>
                    <select
                      value={guestForm.guestIdProofType}
                      onChange={(e) => setGuestForm({ ...guestForm, guestIdProofType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                    >
                      <option value="">Select...</option>
                      <option value="aadhaar">Aadhaar</option>
                      <option value="pan">PAN</option>
                      <option value="license">Driving License</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                    <textarea
                      value={guestForm.specialRequests}
                      onChange={(e) => setGuestForm({ ...guestForm, specialRequests: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={createBooking}
                      disabled={submitting}
                      className="flex-1 bg-whatsapp text-white py-2.5 rounded-lg hover:bg-whatsapp-light transition-colors disabled:opacity-50 font-medium"
                    >
                      {submitting ? 'Creating...' : 'Create Booking →'}
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 bg-gray-200 text-gray-800 py-2.5 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Room Assignment */}
              {step === 2 && (
                <div className="space-y-4">
                  {roomsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp"></div>
                    </div>
                  ) : availableRooms.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertTriangle size={32} className="mx-auto mb-2 text-amber-500" />
                      <p>No rooms available for these dates</p>
                      <p className="text-sm mt-1">You can assign later from the Bookings page</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-600 mb-3">Select a room to assign:</p>
                      {Object.entries(groupedRooms).map(([seriesName, rooms]) => (
                        <div key={seriesName} className="mb-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">{seriesName}</h4>
                          <div className="space-y-2">
                            {rooms.map((room) => {
                              const isSelected = selectedRoom?.roomId === room.roomId;
                              const guestCount = (selectedHandover.bookingDraft?.adults || 1) + (selectedHandover.bookingDraft?.kids || []).length;
                              const isUndersized = room.capacity < guestCount;
                              const check = roomCheckStatus[room.roomId];
                              const isBooked = check && check.available === false;
                              return (
                                <button
                                  key={room.roomId}
                                  onClick={() => !isBooked && selectRoom(room)}
                                  disabled={isBooked}
                                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                                    isBooked
                                      ? 'border-red-300 bg-red-50 opacity-70 cursor-not-allowed'
                                      : isSelected
                                      ? 'border-whatsapp bg-green-50'
                                      : 'border-gray-200 hover:border-gray-300'
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
                                      <span className="font-medium text-gray-800">Room {room.roomNumber}</span>
                                      {isSelected && !check?.checking && check?.available !== false && (
                                        <CheckCircle size={16} className="text-whatsapp" />
                                      )}
                                      {isUndersized && (
                                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                          Under capacity
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-sm text-gray-500">Capacity: {room.capacity}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Capacity Warning */}
                  {capacityWarning && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-800">
                        <AlertTriangle size={16} />
                        <span className="text-sm font-medium">{capacityWarning}</span>
                      </div>
                      {confirmWarning && (
                        <p className="text-xs text-amber-700 mt-1">Click "Confirm Assignment" again to proceed anyway.</p>
                      )}
                    </div>
                  )}

                  {/* Live availability confirmation bar */}
                  {selectedRoom && roomCheckStatus[selectedRoom.roomId] && (
                    <div className={`p-3 rounded-lg border ${
                      roomCheckStatus[selectedRoom.roomId].checking ? 'bg-gray-50 border-gray-200' :
                      roomCheckStatus[selectedRoom.roomId].available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {roomCheckStatus[selectedRoom.roomId].checking ? (
                          <><RefreshCw size={16} className="animate-spin text-gray-500" /><span className="text-sm text-gray-600">Verifying Room {selectedRoom.roomNumber} availability...</span></>
                        ) : roomCheckStatus[selectedRoom.roomId].available ? (
                          <><CheckCircle size={16} className="text-green-600" /><span className="text-sm font-medium text-green-700">Room {selectedRoom.roomNumber} is available for these dates</span></>
                        ) : (
                          <><XCircle size={16} className="text-red-600" /><span className="text-sm font-medium text-red-700">Room {selectedRoom.roomNumber} is no longer available — please refresh and pick another</span></>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={assignRoom}
                      disabled={submitting || !selectedRoom || (roomCheckStatus[selectedRoom?.roomId]?.available === false)}
                      className="flex-1 bg-whatsapp text-white py-2.5 rounded-lg hover:bg-whatsapp-light transition-colors disabled:opacity-50 font-medium"
                    >
                      {submitting ? 'Assigning...' : confirmWarning ? 'Confirm Assignment' : 'Confirm & Assign Room'}
                    </button>
                    <button
                      onClick={skipRoomAssignment}
                      className="flex-1 bg-gray-200 text-gray-800 py-2.5 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Skip for Now
                    </button>
                  </div>
                  <button
                    onClick={() => navigate('/pms/bookings')}
                    className="w-full text-center text-sm text-whatsapp hover:text-whatsapp-light mt-2"
                  >
                    View in Bookings list →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
