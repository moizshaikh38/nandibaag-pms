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
  AlertCircle,
  CreditCard,
  Building,
  Package
} from 'lucide-react';

const QUICK_REPLIES = [
  { 
    label: '💰 Cottage Rates', 
    text: `Booking Details

Group Booking

✅ Weekday (Mon – Thurs): ₹2000 per person
✅ Weekend (Fri – Sun): ₹3000 per person
✅ Kids Pricing:
Below 5 years: Free
6 to 10 years: ₹1000 per child
Above 10 years: Charged as an adult
⏳ Check-in: 12:00 PM
⏳ Check-out: 10:30 AM

Couple Booking
✅ Weekday (Mon – Thurs): ₹5500 per couple
✅ Weekend (Fri – Sun): ₹6500 per couple
✅ KIDS CHARGES
Below 5 yrs : Free
6 to 10 yrs: ₹ 1000 per child
10 to 15 yrs :1500 per child

Includes: 4 meals + activities

⏳ Check-in: 12:00 PM
⏳ Check-out: 10:30 AM

One-Day Package

Weekday
✅ Breakfast to Dinner: ₹1250 pp
✅️Breakfast to Hiitea 1000 pp

Weekend
✅ Breakfast to Dinner 1500 pp
✅️Breakfast to Hiiitea 1250 pp

✅ ONE DAY PICNIC ROOM CHARGES 2000
ROOM STRICTLY ALLOTTED AT 12 PM

NOTE : GST CHARGE 5% IN WHOLE AMOUNT. IT IS COMPULSORY ANY MODE OF PAYMENT

✅ INCLUDING ACTIVITIES
KAYAKING
BARMABRIDGE
ROPE CYCLING
INDOOR OUTDOOR GAMES
POOL
BABY POOL
RAINDANCE

Activities timing
Kayaking and rope cycling
9:00 am to 1:30 pm
3:00 pm to 6:00 pm

DOLLERS CAFE TIMING
12:00 PM TO 12:00 AM

OUR POLICY : -
ONE DAY PICNIC STRICTLY ROOM ALLOTTED AT 12:00 PM
NONVEG NOT ALLOWED IN PROPERTY
REFUND POLICY:
NON REFUNDABLE` 
  },
  { label: '🏊 Pool & Activities', text: 'Namaste! Outdoor & Swimming pool is included in all packages. Activities timing: Kayaking & Rope Cycling from 9:00 AM to 1:30 PM & 3:00 PM to 6:00 PM.' },
  { label: '⏰ Check-in/Out', text: 'Check-in time is 12:00 PM (Noon) and Check-out time is 10:30 AM.' },
  { label: '📍 Location', text: 'Nandibaag Resort is located in Karjat, Maharashtra. We provide free parking on premises for all guests.' },
  { label: '💳 Payment & GST', text: 'Note: 5% GST charge is applicable on the whole amount across any mode of payment. Advance payment via Google Pay / PhonePe / Paytm / UPI.' }
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
    setIsLoadingRooms(true);
    try {
      const res = await api.get('/rooms/availability-realtime', {
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
      packageType: 'couple',
      mealOption: 'B->D',
      adults: chat?.bookingDraft?.adults || 2,
      children: 0,
      guestName: chat?.customerName || '',
      guestPhone: chat?.customerPhone || '+91',
      bookedByName: '',
      guestIdProofType: 'aadhaar',
      notes: '',
      roomId: '',
      selectedRooms: [],
      totalAmount: 3500,
      advanceAmount: 0,
      remainingAmount: 3500,
      isFullPaid: false
    }));
    fetchAvailableRooms(inDate, outDate);
  };

  const handleRoomChipToggle = (room) => {
    const num = String(room.number || room.roomNumber || room._id || room.roomId);
    setAssignForm(prev => {
      const current = prev.selectedRooms;
      let updated;
      if (current.includes(num)) {
        updated = current.filter(r => r !== num);
      } else {
        updated = [...current, num];
      }
      return {
        ...prev,
        selectedRooms: updated,
        roomId: updated.join(', ')
      };
    });
  };

  const handleAssignRoomSubmit = async (e) => {
    if (e) e.preventDefault();
    const roomsToBook = assignForm.selectedRooms.length > 0 ? assignForm.selectedRooms : (assignForm.roomId ? [assignForm.roomId] : []);
    if (roomsToBook.length === 0) {
      toast.error('Please select at least one available cottage room!');
      return;
    }
    setIsAssigning(true);
    try {
      const total = parseFloat(assignForm.totalAmount) || 0;
      const adv = assignForm.isFullPaid ? total : (parseFloat(assignForm.advanceAmount) || 0);
      const rem = assignForm.isFullPaid ? 0 : Math.max(0, total - adv);
      const pStatus = assignForm.isFullPaid || adv >= total ? 'paid' : adv > 0 ? 'partially_paid' : 'unpaid';

      await api.post('/bookings/manual-booking', {
        customerName: assignForm.guestName || chat.customerName || 'Guest',
        customerPhone: assignForm.guestPhone || chat.customerPhone,
        packageType: assignForm.packageType,
        mealOption: assignForm.mealOption,
        checkInDate: assignForm.checkInDate,
        checkOutDate: assignForm.checkOutDate,
        guestComposition: { adults: parseInt(assignForm.adults) || 2, children: parseInt(assignForm.children) || 0 },
        bookedBy: { name: assignForm.bookedByName || 'Front Desk' },
        totalAmount: total,
        advancePaid: adv,
        remainingPayment: rem,
        paymentStatus: pStatus,
        roomId: roomsToBook.join(', '),
        roomIds: roomsToBook,
        notes: assignForm.notes
      });

      toast.success('🎉 Cottage Room Assigned & Synced to PMS!');
      setShowAssignModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to assign room');
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
    <div className="h-full min-h-0 flex flex-col bg-slate-100 relative overflow-hidden">
      
      {/* Authentic WhatsApp Top Bar Header */}
      <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-[#075e54] text-white shadow-md flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onClose}
            className="md:hidden p-2 text-white bg-white/10 active:bg-white/20 rounded-xl border border-white/20 shrink-0 flex items-center justify-center font-bold active:scale-95 transition-all"
            title="Back to chat list"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#128c7e] text-white flex items-center justify-center font-extrabold text-sm shadow-xs shrink-0 border border-white/20">
            {chat?.customerName?.charAt(0).toUpperCase() || chat?.customerPhone?.slice(-2) || 'G'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate">
              <h2 className="font-display font-extrabold text-sm sm:text-base text-white truncate">
                {chat?.customerName || formatPhoneDisplay(chat?.customerPhone)}
              </h2>
              {isHot && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-extrabold shadow-2xs shrink-0">
                  <Flame size={9} className="animate-pulse fill-amber-200" />
                  <span>Hot</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-emerald-100/90 flex items-center gap-1.5 truncate">
              <span className="font-mono font-medium">{formatPhoneDisplay(chat?.customerPhone)}</span>
              <span>•</span>
              <span className="capitalize font-bold text-amber-200">{chat?.bookingStage || 'Inquiry'}</span>
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={`tel:${chat?.customerPhone}`}
            className="p-2 sm:px-3 sm:py-1.5 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl border border-white/20 transition-all flex items-center gap-1 text-xs font-bold"
            title="Call Guest"
          >
            <PhoneCall size={15} className="text-emerald-200" />
            <span className="hidden lg:inline">Call</span>
          </a>

          <button
            onClick={handleOpenAssignModal}
            className="p-2 sm:px-3 sm:py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1 shadow-xs active:scale-95"
            title="Assign Cottage Room"
          >
            <Bed size={15} />
            <span className="hidden sm:inline">Assign Cottage</span>
          </button>

          <button
            onClick={handleModeToggle}
            className={`p-2 sm:px-3 sm:py-1.5 font-extrabold text-xs rounded-xl border transition-all flex items-center gap-1 shadow-xs active:scale-95 ${
              optimisticMode === 'ai'
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-indigo-600 text-white border-indigo-400'
            }`}
            title="Toggle AI Bot / Staff Mode"
          >
            {optimisticMode === 'ai' ? <Zap size={15} /> : <User size={15} />}
            <span className="hidden sm:inline">{optimisticMode === 'ai' ? 'AI Auto' : 'Staff'}</span>
          </button>
        </div>
      </div>

      {/* Messages Stream with Authentic WhatsApp Wallpaper */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-2.5 whatsapp-bg chat-scrollbar relative whatsapp-messages-scroll"
      >
        {chat?.messages?.map((msg, index) => {
          const isCustomer = msg.sender === 'customer';
          const isBot = msg.sender === 'bot';

          return (
            <div
              key={index}
              className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} animate-fade-in`}
            >
              <div className={`max-w-[88%] sm:max-w-[75%] p-3 rounded-2xl shadow-xs space-y-1 relative ${
                isCustomer
                  ? 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/80 shadow-slate-300/40'
                  : 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs border border-emerald-200/80 shadow-emerald-900/10'
              }`}>
                {/* Sender Header */}
                <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500 font-semibold border-b border-slate-900/5 pb-1 mb-1">
                  <span className={`font-bold ${isCustomer ? 'text-emerald-800' : isBot ? 'text-teal-800' : 'text-indigo-800'}`}>
                    {isCustomer ? (chat.customerName || formatPhoneDisplay(chat.customerPhone)) : isBot ? '🤖 AI Assistant' : '👤 Staff Member'}
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[9px]">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {!isCustomer && (
                      <span className="text-[#34b7f1] font-bold" title="Delivered to WhatsApp">✓✓</span>
                    )}
                    {msg.deliveryStatus === 'failed' && (
                      <span className="text-rose-600 font-bold flex items-center gap-0.5 ml-1" title="Message failed to deliver to WhatsApp">
                        <AlertCircle size={12} />
                        <span>Failed</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                {msg.messageType === 'image' || msg.mediaUrl || (msg.text && msg.text.includes('📷')) ? (
                  <div className="space-y-1.5">
                    {msg.mediaUrl ? (
                      <img src={msg.mediaUrl} alt="Received photo" className="max-w-full rounded-xl max-h-64 object-cover shadow-xs border border-slate-200" />
                    ) : (
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-800 bg-emerald-50/90 p-2 rounded-xl text-xs border border-emerald-200">
                        📸 Photo Received
                      </div>
                    )}
                    {msg.text && msg.text !== '[Media]' && <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans text-slate-900">{msg.text}</p>}
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans text-slate-900">{msg.text}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />

        {/* Scroll-to-bottom Floating Button */}
        {isUserScrolledUp && (
          <button
            onClick={() => {
              setIsUserScrolledUp(false);
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="sticky bottom-2 left-full -translate-x-2 p-2 bg-white text-slate-700 hover:text-emerald-700 rounded-full shadow-lg border border-slate-200 transition-all active:scale-90 flex items-center justify-center z-20"
            title="Scroll to latest message"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* Quick Reply Template Chips Bar */}
      <div className="px-2 py-2 bg-[#f0f2f5] border-t border-slate-200/90 overflow-x-auto overscroll-x-contain flex items-center gap-2 no-scrollbar whatsapp-quick-replies">
        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider pl-1 sm:pl-2 shrink-0">Templates:</span>
        {QUICK_REPLIES.map((qr, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(qr.text)}
            className="min-h-9 px-3 py-1.5 text-xs bg-white hover:bg-emerald-50 hover:text-emerald-900 border border-slate-200/90 rounded-xl text-slate-800 font-bold shrink-0 transition-all active:scale-95 shadow-2xs whitespace-nowrap"
          >
            {qr.label}
          </button>
        ))}
      </div>

      {/* Spacious WhatsApp Input Reply Bar */}
      <div className="p-2.5 sm:p-3 bg-[#f0f2f5] border-t border-slate-200/90 flex items-end gap-2 safe-pb shrink-0">
        <div className="flex-1 min-w-0 bg-white border border-slate-300/80 rounded-2xl shadow-inner flex items-center px-3 py-2 sm:py-1.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            rows={Math.min(5, Math.max(1, messageText.split('\n').length))}
            placeholder="Type WhatsApp message (Enter to send, Shift+Enter for new line)..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            className="w-full text-base sm:text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none resize-none font-sans leading-normal py-1 custom-scrollbar"
            style={{ minHeight: '50px', maxHeight: '150px', fontSize: '16px', lineHeight: '1.5' }}
          />
        </div>

        <button
          onClick={() => handleSendMessage()}
          disabled={isSending || !messageText.trim()}
          className="w-12 h-12 sm:w-11 sm:h-11 bg-[#00a884] hover:bg-[#06cf9c] active:scale-95 disabled:opacity-40 text-white font-extrabold text-xs rounded-full shadow-md transition-all flex items-center justify-center shrink-0"
          title="Send WhatsApp Message"
        >
          {isSending ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      {/* Room Assign Modal (Full Mobile-Optimized Manual Booking Form Style) */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full my-auto overflow-hidden animate-fade-in shadow-2xl border border-slate-200/90 text-slate-800">
            
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 px-4 py-3.5 sm:px-6 sm:py-4 text-white flex items-center justify-between gap-2 border-b border-emerald-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xs shrink-0">
                  <Bed size={18} className="text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-display font-extrabold leading-none tracking-tight">
                    Assign Cottage Room
                  </h3>
                  <p className="text-[11px] text-emerald-200/90 font-medium mt-1">
                    Guest: <strong>{chat.customerName || formatPhoneDisplay(chat.customerPhone)}</strong> • Direct PMS Sync
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center transition-all text-sm shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignRoomSubmit} className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto custom-scrollbar">
              
              {/* 1. Stay Dates */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Calendar size={14} className="text-emerald-600" /> Stay Dates & Guest Info
                </h4>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Check-in Date *</label>
                    <input
                      type="date"
                      value={assignForm.checkInDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAssignForm(prev => {
                          let updated = { ...prev, checkInDate: val, roomId: '', selectedRooms: [] };
                          const isOneDay = prev.packageType === 'oneDay' || prev.packageType === 'picnic';
                          const inTime = new Date(val).getTime();
                          const outTime = new Date(prev.checkOutDate).getTime();
                          if (isOneDay) {
                            if (isNaN(outTime) || outTime < inTime) {
                              updated.checkOutDate = val;
                            }
                          } else {
                            if (isNaN(outTime) || inTime >= outTime) {
                              updated.checkOutDate = new Date(inTime + 86400000).toISOString().split('T')[0];
                            }
                          }
                          return updated;
                        });
                      }}
                      required
                      className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Check-out Date *</label>
                    <input
                      type="date"
                      value={assignForm.checkOutDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAssignForm(prev => {
                          let updated = { ...prev, checkOutDate: val, roomId: '', selectedRooms: [] };
                          const isOneDay = prev.packageType === 'oneDay' || prev.packageType === 'picnic';
                          const outTime = new Date(val).getTime();
                          const inTime = new Date(prev.checkInDate).getTime();
                          if (isOneDay) {
                            if (isNaN(inTime) || outTime < inTime) {
                              updated.checkInDate = val;
                            }
                          } else {
                            if (isNaN(inTime) || outTime <= inTime) {
                              updated.checkInDate = new Date(outTime - 86400000).toISOString().split('T')[0];
                            }
                          }
                          return updated;
                        });
                      }}
                      required
                      className="w-full px-3 py-2 text-xs sm:text-sm font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Guest Full Name *</label>
                    <input
                      type="text"
                      value={assignForm.guestName}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, guestName: e.target.value }))}
                      required
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Guest WhatsApp Phone *</label>
                    <input
                      type="text"
                      value={assignForm.guestPhone}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, guestPhone: e.target.value }))}
                      required
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Package Type Selection */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Package size={14} className="text-emerald-600" /> Package Type & Guest Count
                </h4>

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
                        setAssignForm(prev => {
                          let out = prev.checkOutDate;
                          if (pkg.id === 'oneDay') {
                            out = prev.checkInDate;
                          } else if (out <= prev.checkInDate) {
                            out = new Date(new Date(prev.checkInDate).getTime() + 86400000).toISOString().split('T')[0];
                          }
                          return {
                            ...prev,
                            packageType: pkg.id,
                            checkOutDate: out,
                            roomId: '',
                            selectedRooms: []
                          };
                        });
                      }}
                      className={`p-2 text-left rounded-xl border transition-all ${
                        assignForm.packageType === pkg.id
                          ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-xs font-extrabold block">{pkg.label}</span>
                      <span className={`text-[9px] block ${assignForm.packageType === pkg.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {pkg.sub}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Meal Options for One Day Picnic */}
                {assignForm.packageType === 'oneDay' && (
                  <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 space-y-1.5">
                    <label className="block text-xs font-extrabold text-sky-950">Meal Option:</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'B->D', label: 'B → D', time: '9am - 9:30pm' },
                        { value: 'B->T', label: 'B → Tea', time: '9am - 6:30pm' }
                      ].map(opt => (
                        <button
                          type="button"
                          key={opt.value}
                          onClick={() => setAssignForm(prev => ({ ...prev, mealOption: opt.value }))}
                          className={`p-2 rounded-xl border text-center font-bold text-xs ${
                            assignForm.mealOption === opt.value
                              ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          <div>{opt.label}</div>
                          <div className="text-[9px] opacity-80">{opt.time}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Adults (12+ Yrs)</label>
                    <input
                      type="number"
                      min="1"
                      value={assignForm.adults}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, adults: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Children (&lt;12 Yrs)</label>
                    <input
                      type="number"
                      min="0"
                      value={assignForm.children}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, children: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-center"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Multi-Room Interactive Selection Grid */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <Building size={14} className="text-emerald-600" /> Select Cottage Rooms
                  </h4>
                  {isLoadingRooms && <span className="text-[10px] text-emerald-700 font-bold animate-pulse">Checking...</span>}
                </div>

                {availableRooms.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 p-1.5 bg-white border border-slate-200 rounded-xl no-scrollbar">
                    {Object.entries(roomsBySeries).map(([seriesName, rooms]) => (
                      <div key={seriesName} className="space-y-1.5">
                        <div className="text-[11px] font-extrabold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center justify-between">
                          <span>🏡 {seriesName}</span>
                          <span className="text-[10px] text-emerald-700 font-bold">{rooms.filter(r => r.status === 'available' || r.status === 'reserved_by_you').length} available</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {rooms.map((room) => {
                            const num = String(room.number || room.roomNumber || room._id || room.roomId);
                            const cap = room.capacity || 4;
                            const isChecked = assignForm.selectedRooms.includes(num);

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
                                onClick={() => !isDisabled && handleRoomChipToggle(room)}
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
                                <div className="flex items-center justify-between text-[10px] mt-1 opacity-90">
                                  <span>Cap: {cap}</span>
                                  <span className="font-extrabold uppercase">
                                    {isMaintenance ? '🔧 LOCK' : isBooked ? 'Booked' : isReservedByOther ? 'Held' : isChecked ? 'Selected' : 'Available'}
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
                    {isLoadingRooms ? '⏳ Fetching available rooms...' : 'No available rooms for selected dates.'}
                  </p>
                )}

                {assignForm.selectedRooms.length > 0 && (
                  <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-xs font-bold flex items-center justify-between">
                    <span>Selected: {assignForm.selectedRooms.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* 4. Payment Breakdown Card */}
              <div className="p-4 rounded-2xl bg-slate-950 text-white space-y-3 shadow-xl border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CreditCard size={14} /> Payment Summary
                  </h4>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
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
                      required
                      className="w-full px-2.5 py-2 text-sm font-extrabold border border-slate-700 rounded-xl bg-slate-900 text-white text-center shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-emerald-400 mb-1">Advance (₹)</label>
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
                      className="w-full px-2.5 py-2 text-sm font-extrabold border border-emerald-800 rounded-xl bg-emerald-950 text-emerald-300 text-center shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-amber-400 mb-1">Balance (₹)</label>
                    <input
                      type="number"
                      readOnly
                      value={Math.max(0, (parseFloat(assignForm.totalAmount) || 0) - (parseFloat(assignForm.advanceAmount) || 0))}
                      className="w-full px-2.5 py-2 text-sm font-extrabold border border-amber-800 bg-amber-950 text-amber-300 rounded-xl text-center shadow-inner"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAssigning}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white font-display font-extrabold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAssigning ? 'Assigning Cottage...' : '✓ Assign & Confirm Reservation'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
