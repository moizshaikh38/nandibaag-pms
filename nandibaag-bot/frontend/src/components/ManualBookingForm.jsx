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
  Lock,
  Send,
  X,
  MessageSquare
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
  const [createdBooking, setCreatedBooking] = useState(null);
  const [sendingSms, setSendingSms] = useState(false);

  // Sprint 2: Authoritative server-side pricing preview, overrides, discounts & payment collection
  const [childrenAges, setChildrenAges] = useState([]);
  const [roomAddon, setRoomAddon] = useState(false);
  const [rateOverrides, setRateOverrides] = useState({
    coupleBaseRate: '',
    coupleBaseRateWeekday: '',
    coupleBaseRateWeekend: '',
    extraAdultRate: '',
    extraAdultRateWeekday: '',
    extraAdultRateWeekend: '',
    groupAdultRate: '',
    groupAdultRateWeekday: '',
    groupAdultRateWeekend: '',
    childRate: '',
    childRateWeekday: '',
    childRateWeekend: '',
    oneDayPerPersonRate: '',
    roomAddonRate: '',
    reason: ''
  });
  const [discount, setDiscount] = useState({ type: 'none', value: '', reason: '' });
  const [paymentDetails, setPaymentDetails] = useState({
    mode: 'cash',
    utr: '',
    screenshotRef: '',
    uploading: false,
    uploadError: ''
  });
  const [quoteState, setQuoteState] = useState({ quote: null, loading: false, error: '' });
  const [acknowledgeCoupleWarning, setAcknowledgeCoupleWarning] = useState(false);
  const [acknowledgeZeroAdvance, setAcknowledgeZeroAdvance] = useState(false);
  const previewSeqRef = React.useRef(0);
  const generateIdempotencyKey = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `mb-${crypto.randomUUID()}`
      : `mb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  const idempotencyKeyRef = React.useRef(generateIdempotencyKey());

  // Sprint 2.1: Regenerate idempotency key when user materially changes booking inputs
  useEffect(() => {
    idempotencyKeyRef.current = generateIdempotencyKey();
  }, [
    formData.customerName,
    formData.customerPhone,
    formData.packageType,
    formData.checkInDate,
    formData.checkOutDate,
    formData.guestComposition.adults,
    formData.mealOption,
    formData.advancePayment,
    formData.notes,
    childrenAges,
    roomAddon,
    rateOverrides,
    discount,
    paymentDetails.mode,
    paymentDetails.utr,
    paymentDetails.screenshotRef,
    selectedRooms
  ]);

  // Sprint 2: Reset acknowledgments when core booking configuration changes
  useEffect(() => {
    setAcknowledgeCoupleWarning(false);
  }, [formData.packageType, formData.guestComposition.adults, formData.checkInDate, formData.checkOutDate]);

  useEffect(() => {
    setAcknowledgeZeroAdvance(false);
  }, [formData.advancePayment, quoteState.quote?.totalAmount]);

  // Sprint 2.1: Authoritative server-side pricing preview (immediately marks quote loading/stale before debounce)
  useEffect(() => {
    if (!formData.packageType || !formData.checkInDate) return;
    if (formData.packageType !== 'oneDay' && !formData.checkOutDate) return;

    const seq = ++previewSeqRef.current;
    setQuoteState(prev => ({ ...prev, loading: true, error: '' }));

    const timer = setTimeout(async () => {
      try {
        const hasAnyOverride = Object.entries(rateOverrides).some(
          ([k, v]) => k !== 'reason' && v !== ''
        );
        const hasDiscount = discount.type !== 'none' && Number(discount.value) > 0;

        const payload = {
          packageType: formData.packageType,
          checkInDate: formData.checkInDate,
          checkOutDate: formData.packageType === 'oneDay' ? formData.checkInDate : formData.checkOutDate,
          adults: Number(formData.guestComposition.adults) || 1,
          childrenAges,
          mealOption: formData.packageType === 'oneDay' ? formData.mealOption : undefined,
          roomAddon: formData.packageType === 'oneDay' ? roomAddon : false,
          rateOverrides: hasAnyOverride ? rateOverrides : undefined,
          discount: hasDiscount ? { ...discount, value: Number(discount.value) } : undefined,
          acknowledgeCoupleWarning
        };

        const res = await api.post('/pms/pricing/preview', payload);
        if (seq !== previewSeqRef.current) return; // Ignore stale response

        const q = res.data.quote;
        setQuoteState({ quote: q, loading: false, error: '' });
        if (q) {
          const breakdown = Array.isArray(q.dailyBreakdown)
            ? q.dailyBreakdown
            : (Array.isArray(q.snapshot?.breakdown) ? q.snapshot.breakdown : []);
          const ratesApplied = q.snapshot?.ratesApplied || {};
          const addOns = q.addOns || q.snapshot?.addOns || {};
          const weekdayBreak = breakdown.find(b => b.rateCategory === 'WEEKDAY') || null;
          const weekendBreak = breakdown.find(b => b.rateCategory === 'WEEKEND') || null;
          const firstBreak = breakdown[0] || null;

          const getExtra = (b) => (b?.guestCounts?.extraAdults > 0 && b?.extraAdultPricing != null ? String(Math.round(b.extraAdultPricing / b.guestCounts.extraAdults)) : '');
          const getChild = (b) => (b?.guestCounts?.chargeableChildren > 0 && b?.childPricing != null ? String(Math.round(b.childPricing / b.guestCounts.chargeableChildren)) : '');

          const dCoupleWd = formData.packageType === 'couple' && weekdayBreak?.roomRate != null ? String(weekdayBreak.roomRate) : '';
          const dCoupleWe = formData.packageType === 'couple' && weekendBreak?.roomRate != null ? String(weekendBreak.roomRate) : '';
          const dExtraWd = getExtra(weekdayBreak);
          const dExtraWe = getExtra(weekendBreak);
          const dGroupWd = formData.packageType === 'group' && weekdayBreak?.roomRate != null ? String(weekdayBreak.roomRate) : '';
          const dGroupWe = formData.packageType === 'group' && weekendBreak?.roomRate != null ? String(weekendBreak.roomRate) : '';
          const dChildWd = getChild(weekdayBreak);
          const dChildWe = getChild(weekendBreak);
          const dOneDay = formData.packageType === 'oneDay' && (firstBreak?.perPersonRate ?? ratesApplied?.oneDayPerPersonRate) != null
            ? String(firstBreak?.perPersonRate ?? ratesApplied?.oneDayPerPersonRate) : '';
          const dRoomAddon = formData.packageType === 'oneDay' && roomAddon && (addOns?.smallRoom?.amount ?? ratesApplied?.roomAddonRate) != null
            ? String(addOns?.smallRoom?.amount ?? ratesApplied?.roomAddonRate) : '';

          setRateOverrides(prev => {
            const next = {
              ...prev,
              coupleBaseRateWeekday: prev.coupleBaseRateWeekday === '' && dCoupleWd !== '' ? dCoupleWd : prev.coupleBaseRateWeekday,
              coupleBaseRateWeekend: prev.coupleBaseRateWeekend === '' && dCoupleWe !== '' ? dCoupleWe : prev.coupleBaseRateWeekend,
              extraAdultRateWeekday: prev.extraAdultRateWeekday === '' && dExtraWd !== '' ? dExtraWd : prev.extraAdultRateWeekday,
              extraAdultRateWeekend: prev.extraAdultRateWeekend === '' && dExtraWe !== '' ? dExtraWe : prev.extraAdultRateWeekend,
              groupAdultRateWeekday: prev.groupAdultRateWeekday === '' && dGroupWd !== '' ? dGroupWd : prev.groupAdultRateWeekday,
              groupAdultRateWeekend: prev.groupAdultRateWeekend === '' && dGroupWe !== '' ? dGroupWe : prev.groupAdultRateWeekend,
              childRateWeekday: prev.childRateWeekday === '' && dChildWd !== '' ? dChildWd : prev.childRateWeekday,
              childRateWeekend: prev.childRateWeekend === '' && dChildWe !== '' ? dChildWe : prev.childRateWeekend,
              oneDayPerPersonRate: prev.oneDayPerPersonRate === '' && dOneDay !== '' ? dOneDay : prev.oneDayPerPersonRate,
              roomAddonRate: prev.roomAddonRate === '' && dRoomAddon !== '' ? dRoomAddon : prev.roomAddonRate
            };
            const changed = Object.keys(next).some(k => next[k] !== prev[k]);
            return changed ? next : prev;
          });
        }
        setFormData(prev => {
          const adv = prev.isFullPaid ? q.totalAmount : (parseFloat(prev.advancePayment) || 0);
          return {
            ...prev,
            totalAmount: q.totalAmount,
            advancePayment: prev.isFullPaid ? q.totalAmount : prev.advancePayment,
            remainingPayment: Math.max(0, q.totalAmount - adv)
          };
        });
      } catch (err) {
        if (seq !== previewSeqRef.current) return;
        setQuoteState({
          quote: null,
          loading: false,
          error: err.response?.data?.message || 'Unable to calculate server pricing preview'
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [
    formData.packageType,
    formData.checkInDate,
    formData.checkOutDate,
    formData.guestComposition.adults,
    formData.mealOption,
    childrenAges,
    roomAddon,
    rateOverrides,
    discount,
    acknowledgeCoupleWarning
  ]);

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
    const roomIdentifier = String(roomObj._id); // ALWAYS use the unique ObjectId
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
      const numVal = Math.max(0, parseInt(value, 10) || 0);
      if (key === 'children') {
        setChildrenAges(prevAges => {
          if (numVal === prevAges.length) return prevAges;
          if (numVal < prevAges.length) return prevAges.slice(0, numVal);
          return [...prevAges, ...Array.from({ length: numVal - prevAges.length }, () => 8)];
        });
      }
      setFormData(prev => ({
        ...prev,
        guestComposition: {
          ...prev.guestComposition,
          [key]: key === 'adults' ? Math.max(1, numVal) : numVal
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

    // VALIDATION 1: Check package type
    if (!formData.packageType) {
      alert('❌ Select package type first');
      setLoading(false);
      return;
    }

    // VALIDATION 2: Rooms REQUIRED for overnight/couple/group
    if (['couple', 'group', 'overnight'].includes(formData.packageType)) {
      if (!selectedRooms || selectedRooms.length === 0) {
        alert(
          `❌ Select at least 1 room for ${formData.packageType} booking\n\n` +
          `Please select room(s) before creating booking.`
        );
        console.log('[Form:Booking] ❌ Validation failed - no rooms');
        setLoading(false);
        return; // Don't proceed
      }
    }

    // VALIDATION 3: Check dates
    if (!formData.checkInDate || !formData.checkOutDate) {
      alert('❌ Enter check-in and check-out dates');
      setLoading(false);
      return;
    }

    // VALIDATION 4: Server-side pricing preview must be fresh & valid
    if (quoteState.loading || !quoteState.quote || quoteState.error) {
      toast.error(quoteState.error || 'Waiting for server pricing calculation...');
      setLoading(false);
      return;
    }

    const requiredCoupleWarn = quoteState.quote.warnings?.find(w => w.requiresAcknowledgment);
    if (requiredCoupleWarn && !acknowledgeCoupleWarning) {
      toast.error('Please acknowledge the Couple Stay extra-adult warning before proceeding.');
      setLoading(false);
      return;
    }

    const advAmt = Number(formData.advancePayment) || 0;
    if (advAmt === 0 && !acknowledgeZeroAdvance) {
      toast.error('No advance payment has been collected for this booking. Please confirm before proceeding.');
      setLoading(false);
      return;
    }

    const hasAnyOverride = (
      rateOverrides.coupleBaseRate !== '' ||
      rateOverrides.extraAdultRate !== '' ||
      rateOverrides.groupAdultRate !== '' ||
      rateOverrides.childRate !== '' ||
      rateOverrides.oneDayPerPersonRate !== '' ||
      rateOverrides.roomAddonRate !== ''
    );
    const hasDiscount = discount.type !== 'none' && Number(discount.value) > 0;

    try {
      const response = await api.post('/bookings/manual-booking', {
        ...formData,
        childrenAges,
        roomAddon: formData.packageType === 'oneDay' ? roomAddon : false,
        rateOverrides: hasAnyOverride ? rateOverrides : null,
        discount: hasDiscount ? { ...discount, value: Number(discount.value) } : null,
        payment: {
          amount: advAmt,
          mode: paymentDetails.mode,
          utr: paymentDetails.utr,
          screenshotRef: paymentDetails.screenshotRef
        },
        acknowledgeCoupleWarning,
        acknowledgedCoupleWarningCode: requiredCoupleWarn ? requiredCoupleWarn.code : null,
        acknowledgeZeroAdvance,
        idempotencyKey: idempotencyKeyRef.current,
        roomIds: selectedRooms,
        roomId: selectedRooms.join(', '),
        advancePaid: advAmt,
        adults: formData.guestComposition.adults,
        sessionId
      });

      const newBooking = response.data.booking;
      toast.success('✅ Booking created & synced to PMS!');
      setMessage('✅ Booking created successfully! You can send confirmation below.');
      setCreatedBooking(newBooking);

      // Reset ALL form & Sprint 2 states ONLY after confirmed success
      setSelectedRooms([]);
      setTotalCapacity(0);
      setChildrenAges([]);
      setRoomAddon(false);
      setShowOverrides(false);
      setRateOverrides({
        coupleBaseRate: '',
        extraAdultRate: '',
        groupAdultRate: '',
        childRate: '',
        oneDayPerPersonRate: '',
        roomAddonRate: '',
        reason: ''
      });
      setDiscount({ type: 'none', value: '', reason: '' });
      setPaymentDetails({
        mode: 'cash',
        utr: '',
        screenshotRef: '',
        uploading: false,
        uploadError: ''
      });
      setAcknowledgeCoupleWarning(false);
      setAcknowledgeZeroAdvance(false);
      setQuoteState({ quote: null, loading: false, error: '' });
      idempotencyKeyRef.current = generateIdempotencyKey();
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

      window.dispatchEvent(new Event('refresh_bookings'));
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      
      if (error.response?.data?.requiresRoomSelection) {
        alert('❌ Please select at least 1 room');
      } else {
        alert('❌ Error: ' + errorMsg);
      }
      toast.error(errorMsg);
      setMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendSMSNow = async (bookingId) => {
    if (!bookingId) return;
    try {
      setSendingSms(true);
      toast.loading('Sending WhatsApp/SMS confirmation...', { id: 'sms-now' });
      const res = await api.post(`/bookings/send-confirmation-sms/${bookingId}`);
      if (res.data.success) {
        toast.success('✅ Confirmation message sent successfully!', { id: 'sms-now' });
        setCreatedBooking(prev => prev ? { ...prev, smsSent: true } : null);
        window.dispatchEvent(new Event('refresh_bookings'));
        setTimeout(() => {
          setCreatedBooking(null);
        }, 1800);
      } else {
        toast.error(`❌ Failed: ${res.data.error || 'Could not send message'}`, { id: 'sms-now' });
      }
    } catch (err) {
      console.error('[Form:SendSMS] Error:', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to send confirmation', { id: 'sms-now' });
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden animate-fade-in text-slate-800 mb-28 lg:mb-4 relative">
      
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

              {/* Meal Options & Small Room Add-on for One Day Picnic */}
              {formData.packageType === 'oneDay' && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 space-y-2.5">
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

                  <label className="flex items-center justify-between p-2 rounded-xl bg-white border border-sky-200 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Optional Small Room Add-on</span>
                      <span className="text-[10px] text-slate-500">Pricing only (+₹2,000); assign room manually if needed</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={roomAddon}
                      onChange={(e) => setRoomAddon(e.target.checked)}
                      className="w-4 h-4 accent-sky-600 cursor-pointer"
                    />
                  </label>
                </div>
              )}

              {/* Guest Counts */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Adults</label>
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
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Children</label>
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

              {/* Per-Child Ages */}
              {childrenAges.length > 0 && (
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Child Ages (Years):
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {childrenAges.map((age, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-500 font-semibold">#{idx + 1}</span>
                        <input
                          type="number"
                          min="0"
                          max="120"
                          value={age}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setChildrenAges(prev => prev.map((a, i) => (i === idx ? val : a)));
                          }}
                          className="w-full px-2 py-1 text-xs font-bold border border-slate-300 rounded-lg text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Couple 3/5 Adults Warning */}
              {quoteState.quote?.warnings?.some(w => w.requiresAcknowledgment) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                  <p className="text-xs font-bold text-amber-900">
                    ⚠️ {quoteState.quote.warnings.find(w => w.requiresAcknowledgment).message}
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-amber-950">
                    <input
                      type="checkbox"
                      checked={acknowledgeCoupleWarning}
                      onChange={(e) => setAcknowledgeCoupleWarning(e.target.checked)}
                      className="w-4 h-4 accent-amber-600"
                    />
                    <span>I acknowledge the extra adult charge and wish to proceed</span>
                  </label>
                </div>
              )}
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
                          const num = String(room.number || room.roomNumber || room._id); // Keep for UI display only
                          const id = String(room._id); // Use ID for exact matching
                          const cap = room.capacity || 4;
                          const isChecked = selectedRooms.includes(id);

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

              {/* Room required warning for specific package types */}
              {['couple', 'group', 'overnight'].includes(formData.packageType) && (
                <div className="p-2.5 mt-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] font-semibold shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span>🔴 Rooms required for {formData.packageType}</span>
                    <span>Selected: {selectedRooms?.length || 0}</span>
                  </div>
                  {(!selectedRooms || selectedRooms.length === 0) && (
                    <div className="text-rose-600 font-bold mt-1.5 flex items-center gap-1">
                      ⚠️ Please select at least 1 room below
                    </div>
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

              {/* Date-wise Authoritative Quote Breakdown */}
              {quoteState.loading && (
                <p className="text-[11px] text-emerald-300 animate-pulse">Calculating authoritative server quote...</p>
              )}
              {quoteState.error && (
                <p className="text-xs text-rose-400 font-semibold">⚠️ {quoteState.error}</p>
              )}
              {quoteState.quote && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-400">
                    <span>Package / Duration:</span>
                    <span className="text-white font-bold uppercase">
                      {quoteState.quote.packageType} • {quoteState.quote.nights > 0 ? `${quoteState.quote.nights} Night(s)` : 'Day Use'}
                    </span>
                  </div>
                  {quoteState.quote.dailyBreakdown?.map((d, idx) => (
                    <div key={idx} className="flex justify-between text-slate-300">
                      <span>{d.dateShort} ({d.dayName.slice(0, 3)}, {d.rateCategory})</span>
                      <span className="font-semibold">₹{d.dailySubtotal.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                  {quoteState.quote.originalTotal !== quoteState.quote.totalAmount && (
                    <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-1">
                      <span>Original Default Total:</span>
                      <span>₹{quoteState.quote.originalTotal.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {quoteState.quote.discountAmount > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span>Discount ({discount.reason}):</span>
                      <span>-₹{quoteState.quote.discountAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Rate Overrides (Permanently Expanded) & Discount Controls */}
              <div className="space-y-3 border-t border-slate-800 pt-3">
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">Rate Overrides</span>
                    <span className="text-[10px] text-slate-400">Edit any applicable rate to recalculate quote</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {formData.packageType === 'couple' && (
                      <>
                        {(quoteState.quote?.weekdayNights ?? 1) > 0 && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Couple Base — Weekday (₹)</label>
                            <input type="number" min="0" placeholder="Weekday Base (₹)" value={rateOverrides.coupleBaseRateWeekday} onChange={e => setRateOverrides(p => ({ ...p, coupleBaseRateWeekday: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                        {(quoteState.quote?.weekendNights ?? 0) > 0 && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Couple Base — Weekend (₹)</label>
                            <input type="number" min="0" placeholder="Weekend Base (₹)" value={rateOverrides.coupleBaseRateWeekend} onChange={e => setRateOverrides(p => ({ ...p, coupleBaseRateWeekend: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                        {(Number(formData.guestComposition?.adults) || 0) > 2 && (quoteState.quote?.weekdayNights ?? 1) > 0 && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Extra Adult — Weekday (₹)</label>
                            <input type="number" min="0" placeholder="Weekday Extra Adult (₹)" value={rateOverrides.extraAdultRateWeekday} onChange={e => setRateOverrides(p => ({ ...p, extraAdultRateWeekday: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                        {(Number(formData.guestComposition?.adults) || 0) > 2 && (quoteState.quote?.weekendNights ?? 0) > 0 && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Extra Adult — Weekend (₹)</label>
                            <input type="number" min="0" placeholder="Weekend Extra Adult (₹)" value={rateOverrides.extraAdultRateWeekend} onChange={e => setRateOverrides(p => ({ ...p, extraAdultRateWeekend: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                      </>
                    )}
                    {formData.packageType === 'group' && (
                      <>
                        {(quoteState.quote?.weekdayNights ?? 1) > 0 && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Group Adult — Weekday (₹)</label>
                            <input type="number" min="0" placeholder="Weekday Group Adult (₹)" value={rateOverrides.groupAdultRateWeekday} onChange={e => setRateOverrides(p => ({ ...p, groupAdultRateWeekday: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                        {(quoteState.quote?.weekendNights ?? 0) > 0 && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Group Adult — Weekend (₹)</label>
                            <input type="number" min="0" placeholder="Weekend Group Adult (₹)" value={rateOverrides.groupAdultRateWeekend} onChange={e => setRateOverrides(p => ({ ...p, groupAdultRateWeekend: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                      </>
                    )}
                    {formData.packageType !== 'oneDay' ? (
                      childrenAges.some(age => Number(age) >= 6) && (
                        <>
                          {(quoteState.quote?.weekdayNights ?? 1) > 0 && (
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Child Rate — Weekday (₹)</label>
                              <input type="number" min="0" placeholder="Weekday Child (₹)" value={rateOverrides.childRateWeekday} onChange={e => setRateOverrides(p => ({ ...p, childRateWeekday: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                            </div>
                          )}
                          {(quoteState.quote?.weekendNights ?? 0) > 0 && (
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Child Rate — Weekend (₹)</label>
                              <input type="number" min="0" placeholder="Weekend Child (₹)" value={rateOverrides.childRateWeekend} onChange={e => setRateOverrides(p => ({ ...p, childRateWeekend: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      <>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Per-Person Rate (₹)</label>
                          <input type="number" min="0" placeholder="Per-Person (₹)" value={rateOverrides.oneDayPerPersonRate} onChange={e => setRateOverrides(p => ({ ...p, oneDayPerPersonRate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                        </div>
                        {roomAddon && (
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Room Add-on (₹)</label>
                            <input type="number" min="0" placeholder="Room Add-on (₹)" value={rateOverrides.roomAddonRate} onChange={e => setRateOverrides(p => ({ ...p, roomAddonRate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <input type="text" placeholder="Override reason (optional)" value={rateOverrides.reason} onChange={e => setRateOverrides(p => ({ ...p, reason: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <select
                    value={discount.type}
                    onChange={e => setDiscount(p => ({ ...p, type: e.target.value }))}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  >
                    <option value="none">No Discount</option>
                    <option value="fixed">Fixed (₹)</option>
                    <option value="percentage">Percent (%)</option>
                  </select>
                  {discount.type !== 'none' && (
                    <>
                      <input type="number" min="0" placeholder="Value" value={discount.value} onChange={e => setDiscount(p => ({ ...p, value: e.target.value }))} className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white" />
                      <input type="text" placeholder="Discount reason (optional)" value={discount.reason} onChange={e => setDiscount(p => ({ ...p, reason: e.target.value }))} className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white" />
                    </>
                  )}
                </div>
              </div>

              {/* Payment Mode, UTR & Screenshot */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Payment Mode</label>
                  <select
                    value={paymentDetails.mode}
                    onChange={e => setPaymentDetails(p => ({ ...p, mode: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">UTR / Ref (Optional)</label>
                  <input
                    type="text"
                    placeholder="UTR / Transaction Ref"
                    value={paymentDetails.utr}
                    onChange={e => setPaymentDetails(p => ({ ...p, utr: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="text-[11px] space-y-1">
                <label className="block text-[10px] font-bold text-slate-400">Payment Screenshot (Optional, Private Cloud Storage)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPaymentDetails(p => ({ ...p, uploading: true, uploadError: '' }));
                    try {
                      const base64 = await new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(r.result);
                        r.onerror = reject;
                        r.readAsDataURL(file);
                      });
                      const up = await api.post('/pms/uploads/payment-screenshot', {
                        fileBase64: base64,
                        mimeType: file.type,
                        originalName: file.name
                      });
                      setPaymentDetails(p => ({ ...p, screenshotRef: up.data.screenshotRef, uploading: false }));
                      toast.success('Payment screenshot uploaded');
                    } catch (err) {
                      setPaymentDetails(p => ({
                        ...p,
                        uploading: false,
                        uploadError: err.response?.data?.message || 'Screenshot upload failed'
                      }));
                    }
                  }}
                  className="w-full text-[11px] text-slate-300"
                />
                {paymentDetails.uploadError && (
                  <p className="text-[10px] text-amber-300">ℹ️ {paymentDetails.uploadError}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-300 mb-1">Final Total (₹)</label>
                  <input
                    type="number"
                    readOnly
                    value={formData.totalAmount}
                    className="w-full px-2.5 py-2 text-sm font-extrabold border border-slate-700 rounded-xl bg-slate-900 text-white text-center shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-emerald-400 mb-1">Advance (₹)</label>
                  <input
                    type="number"
                    min="0"
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

              {/* Zero-Advance Warning Acknowledgment */}
              {(Number(formData.advancePayment) || 0) === 0 && (
                <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-600/60 space-y-1.5">
                  <p className="text-[11px] font-bold text-amber-300">
                    ⚠️ No advance payment has been collected for this booking. Please confirm before proceeding.
                  </p>
                  <label className="flex items-center gap-2 text-[11px] text-amber-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeZeroAdvance}
                      onChange={e => setAcknowledgeZeroAdvance(e.target.checked)}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span>Confirm Unpaid / ₹0 Advance Booking</span>
                  </label>
                </div>
              )}

              {/* Desktop Submit Button (Hidden on Mobile) */}
              <button
                type="submit"
                disabled={loading || quoteState.loading || Boolean(quoteState.error)}
                className="hidden md:flex w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white font-display font-extrabold text-sm shadow-lg transition-all items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Creating Reservation...' : '✓ Create & Confirm Reservation'}
              </button>
            </div>

          </div>

        </div>

        {/* MOBILE STICKY ACTION BAR */}
        <div className="md:hidden fixed bottom-16 left-0 right-0 p-3 bg-white/90 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-40 flex items-center justify-between gap-4 safe-pb">
          <div className="flex flex-col pl-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total</span>
            <span className="text-lg font-extrabold text-slate-900 leading-none tracking-tight">₹{formData.totalAmount || 0}</span>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 active:scale-[0.98] text-white font-display font-extrabold text-sm shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-transform"
          >
            {loading ? 'Processing...' : '✓ Confirm Booking'}
          </button>
        </div>

        {/* Mobile Spacer to prevent overlap with sticky bar */}
        <div className="md:hidden h-28 w-full shrink-0"></div>

      </form>

      {/* POST-BOOKING MODAL: SEND CONFIRMATION SMS OPTION */}
      {createdBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-emerald-300 relative text-slate-800">
            <button
              type="button"
              onClick={() => setCreatedBooking(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-sm border border-emerald-200">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  Reservation Created!
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Synced to PMS • ID: {String(createdBooking._id).slice(-8)}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-700 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Guest:</span>
                <span className="font-bold text-slate-900">{createdBooking.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Phone:</span>
                <span className="font-bold text-slate-900">{createdBooking.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Check-in:</span>
                <span className="font-bold text-emerald-800">{createdBooking.date || createdBooking.checkInDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Rooms:</span>
                <span className="font-bold text-slate-900">{(createdBooking.roomNumbers?.join(', ')) || createdBooking.roomId || (createdBooking.roomIds?.join(', ')) || 'Assigned'}</span>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] flex items-center gap-2">
              <MessageSquare size={14} className="text-amber-600 shrink-0" />
              <span>Confirmation SMS / WhatsApp has <strong>not</strong> been sent automatically.</span>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSendSMSNow(createdBooking._id)}
                disabled={sendingSms}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white font-extrabold rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                <Send size={15} />
                <span>{sendingSms ? 'Sending Confirmation...' : '📱 Send Confirmation Message Now'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedBooking(null)}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 font-bold rounded-xl text-xs transition-colors text-center"
              >
                Done (Send Later from Dashboard)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualBookingForm;
