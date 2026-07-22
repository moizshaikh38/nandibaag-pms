import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  MessageSquare, Calendar, AlertTriangle, Bell,
  RefreshCw, X, Check, Flame, Bot, User, Clock,
  ChevronRight, Clock3, Bed, Home, Mail, CalendarDays,
  CheckCircle, XCircle, Ban, LogIn, LogOut, Users, Grid3x3
} from 'lucide-react';

// ── Shared configs ──

const BOOKING_STATUS_CONFIG = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  pending_payment: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
  checked_in: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Checked In' },
  checked_out: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Checked Out' },
  no_show: { bg: 'bg-gray-200', text: 'text-gray-800', label: 'No Show' }
};

const MSG_TYPE_LABELS = {
  followup_3hr: 'Follow-up 3h', followup_1day: 'Follow-up 1d',
  followup_3day: 'Follow-up 3d', followup_7day: 'Follow-up 7d',
  checkin_reminder: 'Check-in', checkout_message: 'Check-out',
  review_request: 'Review'
};

const MSG_STATUS_ICON = { sent: CheckCircle, failed: XCircle, cancelled: Ban };

// ── Reusable components ──

function SectionCard({ title, icon: Icon, iconColor, badge, linkTo, linkLabel, onLinkClick, children, loading }) {
  return (
    <div className="bg-white rounded-lg shadow mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={18} className={iconColor || 'text-whatsapp'} />}
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          {badge !== undefined && badge !== null && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {badge}
            </span>
          )}
        </div>
        {linkLabel && (
          <button
            onClick={onLinkClick}
            className="text-sm text-whatsapp hover:text-whatsapp-light font-medium flex items-center gap-1 transition-colors"
          >
            {linkLabel} <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="p-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        ) : children}
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
      <div className="h-8 bg-gray-200 rounded w-1/2" />
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = BOOKING_STATUS_CONFIG[status] || BOOKING_STATUS_CONFIG.draft;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

// ── Main component ──

export default function Dashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  // Existing state
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [globalMode, setGlobalMode] = useState('ai');
  const [pendingModeChange, setPendingModeChange] = useState(null);
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // PMS section data
  const [pendingHandovers, setPendingHandovers] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [recentBookings, setRecentBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [inventorySummary, setInventorySummary] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [recentMessages, setRecentMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [todayOccupancy, setTodayOccupancy] = useState({ bookings: [], total: 0 });
  const [occupancyLoading, setOccupancyLoading] = useState(true);

  // ── Existing fetches ──

  const fetchStats = async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setStats(res.data.stats);
    } catch { /* silent */ } finally { setIsLoadingStats(false); }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      setGlobalMode(res.data.settings.globalMode);
      setFollowUpEnabled(res.data.settings.followUpEnabled);
    } catch { /* silent */ }
  };

  // ── PMS preview fetches ──

  const fetchPendingHandovers = async () => {
    setPendingLoading(true);
    try {
      const res = await api.get('/pms/pending-handovers');
      setPendingHandovers((res.data.handovers || []).slice(0, 4));
    } catch { /* silent */ } finally { setPendingLoading(false); }
  };

  const fetchRecentBookings = async () => {
    setBookingsLoading(true);
    try {
      const res = await api.get('/pms/bookings?limit=5');
      setRecentBookings(res.data.bookings || []);
    } catch { /* silent */ } finally { setBookingsLoading(false); }
  };

  const fetchInventorySummary = async () => {
    setInventoryLoading(true);
    try {
      const res = await api.get('/inventory/summary');
      setInventorySummary(res.data.summary);
    } catch { /* silent */ } finally { setInventoryLoading(false); }
  };

  const fetchRecentMessages = async () => {
    setMessagesLoading(true);
    try {
      const res = await api.get('/message-log?limit=5');
      setRecentMessages(res.data.logs || []);
    } catch { /* silent */ } finally { setMessagesLoading(false); }
  };

  const fetchTodayOccupancy = async () => {
    setOccupancyLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/pms/bookings?dateFrom=${today}&dateTo=${today}&limit=100`);
      setTodayOccupancy({ bookings: res.data.bookings || [], total: res.data.total || 0 });
    } catch { /* silent */ } finally { setOccupancyLoading(false); }
  };

  const refreshAllPms = useCallback(() => {
    fetchPendingHandovers();
    fetchRecentBookings();
    fetchInventorySummary();
    fetchRecentMessages();
    fetchTodayOccupancy();
  }, []);

  // ── Initial load ──

  useEffect(() => {
    fetchStats();
    fetchSettings();
    refreshAllPms();
    if ('Notification' in window) Notification.requestPermission().then(setNotificationPermission);
    const interval = setInterval(() => { fetchStats(); refreshAllPms(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Socket listeners (unchanged) ──

  useEffect(() => {
    if (!socket) return;
    const addAlert = (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
      toast(alert.message, { icon: alert.icon, duration: 5000 });
      if (notificationPermission === 'granted' && alert.showNotification) {
        new Notification(alert.title, { body: alert.message, icon: '/icons/icon-192.png' });
      }
    };
    const h = {
      handleHotLead: (d) => addAlert({ id: `hot-${d.chatId}-${Date.now()}`, type: 'hot_lead', title: 'Hot Lead Alert', message: `Hot lead: ${d.customerPhone} (score: ${d.score})`, icon: <Flame size={20} className="text-orange-500" />, chatId: d.chatId, customerPhone: d.customerPhone, timestamp: new Date(), showNotification: true }),
      handleAIFailure: (d) => addAlert({ id: `ai-fail-${d.chatId}-${Date.now()}`, type: 'ai_failure', title: 'AI Failure', message: `AI couldn't respond to ${d.customerPhone}`, icon: <AlertTriangle size={20} className="text-red-500" />, chatId: d.chatId, customerPhone: d.customerPhone, timestamp: new Date(), showNotification: true }),
      handleWADisconnect: (d) => addAlert({ id: `wa-${d.sessionId}-${Date.now()}`, type: 'whatsapp_disconnected', title: 'WhatsApp Disconnected', message: `Session ${d.sessionId}: ${d.reason}`, icon: <AlertCircle size={20} className="text-red-500" />, sessionId: d.sessionId, timestamp: new Date(), showNotification: true }),
      handleReconnectFail: (d) => addAlert({ id: `rf-${d.sessionId}-${Date.now()}`, type: 'reconnect_failed', title: 'Reconnection Failed', message: `Session ${d.sessionId} failed to reconnect`, icon: <AlertTriangle size={20} className="text-red-500" />, sessionId: d.sessionId, timestamp: new Date(), showNotification: true }),
      handleModeChange: (d) => { setGlobalMode(d.globalMode); toast.success(`Mode changed to ${d.globalMode === 'ai' ? 'AI' : 'Human'}`); }
    };
    socket.on('lead:hot_alert', h.handleHotLead);
    socket.on('lead:ai_failure_alert', h.handleAIFailure);
    socket.on('whatsapp:disconnected', h.handleWADisconnect);
    socket.on('whatsapp:reconnect_failed', h.handleReconnectFail);
    socket.on('settings:global_mode_changed', h.handleModeChange);
    return () => {
      socket.off('lead:hot_alert', h.handleHotLead);
      socket.off('lead:ai_failure_alert', h.handleAIFailure);
      socket.off('whatsapp:disconnected', h.handleWADisconnect);
      socket.off('whatsapp:reconnect_failed', h.handleReconnectFail);
      socket.off('settings:global_mode_changed', h.handleModeChange);
    };
  }, [socket, notificationPermission]);

  // ── Actions (unchanged) ──

  const handleToggleGlobalMode = () => setPendingModeChange(globalMode === 'ai' ? 'human' : 'ai');
  const updateGlobalMode = async (m) => {
    try { await api.patch('/settings/global-mode', { globalMode: m }); setGlobalMode(m); toast.success(`Switched to ${m === 'ai' ? 'AI' : 'Human'} mode`); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const handleToggleFollowUps = async () => {
    try { await api.patch('/settings/follow-ups', { followUpEnabled: !followUpEnabled }); setFollowUpEnabled(!followUpEnabled); toast.success(`Follow-ups ${!followUpEnabled ? 'enabled' : 'disabled'}`); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const handleRefresh = () => { fetchStats(); refreshAllPms(); };
  const formatRelTime = (d) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return new Date(d).toLocaleDateString();
  };
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-';

  // ── Today's occupancy helpers ──
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCheckIns = todayOccupancy.bookings.filter(b => b.checkInDate && b.checkInDate.split('T')[0] === todayStr);
  const todayCheckOuts = todayOccupancy.bookings.filter(b => b.checkOutDate && b.checkOutDate.split('T')[0] === todayStr);
  const activeToday = todayOccupancy.bookings.filter(b => b.status !== 'cancelled');
  const totalRooms = inventorySummary?.totalRooms || 0;
  const activeRooms = inventorySummary?.byStatus?.active || 0;
  const occupiedCount = activeToday.length;
  const occupancyPct = activeRooms > 0 ? Math.min(100, Math.round((occupiedCount / activeRooms) * 100)) : 0;

  return (
    <>
      <div className="p-4 pb-20 md:pb-4">
        <div className="max-w-6xl mx-auto">

          {/* ═══ EXISTING TOP SECTION ═══ */}

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            <button onClick={handleRefresh} className="p-2 text-gray-600 hover:text-whatsapp transition-colors" title="Refresh">
              <RefreshCw size={20} className={isLoadingStats ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Global Mode */}
          <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Global Mode</h2>
                <p className="text-sm text-gray-600">{globalMode === 'ai' ? 'AI is responding to all customer messages' : 'Staff must manually respond to all messages'}</p>
              </div>
              {isAdmin && (
                <button onClick={handleToggleGlobalMode} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${globalMode === 'ai' ? 'bg-whatsapp text-white hover:bg-whatsapp-light' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>
                  {globalMode === 'ai' ? <><Bot size={20} /> AI Mode</> : <><User size={20} /> Human Mode</>}
                </button>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {isLoadingStats ? (<><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>) : (<>
              <div className="bg-white rounded-lg shadow p-4 md:p-6">
                <div className="flex items-center gap-2 mb-2"><MessageSquare className="text-whatsapp" size={20} /><span className="text-sm text-gray-600">Sessions</span></div>
                <p className="text-2xl font-bold text-gray-800">{stats?.activeSessions || 0} connected</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 md:p-6">
                <div className="flex items-center gap-2 mb-2"><MessageSquare className="text-blue-500" size={20} /><span className="text-sm text-gray-600">Chats Today</span></div>
                <p className="text-2xl font-bold text-gray-800">{stats?.chatsToday || 0}</p>
              </div>
              <button onClick={() => navigate('/chats?filter=hot')} className="bg-white rounded-lg shadow p-4 md:p-6 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-2 mb-2"><Flame className="text-orange-500" size={20} /><span className="text-sm text-gray-600">Hot Leads</span></div>
                <p className="text-2xl font-bold text-gray-800">{stats?.hotLeadsCount || 0}</p>
              </button>
              <div className="bg-white rounded-lg shadow p-4 md:p-6">
                <div className="flex items-center gap-2 mb-2"><Calendar className="text-green-500" size={20} /><span className="text-sm text-gray-600">Bookings</span></div>
                <p className="text-2xl font-bold text-gray-800">{stats?.bookingsThisWeek || 0}</p>
              </div>
              <button onClick={() => navigate('/pms/pending')} className="bg-white rounded-lg shadow p-4 md:p-6 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-2 mb-2"><Clock className="text-amber-500" size={20} /><span className="text-sm text-gray-600">Pending</span></div>
                <p className="text-2xl font-bold text-gray-800">{pendingHandovers.length}</p>
              </button>
            </>)}
          </div>

          {/* AI Failures */}
          {stats?.aiFailuresLast24h > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-red-600" size={24} />
                <div><h3 className="font-semibold text-red-800">AI Failures</h3><p className="text-sm text-red-700">{stats.aiFailuresLast24h} failure(s) in 24h</p></div>
              </div>
            </div>
          )}

          {/* Follow-ups */}
          <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-6">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-semibold text-gray-800 mb-1">Follow-ups</h2><p className="text-sm text-gray-600">{followUpEnabled ? 'Enabled' : 'Disabled'}</p></div>
              {isAdmin && (
                <button onClick={handleToggleFollowUps} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${followUpEnabled ? 'bg-whatsapp text-white hover:bg-whatsapp-light' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>
                  {followUpEnabled ? <><Check size={20} /> Enabled</> : <><X size={20} /> Disabled</>}
                </button>
              )}
            </div>
          </div>

          {/* Live Alerts */}
          <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><Bell size={20} /> Live Alerts</h2>
              {alerts.length > 0 && <button onClick={() => setAlerts([])} className="text-sm text-gray-600 hover:text-gray-800">Clear All</button>}
            </div>
            {alerts.length === 0 ? (
              <div className="text-center py-6 text-gray-500"><Bell size={36} className="mx-auto mb-2 text-gray-300" /><p>No recent alerts</p></div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alerts.slice(0, 8).map(a => (
                  <div key={a.id} className={`p-3 rounded-lg border ${a.type === 'hot_lead' ? 'bg-orange-50 border-orange-200' : a.type === 'ai_failure' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1"><div className="flex items-center gap-2 mb-0.5">{a.icon}<span className="font-medium text-gray-800 text-sm">{a.title}</span></div><p className="text-sm text-gray-700">{a.message}</p><p className="text-xs text-gray-500 mt-0.5">{formatRelTime(a.timestamp)}</p></div>
                      <div className="flex items-center gap-1">
                        {a.chatId && <button onClick={() => navigate(`/chats/${a.chatId}`)} className="text-xs bg-whatsapp text-white px-2 py-1 rounded hover:bg-whatsapp-light">Chat</button>}
                        <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ PMS SECTION BLOCKS ═══ */}

          <div className="border-t-2 border-whatsapp/20 pt-6 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Property Management</h2>
          </div>

          {/* Availability - Staff's main daily tool */}
          <SectionCard
            title="Room Availability"
            icon={Grid3x3}
            iconColor="text-whatsapp"
            linkLabel="Open Grid"
            onLinkClick={() => navigate('/availability')}
          >
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-2">View and book rooms by date</p>
              <p className="text-xs text-gray-500">Select rooms for walk-in or phone bookings</p>
            </div>
          </SectionCard>

          {/* 1. Pending Bookings */}
          <SectionCard
            title="Pending Bookings"
            icon={Clock3}
            iconColor="text-amber-500"
            badge={pendingHandovers.length > 0 ? `${pendingHandovers.length} waiting` : null}
            linkLabel="View All"
            onLinkClick={() => navigate('/pms/pending')}
            loading={pendingLoading}
          >
            {pendingHandovers.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                <p className="text-gray-600 font-medium">All caught up</p>
                <p className="text-sm text-gray-400">No pending handovers right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingHandovers.map(h => {
                  const draft = h.bookingDraft || {};
                  const gc = (draft.adults || 0) + (draft.kids || []).length;
                  return (
                    <button key={h._id} onClick={() => navigate('/pms/pending')} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-whatsapp hover:bg-green-50/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{h.customerName || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 truncate">{h.customerPhone} &middot; {gc} guest{gc !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-xs text-gray-500">{draft.date || 'No date'}</p>
                          {draft.calculatedPrice > 0 && <p className="text-xs font-medium text-gray-700">₹{draft.calculatedPrice.toLocaleString()}</p>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* 2. Today's Occupancy */}
          <SectionCard
            title="Today's Occupancy"
            icon={CalendarDays}
            iconColor="text-whatsapp"
            linkLabel="Open Calendar"
            onLinkClick={() => navigate('/pms/calendar')}
            loading={occupancyLoading}
          >
            <div className="mb-3">
              <p className="text-sm text-gray-500 mb-2">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {/* Occupancy bar */}
              <div className="flex items-center gap-3 mb-1">
                <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-whatsapp rounded-full transition-all duration-500" style={{ width: `${occupancyPct}%` }} />
                </div>
                <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-right">{occupancyPct}%</span>
              </div>
              <p className="text-xs text-gray-500">
                {occupiedCount} of {activeRooms} active rooms occupied today
              </p>
            </div>
            {/* Check-ins / Check-outs */}
            {(todayCheckIns.length > 0 || todayCheckOuts.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {todayCheckIns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1 flex items-center gap-1"><LogIn size={12} /> Check-ins ({todayCheckIns.length})</p>
                    <div className="space-y-1">
                      {todayCheckIns.slice(0, 3).map(b => (
                        <p key={b._id} className="text-sm text-gray-700 truncate">{b.customerName} <span className="text-gray-400">{b.room ? `· Room ${b.room.roomNumber}` : ''}</span></p>
                      ))}
                      {todayCheckIns.length > 3 && <p className="text-xs text-gray-400">+{todayCheckIns.length - 3} more</p>}
                    </div>
                  </div>
                )}
                {todayCheckOuts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1 flex items-center gap-1"><LogOut size={12} /> Check-outs ({todayCheckOuts.length})</p>
                    <div className="space-y-1">
                      {todayCheckOuts.slice(0, 3).map(b => (
                        <p key={b._id} className="text-sm text-gray-700 truncate">{b.customerName} <span className="text-gray-400">{b.room ? `· Room ${b.room.roomNumber}` : ''}</span></p>
                      ))}
                      {todayCheckOuts.length > 3 && <p className="text-xs text-gray-400">+{todayCheckOuts.length - 3} more</p>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-2">No check-ins or check-outs scheduled today</p>
            )}
          </SectionCard>

          {/* 3. Recent Bookings */}
          <SectionCard
            title="Recent Bookings"
            icon={Bed}
            iconColor="text-blue-500"
            linkLabel="View All Bookings"
            onLinkClick={() => navigate('/pms/bookings')}
            loading={bookingsLoading}
          >
            {recentBookings.length === 0 ? (
              <div className="text-center py-6">
                <Bed size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-gray-500 text-sm">No bookings yet — they'll appear here once confirmed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentBookings.map(b => {
                  const gc = (b.adults || 0) + (b.kids || []).length;
                  return (
                    <button key={b._id} onClick={() => navigate('/pms/bookings')} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-medium text-gray-800 truncate">{b.customerName}</p>
                            <StatusPill status={b.status} />
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {fmtDate(b.checkInDate)} → {fmtDate(b.checkOutDate)} &middot; {gc} guest{gc !== 1 ? 's' : ''}
                            {b.room ? ` · Room ${b.room.roomNumber}` : ''}
                          </p>
                        </div>
                        {b.totalAmount > 0 && <span className="text-xs font-medium text-gray-600 ml-2">₹{b.totalAmount.toLocaleString()}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* 4. Room Inventory Summary */}
          <SectionCard
            title="Room Inventory"
            icon={Home}
            iconColor="text-green-600"
            linkLabel="Manage Inventory"
            onLinkClick={() => navigate('/inventory')}
            loading={inventoryLoading}
          >
            {inventorySummary ? (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-700">{inventorySummary.byStatus?.active || 0}</p>
                    <p className="text-xs text-green-600">Active</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-700">{inventorySummary.totalActiveCapacity || 0}</p>
                    <p className="text-xs text-blue-600">Capacity</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-lg">
                    <p className="text-2xl font-bold text-amber-700">{inventorySummary.byStatus?.maintenance || 0}</p>
                    <p className="text-xs text-amber-600">Maintenance</p>
                  </div>
                </div>
                {/* Per-series mini bars */}
                {inventorySummary.bySeries && inventorySummary.bySeries.length > 0 && (
                  <div className="space-y-1.5">
                    {inventorySummary.bySeries.map(s => (
                      <div key={s.seriesId} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600 min-w-[80px]">{s.name}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-whatsapp rounded-full" style={{ width: `${(s.activeCount / Math.max(s.count, 1)) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 min-w-[50px] text-right">{s.activeCount}/{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No inventory data — run seed-rooms to initialize</p>
            )}
          </SectionCard>

          {/* 5. Recent Message Activity */}
          <SectionCard
            title="Recent Message Activity"
            icon={Mail}
            iconColor="text-purple-500"
            linkLabel="View Full Log"
            onLinkClick={() => navigate('/pms/message-log')}
            loading={messagesLoading}
          >
            {recentMessages.length === 0 ? (
              <div className="text-center py-6">
                <Mail size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-gray-500 text-sm">No messages logged yet</p>
                <p className="text-xs text-gray-400 mt-1">Automated messages will appear once bookings are active</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentMessages.map(log => {
                  const StatusIcon = MSG_STATUS_ICON[log.status] || CheckCircle;
                  const statusColor = log.status === 'sent' ? 'text-green-600' : log.status === 'failed' ? 'text-red-600' : 'text-gray-500';
                  return (
                    <button key={log._id} onClick={() => navigate('/pms/message-log')} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{MSG_TYPE_LABELS[log.messageType] || log.messageType}</span>
                            <StatusIcon size={12} className={statusColor} />
                            <span className={`text-xs capitalize ${statusColor}`}>{log.status}</span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {log.guestPhone}
                            {log.bookingId?.customerName && <span className="text-gray-400"> · {log.bookingId.customerName}</span>}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{formatRelTime(log.sentAt || log.createdAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

        </div>
      </div>

      {/* Global Mode Modal */}
      {pendingModeChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-yellow-500" size={24} />
              <h3 className="text-lg font-semibold">Switch to {pendingModeChange === 'ai' ? 'AI' : 'Human'} Mode?</h3>
            </div>
            <p className="text-gray-600 mb-6">This will switch ALL chats to {pendingModeChange === 'ai' ? 'AI' : 'Human'} mode.</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingModeChange(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={async () => { await updateGlobalMode(pendingModeChange); setPendingModeChange(null); }} className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900">Continue</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
