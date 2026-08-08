import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import api from '../utils/api';
import { formatPhoneDisplay, formatRelativeTime } from '../utils/formatters';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, 
  Bot, 
  User, 
  Send, 
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Users,
  MessageSquare,
  Bed,
  CheckCircle,
  PlusCircle,
  Clock,
  Home,
  Sparkles,
  PhoneCall,
  Flame,
  Zap,
  MapPin,
  DollarSign,
  ShieldAlert,
  Loader,
  AlertCircle
} from 'lucide-react';

const QUICK_REPLIES = [
  { label: '💰 Cottage Rates', text: 'Namaste! Our luxury cottages start at ₹3,500/night for couples including swimming pool access and delicious breakfast. Would you like to check date availability?' },
  { label: '🏊 Pool Rules', text: 'Our clean resort swimming pool is open from 7:00 AM to 8:00 PM daily. Standard nylon/lycra swimwear is required for all guests.' },
  { label: '⏰ Check-in/Out', text: 'Check-in time is 12:00 PM (Noon) and Check-out time is 10:00 AM. Early check-in is subject to cottage availability.' },
  { label: '📍 Location', text: 'Nandibaag Resort is located in Karjat, Maharashtra. We provide free parking on premises for all guests.' },
  { label: '💳 Payment Details', text: 'You can pay advance via Google Pay / PhonePe / Paytm / UPI to confirm your cottage reservation.' }
];

