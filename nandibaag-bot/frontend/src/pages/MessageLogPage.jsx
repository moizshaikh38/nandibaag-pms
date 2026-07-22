import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Filter,
  Mail,
  AlertCircle,
  CheckCircle,
  XCircle,
  Ban
} from 'lucide-react';

const MSG_TYPE_CONFIG = {
  followup_3hr:        { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Follow-up 3h' },
  followup_1day:       { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Follow-up 1d' },
  followup_3day:       { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Follow-up 3d' },
  followup_7day:       { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Follow-up 7d' },
  checkin_reminder:    { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Check-in' },
  checkout_message:    { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Check-out' },
  review_request:      { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Review' }
};

const STATUS_CONFIG = {
  sent:      { icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50',  label: 'Sent' },
  failed:    { icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50',    label: 'Failed' },
  cancelled: { icon: Ban,         color: 'text-gray-500',   bg: 'bg-gray-100',  label: 'Cancelled' }
};

export default function MessageLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);

  const [filters, setFilters] = useState({
    guestPhone: '',
    messageType: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.guestPhone) params.append('guestPhone', filters.guestPhone);
      if (filters.messageType) params.append('messageType', filters.messageType);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      params.append('page', page);
      params.append('limit', 50);

      const res = await api.get(`/message-log?${params}`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (error) {
      toast.error('Failed to load message log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const clearFilters = () => {
    setFilters({ guestPhone: '', messageType: '', status: '', dateFrom: '', dateTo: '' });
    setPage(1);
    setTimeout(fetchLogs, 0);
  };

  const toggleExpand = (id) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  return (
    <div className="p-4 pb-20 md:pb-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Message Log</h1>
            <p className="text-sm text-gray-500">{total} message{total !== 1 ? 's' : ''} logged</p>
          </div>
          <button onClick={fetchLogs} className="p-2 text-gray-600 hover:text-whatsapp transition-colors" title="Refresh">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-3 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <form onSubmit={handleSearch} className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Phone / Name</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={filters.guestPhone}
                  onChange={(e) => handleFilterChange('guestPhone', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
                />
              </div>
            </form>
            <div className="min-w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Message Type</label>
              <select
                value={filters.messageType}
                onChange={(e) => handleFilterChange('messageType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
              >
                <option value="">All</option>
                {Object.entries(MSG_TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
              >
                <option value="">All</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="min-w-[130px]">
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
              />
            </div>
            <div className="min-w-[130px]">
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={applyFilters}
                className="px-4 py-2 bg-whatsapp text-white rounded-lg hover:bg-whatsapp-light transition-colors text-sm"
              >
                Apply
              </button>
              <button
                onClick={clearFilters}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Log List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Mail size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 text-lg">No messages logged yet</p>
            <p className="text-gray-400 text-sm mt-1">
              {filters.guestPhone || filters.messageType || filters.status || filters.dateFrom || filters.dateTo
                ? 'No messages match your filters. Try clearing them to see all logged messages.'
                : 'Automated messages (check-in reminders, checkout notices, follow-ups) will be logged here once bookings are active.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const msgType = MSG_TYPE_CONFIG[log.messageType] || MSG_TYPE_CONFIG.followup_3hr;
              const statusCfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.sent;
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedRow === log._id;
              const bookingName = log.bookingId?.customerName;

              return (
                <div key={log._id} className="bg-white rounded-lg shadow overflow-hidden">
                  <button
                    onClick={() => toggleExpand(log._id)}
                    className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                      <span className="text-xs text-gray-400 min-w-[90px]">
                        {formatDate(log.sentAt || log.createdAt)}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${msgType.bg} ${msgType.text}`}>
                        {msgType.label}
                      </span>
                      <span className="flex-1 text-sm text-gray-700 truncate">
                        {log.guestPhone}
                        {bookingName && <span className="text-gray-400 ml-1">({bookingName})</span>}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        <StatusIcon size={12} />
                        {statusCfg.label}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 border-t border-gray-100 bg-gray-50">
                      {log.messageText && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-gray-500 mb-1">Message:</p>
                          <p className="text-sm text-gray-700 bg-white rounded p-2 border border-gray-200 whitespace-pre-wrap">
                            {log.messageText}
                          </p>
                        </div>
                      )}
                      {log.errorReason && (
                        <div className="flex items-start gap-2 text-red-600">
                          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium">Error:</p>
                            <p className="text-sm">{log.errorReason}</p>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-400">
                        ID: {log._id}
                        {log.bookingId?._id && ` | Booking: ${log.bookingId._id}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
