import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDMY } from '../utils/formatters';
import toast from 'react-hot-toast';
import ManualBookingForm from '../components/ManualBookingForm';
import BookingsTableView from '../components/BookingsTableView';
import { groupBookingsByDate } from '../utils/bookingGrouper';
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
  Users,
  Trash2,
  BookOpen,
  DollarSign,
  Printer,
  CheckCheck,
  FileText,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Send
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Draft' },
  pending_payment: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending Payment' },
  confirmed: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Confirmed' },
  cancelled: { bg: 'bg-rose-100', text: 'text-rose-800', label: 'Cancelled' },
  checked_in: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Checked In' },
  checked_out: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Checked Out' },
  no_show: { bg: 'bg-slate-200', text: 'text-slate-800', label: 'No Show' }
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', search: '', date: '' });
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('card');

  // Modals
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [invoiceModal, setInvoiceModal] = useState(null); // Printable receipt modal
  const [idPhotoPreviewModal, setIdPhotoPreviewModal] = useState(null); // ID Photo zoom modal
  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    guestName: '', guestPhone: '+91', guestAddress: '', guestIdProofType: 'aadhaar', guestIdProofPhoto: null,
    bookingType: 'couple', checkInDate: '', checkOutDate: '', adults: 2, kids: [],
    totalAmount: 3500, advancePayment: '', remainingPayment: '', priceBreakdown: '', specialRequests: '', roomId: ''
  });
  const [manualRooms, setManualRooms] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // New manual reservation form enhancement fields
  const [packageType, setPackageType] = useState('couple');
  const [guestComposition, setGuestComposition] = useState({
    adults: 2,
    children: 0
  });
  const [staffNames, setStaffNames] = useState([
    { name: 'Kadambari', id: 'staff_1' },
    { name: 'Ravi', id: 'staff_2' },
    { name: 'Priti', id: 'staff_3' },
    { name: 'Mansi', id: 'staff_4' }
  ]);
  const [bookedBy, setBookedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);

  const fetchStaffNames = async () => {
    try {
      const response = await api.get('/bookings/staff-names');
      if (response.data?.staffNames) {
        setStaffNames(response.data.staffNames);
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  useEffect(() => {
    fetchStaffNames();
  }, []);

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return;
    try {
      const response = await api.post('/bookings/staff-names', {
        name: newStaffName.trim()
      });
      if (response.data?.staff) {
        setStaffNames(prev => [...prev, response.data.staff]);
      }
      setNewStaffName('');
      setShowAddStaff(false);
      toast.success('Staff added successfully');
    } catch (error) {
      console.error('Error adding staff:', error);
      toast.error('Failed to add staff');
    }
  };

  const handleDeleteStaff = async (staffId) => {
    try {
      await api.delete(`/bookings/staff-names/${staffId}`);
      setStaffNames(prev => prev.filter(s => s.id !== staffId));
      if (bookedBy === staffId) setBookedBy('');
      toast.success('Staff removed');
    } catch (error) {
      console.error('Error deleting staff:', error);
      toast.error('Failed to remove staff');
    }
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
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

  const handleCancel = async (bookingId) => {
    setSubmitting(true);
    try {
      await api.patch(`/pms/bookings/${bookingId}/cancel`, { reason: cancelReason });
      toast.success('Booking cancelled & room released');
      setCancelModal(null);
      setCancelReason('');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to permanently delete this booking? The assigned room will be released.')) return;
    try {
      await api.delete(`/pms/bookings/${bookingId}`);
      toast.success('🗑️ Booking deleted & room released');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete booking');
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

  const handlePrintInvoice = (b) => {
    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) {
      toast.error('Please allow popups to print invoices');
      return;
    }

    const checkIn = formatDMY(b.checkInDate || b.date);
    const checkOut = formatDMY(b.checkOutDate || (new Date(b.checkInDate || b.date).getTime() + 86400000));
    const invoiceNo = `NB-${(b._id || '').slice(-6).toUpperCase()}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${b.customerName} - ${invoiceNo}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #0f172a; background: #ffffff; }
            .box { max-width: 680px; margin: auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #047857; padding-bottom: 20px; margin-bottom: 20px; }
            .brand h1 { margin: 0; color: #047857; font-size: 24px; font-weight: 800; }
            .brand p { margin: 4px 0 0 0; color: #64748b; font-size: 12px; }
            .badge { display: inline-block; background: #d1fae5; color: #065f46; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 20px; margin-bottom: 6px; }
            .meta { font-size: 11px; color: #64748b; margin: 2px 0; }
            .details { display: flex; justify-content: space-between; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
            th { background: #f1f5f9; color: #334155; text-align: left; padding: 10px 12px; font-weight: 700; border-bottom: 1px solid #cbd5e1; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
            .text-right { text-align: right; }
            .total-row { background: #f0fdf4; font-weight: 800; color: #065f46; font-size: 14px; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="header">
              <div class="brand">
                <h1>NANDIBAAG RESORT</h1>
                <p>Pure Veg & Jain Resort • Karjat, Maharashtra</p>
                <p>Contact: +91 92576 57665 | GSTIN: 27AABCN1234F1Z5</p>
              </div>
              <div style="text-align: right;">
                <div class="badge">OFFICIAL INVOICE</div>
                <div class="meta"><strong>Invoice #:</strong> ${invoiceNo}</div>
                <div class="meta"><strong>Date:</strong> ${formatDMY(new Date())}</div>
              </div>
            </div>

            <div class="details">
              <div>
                <div style="color: #64748b; font-size: 11px; margin-bottom: 2px;">Guest Information:</div>
                <strong>${b.customerName}</strong>
                <div>${b.customerPhone}</div>
              </div>
              <div style="text-align: right;">
                <div style="color: #64748b; font-size: 11px; margin-bottom: 2px;">Stay Duration:</div>
                <strong>${checkIn} ➔ ${checkOut}</strong>
                <div style="text-transform: capitalize;">Type: ${b.bookingType || 'Couple'}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cottage Stay Package</td>
                  <td class="text-right">₹${b.totalAmount}</td>
                </tr>
                <tr>
                  <td style="color: #047857;">Advance Paid</td>
                  <td class="text-right" style="color: #047857;">- ₹${b.advancePayment || 0}</td>
                </tr>
                <tr class="total-row">
                  <td>Net Balance Due</td>
                  <td class="text-right">₹${b.remainingPayment || 0}</td>
                </tr>
              </tbody>
            </table>

            <div class="footer">
              Thank you for choosing Nandibaag Resort! We wish you a peaceful stay.
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  /**
   * FEATURE #1: 1-CLICK MARK BALANCE PAID
   */
  const handleSettlePayment = async (bookingId, remainingAmount) => {
    if (!window.confirm(`Mark remaining balance of ₹${remainingAmount} as FULLY PAID?`)) return;
    try {
      await api.patch(`/pms/bookings/${bookingId}/settle-payment`);
      toast.success(`💳 Balance of ₹${remainingAmount} marked as FULLY PAID! Receipt sent on WhatsApp.`);
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to settle payment');
    }
  };

  /**
   * FEATURE #3: ID PHOTO FILE UPLOAD TO BASE64
   */
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error('ID photo file size should be less than 15MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
        setManualForm(prev => ({ ...prev, guestIdProofPhoto: compressedBase64 }));
        toast.success('📷 ID Proof photo attached & optimized!');
      };
      img.onerror = () => {
        setManualForm(prev => ({ ...prev, guestIdProofPhoto: reader.result }));
        toast.success('📷 ID Proof photo attached successfully!');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
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

  useEffect(() => {
    if (invoiceModal || idPhotoPreviewModal || cancelModal) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [invoiceModal, idPhotoPreviewModal, cancelModal]);

  useEffect(() => {
    if (manualModal) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const ci = manualForm.checkInDate || new Date().toISOString().split('T')[0];
      const co = manualForm.checkOutDate || new Date(Date.now() + 86400000).toISOString().split('T')[0];
      if (!manualForm.checkInDate || !manualForm.checkOutDate) {
        setManualForm(prev => ({ ...prev, checkInDate: ci, checkOutDate: co }));
      }
      fetchManualRooms(ci, co);
    }
  }, [manualModal]);

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
      const roomIds = manualForm.roomId ? [manualForm.roomId] : [];
      const res = await api.post('/pms/bookings/manual', {
        ...manualForm,
        packageType,
        guestComposition: {
          adults: parseInt(guestComposition.adults) || 1,
          children: parseInt(guestComposition.children) || 0
        },
        bookedBy: { name: bookedBy },
        staffNames,
        notes,
        adults: parseInt(guestComposition.adults) || 1,
        totalAmount: parseFloat(manualForm.totalAmount) || 0,
        advancePayment: parseFloat(manualForm.advancePayment) || 0,
        remainingPayment: parseFloat(manualForm.remainingPayment) || 0,
        roomId: manualForm.roomId || null,
        roomIds,
        guestIdProofType: manualForm.guestIdProofType || null,
        guestIdProofPhoto: manualForm.guestIdProofPhoto || null
      });
      if (res.data.warning) toast(res.data.warning, { icon: '⚠️' });
      else toast.success('Manual booking created & synced to availability!');
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
      guestName: '', guestPhone: '+91', guestAddress: '', guestIdProofType: 'aadhaar', guestIdProofPhoto: null,
      bookingType: 'couple', checkInDate: '', checkOutDate: '', adults: 2, kids: [],
      totalAmount: 3500, advancePayment: '', remainingPayment: '', priceBreakdown: '', specialRequests: '', roomId: ''
    });
    setManualRooms([]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner */}
      <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="text-emerald-600" size={22} />
            <span>Resort PMS Bookings & Payments Management</span>
          </h1>
          <p className="text-xs text-slate-500">
            Manage reservations, 1-click balance settlements, ID photos, and printable PDF invoices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBookings}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            title="Refresh Bookings"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setManualModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:scale-105"
          >
            <Plus size={16} />
            <span>Add Manual Booking</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 rounded-2xl bg-white border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search by guest name or phone..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl">
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <button
            type="button"
            onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
            className="px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1.5 shrink-0"
            title="Toggle date sort order"
          >
            <CalendarDays size={13} className="text-emerald-600" />
            <span>{sortOrder === 'asc' ? 'Earliest First' : 'Latest First'}</span>
          </button>

          <input
            type="date"
            value={filters.date}
            onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
            title="Filter by check-in date"
          />

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
            <option value="cancelled">Cancelled</option>
            <option value="pending_payment">Pending Payment</option>
          </select>

          {/* View Mode Switcher */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📋 Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📊 Spreadsheet Table
            </button>
          </div>
        </div>
      </div>

      {/* Bookings List */}
      {loading ? (
        <div className="py-16 text-center space-y-3 glass-card rounded-2xl">
          <RefreshCw size={32} className="animate-spin text-emerald-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Loading guest bookings...</p>
        </div>
      ) : viewMode === 'table' ? (
        <BookingsTableView bookings={bookings} />
      ) : bookings.length === 0 ? (
        <div className="py-16 text-center space-y-3 glass-card rounded-2xl">
          <BookOpen size={36} className="text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No bookings found</p>
          <p className="text-xs text-slate-400">Click "Add Manual Booking" to create a new reservation.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupBookingsByDate(bookings, sortOrder).map((dateGroup) => (
            <div key={dateGroup.isoDateKey} className="space-y-3">
              {/* DATE HEADER BANNER */}
              <div className="flex items-center justify-between p-3.5 px-4 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-900 text-white shadow-xs border border-emerald-700/40">
                <div className="flex items-center gap-2.5">
                  <CalendarDays size={18} className="text-emerald-400" />
                  <h3 className="font-display font-extrabold text-sm tracking-wide uppercase">
                    📅 {dateGroup.formattedDate}
                  </h3>
                </div>
                <span className="bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-extrabold text-emerald-200 border border-white/20">
                  {dateGroup.bookings.length} {dateGroup.bookings.length === 1 ? 'booking' : 'bookings'}
                </span>
              </div>

              {/* BOOKINGS LIST FOR THIS DATE */}
              <div className="space-y-3 pl-1 sm:pl-2">
                {dateGroup.bookings.map((b) => (
                  <div key={b._id} className="glass-card rounded-2xl p-5 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-all">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-base text-slate-800">{b.customerName}</h3>
                        <StatusBadge status={b.status} />
                        <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full capitalize">
                          {b.bookingType || 'Couple'}
                        </span>

                        {/* ID Proof Thumbnail */}
                        {b.guestIdProofPhoto && (
                          <button
                            onClick={() => setIdPhotoPreviewModal(b.guestIdProofPhoto)}
                            className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            title="View Guest ID Photo"
                          >
                            <ImageIcon size={10} />
                            <span>ID Attached</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Phone size={13} className="text-slate-400" />
                          <span>{b.customerPhone}</span>
                        </span>

                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <CalendarDays size={13} className="text-slate-400" />
                          <span>{formatDMY(b.checkInDate || b.date)} ➔ {formatDMY(b.checkOutDate || (new Date(b.checkInDate || b.date).getTime() + 86400000))}</span>
                        </span>

                        <span className="flex items-center gap-1 font-bold text-emerald-800">
                          <DollarSign size={13} />
                          <span>Total: ₹{b.totalAmount}</span>
                        </span>

                        {b.advancePayment > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Adv: ₹{b.advancePayment}
                          </span>
                        )}

                        {b.remainingPayment > 0 ? (
                          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            Bal: ₹{b.remainingPayment}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                            ✓ Paid
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      
                      {/* FEATURE #1: 1-Click Settle Balance */}
                      {b.remainingPayment > 0 && (
                        <button
                          onClick={() => handleSettlePayment(b._id, b.remainingPayment)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1 hover:scale-105"
                          title="Mark Remaining Balance as Fully Paid"
                        >
                          <CheckCheck size={13} />
                          <span>Settle Bal (₹{b.remainingPayment})</span>
                        </button>
                      )}

                      {/* FEATURE #2: Printable / WhatsApp PDF Receipt */}
                      <button
                        onClick={() => setInvoiceModal(b)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1"
                        title="Generate Printable PDF Invoice Receipt"
                      >
                        <Printer size={13} />
                        <span>PDF Invoice</span>
                      </button>

                      {b.status === 'confirmed' && (
                        <button
                          onClick={() => handleStatusChange(b._id, 'checked_in')}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold rounded-xl border border-emerald-200 transition-colors flex items-center gap-1"
                        >
                          <LogIn size={13} />
                          <span>Check In</span>
                        </button>
                      )}

                      {b.status === 'checked_in' && (
                        <button
                          onClick={() => handleStatusChange(b._id, 'checked_out')}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 text-xs font-semibold rounded-xl border border-indigo-200 transition-colors flex items-center gap-1"
                        >
                          <LogOut size={13} />
                          <span>Check Out</span>
                        </button>
                      )}

                      <button
                        onClick={() => { setCancelModal(b); setCancelReason(''); }}
                        className="px-3 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold rounded-xl border border-amber-200 transition-colors flex items-center gap-1"
                      >
                        <XCircle size={13} />
                        <span>Cancel</span>
                      </button>

                      <button
                        onClick={() => handleDeleteBooking(b._id)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FEATURE #2: PRINTABLE / WHATSAPP PDF INVOICE RECEIPT MODAL */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 pt-2 sm:pt-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <div className="glass-card rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 bg-white animate-fade-in shadow-2xl overflow-y-auto max-h-[92vh] mt-0 mb-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="text-emerald-700" size={22} />
                <h3 className="font-display font-bold text-lg text-slate-800">Nandibaag Resort — Guest Bill Invoice</h3>
              </div>
              <button onClick={() => setInvoiceModal(null)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            {/* Printable Receipt Card */}
            <div id="printable-receipt" className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-4 text-xs text-slate-800">
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <h2 className="font-display font-bold text-lg text-emerald-800">NANDIBAAG RESORT</h2>
                  <p className="text-[11px] text-slate-500">Pure Veg & Jain Resort • Karjat, Maharashtra</p>
                  <p className="text-[11px] text-slate-500">Phone: +91 92576 57665 | GSTIN: 27AABCN1234F1Z5</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-xs bg-emerald-100 text-emerald-900 px-3 py-1 rounded-full inline-block mb-1">
                    INVOICE RECEIPT
                  </span>
                  <p className="text-[10px] text-slate-500 font-mono">Invoice #: NB-{invoiceModal._id.slice(-6).toUpperCase()}</p>
                  <p className="text-[10px] text-slate-500">Date: {formatDMY(new Date())}</p>
                </div>
              </div>

              {/* Guest Details */}
              <div className="grid grid-cols-2 gap-4 bg-white p-3.5 rounded-lg border border-slate-200">
                <div>
                  <p className="text-[11px] text-slate-500">Guest Name:</p>
                  <p className="font-bold text-sm text-slate-800">{invoiceModal.customerName}</p>
                  <p className="text-xs text-slate-600">{invoiceModal.customerPhone}</p>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-slate-500">Stay Duration:</p>
                  <p className="font-bold text-xs text-slate-800">
                    {formatDMY(invoiceModal.checkInDate || invoiceModal.date)} ➔ {formatDMY(invoiceModal.checkOutDate)}
                  </p>
                  <p className="text-xs text-slate-600 capitalize">Booking: {invoiceModal.bookingType || 'Couple'}</p>
                </div>
              </div>

              {/* Amount Breakdown Table */}
              <table className="w-full text-left border-collapse bg-white rounded-lg border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5">Cottage Room Package Stay</td>
                    <td className="p-2.5 text-right font-semibold">₹{invoiceModal.totalAmount}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-emerald-800 font-medium">Advance Paid</td>
                    <td className="p-2.5 text-right text-emerald-800 font-semibold">- ₹{invoiceModal.advancePayment || 0}</td>
                  </tr>
                  <tr className="bg-emerald-50/50 font-bold text-slate-800">
                    <td className="p-2.5">Net Remaining Balance Due</td>
                    <td className="p-2.5 text-right text-emerald-900 text-sm">₹{invoiceModal.remainingPayment || 0}</td>
                  </tr>
                </tbody>
              </table>

              <p className="text-[10px] text-slate-400 text-center italic">
                Thank you for staying at Nandibaag Resort! We wish you a peaceful journey.
              </p>
            </div>

            {/* Receipt Modal Action Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => handlePrintInvoice(invoiceModal)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:scale-105"
              >
                <Printer size={15} />
                <span>Print Official PDF Receipt</span>
              </button>

              <button
                onClick={() => setInvoiceModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FEATURE #3: FULLSIZE ID PHOTO PREVIEW MODAL */}
      {idPhotoPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-4 sm:pt-8 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <div className="glass-card rounded-2xl max-w-lg w-full p-4 bg-white animate-fade-in shadow-2xl space-y-3 text-center my-0">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-display font-bold text-sm text-slate-800">Guest ID Proof Document</h4>
              <button onClick={() => setIdPhotoPreviewModal(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <img
              src={idPhotoPreviewModal}
              alt="Guest ID Proof"
              className="max-h-[70vh] w-auto mx-auto rounded-xl shadow-md border border-slate-200 object-contain"
            />

            <button
              onClick={() => setIdPhotoPreviewModal(null)}
              className="px-5 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl"
            >
              Close Document
            </button>
          </div>
        </div>
      )}

      {/* Manual Booking Modal */}
      {manualModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-4 sm:pt-8 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative max-w-3xl w-full bg-transparent animate-fade-in my-0">
            <button
              onClick={() => setManualModal(false)}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-slate-900 transition-all shadow-lg"
              title="Close form"
            >
              <X size={18} />
            </button>
            <ManualBookingForm />
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-4 sm:pt-8 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="glass-card rounded-2xl max-w-sm w-full p-6 space-y-4 bg-white animate-fade-in shadow-2xl my-0">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <AlertTriangle className="text-amber-600" size={20} />
              <h3 className="font-display font-bold text-base text-slate-800">Cancel Reservation</h3>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to cancel the booking for <strong>{cancelModal.customerName}</strong>? The assigned cottage will be released immediately.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCancelModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Dismiss
              </button>
              <button
                onClick={() => handleCancel(cancelModal._id)}
                disabled={submitting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
              >
                {submitting ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
