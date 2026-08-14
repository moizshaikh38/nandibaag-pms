import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { getSessionId } from '../utils/sessionManager';
import { connectSocket } from '../utils/socket';
import { formatDateDDMMYYYY, getDayName, formatDateWithDay } from '../utils/dateFormatter';
import {
  FileEdit,
  User,
  Phone,
  Calendar,
  Package,
  Users,
  Check,
  CreditCard,
  Building,
  Upload,
  Sparkles,
  CheckCircle2,
  Image as ImageIcon,
  Clock,
  Lock
} from 'lucide-react';
import '../styles/ManualBookingForm.css';

const ManualBookingForm = () => {
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '+91',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    packageType: 'couple',
    mealOption: 'B->D',
    guestComposition: { adults: 2, children: 0 },
    bookedBy: { name: '', staffId: '' },
    staffNames: [],
    roomId: '',
    guestIdProofType: 'aadhaar',
    guestIdProofPhoto: null,
    totalAmount: 3500,
    advancePayment: 0,
    remainingPayment: 3500,
    isFullPaid: false,
    notes: ''
  });

  const [sessionId] = useState(() => getSessionId());
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [reservationExpiry, setReservationExpiry] = useState(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Group rooms by Series Name
  const roomsBySeries = useMemo(() => {
    const map = {};
    for (const room of roomsList) {
      const num = String(room.number || room.roomNumber || room._id);
      const series = room.seriesName || (num.startsWith('2') ? 'Series 200 (Deluxe)' : 'Series 100 (Cottages)');
      if (!map[series]) map[series] = [];
      map[series].push(room);
    }
    return map;
  }, [roomsList]);

  // Connect socket and listen for real-time room updates
  useEffect(() => {
    connectSocket();
    const handleRefresh = () => {
      if (formData.checkInDate && formData.checkOutDate) {
        fetchRealtimeRooms(formData.checkInDate, formData.checkOutDate);
      }
    };
    window.addEventListener('refresh_availability', handleRefresh);
    return () => window.removeEventListener('refresh_availability', handleRefresh);
  }, [formData.checkInDate, formData.checkOutDate]);

  // Fetch staff on load
  useEffect(() => {
    fetchStaffNames();
  }, []);

  const fetchStaffNames = async () => {
    try {
      const response = await api.get('/bookings/staff-names');
      const names = response.data.staffNames || [];
      setStaffOptions(names);
      setFormData(prev => ({
        ...prev,
        staffNames: names
      }));
    } catch (error) {
      console.error('[ManualBooking] Error fetching staff:', error);
    }
  };

  const [availabilityMessage, setAvailabilityMessage] = useState(null);

  const fetchRealtimeRooms = async (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return;
    setIsLoadingRooms(true);
    try {
      const res = await api.get('/rooms/availability-realtime', {
        params: { checkInDate: checkIn, checkOutDate: checkOut, sessionId }
      });
      const rooms = res.data.rooms || [];
      setRoomsList(rooms);
      setAvailabilityMessage(res.data.availabilityMessage?.message || null);
    } catch (err) {
      console.error('[Form:RealtimeRooms] Error:', err);
      fetchRooms(checkIn, checkOut);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  const fetchRooms = async (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return;
    setIsLoadingRooms(true);
    try {
      const res = await api.get('/rooms/availability', { params: { checkInDate: checkIn, checkOutDate: checkOut } });
      const rooms = res.data.rooms || [];
      setRoomsList(rooms);
    } catch (err) {
      console.error('[Form:Rooms] Error:', err);
      setRoomsList([]);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (formData.checkInDate && formData.checkOutDate) {
      fetchRealtimeRooms(formData.checkInDate, formData.checkOutDate);
      setSelectedRooms([]);
      setTotalCapacity(0);
      setReservationExpiry(null);
      setFormData(prev => ({ ...prev, roomId: '' }));
    }
  }, [formData.checkInDate, formData.checkOutDate]);

  const handleRoomToggle = async (roomObj) => {
    const roomIdentifier = String(roomObj.number || roomObj.roomNumber || roomObj._id);
    const isSelected = selectedRooms.includes(roomIdentifier);
    const newSelection = isSelected
      ? selectedRooms.filter(r => r !== roomIdentifier)
      : [...selectedRooms, roomIdentifier];

    setSelectedRooms(newSelection);

    const cap = newSelection.reduce((sum, num) => {
      const rObj = roomsList.find(r => String(r.number || r.roomNumber || r._id) === num);
      return sum + (rObj?.capacity || 4);
    }, 0);

    setTotalCapacity(cap);
    setFormData(prev => ({
      ...prev,
      roomId: newSelection.join(', ')
    }));

    // Create 15-minute room reservation lock on backend
    if (newSelection.length > 0) {
      try {
        const res = await api.post('/reservations', {
          roomIds: newSelection,
          checkInDate: formData.checkInDate,
          checkOutDate: formData.checkOutDate,
          sessionId,
          userId: formData.bookedBy.name || 'staff'
        });
        if (res.data?.expiresAt) {
          setReservationExpiry(new Date(res.data.expiresAt));
        }
      } catch (err) {
        console.error('[Form:Reservation] Lock error:', err.response?.data?.error || err.message);
        toast.error(err.response?.data?.error || 'Room locked by another user!');
      }
    } else {
      setReservationExpiry(null);
      try {
        await api.post('/reservations/cancel', {
          sessionId,
          checkInDate: formData.checkInDate,
          checkOutDate: formData.checkOutDate
        });
      } catch (_) {}
    }
  };

  const handleDateChange = (field, value) => {
    setFormData(prev => {
      let updated = { ...prev, [field]: value };
      const isOneDay = prev.packageType === 'oneDay' || prev.packageType === 'picnic';

      if (field === 'checkInDate') {
        const inTime = new Date(value).getTime();
        const outTime = new Date(prev.checkOutDate).getTime();
        if (isOneDay) {
          // For One Day picnic, default checkout to same day if not set or before check-in
          if (isNaN(outTime) || outTime < inTime) {
            updated.checkOutDate = value;
          }
        } else {
          // For Stays, checkout must be at least checkIn + 1 day
          if (isNaN(outTime) || inTime >= outTime) {
            const nextDay = new Date(inTime + 86400000).toISOString().split('T')[0];
            updated.checkOutDate = nextDay;
          }
        }
      } else if (field === 'checkOutDate') {
        const outTime = new Date(value).getTime();
        const inTime = new Date(prev.checkInDate).getTime();
        if (isOneDay) {
          // For One Day picnic, allow same day (outTime === inTime)
          if (isNaN(inTime) || outTime < inTime) {
            updated.checkInDate = value;
          }
        } else {
          // For Stays, checkout cannot be same day or before checkin
          if (isNaN(inTime) || outTime <= inTime) {
            const prevDay = new Date(outTime - 86400000).toISOString().split('T')[0];
            updated.checkInDate = prevDay;
          }
        }
      }
      return updated;
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith('guestComposition.')) {
      const key = name.replace('guestComposition.', '');
      const numVal = parseInt(value) || 0;
      setFormData(prev => ({
        ...prev,
        guestComposition: {
          ...prev.guestComposition,
          [key]: numVal
        }
      }));
    } else if (name === 'bookedByName') {
      const selectedStaff = staffOptions.find(s => s.name === value);
      setFormData(prev => ({
        ...prev,
        bookedBy: {
          name: value,
          staffId: selectedStaff?.id || ''
        }
      }));
    } else if (name === 'totalAmount' || name === 'advancePayment') {
      const num = parseFloat(value) || 0;
      setFormData(prev => {
        const total = name === 'totalAmount' ? num : parseFloat(prev.totalAmount) || 0;
        const adv = name === 'advancePayment' ? num : parseFloat(prev.advancePayment) || 0;
        return {
          ...prev,
          [name]: value,
          remainingPayment: Math.max(0, total - adv)
        };
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, guestIdProofPhoto: reader.result }));
      toast.success('📷 ID Proof attached');
    };
    reader.readAsDataURL(file);
  };

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) {
      toast.error('Staff name required');
      return;
    }
    try {
      const response = await api.post('/bookings/staff-names', { name: newStaffName });
      const newStaff = response.data.staff;
      const updatedNames = response.data.staffNames || [...formData.staffNames, newStaff];
      setFormData(prev => ({
        ...prev,
        staffNames: updatedNames
      }));
      setStaffOptions(updatedNames);
      setNewStaffName('');
      setShowAddStaff(false);
      toast.success('Staff added');
    } catch (error) {
      toast.error('Failed to add staff');
    }
  };

  const handleDeleteStaff = async (staffId) => {
    try {
      const response = await api.delete(`/bookings/staff-names/${staffId}`);
      const updatedNames = response.data.staffNames || formData.staffNames.filter(s => s.id !== staffId);
      setFormData(prev => ({
        ...prev,
        staffNames: updatedNames
      }));
      setStaffOptions(updatedNames);
      toast.success('Staff removed');
    } catch (error) {
      toast.error('Failed to delete staff');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (!formData.customerName || !formData.customerPhone) {
      toast.error('Customer Name and Phone are required!');
      setLoading(false);
      return;
    }

    if (!formData.bookedBy.name) {
      toast.error('Please select staff member who took the booking');
      setLoading(false);
      return;
    }

    try {
      await api.post('/bookings/manual-booking', {
        ...formData,
        roomIds: selectedRooms,
        roomId: selectedRooms.join(', '),
        advancePaid: Number(formData.advancePayment) || 0,
        adults: formData.guestComposition.adults,
        sessionId
      });

      toast.success('✅ Booking created & synced to PMS!');
      setMessage('✅ Booking created successfully!');

      setTimeout(() => {
        setSelectedRooms([]);
        setTotalCapacity(0);
        setFormData({
          customerName: '',
          customerPhone: '+91',
          checkInDate: new Date().toISOString().split('T')[0],
          checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          packageType: 'couple',
          mealOption: 'B->D',
          guestComposition: { adults: 2, children: 0 },
          bookedBy: { name: '', staffId: '' },
          staffNames: staffOptions,
          roomId: '',
          guestIdProofType: 'aadhaar',
          guestIdProofPhoto: null,
          totalAmount: 3500,
          advancePayment: 0,
          remainingPayment: 3500,
          isFullPaid: false,
          notes: ''
        });
        setMessage('');
      }, 1200);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error creating booking');
      setMessage(error.response?.data?.error || 'Error creating booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden animate-fade-in text-slate-800 mb-16 lg:mb-4">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 px-3.5 py-3 sm:px-6 sm:py-4 text-white flex items-center justify-between gap-2 border-b border-emerald-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-sm shrink-0">
            <FileEdit size={18} className="text-emerald-300" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-display font-extrabold leading-none tracking-tight">
              Add Manual Reservation
            </h2>
            <p className="text-[11px] text-emerald-200/90 font-medium mt-1">
              Front Desk Entry • Instant Availability & PMS Sync
            </p>
          </div>
        </div>
        
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-100 text-xs font-bold border border-emerald-400/30 shrink-0">
          <Sparkles size={12} className="text-emerald-300 animate-pulse" /> Live Sync
        </span>
      </div>

      {message && (
        <div className="mx-3.5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold text-xs flex items-center gap-2 shadow-2xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* SINGLE-PAGE COMPACT FORM GRID */}
      <form onSubmit={handleSubmit} className="p-3 sm:p-5">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
          
          {/* LEFT SECTION (Col 1-7): Guest Info, Package & Rooms */}
          <div className="md:col-span-7 space-y-3">
            
            {/* 1. DATES & GUEST CONTACT */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 shadow-2xs">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Calendar size={14} className="text-emerald-600" /> Stay Dates & Guest Info
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Check-in Date *</label>
                  <input
                    type="date"
                    name="checkInDate"
                    value={formData.checkInDate}
                    onChange={(e) => handleDateChange('checkInDate', e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Check-out Date *</label>
                  <input
                    type="date"
                    name="checkOutDate"
                    value={formData.checkOutDate}
                    onChange={(e) => handleDateChange('checkOutDate', e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {formData.checkInDate && formData.checkOutDate && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950 flex flex-wrap items-center justify-between gap-1.5 shadow-2xs">
                  <span>In: <strong>{formatDateDDMMYYYY(formData.checkInDate)}</strong> ({getDayName(formData.checkInDate)})</span>
                  <span>Out: <strong>{formatDateDDMMYYYY(formData.checkOutDate)}</strong> ({getDayName(formData.checkOutDate)})</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Guest Full Name *</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      name="customerName"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.customerName}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">WhatsApp Phone Number *</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      name="customerPhone"
                      placeholder="+919876543210"
                      value={formData.customerPhone}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. PACKAGE TYPE & GUEST COUNT */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 shadow-2xs">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Package size={14} className="text-emerald-600" /> Package Type & Guest Count
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'couple', label: 'Couple Stay', sub: '2 Adults' },
                  { id: 'group', label: 'Group Stay', sub: 'Family/Group' },
                  { id: 'oneDay', label: 'One Day', sub: 'Picnic' }
                ].map((pkg) => (
                  <button
                    type="button"
                    key={pkg.id}
                    onClick={() => {
                      setFormData(prev => {
                        let out = prev.checkOutDate;
                        if (pkg.id === 'oneDay') {
                          out = prev.checkInDate; // One Day picnic defaults to same day!
                        } else if (out <= prev.checkInDate) {
                          out = new Date(new Date(prev.checkInDate).getTime() + 86400000).toISOString().split('T')[0];
                        }
                        return {
                          ...prev,
                          packageType: pkg.id,
                          checkOutDate: out
                        };
                      });
                    }}
                    className={`p-2.5 text-left rounded-xl border transition-all select-none ${
                      formData.packageType === pkg.id
                        ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-md scale-[1.02]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold">{pkg.label}</span>
                      {formData.packageType === pkg.id && <Check size={12} />}
                    </div>
                    <span className={`text-[10px] block mt-0.5 ${formData.packageType === pkg.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {pkg.sub}
                    </span>
                  </button>
                ))}
              </div>

              {/* Meal Options for One Day Picnic */}
              {formData.packageType === 'oneDay' && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 space-y-2">
                  <label className="block text-xs font-extrabold text-sky-950">
                    Meal Option Timing:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'B->D', label: 'B → D (Breakfast to Dinner)', time: '9:00 am - 9:30 pm' },
                      { value: 'B->T', label: 'B → Tea (Breakfast to Hi-Tea)', time: '9:00 am - 6:30 pm' }
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                          formData.mealOption === opt.value
                            ? 'bg-sky-600 text-white border-sky-600 font-bold shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-sky-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mealOption"
                          value={opt.value}
                          checked={formData.mealOption === opt.value}
                          onChange={(e) => setFormData(prev => ({ ...prev, mealOption: e.target.value }))}
                          className="sr-only"
                        />
                        <span className="text-xs font-extrabold block">{opt.label}</span>
                        <span className={`text-[10px] block mt-0.5 ${formData.mealOption === opt.value ? 'text-sky-100' : 'text-slate-500'}`}>
                          {opt.time}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Guest Counts */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Adults (12+ Yrs)</label>
                  <input
                    type="number"
                    min="1"
                    name="guestComposition.adults"
                    value={formData.guestComposition.adults}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl bg-white text-center shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Children (&lt;12 Yrs)</label>
                  <input
                    type="number"
                    min="0"
                    name="guestComposition.children"
                    value={formData.guestComposition.children}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl bg-white text-center shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* 3. MULTI-ROOM SELECTION GRID */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Building size={14} className="text-emerald-600" /> Select Cottage Rooms
                </h3>
                <div className="flex items-center gap-2">
                  {isLoadingRooms && (
                    <span className="text-[10px] text-emerald-700 font-bold animate-pulse">
                      ⏳ Syncing availability...
                    </span>
                  )}
                  {selectedRooms.length > 0 && (
                    <span className="text-xs text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full font-bold border border-emerald-300 shadow-2xs">
                      Cap: {totalCapacity} ({selectedRooms.length} {selectedRooms.length === 1 ? 'room' : 'rooms'})
                    </span>
                  )}
                </div>
              </div>

              {/* Overall Availability Message Banner */}
              {availabilityMessage && (
                <div className={`p-2.5 rounded-xl text-xs font-bold border flex items-center justify-between shadow-2xs ${
                  availabilityMessage.includes('✅')
                    ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                    : 'bg-amber-50 text-amber-950 border-amber-300'
                }`}>
                  <span>{availabilityMessage}</span>
                </div>
              )}

              {/* 15-Minute Reservation Lock Banner */}
              {reservationExpiry && (
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-center justify-between font-semibold shadow-2xs">
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-600 animate-pulse" />
                    Rooms locked for 15 mins
                  </span>
                  <span className="font-extrabold text-amber-900">
                    Expires at {reservationExpiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {roomsList.length > 0 ? (
                <div className="max-h-56 overflow-y-auto space-y-2.5 p-2 bg-white border border-slate-200 rounded-xl no-scrollbar">
                  {Object.entries(roomsBySeries).map(([seriesName, rooms]) => (
                    <div key={seriesName} className="space-y-1.5">
                      <div className="text-xs font-extrabold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center justify-between">
                        <span>🏡 {seriesName}</span>
                        <span className="text-[10px] text-emerald-700 font-bold">{rooms.filter(r => r.status === 'available' || r.status === 'reserved_by_you').length} available</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {rooms.map((room) => {
                          const num = String(room.number || room.roomNumber || room._id);
                          const cap = room.capacity || 4;
                          const isChecked = selectedRooms.includes(num);

                          const isAvailable = room.status === 'available';
                          const isReservedByYou = room.status === 'reserved_by_you';
                          const isReservedByOther = room.status === 'reserved_by_other';
                          const isBooked = room.status === 'booked';
                          const isMaintenance = room.status === 'maintenance';
                          const isDisabled = isBooked || isReservedByOther || isMaintenance;

                          let cardStyle = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer';
                          if (isChecked || isReservedByYou) {
                            cardStyle = 'bg-emerald-700 text-white border-emerald-700 font-bold shadow-xs cursor-pointer';
                          } else if (isMaintenance) {
                            cardStyle = 'bg-amber-100 text-amber-950 border-amber-300 font-semibold opacity-90 cursor-not-allowed';
                          } else if (isReservedByOther) {
                            cardStyle = 'bg-rose-50 text-rose-900 border-rose-300 opacity-60 cursor-not-allowed';
                          } else if (isBooked) {
                            cardStyle = 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed';
                          }

                          return (
                            <label
                              key={num}
                              onClick={() => !isDisabled && handleRoomToggle(room)}
                              className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between select-none active:scale-95 ${cardStyle}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-extrabold">Room {num}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked || isReservedByYou}
                                  disabled={isDisabled}
                                  onChange={() => {}}
                                  className="w-4 h-4 accent-emerald-600 rounded"
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] mt-1.5 opacity-90">
                                <span>Cap: {cap}</span>
                                <span className="font-extrabold uppercase">
                                  {isMaintenance
                                    ? `🔧 LOCK`
                                    : isBooked
                                    ? 'Booked'
                                    : isReservedByOther
                                    ? 'Held'
                                    : isReservedByYou || isChecked
                                    ? 'Selected'
                                    : 'Available'}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-100 p-3 rounded-xl border border-slate-200 text-center font-medium">
                  No available rooms for selected dates.
                </p>
              )}

              {selectedRooms.length > 0 && (
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-xs flex items-center justify-between font-semibold shadow-2xs">
                  <span>Selected Rooms: <strong>{selectedRooms.join(', ')}</strong></span>
                  {formData.guestComposition.adults + formData.guestComposition.children > totalCapacity && (
                    <span className="text-rose-700 font-extrabold">⚠️ Exceeds capacity!</span>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SECTION (Col 8-12): Staff Handover, ID Proof & Payment */}
          <div className="md:col-span-5 space-y-3">
            
            {/* 4. STAFF HANDOVER */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2.5 shadow-2xs">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Users size={14} className="text-emerald-600" /> Staff Member (Booked By)
              </h3>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Staff Member *</label>
                <select
                  name="bookedByName"
                  value={formData.bookedBy.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <option value="">-- Select Staff Member --</option>
                  {formData.staffNames.map(staff => (
                    <option key={staff.id} value={staff.name}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Roster Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase">Roster:</span>
                {formData.staffNames.map(staff => (
                  <span
                    key={staff.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${
                      formData.bookedBy.name === staff.name
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    {staff.name}
                    <button type="button" onClick={() => handleDeleteStaff(staff.id)} className="hover:text-rose-300 ml-0.5 font-bold">×</button>
                  </span>
                ))}
                {!showAddStaff ? (
                  <button
                    type="button"
                    onClick={() => setShowAddStaff(true)}
                    className="text-xs font-extrabold text-emerald-700 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                  >
                    + Add Staff
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Name..."
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white w-24 font-semibold"
                    />
                    <button type="button" onClick={handleAddStaff} className="px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-xs">Save</button>
                    <button type="button" onClick={() => setShowAddStaff(false)} className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">✕</button>
                  </div>
                )}
              </div>
            </div>

            {/* 5. ID PROOF & NOTES */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2.5 shadow-2xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ID Proof Type</label>
                  <select
                    name="guestIdProofType"
                    value={formData.guestIdProofType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white shadow-2xs"
                  >
                    <option value="aadhaar">Aadhaar Card</option>
                    <option value="pan">PAN Card</option>
                    <option value="license">Driver License</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Upload ID Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="w-full text-xs text-slate-500 file:mr-1 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-100 file:text-emerald-900 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Notes / Special Requests (Optional)</label>
                <textarea
                  name="notes"
                  placeholder="Extra mattress, Jain meal preference..."
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={2}
                  maxLength={500}
                  className="w-full p-2.5 text-xs font-medium border border-slate-300 rounded-xl bg-white resize-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>
            </div>

            {/* 6. PAYMENT SUMMARY & SUBMIT BUTTON */}
            <div className="p-4 rounded-2xl bg-slate-950 text-white space-y-3 shadow-xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CreditCard size={14} /> Payment Breakdown
                </h3>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isFullPaid}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      const total = parseFloat(formData.totalAmount) || 0;
                      setFormData(prev => ({
                        ...prev,
                        isFullPaid: isChecked,
                        advancePayment: isChecked ? total : 0,
                        remainingPayment: isChecked ? 0 : total
                      }));
                    }}
                    className="w-4 h-4 text-emerald-500 rounded accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-emerald-300">✓ Mark Full Paid</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-300 mb-1">Total (₹) *</label>
                  <input
                    type="number"
                    name="totalAmount"
                    value={formData.totalAmount}
                    onChange={handleInputChange}
                    required
                    className="w-full px-2.5 py-2 text-sm font-extrabold border border-slate-700 rounded-xl bg-slate-900 text-white text-center shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-emerald-400 mb-1">Advance (₹)</label>
                  <input
                    type="number"
                    name="advancePayment"
                    value={formData.advancePayment}
                    onChange={handleInputChange}
                    className="w-full px-2.5 py-2 text-sm font-extrabold border border-emerald-800 rounded-xl bg-emerald-950 text-emerald-300 text-center shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-amber-400 mb-1">Balance (₹)</label>
                  <input
                    type="number"
                    readOnly
                    value={formData.remainingPayment}
                    className="w-full px-2.5 py-2 text-sm font-extrabold border border-amber-800 bg-amber-950 text-amber-300 rounded-xl text-center shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white font-display font-extrabold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Creating Reservation...' : '✓ Create & Confirm Reservation'}
              </button>
            </div>

          </div>

        </div>

      </form>
    </div>
  );
};

export default ManualBookingForm;
