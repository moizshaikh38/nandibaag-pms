import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import api from '../utils/api';
import { 
  Building2, 
  Bot, 
  Wifi, 
  WifiOff, 
  LogOut, 
  PlusCircle, 
  Grid3x3, 
  QrCode, 
  User as UserIcon,
  MessageSquare,
  LayoutDashboard,
  Settings,
  CalendarDays,
  Home,
  Clock,
  BookOpen,
  AlertTriangle
} from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [whatsappStatus, setWhatsappStatus] = useState('checking');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [pendingHandoverCount, setPendingHandoverCount] = useState(0);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    fetchSessionStatus();
    fetchPendingHandovers();

    const interval = setInterval(() => {
      fetchSessionStatus();
      fetchPendingHandovers();
    }, 10000);

    if (socket) {
      const handleReady = (data) => {
        setWhatsappStatus('connected');
        if (data?.sessionId) setActiveSessionId(data.sessionId);
        fetchSessionStatus();
      };

      const handleDisconnected = () => {
        fetchSessionStatus();
      };

      socket.on('whatsapp:ready', handleReady);
      socket.on('whatsapp:disconnected', handleDisconnected);
      socket.on('whatsapp:session_destroyed', handleDisconnected);
      socket.on('number_deleted', handleDisconnected);

      return () => {
        clearInterval(interval);
        socket.off('whatsapp:ready', handleReady);
        socket.off('whatsapp:disconnected', handleDisconnected);
        socket.off('whatsapp:session_destroyed', handleDisconnected);
        socket.off('number_deleted', handleDisconnected);
      };
    }

    return () => clearInterval(interval);
  }, [socket]);

  const playWarningAudio = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  };

  const fetchSessionStatus = async () => {
    try {
      const res = await api.get('/whatsapp/sessions');
      const sessions = res.data.sessions || {};
      const activeEntry = Object.entries(sessions).find(([_, status]) => status === 'connected');
      if (activeEntry) {
        setWhatsappStatus('connected');
        setActiveSessionId(activeEntry[0]);
      } else {
        if (whatsappStatus === 'connected') playWarningAudio();
        setWhatsappStatus('disconnected');
        setActiveSessionId(null);
      }
    } catch (err) {
      if (whatsappStatus === 'connected') playWarningAudio();
      setWhatsappStatus('disconnected');
    }
  };

  const fetchPendingHandovers = async () => {
    try {
      const res = await api.get('/pms/pending-handovers');
      setPendingHandoverCount(res.data.count || 0);
    } catch (err) {
      // silent catch
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (location.pathname === '/login') return null;

  return (
    <>
      {whatsappStatus === 'disconnected' && (
        <div className="bg-rose-600 text-white text-xs font-bold px-4 py-1.5 text-center flex items-center justify-center gap-2 shadow-sm animate-pulse sticky top-0 z-50">
          <AlertTriangle size={15} />
          <span>⚠️ WhatsApp Bot Disconnected! Check phone internet connection & scan QR in WhatsApp Hub.</span>
        </div>
      )}
      <header className="sticky top-0 z-40 glass-header shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo & System Status */}
          <div className="flex items-center gap-3">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-900/20 group-hover:scale-105 transition-all">
                <Building2 size={22} />
              </div>
              <div className="flex flex-col">
                <span className="font-display font-bold text-lg text-slate-800 tracking-tight leading-none group-hover:text-emerald-700 transition-colors">
                  Nandibaag Resort
                </span>
                <span className="text-[11px] font-medium text-slate-500 tracking-wide leading-tight mt-0.5">
                  PMS & AI Chatbot
                </span>
              </div>
            </NavLink>

            {/* Status Pills */}
            <div className="hidden md:flex items-center gap-2 ml-4">
              {/* WhatsApp Session Status */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                whatsappStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  whatsappStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`} />
                <Bot size={13} />
                <span>{whatsappStatus === 'connected' ? `Bot: ${activeSessionId}` : 'Bot Offline'}</span>
              </div>

              {/* Socket Connection Status */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                socket ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {socket ? <Wifi size={12} className="text-teal-600" /> : <WifiOff size={12} className="text-rose-600" />}
                <span>{socket ? 'Live Sync' : 'Offline'}</span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <LayoutDashboard size={17} />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/chats"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <MessageSquare size={17} />
              <span>Chats</span>
            </NavLink>

            <NavLink
              to="/availability"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Grid3x3 size={17} />
              <span>Availability</span>
            </NavLink>

            <NavLink
              to="/pms/bookings"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <BookOpen size={17} />
              <span>Bookings</span>
            </NavLink>

            <NavLink
              to="/pms/calendar"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <CalendarDays size={17} />
              <span>Calendar</span>
            </NavLink>

            {pendingHandoverCount > 0 && (
              <NavLink
                to="/pms/pending"
                className="relative px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors flex items-center gap-1.5"
              >
                <Clock size={16} />
                <span>Pending</span>
                <span className="ml-1 bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {pendingHandoverCount}
                </span>
              </NavLink>
            )}
          </nav>

          {/* Quick Actions & User Menu */}
          <div className="flex items-center gap-3">
            <NavLink
              to="/connect"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all"
            >
              <QrCode size={15} />
              <span>WhatsApp Hub</span>
            </NavLink>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-800 leading-tight">
                    {user?.name || 'Staff User'}
                  </span>
                  <span className="text-[10px] text-slate-500 capitalize">
                    {user?.role || 'Staff'}
                  </span>
                </div>
              </button>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-40 animate-fade-in">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-800">{user?.name || 'User'}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                    </div>

                    <NavLink
                      to="/settings"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Settings size={15} />
                      <span>System Settings</span>
                    </NavLink>

                    <NavLink
                      to="/inventory"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Home size={15} />
                      <span>Room Inventory</span>
                    </NavLink>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors font-medium border-t border-slate-100 mt-1"
                    >
                      <LogOut size={15} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </header>
    </>
  );
}
