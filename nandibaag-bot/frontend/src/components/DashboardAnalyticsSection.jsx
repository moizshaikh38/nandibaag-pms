import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { CalendarDays, RefreshCw, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';

function getISTToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getISTDaysAgo(days) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  );
}

export default function DashboardAnalyticsSection() {
  const [dateFrom, setDateFrom] = useState(() => getISTDaysAgo(29));
  const [dateTo, setDateTo] = useState(() => getISTToday());
  const [dateBasis, setDateBasis] = useState('created');
  const [granularity, setGranularity] = useState('daily');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const fetchAnalytics = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('Start date must be on or before end date.');
      return;
    }
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dashboard/analytics', {
        params: { dateFrom, dateTo, dateBasis, granularity }
      });
      if (reqId !== requestIdRef.current) return;
      setData(res.data);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setError(err.response?.data?.message || 'Failed to load dashboard analytics');
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateFrom, dateTo, dateBasis, granularity]);

  const overview = data?.bookingOverview;
  const payment = data?.paymentPosition;
  const collections = data?.collections;
  const stay = data?.stayAnalytics;
  const packages = data?.packageBreakdown || [];
  const trends = data?.bookingTrends || [];

  return (
    <div className="glass-card p-5 rounded-2xl bg-white border border-slate-200 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-600" />
            <span>Revenue, Collections & Booking Analytics (IST)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Authoritative server-side aggregation separating booking value from actual collected payments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
            aria-label="Analytics start date"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
            aria-label="Analytics end date"
          />
          <select
            value={dateBasis}
            onChange={(e) => setDateBasis(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
            aria-label="Date basis"
          >
            <option value="created">By Booking Created</option>
            <option value="stay">By Stay Dates</option>
          </select>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
            aria-label="Trend granularity"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            title="Refresh Analytics"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertCircle size={14} />
            <span>{error}</span>
          </span>
          <button type="button" onClick={fetchAnalytics} className="font-bold underline">Retry</button>
        </div>
      )}

      {loading && !data ? (
        <div className="py-10 text-center text-xs text-slate-500">Loading analytics...</div>
      ) : !data || (overview?.totalBookings === 0 && collections?.periodCollectedActive === 0) ? (
        <div className="py-10 text-center text-xs text-slate-500">
          No bookings or collections found for the selected IST date range.
        </div>
      ) : (
        <>
          {/* Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-semibold text-slate-500 uppercase">Active Booking Value</p>
              <p className="text-xl font-bold text-slate-900 mt-1">₹{(overview?.totalBookingValue ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {overview?.totalBookings ?? 0} active bookings • Avg ₹{(overview?.averageBookingValue ?? 0).toLocaleString('en-IN')}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase">Collected in Period (paidAt)</p>
              <p className="text-xl font-bold text-emerald-900 mt-1">₹{(collections?.periodCollectedActive ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-emerald-700 mt-1">
                {collections?.periodTransactionsActive ?? 0} active txns
                {collections?.periodCollectedCancelled > 0 && ` • Cancelled: ₹${collections.periodCollectedCancelled.toLocaleString('en-IN')}`}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[11px] font-semibold text-amber-800 uppercase">Current Outstanding Balance</p>
              <p className="text-xl font-bold text-amber-900 mt-1">₹{(payment?.outstandingBalance ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-amber-800 mt-1">
                Paid: {payment?.fullyPaidCount ?? 0} • Partial: {payment?.partiallyPaidCount ?? 0} • Unpaid: {payment?.unpaidCount ?? 0}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-[11px] font-semibold text-indigo-700 uppercase">Stay Mix (Overnight vs One Day)</p>
              <p className="text-xl font-bold text-indigo-900 mt-1">
                {stay?.overnightBookings ?? 0} / {stay?.oneDayBookings ?? 0}
              </p>
              <p className="text-[11px] text-indigo-700 mt-1">
                Overnight: ₹{(stay?.overnightBookingValue ?? 0).toLocaleString('en-IN')} • One Day: ₹{(stay?.oneDayBookingValue ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {collections?.legacyUntimestampedCount > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
              <strong>Note:</strong> {collections.legacyUntimestampedCount} legacy booking(s) with ₹{collections.legacyUntimestampedAmount.toLocaleString('en-IN')} in untimestamped advances are included in Current Collected (₹{(payment?.totalCollected ?? 0).toLocaleString('en-IN')}) but excluded from period-filtered <code>paidAt</code> collections.
            </div>
          )}

          {/* Package Breakdown & Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                <DollarSign size={14} className="text-emerald-600" />
                <span>Package Breakdown</span>
              </h3>
              {packages.length === 0 ? (
                <p className="text-xs text-slate-400">No package data.</p>
              ) : (
                <div className="space-y-1.5">
                  {packages.map((pkg) => (
                    <div key={pkg.packageType} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                      <span className="font-semibold capitalize text-slate-700">{pkg.packageType} ({pkg.bookingCount})</span>
                      <span className="text-slate-600">
                        Value: <strong>₹{pkg.bookingValue.toLocaleString('en-IN')}</strong> • Collected: <strong className="text-emerald-700">₹{pkg.collectedAmount.toLocaleString('en-IN')}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                <CalendarDays size={14} className="text-indigo-600" />
                <span>Booking Creation Trends ({granularity})</span>
              </h3>
              {trends.length === 0 ? (
                <p className="text-xs text-slate-400">No trend data in range.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {trends.map((t) => (
                    <div key={t.period} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                      <span className="font-mono text-slate-600">{t.period}</span>
                      <span className="text-slate-700">
                        <strong>{t.bookingsCreated}</strong> bookings • ₹{t.bookingValue.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