export default function ChatWindow({ chat, onClose, onModeChange, onChatUpdated }) {
  const navigate = useNavigate();
  const socket = useSocket();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showBookingInfo, setShowBookingInfo] = useState(false);

  // Quick Room Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    roomId: '',
    guestName: chat?.customerName || '',
    guestPhone: chat?.customerPhone || '+91',
    adults: 2,
    totalAmount: 3500,
    advanceAmount: 0,
    remainingAmount: 3500,
    isFullPaid: false
  });
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const [optimisticMode, setOptimisticMode] = useState(chat?.mode || 'ai');
  const latestIntendedModeRef = useRef(chat?.mode || 'ai');
  const pendingRequestRef = useRef(null);

  useEffect(() => {
    if (chat?.mode && !pendingRequestRef.current) {
      setOptimisticMode(chat.mode);
      latestIntendedModeRef.current = chat.mode;
    }
    if (chat) {
      setAssignForm(prev => ({
        ...prev,
        guestName: chat.customerName || '',
        guestPhone: chat.customerPhone || '+91'
      }));
    }
  }, [chat]);

  const fetchSingleChat = useCallback(async () => {
    if (!chat?._id) return;
    try {
      const res = await api.get(`/chats/${chat._id}`);
      if (res.data?.chat && onChatUpdated) {
        onChatUpdated(res.data.chat);
      }
    } catch (err) {
      console.error('Failed to fetch chat details:', err);
    }
  }, [chat?._id, onChatUpdated]);

  useEffect(() => {
    fetchSingleChat();
  }, [chat?._id]);

  useEffect(() => {
    if (!socket || !chat?._id) return;

    const handleMessageEvent = (data) => {
      const targetId = data._id || data.chatId || data.chat?._id;
      if (targetId === chat._id) {
        if (data.chat && onChatUpdated) {
          onChatUpdated(data.chat);
        } else {
          fetchSingleChat();
        }
      }
    };

    socket.on('chat:updated', handleMessageEvent);
    socket.on('chat:new_message', handleMessageEvent);
    socket.on('new_message', handleMessageEvent);

    return () => {
      socket.off('chat:updated', handleMessageEvent);
      socket.off('chat:new_message', handleMessageEvent);
      socket.off('new_message', handleMessageEvent);
    };
  }, [socket, chat?._id, fetchSingleChat, onChatUpdated]);

  useEffect(() => {
    if (!isUserScrolledUp && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat?.messages, isUserScrolledUp]);

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsUserScrolledUp(!isNearBottom);
    }
  };

  const handleModeToggle = useCallback(async () => {
    if (!chat?._id) return;
    const newMode = optimisticMode === 'ai' ? 'human' : 'ai';

    setOptimisticMode(newMode);
    latestIntendedModeRef.current = newMode;
    if (onModeChange) onModeChange(newMode);

    if (pendingRequestRef.current) {
      pendingRequestRef.current.abort();
    }

    const controller = new AbortController();
    pendingRequestRef.current = controller;

    try {
      await api.patch(`/chats/${chat._id}/mode`, { mode: newMode }, { signal: controller.signal });
      toast.success(newMode === 'human' ? '👤 Switched to Staff Handover Mode' : '⚡ Switched to AI Auto-Reply');
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
      const revertTo = newMode === 'ai' ? 'human' : 'ai';
      setOptimisticMode(revertTo);
      latestIntendedModeRef.current = revertTo;
      if (onModeChange) onModeChange(revertTo);
      toast.error('Failed to change mode');
    } finally {
      if (pendingRequestRef.current === controller) {
        pendingRequestRef.current = null;
      }
    }
  }, [chat?._id, optimisticMode, onModeChange]);

  const fetchAvailableRooms = async (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return;
    try {
      setIsLoadingRooms(true);
      const res = await api.get('/availability/rooms', {
        params: { checkInDate: checkIn, checkOutDate: checkOut }
      });
      setAvailableRooms(res.data.rooms || []);
    } catch (err) {
      toast.error('Failed to fetch available rooms');
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (showAssignModal && assignForm.checkInDate && assignForm.checkOutDate) {
      fetchAvailableRooms(assignForm.checkInDate, assignForm.checkOutDate);
    }
  }, [showAssignModal, assignForm.checkInDate, assignForm.checkOutDate]);

  const handleOpenAssignModal = () => {
    setShowAssignModal(true);
    const defaultCheckIn = new Date().toISOString().split('T')[0];
    const defaultCheckOut = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const inDate = chat?.bookingDraft?.checkInDate || chat?.bookingDraft?.date || defaultCheckIn;
    const outDate = chat?.bookingDraft?.checkOutDate || defaultCheckOut;

    setAssignForm(prev => ({
      ...prev,
      checkInDate: inDate,
      checkOutDate: outDate,
      adults: chat?.bookingDraft?.adults || 2,
      guestName: chat?.customerName || '',
      guestPhone: chat?.customerPhone || '+91',
      roomId: ''
    }));
    fetchAvailableRooms(inDate, outDate);
  };

  const handleAssignRoomSubmit = async () => {
    if (!assignForm.roomId) {
      toast.error('Please select an available cottage room');
      return;
    }
    setIsAssigning(true);
    try {
      const total = parseFloat(assignForm.totalAmount) || 0;
      const adv = assignForm.isFullPaid ? total : (parseFloat(assignForm.advanceAmount) || 0);
      const rem = assignForm.isFullPaid ? 0 : Math.max(0, total - adv);
      const pStatus = assignForm.isFullPaid || adv >= total ? 'paid' : adv > 0 ? 'partially_paid' : 'unpaid';

      await api.post('/pms/bookings/manual', {
        guestName: assignForm.guestName || chat.customerName || 'Guest',
        guestPhone: assignForm.guestPhone || chat.customerPhone,
        bookingType: 'couple',
        checkInDate: assignForm.checkInDate,
        checkOutDate: assignForm.checkOutDate,
        adults: parseInt(assignForm.adults) || 2,
        totalAmount: total,
        advancePayment: adv,
        remainingPayment: rem,
        paymentStatus: pStatus,
        roomId: assignForm.roomId,
        roomIds: [assignForm.roomId]
      });

      toast.success('🎉 Cottage Room Assigned & Synced Successfully!');
      setShowAssignModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign room');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || messageText;
    if (!text.trim() || isSending) return;

    setIsSending(true);
    try {
      let res;
      try {
        res = await api.post(`/chats/${chat._id}/message`, { text: text.trim() });
      } catch (err1) {
        try {
          res = await api.post(`/chats/${chat._id}/reply`, { text: text.trim() });
        } catch (err2) {
          res = await api.post(`/chats/${chat._id}/send`, { text: text.trim() });
        }
      }
      if (!textToSend) setMessageText('');
      if (res?.data?.chat && onChatUpdated) {
        onChatUpdated(res.data.chat);
      } else {
        fetchSingleChat();
      }
      toast.success('Message sent to WhatsApp');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Message failed to send — check WhatsApp connection');
    } finally {
      setIsSending(false);
    }
  };

  const isHot = chat?.leadStatus === 'hot' || (chat?.leadScore && chat.leadScore >= 70);

  const roomsBySeries = (availableRooms || []).reduce((acc, r) => {
    const series = r.seriesName || 'Other Cottages';
    if (!acc[series]) acc[series] = [];
    acc[series].push(r);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col bg-slate-100 relative overflow-hidden">
      
      {/* Executive Header */}
      <div className="p-4 bg-white border-b border-slate-200 shadow-xs flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="md:hidden p-2 text-slate-700 bg-slate-100 active:bg-slate-200 rounded-xl border border-slate-200 shrink-0 flex items-center justify-center"
            title="Back to conversation list"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            {chat?.customerName?.charAt(0).toUpperCase() || chat?.customerPhone?.slice(-2) || 'G'}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-sm text-slate-800">
                {chat?.customerName || formatPhoneDisplay(chat?.customerPhone)}
              </h2>
              {isHot && (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[10px] font-bold shadow-xs">
                  <Flame size={10} className="animate-pulse" />
                  <span>Hot Lead ({chat?.leadScore || 85})</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-2">
              <span className="font-mono font-medium">{formatPhoneDisplay(chat?.customerPhone)}</span>
              <span>•</span>
              <span className="capitalize font-medium text-emerald-800">Stage: {chat?.bookingStage || 'Inquiry'}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <a
            href={`tel:${chat?.customerPhone}`}
            className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl border border-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold"
            title="Call Customer"
          >
            <PhoneCall size={15} />
            <span className="hidden lg:inline">Call</span>
          </a>

          <button
            onClick={() => navigate('/pms/manual-booking')}
            className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 border border-amber-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1"
            title="Open Manual Booking Form"
          >
            <PlusCircle size={14} className="text-amber-600" />
            <span className="hidden sm:inline">Booking</span>
          </button>

          <button
            onClick={handleOpenAssignModal}
            className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-semibold text-xs rounded-xl transition-all flex items-center gap-1"
          >
            <Bed size={14} />
            <span className="hidden sm:inline">Cottage</span>
          </button>

          <button
            onClick={handleModeToggle}
            className={`px-2.5 py-1.5 sm:px-3 sm:py-2 font-bold text-xs rounded-xl border transition-all flex items-center gap-1.5 ${
              optimisticMode === 'ai'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
            }`}
          >
            {optimisticMode === 'ai' ? <Zap size={14} /> : <User size={14} />}
            <span>{optimisticMode === 'ai' ? 'AI Bot' : 'Staff'}</span>
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 whatsapp-bg chat-scrollbar"
      >
        {chat?.messages?.map((msg, index) => {
          const isCustomer = msg.sender === 'customer';
          const isBot = msg.sender === 'bot';

          return (
            <div
              key={index}
              className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} animate-fade-in`}
            >
              <div className={`max-w-[85%] sm:max-w-[70%] p-3.5 rounded-2xl shadow-sm space-y-1 relative ${
                isCustomer
                  ? 'bg-white text-slate-800 rounded-tl-xs border border-slate-200/90 shadow-slate-200/50'
                  : isBot
                  ? 'bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-tr-xs shadow-emerald-950/20'
                  : 'bg-gradient-to-r from-indigo-700 to-purple-800 text-white rounded-tr-xs shadow-indigo-950/20'
              }`}>
                <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 border-b border-white/10 pb-1 mb-1 font-semibold">
                  <span className="capitalize">{isCustomer ? (chat.customerName || formatPhoneDisplay(chat.customerPhone)) : isBot ? '🤖 AI Bot' : '👤 Staff'}</span>
                  <div className="flex items-center gap-1 font-mono">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {!isCustomer && <CheckCircle size={10} className="text-emerald-300" />}
                    {msg.deliveryStatus === 'failed' && (
                      <span className="text-rose-200 font-bold flex items-center gap-0.5 ml-1" title="Message failed to deliver to WhatsApp">
                        <AlertCircle size={12} className="text-rose-300" />
                        <span>Failed</span>
                      </span>
                    )}
                  </div>
                </div>
                {msg.messageType === 'image' || msg.mediaUrl || (msg.text && msg.text.includes('📷')) ? (
                  <div className="space-y-1.5">
                    {msg.mediaUrl ? (
                      <img src={msg.mediaUrl} alt="Received photo" className="max-w-full rounded-lg max-h-60 object-cover shadow-xs" />
                    ) : (
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-800 bg-emerald-50/80 p-2 rounded-lg text-xs border border-emerald-100">
                        📸 Photo Received
                      </div>
                    )}
                    {msg.text && msg.text !== '[Media]' && <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies Carousel Bar */}
      <div className="p-2 bg-white border-t border-slate-200 overflow-x-auto flex items-center gap-2 no-scrollbar">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2 shrink-0">Quick Replies:</span>
        {QUICK_REPLIES.map((qr, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(qr.text)}
            className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 rounded-lg text-slate-700 font-medium shrink-0 transition-colors"
          >
            {qr.label}
          </button>
        ))}
      </div>

      {/* Input Reply Bar */}
      <div className="p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center gap-2">
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type WhatsApp message to guest..."
          className="flex-1 px-4 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all shadow-inner"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={isSending || !messageText.trim()}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0"
        >
          {isSending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>

      {/* Room Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-md w-full p-6 space-y-4 bg-white animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800 flex items-center gap-2">
                <PlusCircle size={18} className="text-emerald-600" />
                <span>Assign Cottage Room to {chat.customerName || 'Guest'}</span>
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Check-In & Check-Out Date Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check-In Date</label>
                  <input
                    type="date"
                    value={assignForm.checkInDate}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, checkInDate: e.target.value, roomId: '' }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check-Out Date</label>
                  <input
                    type="date"
                    value={assignForm.checkOutDate}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, checkOutDate: e.target.value, roomId: '' }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Select Available Cottage Room</span>
                  {isLoadingRooms && <span className="text-[11px] text-emerald-600 font-medium animate-pulse">Checking availability...</span>}
                </label>
                <select
                  value={assignForm.roomId}
                  onChange={(e) => setAssignForm(prev => ({ ...prev, roomId: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
                  disabled={isLoadingRooms}
                >
                  <option value="">
                    {isLoadingRooms
                      ? '⏳ Searching available cottages...'
                      : availableRooms.length === 0
                      ? '❌ No cottages available for selected dates'
                      : `-- Choose Available Cottage (${availableRooms.length} available) --`}
                  </option>
                  {Object.entries(roomsBySeries).map(([series, rooms]) => (
                    <optgroup key={series} label={`🏡 ${series}`}>
                      {rooms.map(r => (
                        <option key={r.roomId} value={r.roomId}>
                          Room {r.roomNumber} ({r.seriesName} • Capacity: {r.capacity} Guests)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Guests</label>
                  <input
                    type="number"
                    value={assignForm.adults}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, adults: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Package (₹)</label>
                  <input
                    type="number"
                    value={assignForm.totalAmount}
                    onChange={(e) => {
                      const total = parseFloat(e.target.value) || 0;
                      setAssignForm(prev => ({
                        ...prev,
                        totalAmount: e.target.value,
                        advanceAmount: prev.isFullPaid ? total : prev.advanceAmount,
                        remainingAmount: prev.isFullPaid ? 0 : Math.max(0, total - (parseFloat(prev.advanceAmount) || 0))
                      }));
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Full Paid Checkbox & Payment Breakdown */}
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="assignFullPaid"
                    checked={assignForm.isFullPaid}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      const total = parseFloat(assignForm.totalAmount) || 0;
                      setAssignForm(prev => ({
                        ...prev,
                        isFullPaid: isChecked,
                        advanceAmount: isChecked ? total : 0,
                        remainingAmount: isChecked ? 0 : total
                      }));
                    }}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                  <label htmlFor="assignFullPaid" className="text-xs font-bold text-emerald-900 cursor-pointer">
                    ✓ Mark as Full Paid (₹{assignForm.totalAmount || 0})
                  </label>
                </div>

                {!assignForm.isFullPaid && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                    <div>
                      <label className="block text-[10px] font-semibold text-emerald-800 mb-0.5">Advance Paid (₹)</label>
                      <input
                        type="number"
                        value={assignForm.advanceAmount}
                        onChange={(e) => {
                          const adv = parseFloat(e.target.value) || 0;
                          const total = parseFloat(assignForm.totalAmount) || 0;
                          setAssignForm(prev => ({
                            ...prev,
                            advanceAmount: e.target.value,
                            remainingAmount: Math.max(0, total - adv)
                          }));
                        }}
                        className="w-full px-2.5 py-1 text-xs border border-emerald-300 rounded-lg bg-white font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-amber-800 mb-0.5">Remaining Balance (₹)</label>
                      <input
                        type="number"
                        readOnly
                        value={Math.max(0, (parseFloat(assignForm.totalAmount) || 0) - (parseFloat(assignForm.advanceAmount) || 0))}
                        className="w-full px-2.5 py-1 text-xs border border-amber-300 bg-amber-50 text-amber-900 rounded-lg font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignRoomSubmit}
                disabled={isAssigning}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
              >
                {isAssigning ? 'Assigning...' : 'Confirm Room Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
