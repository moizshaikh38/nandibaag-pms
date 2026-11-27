import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import StaffLeaderboard from './StaffLeaderboard';
import StaffPerformanceChart from './StaffPerformanceChart';
import StaffAnalyticsTable from './StaffAnalyticsTable';
import StaffIndividualProfile from './StaffIndividualProfile';
import '../styles/StaffAnalyticsDashboard.css';

class AnalyticsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
          <p className="font-semibold">{this.props.fallbackTitle || 'Unable to render analytics section'}</p>
          <p className="text-rose-600">{this.state.errorMessage}</p>
          {typeof this.props.onRetry === 'function' && (
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onRetry();
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700"
            >
              Retry
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const StaffAnalyticsDashboard = () => {
  const [stats, setStats] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [months, setMonths] = useState(3);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchAnalytics();
  }, [months, dateFrom, dateTo]);

  const fetchAnalytics = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('Start date must be on or before end date.');
      return;
    }
    const reqId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError('');
      const params = dateFrom || dateTo ? { dateFrom, dateTo } : { months };
      const response = await api.get('/staff/analytics', { params });
      if (reqId !== requestIdRef.current) return;
      setStats(Array.isArray(response.data?.stats) ? response.data.stats : []);
      setMetadata(response.data?.metadata || null);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setError(err.response?.data?.message || 'Failed to load staff analytics');
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="staff-analytics-container">
        <div className="loading">Loading staff performance analytics...</div>
      </div>
    );
  }

  return (
    <AnalyticsErrorBoundary fallbackTitle="Staff Analytics failed to render" onRetry={fetchAnalytics}>
      <div className="staff-analytics-container">
        <div className="analytics-header">
          <div>
            <h2>📊 Staff Performance Analytics</h2>
            <p className="text-xs text-slate-500 mt-1">Track reservation volumes, revenue contributions, and staff lead trends</p>
          </div>
          
          <div className="controls">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="month-selector"
              aria-label="Staff analytics start date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="month-selector"
              aria-label="Staff analytics end date"
            />
            <select 
              value={months} 
              onChange={(e) => {
                setDateFrom('');
                setDateTo('');
                setMonths(parseInt(e.target.value, 10));
              }}
              className="month-selector"
            >
              <option value={1}>Last 1 Month</option>
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={12}>Last 12 Months</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchAnalytics}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {!error && stats.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-600 space-y-3">
            <p className="text-sm font-semibold text-slate-700">No staff performance records found for this period.</p>
            <p className="text-xs text-slate-500">Try expanding the month range or selecting a different date window.</p>
            <button
              type="button"
              onClick={fetchAnalytics}
              className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
            >
              Refresh
            </button>
          </div>
        ) : (
          <>
            {stats.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 uppercase font-semibold">Total Booking Value</span>
                  <p className="text-lg font-bold text-slate-900">
                    ₹{stats.reduce((s, x) => s + (Number(x?.totalBookingValue ?? x?.totalRevenue ?? 0) || 0), 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-emerald-700 uppercase font-semibold">Actual Collected (paidAt)</span>
                  <p className="text-lg font-bold text-emerald-900">
                    ₹{stats.reduce((s, x) => s + (Number(x?.collectedAmount ?? 0) || 0), 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-amber-800 uppercase font-semibold">Cancelled / Legacy Untimestamped</span>
                  <p className="text-sm font-bold text-amber-900 mt-1">
                    Cancelled: ₹{stats.reduce((s, x) => s + (Number(x?.cancelledCollectedAmount ?? 0) || 0), 0).toLocaleString('en-IN')} • Legacy: ₹{(Number(metadata?.legacyUntimestampedAmount ?? 0) || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            )}

            {/* LEADERBOARD */}
            <div className="section">
              <h3>🏆 Leaderboard</h3>
              <StaffLeaderboard 
                stats={stats}
                onSelectStaff={(staff) => {
                  setSelectedStaff(staff);
                  setShowProfile(true);
                }}
              />
            </div>

            {/* CHART */}
            <div className="section">
              <h3>📈 Performance Trend</h3>
              <AnalyticsErrorBoundary fallbackTitle="Performance chart failed to render" onRetry={fetchAnalytics}>
                <StaffPerformanceChart stats={stats} months={months} />
              </AnalyticsErrorBoundary>
            </div>

            {/* TABLE */}
            <div className="section">
              <h3>📋 Detailed Breakdown</h3>
              <StaffAnalyticsTable 
                stats={stats}
                months={months}
                onSelectStaff={(staff) => {
                  setSelectedStaff(staff);
                  setShowProfile(true);
                }}
              />
            </div>
          </>
        )}

        {/* INDIVIDUAL PROFILE MODAL */}
        {showProfile && selectedStaff && (
          <StaffIndividualProfile
            staffName={selectedStaff.name}
            onClose={() => setShowProfile(false)}
          />
        )}
      </div>
    </AnalyticsErrorBoundary>
  );
};

export default StaffAnalyticsDashboard;
