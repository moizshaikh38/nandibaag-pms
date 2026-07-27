import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, QrCode, MessageSquare, Settings, MoreVertical, Home, Clock, BookOpen, Mail, CalendarDays, Grid3x3 } from 'lucide-react';
import api from '../utils/api';
import { useSocket } from '../hooks/useSocket';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/chats', label: 'Chats', icon: MessageSquare },
  { path: '/connect', label: 'Connect', icon: QrCode },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const moreMenuItems = [
  { path: '/availability', label: 'Availability', icon: Grid3x3 },
  { path: '/inventory', label: 'Inventory', icon: Home },
  { path: '/pms/pending', label: 'Pending Bookings', icon: Clock },
  { path: '/pms/bookings', label: 'Bookings', icon: BookOpen },
  { path: '/pms/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/pms/message-log', label: 'Message Log', icon: Mail },
];

export default function BottomNav() {
  const location = useLocation();
  const socket = useSocket();
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
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 lg:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const showBadge = item.path === '/chats' && hotLeadCount > 0;
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive: linkIsActive }) =>
                `flex flex-col items-center justify-center w-full h-full text-sm transition-colors ${
                  linkIsActive
                    ? 'text-whatsapp font-semibold'
                    : 'text-gray-600 hover:text-whatsapp'
                }`
              }
            >
              <div className="relative mb-1">
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                {showBadge && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                    {hotLeadCount}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        {/* More Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex flex-col items-center justify-center w-full h-full text-sm transition-colors ${
              isMoreActive
                ? 'text-whatsapp font-semibold'
                : 'text-gray-600 hover:text-whatsapp'
            }`}
          >
            <MoreVertical size={24} strokeWidth={isMoreActive ? 2.5 : 2} />
            <span>More</span>
          </button>

          {showMoreMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMoreMenu(false)}
              />
              <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[160px]">
                {moreMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setShowMoreMenu(false)}
                      className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors ${
                        isActive ? 'text-whatsapp font-semibold' : 'text-gray-700'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="flex-1">{item.label}</span>
                      {item.path === '/pms/pending' && pendingHandoverCount > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center font-medium">
                          {pendingHandoverCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
