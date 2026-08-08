import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
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
  Image as ImageIcon
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

  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [newStaffName, setNewStaffName] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Group rooms by Series Name
  const roomsBySeries = useMemo(() => {
    const map = {};
    for (const room of roomsList) {
      const num = String(room.number || room.roomNumber || '');
      const series = room.seriesName || (num.startsWith('2') ? 'Series 200 (Deluxe)' : 'Series 100 (Cottages)');
      if (!map[series]) map[series] = [];
      map[series].push(room);
    }
    return map;
  }, [roomsList]);

  // Fetch staff & rooms on load
  useEffect(() => {
    fetchStaffNames();
    fetchRooms(formData.checkInDate, formData.checkOutDate);
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

  const fetchRooms = async (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return;
    try {
      const res = await api.get('/rooms/availability', { params: { checkInDate: checkIn, checkOutDate: checkOut } });
      const rooms = res.data.rooms || [];
      setRoomsList(rooms);
    } catch (err) {
      console.error('[Form:Rooms] Error:', err);
      setRoomsList([]);
    }
  };

  useEffect(() => {
    if (formData.checkInDate && formData.checkOutDate) {
      fetchRooms(formData.checkInDate, formData.checkOutDate);
      setSelectedRooms([]);
      setTotalCapacity(0);
    }
  }, [formData.checkInDate, formData.checkOutDate]);

  const handleRoomToggle = (roomIdentifier) => {
    const isSelected = selectedRooms.includes(roomIdentifier);
    const newSelection = isSelected
      ? selectedRooms.filter(r => r !== roomIdentifier)
      : [...selectedRooms, roomIdentifier];

    setSelectedRooms(newSelection);

    const cap = newSelection.reduce((sum, num) => {
      const roomObj = roomsList.find(r => (r.number || r.roomNumber || String(r._id)) === num);
      return sum + (roomObj?.capacity || 4);
    }, 0);

    setTotalCapacity(cap);
    setFormData(prev => ({
      ...prev,
      roomId: newSelection.join(', ')
    }));
  };

  const handleDateChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
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
        adults: formData.guestComposition.adults
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
    <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-lg border border-slate-200/90 overflow-hidden animate-fade-in text-slate-800">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 px-3.5 py-2.5 sm:px-5 sm:py-3 text-white flex items-center justify-between gap-2 border-b border-emerald-700/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
            <FileEdit size={16} className="text-emerald-200" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-display font-extrabold leading-none tracking-tight">
              Add Manual Reservation
            </h2>
            <p className="text-[10px] text-emerald-200/90 font-medium mt-0.5">
              Front Desk Entry • Single Page PMS Direct Sync
            </p>
          </div>
        </div>
        
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-100 text-[10px] font-bold border border-emerald-400/30">
          <Sparkles size={10} className="text-emerald-300" /> Live Sync
        </span>
      </div>

      {message && (
        <div className="mx-3 mt-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* SINGLE-PAGE COMPACT FORM GRID */}
      <form onSubmit={handleSubmit} className="p-2.5 sm:p-4">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
          
          {/* LEFT SECTION (Col 1-7): Guest Info, Package & Rooms */}
          <div className="md:col-span-7 space-y-2.5">
            
            {/* 1. DATES & GUEST CONTACT */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <Calendar size={13} /> Dates & Guest Contact
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Check-in *</label>
                  <input
                    type="date"
                    name="checkInDate"
                    value={formData.checkInDate}
                    onChange={(e) => handleDateChange('checkInDate', e.target.value)}
                    required
                    className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Check-out *</label>
                  <input
                    type="date"
                    name="checkOutDate"
                    value={formData.checkOutDate}
                    onChange={(e) => handleDateChange('checkOutDate', e.target.value)}
                    required
                    className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Guest Name *</label>
                  <div className="relative">
                    <User size={12} className="absolute left-2 top-2 text-slate-400" />
                    <input
                      type="text"
                      name="customerName"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.customerName}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-7 pr-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Guest Phone *</label>
                  <div className="relative">
                    <Phone size={12} className="absolute left-2 top-2 text-slate-400" />
                    <input
                      type="text"
                      name="customerPhone"
                      placeholder="+919876543210"
                      value={formData.customerPhone}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-7 pr-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. PACKAGE TYPE & GUEST COUNT */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <Package size={13} /> Package Type & Guest Count
              </h3>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'couple', label: 'Couple Stay', sub: '2 Adults' },
                  { id: 'group', label: 'Group Stay', sub: 'Family/Group' },
                  { id: 'oneDay', label: 'One Day', sub: 'Picnic' }
                ].map((pkg) => (
                  <button
                    type="button"
                    key={pkg.id}
                    onClick={() => setFormData(prev => ({ ...prev, packageType: pkg.id }))}
                    className={`p-1.5 text-left rounded-lg border transition-all ${
                      formData.packageType === pkg.id
                        ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] leading-none font-bold">{pkg.label}</span>
                      {formData.packageType === pkg.id && <Check size={10} />}
                    </div>
                    <span className={`text-[9px] block mt-0.5 ${formData.packageType === pkg.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {pkg.sub}
                    </span>
                  </button>
                ))}
              </div>

              {/* Meal Options for One Day Picnic */}
              {formData.packageType === 'oneDay' && (
                <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 space-y-1">
                  <label className="block text-[10px] font-bold text-sky-900">
                    Meal Option:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { value: 'B->D', label: 'B → D', time: '9am - 9:30pm' },
                      { value: 'B->T', label: 'B → Tea', time: '9am - 6:30pm' },
                      { value: 'B->L', label: 'B → Lunch', time: '9am - 2:30pm' }
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className={`p-1.5 rounded-md border text-center cursor-pointer transition-all ${
                          formData.mealOption === opt.value
                            ? 'bg-sky-600 text-white border-sky-600 font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200'
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
                        <span className="text-[10px] font-bold block">{opt.label}</span>
                        <span className={`text-[8px] block ${formData.mealOption === opt.value ? 'text-sky-100' : 'text-slate-400'}`}>
                          {opt.time}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Guest Counts */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Adults (12+ Yrs)</label>
                  <input
                    type="number"
                    min="1"
                    name="guestComposition.adults"
                    value={formData.guestComposition.adults}
                    onChange={handleInputChange}
                    className="w-full px-2 py-1 text-xs font-bold border border-slate-300 rounded-lg bg-white text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Children (&lt;12 Yrs)</label>
                  <input
                    type="number"
                    min="0"
                    name="guestComposition.children"
                    value={formData.guestComposition.children}
                    onChange={handleInputChange}
                    className="w-full px-2 py-1 text-xs font-bold border border-slate-300 rounded-lg bg-white text-center"
                  />
                </div>
              </div>
            </div>

            {/* 3. MULTI-ROOM SELECTION GRID */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                  <Building size={13} /> Select Cottage Rooms
                </h3>
                {selectedRooms.length > 0 && (
                  <span className="text-[9px] text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full font-bold border border-emerald-300">
                    Cap: {totalCapacity} ({selectedRooms.length} {selectedRooms.length === 1 ? 'room' : 'rooms'})
                  </span>
                )}
              </div>

              {roomsList.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-2 p-1.5 bg-white border border-slate-200 rounded-lg">
                  {Object.entries(roomsBySeries).map(([seriesName, rooms]) => (
                    <div key={seriesName} className="space-y-1">
                      <div className="text-[10px] font-extrabold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80 flex items-center justify-between">
                        <span>🏷️ {seriesName}</span>
                        <span className="text-[9px] text-emerald-700 font-bold">{rooms.length} available</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {rooms.map((room) => {
                          const num = room.number || room.roomNumber || String(room._id);
                          const cap = room.capacity || 4;
                          const isChecked = selectedRooms.includes(num);
                          return (
                            <label
                              key={num}
                              onClick={() => handleRoomToggle(num)}
                              className={`p-1.5 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between select-none ${
                                isChecked
                                  ? 'bg-emerald-700 text-white border-emerald-700 font-bold shadow-2xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">Room {num}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  readOnly
                                  className="w-3.5 h-3.5 accent-emerald-600 rounded"
                                />
                              </div>
                              <div className={`text-[9px] font-bold mt-1 ${isChecked ? 'text-emerald-100' : 'text-slate-500'}`}>
                                Cap: <span className="underline">{cap} Guests</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                  No available rooms for selected dates.
                </p>
              )}

              {selectedRooms.length > 0 && (
                <div className="p-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[10px] flex items-center justify-between">
                  <span>Selected: <strong>{selectedRooms.join(', ')}</strong></span>
                  {formData.guestComposition.adults + formData.guestComposition.children > totalCapacity && (
                    <span className="text-rose-700 font-bold">⚠️ Exceeds capacity!</span>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SECTION (Col 8-12): Staff Handover, ID Proof & Payment */}
          <div className="md:col-span-5 space-y-2.5">
            
            {/* 4. STAFF HANDOVER */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <Users size={13} /> Staff Handover
              </h3>

              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Booked By (Staff) *</label>
                <select
                  name="bookedByName"
                  value={formData.bookedBy.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500"
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
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[9px] font-bold text-slate-400">Roster:</span>
                {formData.staffNames.map(staff => (
                  <span
                    key={staff.id}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                      formData.bookedBy.name === staff.name
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {staff.name}
                    <button type="button" onClick={() => handleDeleteStaff(staff.id)} className="hover:text-rose-300">×</button>
                  </span>
                ))}
                {!showAddStaff ? (
                  <button
                    type="button"
                    onClick={() => setShowAddStaff(true)}
                    className="text-[9px] font-bold text-emerald-700 px-1 py-0.2 rounded bg-emerald-50 border border-emerald-200"
                  >
                    + Add
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="Name..."
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="px-1 py-0.2 text-[9px] border border-slate-300 rounded bg-white w-16"
                    />
                    <button type="button" onClick={handleAddStaff} className="px-1 py-0.2 bg-emerald-600 text-white text-[9px] font-bold rounded">Save</button>
                    <button type="button" onClick={() => setShowAddStaff(false)} className="px-1 py-0.2 bg-slate-200 text-slate-700 text-[9px] font-bold rounded">✕</button>
                  </div>
                )}
              </div>
            </div>

            {/* 5. ID PROOF & NOTES */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">ID Type</label>
                  <select
                    name="guestIdProofType"
                    value={formData.guestIdProofType}
                    onChange={handleInputChange}
                    className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="aadhaar">Aadhaar Card</option>
                    <option value="pan">PAN Card</option>
                    <option value="license">License</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Upload ID</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="w-full text-[9px] text-slate-500 file:mr-1 file:py-0.5 file:px-1 file:rounded file:border-0 file:text-[9px] file:font-semibold file:bg-emerald-100 file:text-emerald-800 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Notes / Special Requests (Optional)</label>
                <textarea
                  name="notes"
                  placeholder="Extra mattress, Jain meal..."
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={2}
                  maxLength={500}
                  className="w-full p-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white resize-none"
                />
              </div>
            </div>

            {/* 6. PAYMENT SUMMARY & SUBMIT BUTTON */}
            <div className="p-3 rounded-xl bg-slate-900 text-white space-y-2.5 shadow-md">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <CreditCard size={13} /> Payment Breakdown
              </h3>

              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[9px] font-bold text-slate-300 mb-0.5">Total (₹) *</label>
                  <input
                    type="number"
                    name="totalAmount"
                    value={formData.totalAmount}
                    onChange={handleInputChange}
                    required
                    className="w-full px-2 py-1 text-xs font-bold border border-slate-700 rounded-lg bg-slate-800 text-white text-center"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-emerald-300 mb-0.5">Advance (₹)</label>
                  <input
                    type="number"
                    name="advancePayment"
                    value={formData.advancePayment}
                    onChange={handleInputChange}
                    className="w-full px-2 py-1 text-xs font-bold border border-emerald-700/60 rounded-lg bg-emerald-950/80 text-emerald-300 text-center"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-amber-300 mb-0.5">Balance (₹)</label>
                  <input
                    type="number"
                    readOnly
                    value={formData.remainingPayment}
                    className="w-full px-2 py-1 text-xs font-bold border border-amber-500/50 bg-amber-950/80 text-amber-300 rounded-lg text-center"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white font-display font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
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
