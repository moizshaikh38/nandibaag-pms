import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, QrCode, MessageSquare, Settings, MoreVertical, Home, Clock, BookOpen, Mail, CalendarDays, Grid3x3, ShieldCheck, FileText, Wrench } from 'lucide-react';
import api from '../utils/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/chats', label: 'Chats', icon: MessageSquare },
  { path: '/connect', label: 'Connect', icon: QrCode },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const baseMoreMenuItems = [
  { path: '/pms/manual-booking', label: 'Manual Booking', icon: FileText },
  { path: '/availability', label: 'Availability', icon: Grid3x3 },
  { path: '/maintenance', label: 'Maintenance', icon: Wrench },
  { path: '/inventory', label: 'Inventory', icon: Home },
  { path: '/pms/pending', label: 'Pending Bookings', icon: Clock },
  { path: '/pms/bookings', label: 'Bookings', icon: BookOpen },
  { path: '/pms/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/pms/message-log', label: 'Message Log', icon: Mail },
];

export default function BottomNav() {
  const location = useLocation();
  const socket = useSocket();
  const { user } = useAuth();

  const moreMenuItems = [
    ...baseMoreMenuItems,
    ...(user?.role === 'super_admin' ? [{ path: '/team-security', label: 'Team & Security', icon: ShieldCheck }] : [])
  ];
  const [hotLeadCount, setHotLeadCount] = useState(0);
  const [pendingHandoverCount, setPendingHandoverCount] = useState(0);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (location.pathname === '/login') return;

    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats');
        setHotLeadCount(response.data.stats?.hotLeadsCount || 0);
      } catch (err) {
        console.error('Failed to fetch hot lead count in BottomNav:', err);
      }
    };

    const fetchPendingHandovers = async () => {
      try {
        const res = await api.get('/pms/pending-handovers');
        setPendingHandoverCount(res.data.count || 0);
      } catch (err) {
        // silent
      }
    };

    fetchStats();
    fetchPendingHandovers();

    // Refresh every 30 seconds
    const interval = setInterval(() => { fetchStats(); fetchPendingHandovers(); }, 30000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  // Real-time socket updates for hot leads
  useEffect(() => {
    if (!socket) return;

    const handleHotLead = () => {
      setHotLeadCount(prev => prev + 1);
    };

    socket.on('hot_lead', handleHotLead);
    return () => {
      socket.off('hot_lead', handleHotLead);
    };
  }, [socket]);

  // Hide on login page
  if (location.pathname === '/login') {
    return null;
  }

  const isMoreActive = moreMenuItems.some((item) => location.pathname === item.path);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-2xl z-50 lg:hidden safe-pb">
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const showBadge = item.path === '/chats' && hotLeadCount > 0;
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive: linkIsActive }) =>
                `flex flex-col items-center justify-center w-full h-full text-[11px] font-medium transition-all active:scale-95 ${
                  linkIsActive
                    ? 'text-emerald-700 font-bold'
                    : 'text-slate-500 hover:text-emerald-600'
                }`
              }
            >
              <div className={`relative p-1 rounded-xl transition-all ${isActive ? 'bg-emerald-50 text-emerald-700' : ''}`}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {showBadge && (
                  <span className="absolute -top-1 -right-2 bg-gradient-to-r from-red-500 to-rose-600 text-white text-[10px] rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center font-bold shadow-xs animate-pulse">
                    {hotLeadCount}
                  </span>
                )}
              </div>
              <span className="mt-0.5">{item.label}</span>
            </NavLink>
          );
        })}

        {/* More Menu */}
        <div className="relative w-full h-full flex flex-col items-center justify-center">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex flex-col items-center justify-center w-full h-full text-[11px] font-medium transition-all active:scale-95 ${
              isMoreActive
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-emerald-600'
            }`}
          >
            <div className={`p-1 rounded-xl transition-all ${isMoreActive ? 'bg-emerald-50 text-emerald-700' : ''}`}>
              <MoreVertical size={22} strokeWidth={isMoreActive ? 2.5 : 2} />
            </div>
            <span className="mt-0.5">More</span>
          </button>

          {showMoreMenu && (
            <>
              <div
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 animate-fade-in"
                onClick={() => setShowMoreMenu(false)}
              />
              <div className="absolute bottom-full right-2 mb-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 py-2.5 z-50 min-w-[210px] animate-fade-in divide-y divide-slate-100">
                <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                  Resort Management
                </div>
                <div className="py-1">
                  {moreMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setShowMoreMenu(false)}
                        className={`flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50/80 active:bg-emerald-100 transition-colors text-xs font-medium ${
                          isActive ? 'text-emerald-700 font-bold bg-emerald-50/60' : 'text-slate-700'
                        }`}
                      >
                        <Icon size={17} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                        <span className="flex-1">{item.label}</span>
                        {item.path === '/pms/pending' && pendingHandoverCount > 0 && (
                          <span className="bg-rose-500 text-white text-[10px] rounded-full h-4 min-w-[18px] px-1 flex items-center justify-center font-bold shadow-xs">
                            {pendingHandoverCount}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
