import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  FileEdit,
  User,
  Phone,
  Calendar,
  Package,
  Users,
  UserCheck,
  Plus,
  Check,
  CreditCard,
  Building,
  Upload,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import '../styles/ManualBookingForm.css';

const ManualBookingForm = () => {
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '+91',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    packageType: 'couple',
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

  const [activeTab, setActiveTab] = useState('step1'); // 'step1' | 'step2' for mobile view
  const [staffOptions, setStaffOptions] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
      const res = await api.get('/availability/rooms', { params: { checkInDate: checkIn, checkOutDate: checkOut } });
      setAvailableRooms(res.data.rooms || []);
    } catch (err) {
      setAvailableRooms([]);
    }
  };

  const handleDateChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    if (field === 'checkInDate') {
      fetchRooms(value, formData.checkOutDate);
    } else if (field === 'checkOutDate') {
      fetchRooms(formData.checkInDate, value);
    }
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
      const updated = response.data.staffNames || formData.staffNames.filter(s => s.id !== staffId);
      setFormData(prev => ({
        ...prev,
        staffNames: updated,
        bookedBy: prev.bookedBy.staffId === staffId ? { name: '', staffId: '' } : prev.bookedBy
      }));
      setStaffOptions(updated);
      toast.success('Staff removed');
    } catch (error) {
      toast.error('Failed to delete staff');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.customerName.trim() || !formData.customerPhone.trim()) {
      toast.error('Customer name and phone number are required');
      setActiveTab('step1');
      setLoading(false);
      return;
    }

    if (!formData.bookedBy.name) {
      toast.error('Please select staff member who took the booking');
      setActiveTab('step2');
      setLoading(false);
      return;
    }

    try {
      await api.post('/bookings/manual-booking', {
        ...formData,
        advancePaid: Number(formData.advancePayment) || 0,
        adults: formData.guestComposition.adults
      });

      toast.success('✅ Booking created & synced to PMS!');
      setMessage('✅ Booking created successfully!');

      setTimeout(() => {
        setFormData({
          customerName: '',
          customerPhone: '+91',
          checkInDate: new Date().toISOString().split('T')[0],
          checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          packageType: 'couple',
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
        setActiveTab('step1');
      }, 1500);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error creating booking');
      setMessage(error.response?.data?.error || 'Error creating booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto my-1 sm:my-2 bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden animate-fade-in">
      {/* Compact Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 px-4 py-3 sm:px-6 sm:py-4 text-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
            <FileEdit size={18} className="text-emerald-200" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-display font-extrabold leading-tight">
              Add Manual Reservation
            </h2>
            <p className="text-[11px] text-emerald-100/90 font-medium hidden sm:block">
              Front Desk Entry • Direct PMS Sync
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-100 text-[10px] sm:text-xs font-bold border border-emerald-400/30">
          <Sparkles size={11} className="text-emerald-300" /> Live Sync
        </span>
      </div>

      {message && (
        <div className="m-3 mb-0 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Mobile Step Switcher Tabs (Visible on screens < 1024px) */}
      <div className="lg:hidden flex border-b border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('step1')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'step1'
              ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>1. Dates & Package</span>
          {formData.customerName && formData.customerPhone !== '+91' && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('step2')}
          className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'step2'
              ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>2. Room & Payment</span>
          {formData.bookedBy.name && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-5">
        {/* 2-Column Responsive Grid on Desktop (lg:grid-cols-2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* LEFT COLUMN: STEP 1 (Dates, Guest Info, Package & Composition) */}
          <div className={`space-y-4 ${activeTab === 'step2' ? 'hidden lg:block' : 'block'}`}>
            
            {/* 1. DATES & GUEST INFO */}
            <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Calendar size={15} /> Dates & Guest Info
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Check-in *</label>
                  <input
                    type="date"
                    name="checkInDate"
                    value={formData.checkInDate}
                    onChange={(e) => handleDateChange('checkInDate', e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Check-out *</label>
                  <input
                    type="date"
                    name="checkOutDate"
                    value={formData.checkOutDate}
                    onChange={(e) => handleDateChange('checkOutDate', e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Guest Name *</label>
                  <div className="relative">
                    <User size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      name="customerName"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.customerName}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Guest Phone *</label>
                  <div className="relative">
                    <Phone size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      name="customerPhone"
                      placeholder="+919876543210"
                      value={formData.customerPhone}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. PACKAGE TYPE & GUESTS */}
            <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Package size={15} /> Package Type & Guests
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
                    onClick={() => setFormData(prev => ({ ...prev, packageType: pkg.id }))}
                    className={`p-2 text-left rounded-xl border transition-all ${
                      formData.packageType === pkg.id
                        ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-xs'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] block leading-tight">{pkg.label}</span>
                      {formData.packageType === pkg.id && <Check size={11} />}
                    </div>
                    <span className={`text-[9px] block ${formData.packageType === pkg.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {pkg.sub}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Adults (12+ Yrs)</label>
                  <input
                    type="number"
                    min="1"
                    name="guestComposition.adults"
                    value={formData.guestComposition.adults}
                    onChange={handleInputChange}
                    className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Children (&lt;12 Yrs)</label>
                  <input
                    type="number"
                    min="0"
                    name="guestComposition.children"
                    value={formData.guestComposition.children}
                    onChange={handleInputChange}
                    className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
                  />
                </div>
              </div>

              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Users size={13} className="text-emerald-700" /> Summary:
                </span>
                <span>{formData.guestComposition.adults} Adults + {formData.guestComposition.children} Children</span>
              </div>
            </div>

            {/* Mobile Next Step Button */}
            <div className="lg:hidden pt-1">
              <button
                type="button"
                onClick={() => setActiveTab('step2')}
                className="w-full py-2.5 px-4 bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1"
              >
                <span>Continue to Room & Payment</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: STEP 2 (Room, Staff, ID Proof, Notes & Payment) */}
          <div className={`space-y-4 ${activeTab === 'step1' ? 'hidden lg:block' : 'block'}`}>
            
            {/* 3. ROOM & STAFF SELECTION */}
            <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Building size={15} /> Room & Staff Handover
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Assign Cottage Room</label>
                  <select
                    name="roomId"
                    value={formData.roomId}
                    onChange={handleInputChange}
                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="">-- Assign Later --</option>
                    {availableRooms.map(r => (
                      <option key={r.roomId} value={r.roomId}>
                        Room {r.roomNumber} ({r.seriesName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Booked By (Staff) *</label>
                  <select
                    name="bookedByName"
                    value={formData.bookedBy.name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="">-- Select Staff --</option>
                    {formData.staffNames.map(staff => (
                      <option key={staff.id} value={staff.name}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compact Staff Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-500 mr-1">Roster:</span>
                {formData.staffNames.map(staff => (
                  <span
                    key={staff.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                      formData.bookedBy.name === staff.name
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-700 border border-slate-200'
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
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200"
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
                      className="px-1.5 py-0.5 text-[10px] border border-slate-300 rounded bg-white w-20"
                    />
                    <button type="button" onClick={handleAddStaff} className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded">Save</button>
                    <button type="button" onClick={() => setShowAddStaff(false)} className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded">✕</button>
                  </div>
                )}
              </div>
            </div>

            {/* 4. ID PROOF & NOTES */}
            <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">ID Proof Type</label>
                  <select
                    name="guestIdProofType"
                    value={formData.guestIdProofType}
                    onChange={handleInputChange}
                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="aadhaar">Aadhaar Card</option>
                    <option value="pan">PAN Card</option>
                    <option value="license">License</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Upload ID Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="w-full text-[10px] text-slate-500 file:mr-1 file:py-0.5 file:px-1.5 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-emerald-100 file:text-emerald-800 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Notes / Special Requests (Optional)</label>
                <textarea
                  name="notes"
                  placeholder="Extra mattress? Birthday setup? Jain meal request..."
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={2}
                  maxLength={500}
                  className="w-full p-2 text-xs font-medium border border-slate-300 rounded-xl bg-white"
                />
              </div>
            </div>

            {/* 5. PAYMENT & SUBMIT */}
            <div className="p-3.5 rounded-2xl bg-emerald-950 text-white space-y-3 shadow-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <CreditCard size={15} /> Payment Details & Submit
              </h3>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-emerald-200 mb-0.5">Total (₹) *</label>
                  <input
                    type="number"
                    name="totalAmount"
                    value={formData.totalAmount}
                    onChange={handleInputChange}
                    required
                    className="w-full px-2 py-1.5 text-xs font-bold border border-emerald-700 rounded-lg bg-emerald-900/50 text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-emerald-200 mb-0.5">Advance (₹)</label>
                  <input
                    type="number"
                    name="advancePayment"
                    value={formData.advancePayment}
                    onChange={handleInputChange}
                    className="w-full px-2 py-1.5 text-xs font-bold border border-emerald-700 rounded-lg bg-emerald-900/50 text-emerald-300"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-300 mb-0.5">Balance (₹)</label>
                  <input
                    type="number"
                    readOnly
                    value={formData.remainingPayment}
                    className="w-full px-2 py-1.5 text-xs font-bold border border-amber-500/50 bg-amber-950/60 text-amber-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => setActiveTab('step1')}
                  className="lg:hidden px-3 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 font-bold text-xs rounded-xl flex items-center gap-1"
                >
                  <ChevronLeft size={15} /> Back
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-display font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? 'Creating Booking...' : '✓ Create & Confirm Booking'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
};

export default ManualBookingForm;
