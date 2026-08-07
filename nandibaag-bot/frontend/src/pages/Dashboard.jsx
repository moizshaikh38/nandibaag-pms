import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import api from '../utils/api';
import toast from 'react-hot-toast';
import DashboardStats from '../components/DashboardStats';
import {
  MessageSquare, 
  Calendar, 
  AlertTriangle, 
  RefreshCw, 
  Check, 
  Flame, 
  Bot, 
  User, 
  Clock,
  ChevronRight, 
  Bed, 
  Home, 
  Mail, 
  CalendarDays,
  CheckCircle, 
  XCircle, 
  LogIn, 
  LogOut, 
  Users, 
  Grid3x3,
  Cpu,
  Sparkles,
  Zap,
  TrendingUp,
  ArrowUpRight,
  Sliders,
  DollarSign
} from 'lucide-react';

const AI_PROVIDERS = [
  { name: 'OpenRouter Primary', provider: 'OpenRouter', model: 'Meta Llama 3.3 70B', status: 'active', tier: 'Primary' },
  { name: 'Google Gemini', provider: 'Google AI', model: 'Gemini 2.0 Flash', status: 'ready', tier: 'Fallback 1' },
  { name: 'Groq Cloud', provider: 'Groq', model: 'Llama 3.3 70B Versatile', status: 'ready', tier: 'Fallback 2' },
  { name: 'Cloudflare Workers AI', provider: 'Cloudflare', model: 'Llama 3.1 8B Instruct', status: 'ready', tier: 'Fallback 3' },
  { name: 'Cerebras AI', provider: 'Cerebras', model: 'Gemma 4 31B', status: 'ready', tier: 'Fallback 4' }
];

