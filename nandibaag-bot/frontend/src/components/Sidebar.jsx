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
  Grid3x3, 
  QrCode, 
  MessageSquare,
  LayoutDashboard,
  Settings,
  CalendarDays,
  Home,
  Clock,
  BookOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  AlertTriangle,
  Flame,
  Zap,
  Users,
  ShieldCheck,
  Wrench
} from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [whatsappStatus, setWhatsappStatus] = useState('checking');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [pendingHandoverCount, setPendingHandoverCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    fetchSessionStatus();
    fetchPendingHandovers();

    const interval = setInterval(() => {
      fetchSessionStatus();
      fetchPendingHandovers();
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const fetchSessionStatus = async () => {
    try {
      const res = await api.get('/whatsapp/sessions');
      const sessions = res.data.sessions || {};
      const activeEntry = Object.entries(sessions).find(([_, status]) => status === 'connected');
      if (activeEntry) {
        setWhatsappStatus('connected');
        setActiveSessionId(activeEntry[0]);
      } else {
        setWhatsappStatus('disconnected');
        setActiveSessionId(null);
      }
    } catch (err) {
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

  const NAV_SECTIONS = [
    {
      title: 'CORE PMS',
      items: [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/pms/manual-booking', label: 'Manual Booking', icon: FileText },
        { path: '/chats', label: 'WhatsApp Inbox', icon: MessageSquare },
        { path: '/availability', label: 'Availability Grid', icon: Grid3x3 },
        { path: '/pms/bookings', label: 'Guest Bookings', icon: BookOpen },
        { path: '/pms/calendar', label: 'Calendar View', icon: CalendarDays }
      ]
    },
    {
      title: 'OPERATIONS',
      items: [
        { path: '/pms/pending', label: 'Pending Handovers', icon: Clock, badge: pendingHandoverCount },
        { path: '/inventory', label: 'Room Inventory', icon: Home },
        { path: '/maintenance', label: 'Room Maintenance', icon: Wrench },
        { path: '/staff-analytics', label: 'Staff Analytics', icon: Users },
        { path: '/pms/message-log', label: 'WhatsApp Message Log', icon: FileText }
      ]
    },
    {
      title: 'SYSTEM & BOT',
      items: [
        { path: '/connect', label: 'WhatsApp Hub', icon: QrCode },
        { path: '/settings', label: 'System Settings', icon: Settings },
        ...(user?.role === 'super_admin' ? [{ path: '/team-security', label: 'Team & Security', icon: ShieldCheck }] : [])
      ]
    }
  ];

  return (
    <>
      {/* Mobile Top Header */}
      <div className="lg:hidden sticky top-0 z-40 bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <img
            src="https://res.cloudinary.com/dgfwwnn4x/image/upload/v1786444954/IMG_0303_cnuhws.jpg"
            alt="Nandibaag Resort Logo"
            className="w-8 h-8 rounded-lg object-cover border border-emerald-400/40 shadow-xs"
          />
          <div>
            <span className="font-display font-bold text-sm tracking-tight block leading-tight">Nandibaag Resort</span>
            <span className="text-[10px] text-emerald-400 font-semibold block">Pure Veg & Jain • Karjat</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {whatsappStatus === 'disconnected' && (
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" title="WhatsApp Bot Offline" />
          )}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-2 text-slate-300 hover:text-white rounded-lg"
          >
            {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs"
        />
      )}

      {/* Main Vertical Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 ${
          isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-3 overflow-hidden">
            <img
              src="https://res.cloudinary.com/dgfwwnn4x/image/upload/v1786444954/IMG_0303_cnuhws.jpg"
              alt="Nandibaag Resort Logo"
              className="w-10 h-10 rounded-xl object-cover border border-emerald-400/40 shadow-md shadow-emerald-950/40 shrink-0"
            />

            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-display font-bold text-base text-white truncate leading-none">
                  Nandibaag
                </span>
                <span className="text-[10px] font-semibold text-emerald-400 tracking-wide mt-1 truncate">
                  Pure Veg & Jain • Karjat
                </span>
              </div>
            )}
          </NavLink>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* System Status Pills (WhatsApp & Socket) */}
        {!isCollapsed && (
          <div className="p-3 bg-slate-950/50 border-b border-slate-800/80 space-y-1.5 text-xs">
            <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${whatsappStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-[11px] font-semibold text-slate-300">
                  {whatsappStatus === 'connected' ? `Bot: ${activeSessionId || 'Connected'}` : 'Bot Offline'}
                </span>
              </div>
              <Bot size={13} className={whatsappStatus === 'connected' ? 'text-emerald-400' : 'text-rose-400'} />
            </div>

            {whatsappStatus === 'disconnected' && (
              <NavLink
                to="/connect"
                className="flex items-center gap-1.5 px-2 py-1 bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[10px] font-bold rounded-lg hover:bg-rose-900/80 transition-colors"
              >
                <AlertTriangle size={12} className="text-rose-400 animate-bounce" />
                <span>Reconnect WhatsApp</span>
              </NavLink>
            )}
          </div>
        )}

        {/* Navigation Links List */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 chat-scrollbar">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={idx} className="space-y-1">
              
              {!isCollapsed && (
                <h3 className="px-3 text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-2">
                  {section.title}
                </h3>
              )}

              {section.items.map((item) => {
                const Icon = item.icon;
                const badge = item.badge;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/30'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                      }`
                    }
                  >
                    <Icon size={18} className="shrink-0" />
                    
                    {!isCollapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}

                    {badge > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isCollapsed
                          ? 'absolute top-1 right-1 bg-amber-500 text-slate-950'
                          : 'bg-amber-500 text-slate-950 ml-auto'
                      }`}>
                        {badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </div>

              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-200 truncate">{user?.name || 'Staff Admin'}</span>
                  <span className="text-[10px] text-slate-500 truncate">{user?.email || 'admin@nandibaag.com'}</span>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>

      </aside>
    </>
  );
}
