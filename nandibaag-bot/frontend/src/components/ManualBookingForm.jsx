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
  Trash2,
  Check,
  CreditCard,
  Building,
  Upload,
  StickyNote,
  Sparkles,
  CheckCircle2
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
      toast.success('📷 ID Proof photo attached');
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
      toast.success('Staff member added');
    } catch (error) {
      toast.error('Failed to add staff member');
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
      toast.success('Staff member removed');
    } catch (error) {
      toast.error('Failed to delete staff member');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.customerName.trim() || !formData.customerPhone.trim()) {
      toast.error('Customer name and phone number are required');
      setLoading(false);
      return;
    }

    if (!formData.bookedBy.name) {
      toast.error('Please select staff member who took the booking');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/bookings/manual-booking', {
        ...formData,
        adults: formData.guestComposition.adults
      });

      toast.success('✅ Manual Booking created and synced successfully!');
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
      }, 2000);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error creating booking');
      setMessage(error.response?.data?.error || 'Error creating booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto my-6 bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 p-6 md:p-8 text-white relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
                <FileEdit size={22} className="text-emerald-200" />
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight">
                Add Manual Reservation
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-emerald-100/90 font-medium pl-0.5">
              Create instant front-desk bookings, assign cottages & track staff handovers.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-100 text-xs font-bold border border-emerald-400/30 backdrop-blur-sm">
            <Sparkles size={13} className="text-emerald-300" /> Direct PMS Sync
          </span>
        </div>
      </div>

      {message && (
        <div className="m-6 mb-0 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
        
        {/* 1. DATES & CUSTOMER INFO */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Calendar size={16} /> 1. Booking Dates & Customer Info
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check-in Date *</label>
              <input
                type="date"
                name="checkInDate"
                value={formData.checkInDate}
                onChange={(e) => handleDateChange('checkInDate', e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check-out Date *</label>
              <input
                type="date"
                name="checkOutDate"
                value={formData.checkOutDate}
                onChange={(e) => handleDateChange('checkOutDate', e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Guest Full Name *</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  name="customerName"
                  placeholder="e.g. Rahul Sharma"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  required
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Guest Phone Number *</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  name="customerPhone"
                  placeholder="+919876543210"
                  value={formData.customerPhone}
                  onChange={handleInputChange}
                  required
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. PACKAGE TYPE & GUEST COMPOSITION */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Package size={16} /> 2. Package Type & Guest Composition
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: 'couple', title: 'Couple Stay', desc: 'Standard 2 Adult Package', badge: 'Popular' },
              { id: 'group', title: 'Group Stay', desc: 'Family & Group Cottages', badge: 'Group' },
              { id: 'oneDay', title: 'One Day Picnic', desc: 'Day Access & Food', badge: 'Day Trip' }
            ].map((pkg) => (
              <div
                key={pkg.id}
                onClick={() => setFormData(prev => ({ ...prev, packageType: pkg.id }))}
                className={`cursor-pointer p-4 rounded-2xl border-2 transition-all relative ${
                  formData.packageType === pkg.id
                    ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-800">{pkg.title}</span>
                  {formData.packageType === pkg.id && (
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check size={12} />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{pkg.desc}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adult Guests (12+ Yrs)</label>
              <input
                type="number"
                min="1"
                name="guestComposition.adults"
                value={formData.guestComposition.adults}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Children (Under 12 Yrs)</label>
              <input
                type="number"
                min="0"
                name="guestComposition.children"
                value={formData.guestComposition.children}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Users size={16} className="text-emerald-700" /> Guest Summary:
            </span>
            <span className="px-3 py-1 rounded-full bg-white text-emerald-800 shadow-xs border border-emerald-200">
              {formData.guestComposition.adults} Adults + {formData.guestComposition.children} Children
            </span>
          </div>
        </div>

        {/* 3. COTTAGE ROOM SELECTION & STAFF HANDOVER */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Building size={16} /> 3. Cottage Room & Staff Handover
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Cottage Room</label>
              <select
                name="roomId"
                value={formData.roomId}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              >
                <option value="">-- Assign Room Later --</option>
                {availableRooms.map(r => (
                  <option key={r.roomId} value={r.roomId}>
                    Room {r.roomNumber} ({r.seriesName} • Cap: {r.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Booked By (Staff Member) *</label>
              <select
                name="bookedByName"
                value={formData.bookedBy.name}
                onChange={handleInputChange}
                required
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              >
                <option value="">-- Select Staff Member --</option>
                {formData.staffNames.map(staff => (
                  <option key={staff.id} value={staff.name}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Staff List & Add */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <UserCheck size={15} className="text-emerald-600" /> Active Staff Roster
              </span>
              {!showAddStaff && (
                <button
                  type="button"
                  onClick={() => setShowAddStaff(true)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Staff
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {formData.staffNames.map(staff => (
                <div
                  key={staff.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    formData.bookedBy.name === staff.name
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{staff.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteStaff(staff.id)}
                    className="hover:text-rose-300 ml-1"
                    title="Remove staff"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {showAddStaff && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  placeholder="New staff name..."
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddStaff}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddStaff(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. ID PROOF & NOTES */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Upload size={16} /> 4. ID Proof & Special Notes
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ID Proof Type</label>
              <select
                name="guestIdProofType"
                value={formData.guestIdProofType}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl bg-slate-50/50"
              >
                <option value="aadhaar">Aadhaar Card</option>
                <option value="pan">PAN Card</option>
                <option value="license">Driving License</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Upload ID Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Special Requests (Optional)</label>
            <textarea
              name="notes"
              placeholder="Extra mattress? Birthday setup? Jain meal request? Write notes here..."
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              maxLength={500}
              className="w-full p-3 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
            <span className="block text-right text-[10px] text-slate-400 mt-1">
              {formData.notes.length}/500 chars
            </span>
          </div>
        </div>

        {/* 5. PAYMENT BREAKDOWN & SUBMIT */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <CreditCard size={16} /> 5. Payment Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total Amount (₹) *</label>
              <input
                type="number"
                name="totalAmount"
                value={formData.totalAmount}
                onChange={handleInputChange}
                required
                className="w-full px-3.5 py-2.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-800 mb-1">Advance Paid (₹)</label>
              <input
                type="number"
                name="advancePayment"
                value={formData.advancePayment}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2.5 text-xs font-bold border border-emerald-300 rounded-xl bg-emerald-50/30 text-emerald-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-800 mb-1">Remaining Balance (₹)</label>
              <input
                type="number"
                readOnly
                value={formData.remainingPayment}
                className="w-full px-3.5 py-2.5 text-xs font-bold border border-amber-300 bg-amber-50 text-amber-900 rounded-xl"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-display font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Creating Booking...' : '✓ Create & Confirm Manual Booking'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ManualBookingForm;
