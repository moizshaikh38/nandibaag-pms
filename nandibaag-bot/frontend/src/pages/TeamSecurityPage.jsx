import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { formatDMY } from '../utils/formatters';
import {
  ShieldCheck,
  Users,
  Smartphone,
  KeyRound,
  UserPlus,
  UserX,
  UserCheck,
  LogOut,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Activity,
  Laptop,
  Globe,
  Clock,
  Shield,
  Eye,
  X
} from 'lucide-react';

export default function TeamSecurityPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'activity'
  
  // Team state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userSessions, setUserSessions] = useState({});
  const [loadingSessions, setLoadingSessions] = useState({});

  // Modals state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addUserForm, setAddUserForm] = useState({ name: '', email: '', role: 'staff', password: '' });
  const [createdTempPassword, setCreatedTempPassword] = useState(null);

  const [resetPassModal, setResetPassModal] = useState(null); // target user object
  const [resetPassInput, setResetPassInput] = useState('');
  const [resetPassResult, setResetPassResult] = useState(null);

  // Activity Log state
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionTypes, setActionTypes] = useState([]);
  const [logFilter, setLogFilter] = useState({ userId: '', action: '', dateFrom: '', dateTo: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const res = await api.get('/team/users');
      setUsers(res.data.users || []);
    } catch (error) {
      toast.error('Failed to load team users');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchUserSessions = async (userId) => {
    try {
      setLoadingSessions(prev => ({ ...prev, [userId]: true }));
      const res = await api.get(`/team/users/${userId}/sessions`);
      setUserSessions(prev => ({ ...prev, [userId]: res.data.sessions || [] }));
    } catch (error) {
      toast.error('Failed to load user sessions');
    } finally {
      setLoadingSessions(prev => ({ ...prev, [userId]: false }));
    }
  };

  const fetchActivityLogs = useCallback(async (page = 1) => {
    try {
      setLoadingLogs(true);
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', pagination.limit);
      if (logFilter.userId) params.append('userId', logFilter.userId);
      if (logFilter.action) params.append('action', logFilter.action);
      if (logFilter.dateFrom) params.append('dateFrom', logFilter.dateFrom);
      if (logFilter.dateTo) params.append('dateTo', logFilter.dateTo);

      const res = await api.get(`/team/activity-log?${params.toString()}`);
      setActivityLogs(res.data.logs || []);
      setPagination(res.data.pagination || { page: 1, limit: 15, total: 0, pages: 1 });
    } catch (error) {
      toast.error('Failed to load activity logs');
    } finally {
      setLoadingLogs(false);
    }
  }, [logFilter, pagination.limit]);

  const fetchActionTypes = async () => {
    try {
      const res = await api.get('/team/activity-log/actions');
      setActionTypes(res.data.actions || []);
    } catch (err) {
      // silent
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsers();
      fetchActionTypes();
    }
  }, [isSuperAdmin, fetchUsers]);

  useEffect(() => {
    if (isSuperAdmin && activeTab === 'activity') {
      fetchActivityLogs(1);
    }
  }, [activeTab, isSuperAdmin, fetchActivityLogs]);

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full bg-white border border-rose-200 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Super-Admin Access Required</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Team & Security Management is restricted to super-administrators only. Please contact your resort system administrator if you require elevated permissions.
          </p>
        </div>
      </div>
    );
  }

  const toggleExpandUser = (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      fetchUserSessions(userId);
    }
  };

  const handleForceLogoutSession = async (targetUserId, sessionId) => {
    try {
      await api.post(`/team/users/${targetUserId}/sessions/${sessionId}/logout`);
      toast.success('Session force-logged out successfully');
      fetchUserSessions(targetUserId);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to logout session');
    }
  };

  const handleForceLogoutAll = async (targetUserId) => {
    if (!window.confirm('Are you sure you want to force logout ALL active devices for this user?')) return;
    try {
      const res = await api.post(`/team/users/${targetUserId}/logout-all`);
      toast.success(res.data.message || 'All sessions terminated');
      fetchUserSessions(targetUserId);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to logout all sessions');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/team/users', addUserForm);
      setCreatedTempPassword(res.data.tempPassword);
      toast.success('New team account created successfully!');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create user');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPassModal) return;
    try {
      const res = await api.patch(`/team/users/${resetPassModal._id}/reset-password`, {
        newPassword: resetPassInput
      });
      setResetPassResult(res.data.tempPassword);
      toast.success('Password updated successfully!');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password');
    }
  };

  const handleToggleUserStatus = async (u) => {
    const action = u.isActive ? 'disable' : 'enable';
    if (!window.confirm(`Are you sure you want to ${action} account for ${u.name}?`)) return;
    try {
      await api.patch(`/team/users/${u._id}/${action}`);
      toast.success(`Account ${action}d successfully`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to ${action} account`);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Are you sure you want to delete or disable user ${u.name}?`)) return;
    try {
      const res = await api.delete(`/team/users/${u._id}`);
      if (res.data.isDisabledInstead) {
        toast(res.data.message, { icon: 'ℹ️', duration: 5000 });
      } else {
        toast.success('User account deleted');
      }
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Top Banner */}
      <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-display font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={26} />
              <span>Team & Security Control Center</span>
            </h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              Super-Admin
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Manage staff credentials, monitor live device sessions, enforce instant force-logouts, and audit system activities.
          </p>
        </div>

        <button
          onClick={() => {
            setAddUserForm({ name: '', email: '', role: 'staff', password: '' });
            setCreatedTempPassword(null);
            setShowAddUserModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all hover:scale-105"
        >
          <UserPlus size={16} />
          <span>+ Add Staff / Admin</span>
        </button>
      </div>

      {/* Main Tabs */}
      <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-semibold max-w-md">
        <button
          onClick={() => setActiveTab('team')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeTab === 'team' ? 'bg-white text-slate-800 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users size={16} />
          <span>Team Accounts & Sessions</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeTab === 'activity' ? 'bg-white text-slate-800 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity size={16} />
          <span>System Audit Logs</span>
        </button>
      </div>

      {/* TAB 1: TEAM ACCOUNTS & SESSIONS */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          {loadingUsers ? (
            <div className="py-16 text-center space-y-3 glass-card rounded-2xl bg-white border border-slate-200">
              <RefreshCw size={32} className="animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">Loading team security accounts...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-slate-500 glass-card rounded-2xl bg-white border border-slate-200">
              No team accounts found.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => {
                const isExpanded = expandedUserId === u._id;
                const sessions = userSessions[u._id] || [];
                const isLoadingSess = loadingSessions[u._id];

                return (
                  <div key={u._id} className="glass-card rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
                    {/* User Summary Header */}
                    <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          u.role === 'super_admin'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : u.role === 'admin'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-display font-bold text-base text-slate-800">{u.name}</h3>
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                              u.role === 'super_admin'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : u.role === 'admin'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              {u.role.replace('_', ' ')}
                            </span>

                            {u.isActive ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                Active
                              </span>
                            ) : (
                              <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                                Disabled
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span>{u.email}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1 font-medium text-slate-600">
                              <Smartphone size={13} className="text-slate-400" />
                              <span>{u.activeSessionCount} active device(s)</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* User Actions */}
                      <div className="flex items-center gap-2 flex-wrap border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        <button
                          onClick={() => toggleExpandUser(u._id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <Smartphone size={14} />
                          <span>Devices ({u.activeSessionCount})</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {u.isEditable && (
                          <>
                            <button
                              onClick={() => {
                                setResetPassModal(u);
                                setResetPassInput('');
                                setResetPassResult(null);
                              }}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl border border-amber-200 transition-colors flex items-center gap-1"
                              title="Reset user password"
                            >
                              <KeyRound size={14} />
                              <span>Reset Password</span>
                            </button>

                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 ${
                                u.isActive
                                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              }`}
                            >
                              {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                              <span>{u.isActive ? 'Disable' : 'Enable'}</span>
                            </button>

                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete account"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Sessions Drawer */}
                    {isExpanded && (
                      <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Laptop size={14} className="text-emerald-600" />
                            <span>Logged In Sessions for {u.name}</span>
                          </h4>

                          {sessions.filter(s => s.isActive).length > 0 && u.isEditable && (
                            <button
                              onClick={() => handleForceLogoutAll(u._id)}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition-all"
                            >
                              Force Logout All Devices
                            </button>
                          )}
                        </div>

                        {isLoadingSess ? (
                          <div className="py-4 text-center text-xs text-slate-500">
                            Loading device sessions...
                          </div>
                        ) : sessions.length === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400 italic">
                            No session records found for this user in the last 30 days.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {sessions.map((s) => (
                              <div
                                key={s.id}
                                className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                                  s.isActive
                                    ? 'bg-white border-slate-200 shadow-2xs'
                                    : 'bg-slate-100/60 border-slate-200 opacity-60'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                                      <Laptop size={13} className="text-slate-500" />
                                      <span>{s.deviceInfo}</span>
                                    </p>
                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                      IP: {s.ipAddress || 'Unknown'}
                                    </p>
                                  </div>

                                  {s.isActive ? (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full shrink-0">
                                      Active Now
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full shrink-0">
                                      Logged Out
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                                  <p>Login Time: {formatDMY(s.loginAt)} at {new Date(s.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <p>Last Active: {formatDMY(s.lastActiveAt)} at {new Date(s.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  {s.loggedOutBy && (
                                    <p className="text-rose-600 font-medium">
                                      Force logged out by: {s.loggedOutBy.name}
                                    </p>
                                  )}
                                </div>

                                {s.isActive && u.isEditable && (
                                  <button
                                    onClick={() => handleForceLogoutSession(u._id, s.id)}
                                    className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200 transition-colors flex items-center justify-center gap-1 mt-1"
                                  >
                                    <LogOut size={13} />
                                    <span>Force Logout Device</span>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SYSTEM AUDIT LOGS */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="glass-card rounded-2xl p-4 bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-display font-bold text-sm text-slate-800 flex items-center gap-1.5">
                <Filter size={16} className="text-emerald-600" />
                <span>Filter Activity Logs</span>
              </h3>
              <button
                onClick={() => setLogFilter({ userId: '', action: '', dateFrom: '', dateTo: '' })}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Clear Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">User</label>
                <select
                  value={logFilter.userId}
                  onChange={(e) => setLogFilter(prev => ({ ...prev, userId: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">All Users</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Action Type</label>
                <select
                  value={logFilter.action}
                  onChange={(e) => setLogFilter(prev => ({ ...prev, action: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">All Action Types</option>
                  {actionTypes.map(act => (
                    <option key={act} value={act}>{act}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={logFilter.dateFrom}
                  onChange={(e) => setLogFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={logFilter.dateTo}
                  onChange={(e) => setLogFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="glass-card rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
            {loadingLogs ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw size={32} className="animate-spin text-emerald-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">Loading activity audit log...</p>
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="py-16 text-center text-slate-400 italic text-xs">
                No activity logs match the selected filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-3.5">Timestamp</th>
                      <th className="p-3.5">User</th>
                      <th className="p-3.5">Action</th>
                      <th className="p-3.5">Details</th>
                      <th className="p-3.5">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {formatDMY(log.createdAt)} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{log.user?.name || 'Unknown'}</div>
                          <div className="text-[10px] text-slate-400">{log.user?.email}</div>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900 border border-emerald-200">
                            {log.action}
                          </span>
                        </td>

                        <td className="p-3.5 text-slate-700 leading-snug">
                          {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                        </td>

                        <td className="p-3.5 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                          {log.ipAddress || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 text-xs">
                <span className="text-slate-500">
                  Showing page {pagination.page} of {pagination.pages} ({pagination.total} total logs)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchActivityLogs(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 bg-white border border-slate-200 text-slate-700 disabled:opacity-40 rounded-lg text-xs font-semibold"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchActivityLogs(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="px-3 py-1 bg-white border border-slate-200 text-slate-700 disabled:opacity-40 rounded-lg text-xs font-semibold"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW STAFF/ADMIN ACCOUNT */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-md w-full p-6 space-y-4 bg-white shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800 flex items-center gap-2">
                <UserPlus size={18} className="text-emerald-600" />
                <span>Add New Staff / Admin Account</span>
              </h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {createdTempPassword ? (
              <div className="space-y-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle size={18} />
                  <span>Account Created Successfully!</span>
                </div>
                <p className="text-xs text-slate-600">
                  Provide these initial login credentials directly to the staff member:
                </p>
                <div className="p-3 bg-white border border-emerald-300 rounded-lg font-mono text-xs text-slate-800 space-y-1">
                  <p>Email: <strong>{addUserForm.email}</strong></p>
                  <p>Temp Password: <strong className="text-emerald-700 text-sm">{createdTempPassword}</strong></p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => copyToClipboard(`Email: ${addUserForm.email}\nPassword: ${createdTempPassword}`)}
                    className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1"
                  >
                    <Copy size={14} />
                    <span>Copy Credentials</span>
                  </button>
                  <button
                    onClick={() => setShowAddUserModal(false)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={addUserForm.name}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Rahul Sharma"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={addUserForm.email}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="rahul@nandibaag.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account Role</label>
                  <select
                    value={addUserForm.role}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="staff">Staff (Frontdesk Receptionist)</option>
                    <option value="admin">Admin (Resort Manager)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Initial Password (Optional — leave blank to auto-generate)
                  </label>
                  <input
                    type="password"
                    value={addUserForm.password}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Auto-generated if left empty"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
                  >
                    Create Account
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: RESET USER PASSWORD */}
      {resetPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-md w-full p-6 space-y-4 bg-white shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800 flex items-center gap-2">
                <KeyRound size={18} className="text-amber-600" />
                <span>Reset Password for {resetPassModal.name}</span>
              </h3>
              <button onClick={() => setResetPassModal(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {resetPassResult ? (
              <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <CheckCircle size={18} />
                  <span>Password Reset & Sessions Terminated!</span>
                </div>
                <div className="p-3 bg-white border border-amber-300 rounded-lg font-mono text-slate-800 space-y-1">
                  <p>User: <strong>{resetPassModal.email}</strong></p>
                  <p>New Password: <strong className="text-amber-800 text-sm">{resetPassResult}</strong></p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => copyToClipboard(`Email: ${resetPassModal.email}\nNew Password: ${resetPassResult}`)}
                    className="flex-1 py-2 bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-1"
                  >
                    <Copy size={14} />
                    <span>Copy Password</span>
                  </button>
                  <button
                    onClick={() => setResetPassModal(null)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
                <p className="text-slate-500">
                  Resetting password for <strong>{resetPassModal.email}</strong> will automatically terminate all active logged-in sessions for this user.
                </p>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    New Password (Optional — leave blank to auto-generate)
                  </label>
                  <input
                    type="password"
                    value={resetPassInput}
                    onChange={(e) => setResetPassInput(e.target.value)}
                    placeholder="Auto-generated if left empty"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetPassModal(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
                  >
                    Confirm Reset
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