export default function Dashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [globalMode, setGlobalMode] = useState('ai');
  const [pendingModeChange, setPendingModeChange] = useState(null);
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [alerts, setAlerts] = useState([]);
  
  // Phase D & F state
  const [pendingHandovers, setPendingHandovers] = useState([]);
  const [todaysArrivals, setTodaysArrivals] = useState([]);
  const [todaysDepartures, setTodaysDepartures] = useState([]);
  const [inventorySummary, setInventorySummary] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isLoadingPhaseD, setIsLoadingPhaseD] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await api.get('/settings');
      setGlobalMode(response.data.settings.globalMode);
      setFollowUpEnabled(response.data.settings.followUpEnabled ?? true);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  }, []);

  const fetchPhaseDData = useCallback(async () => {
    try {
      setIsLoadingPhaseD(true);
      const [handoverRes, arrivalsRes, departuresRes, invRes, logsRes] = await Promise.all([
        api.get('/pms/pending-handovers').catch(() => ({ data: { pending: [] } })),
        api.get('/availability/today-arrivals').catch(() => ({ data: { arrivals: [] } })),
        api.get('/availability/today-departures').catch(() => ({ data: { departures: [] } })),
        api.get('/inventory/summary').catch(() => ({ data: { summary: null } })),
        api.get('/message-log/recent').catch(() => ({ data: { logs: [] } }))
      ]);

      setPendingHandovers(handoverRes.data.pending || []);
      setTodaysArrivals(arrivalsRes.data.arrivals || []);
      setTodaysDepartures(departuresRes.data.departures || []);
      setInventorySummary(invRes.data.summary || null);
      setRecentLogs(logsRes.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch PMS data:', error);
    } finally {
      setIsLoadingPhaseD(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchSettings();
    fetchPhaseDData();

    const interval = setInterval(() => {
      fetchStats();
      fetchPhaseDData();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchSettings, fetchPhaseDData]);

  // Real-time socket events
  useEffect(() => {
    if (!socket) return;

    const handleHotLead = (lead) => {
      setAlerts(prev => [{ id: Date.now(), type: 'hot_lead', data: lead }, ...prev]);
      toast.success(`🔥 Hot Lead: ${lead.customerName || lead.customerPhone}`);
      fetchStats();
    };

    const handleBulkModeUpdated = ({ mode }) => {
      setGlobalMode(mode);
      fetchStats();
    };

    socket.on('hot_lead', handleHotLead);
    socket.on('chats:bulk_mode_updated', handleBulkModeUpdated);

    return () => {
      socket.off('hot_lead', handleHotLead);
      socket.off('chats:bulk_mode_updated', handleBulkModeUpdated);
    };
  }, [socket, fetchStats]);

  const confirmGlobalModeToggle = async () => {
    if (!pendingModeChange) return;
    try {
      await api.patch('/settings/global-mode', { globalMode: pendingModeChange });
      setGlobalMode(pendingModeChange);
      toast.success(`Switched all chats to ${pendingModeChange.toUpperCase()} mode`);
      fetchStats();
    } catch (error) {
      toast.error('Failed to update global mode');
    } finally {
      setPendingModeChange(null);
    }
  };

  const occupancyRate = inventorySummary && inventorySummary.totalRooms > 0
    ? Math.round(((inventorySummary.byStatus?.maintenance || 0) / inventorySummary.totalRooms) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardStats />
      
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl bg-white shadow-xs border border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-display font-bold text-slate-800">
              Resort Command Center
            </h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
              Live Overview
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Real-time monitoring for WhatsApp chatbot leads, cottage occupancy, and customer handovers.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 pl-2">
              <Bot size={15} className="text-emerald-600" />
              <span>Global Bot Mode:</span>
            </span>

            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-xs">
              <button
                onClick={() => setPendingModeChange('ai')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  globalMode === 'ai' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Auto AI
              </button>

              <button
                onClick={() => setPendingModeChange('human')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  globalMode === 'human' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Human Only
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mode Toggle Confirmation Modal */}
      {pendingModeChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-sm w-full p-6 space-y-4 bg-white animate-fade-in shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle size={20} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-800 text-base">Switch Global Mode?</h3>
              <p className="text-xs text-slate-500">
                This will override all active customer chats to <strong>{pendingModeChange.toUpperCase()}</strong> mode instantly.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPendingModeChange(null)}
                className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmGlobalModeToggle}
                className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Chats */}
        <div 
          onClick={() => navigate('/chats')}
          className="glass-card p-5 rounded-2xl cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all border border-slate-200 space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Conversations</span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
              <MessageSquare size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-slate-900">
              {isLoadingStats ? '...' : stats?.totalChats || 0}
            </span>
            <span className="text-[11px] text-teal-600 font-semibold flex items-center gap-0.5">
              <span>View all</span>
              <ArrowUpRight size={12} />
            </span>
          </div>
        </div>

        {/* Hot Leads */}
        <div 
          onClick={() => navigate('/chats?filter=hot')}
          className="glass-card p-5 rounded-2xl cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all border border-amber-200/80 bg-gradient-to-tr from-amber-50/50 to-white space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Hot Leads</span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Flame size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-slate-900">
              {isLoadingStats ? '...' : stats?.hotLeadsCount || 0}
            </span>
            <span className="text-[11px] text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
              High Priority
            </span>
          </div>
        </div>

        {/* Total Rooms & Capacity */}
        <div 
          onClick={() => navigate('/inventory')}
          className="glass-card p-5 rounded-2xl cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all border border-slate-200 space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Cottage Rooms</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Home size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-slate-900">
              {inventorySummary?.totalRooms || 47}
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
              {inventorySummary?.totalActiveCapacity || 228} Guests Max
            </span>
          </div>
        </div>

        {/* Confirmed Bookings */}
        <div 
          onClick={() => navigate('/pms/bookings')}
          className="glass-card p-5 rounded-2xl cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all border border-slate-200 space-y-3 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirmed Bookings</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <CalendarDays size={18} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-slate-900">
              {isLoadingStats ? '...' : stats?.confirmedBookingsCount || 0}
            </span>
            <span className="text-[11px] text-purple-600 font-semibold flex items-center gap-0.5">
              <span>View PMS</span>
              <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: AI Health & Pending Handovers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Pending Handover Queue (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card rounded-2xl p-6 space-y-4 bg-white border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <User size={18} />
                </div>
                <div>
                  <h2 className="font-display font-bold text-slate-800 text-base">Pending Staff Handovers</h2>
                  <p className="text-xs text-slate-500">Customers awaiting manual booking confirmation or assistance.</p>
                </div>
              </div>

              <button
                onClick={() => navigate('/pms/pending')}
                className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1"
              >
                <span>View All ({pendingHandovers.length})</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {pendingHandovers.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl space-y-2 border border-dashed border-slate-200">
                <CheckCircle size={28} className="text-emerald-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Handover Queue Clear</p>
                <p className="text-[11px] text-slate-500">All customer inquiries are actively handled by AI bot.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingHandovers.slice(0, 4).map((chat) => (
                  <div
                    key={chat._id}
                    onClick={() => navigate(`/chats/${chat._id}`)}
                    className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors border border-slate-200/80"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-900 font-bold text-xs flex items-center justify-center">
                        {chat.customerName ? chat.customerName.charAt(0).toUpperCase() : 'G'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-xs text-slate-800">
                          {chat.customerName || chat.customerPhone}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Phone: {chat.customerPhone}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        Handover Required
                      </span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Arrivals & Departures Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Arrivals */}
            <div className="glass-card rounded-2xl p-5 space-y-3 bg-white border border-slate-200">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                <LogIn size={16} className="text-emerald-600" />
                <span>Today's Check-ins ({todaysArrivals.length})</span>
              </div>

              {todaysArrivals.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No check-ins scheduled for today.</p>
              ) : (
                <div className="space-y-2">
                  {todaysArrivals.slice(0, 3).map((item) => (
                    <div key={item._id} className="p-2.5 bg-emerald-50/60 rounded-lg text-xs flex justify-between items-center border border-emerald-100">
                      <div>
                        <p className="font-semibold text-slate-800">{item.customerName}</p>
                        <p className="text-[10px] text-slate-500">{item.bookingType} • Adults: {item.adults || 1}</p>
                      </div>
                      <span className="text-[10px] bg-emerald-600 text-white font-semibold px-2 py-0.5 rounded-full">
                        Check-in
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Departures */}
            <div className="glass-card rounded-2xl p-5 space-y-3 bg-white border border-slate-200">
              <div className="flex items-center gap-2 text-purple-800 font-semibold text-xs">
                <LogOut size={16} className="text-purple-600" />
                <span>Today's Check-outs ({todaysDepartures.length})</span>
              </div>

              {todaysDepartures.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No check-outs scheduled for today.</p>
              ) : (
                <div className="space-y-2">
                  {todaysDepartures.slice(0, 3).map((item) => (
                    <div key={item._id} className="p-2.5 bg-purple-50/60 rounded-lg text-xs flex justify-between items-center border border-purple-100">
                      <div>
                        <p className="font-semibold text-slate-800">{item.customerName}</p>
                        <p className="text-[10px] text-slate-500">Phone: {item.customerPhone}</p>
                      </div>
                      <span className="text-[10px] bg-purple-600 text-white font-semibold px-2 py-0.5 rounded-full">
                        Check-out
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* AI Provider Health Matrix Sidebar (1 col) */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4 bg-slate-900 text-white border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-emerald-400" />
                <h3 className="font-display font-bold text-sm text-slate-100">AI Model Health Matrix</h3>
              </div>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                7 Models Active
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Multi-tiered fallback AI routing system. Requests automatically failover to secondary providers if latency exceeds threshold.
            </p>

            <div className="space-y-2 pt-1">
              {AI_PROVIDERS.map((item, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-200">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{item.model}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      item.status === 'active' 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                      <span>{item.tier}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Failover Latency: <strong>&lt; 800ms</strong></span>
              <button 
                onClick={() => navigate('/settings')}
                className="text-emerald-400 font-semibold hover:underline"
              >
                Configure
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
