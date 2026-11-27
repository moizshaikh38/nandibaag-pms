import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDMY } from '../utils/formatters';

const StaffIndividualProfile = ({ staffName, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [staffName]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/staff/${encodeURIComponent(staffName || '')}/profile`, {
        params: { months: 6 }
      });
      setProfile(response.data?.profile || null);
    } catch (err) {
      console.error('[Profile] Error:', err);
      setError(err.response?.data?.message || 'Failed to load staff profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>✕</button>
          <div className="loading">Loading staff profile...</div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>✕</button>
          <div className="p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-rose-700">{error || 'Staff profile unavailable.'}</p>
            <button
              type="button"
              onClick={fetchProfile}
              className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Prefer authoritative packageBreakdown returned by profile service; fall back to monthlyStats only when absent
  const packageCounts = profile.packageBreakdown
    ? {
        couple: Number(profile.packageBreakdown.couple || 0),
        group: Number(profile.packageBreakdown.group || 0),
        oneDay: Number(profile.packageBreakdown.oneDay || 0)
      }
    : Object.values(profile.monthlyStats || {}).reduce(
        (acc, month) => {
          acc.couple += month?.packageBreakdown?.couple || 0;
          acc.group += month?.packageBreakdown?.group || 0;
          acc.oneDay += month?.packageBreakdown?.oneDay || 0;
          return acc;
        },
        { couple: 0, group: 0, oneDay: 0 }
      );

  const totalBookings = Number(profile.totalBookings ?? profile.totalCount ?? 0) || 0;
  const totalRevenue = Number(profile.totalRevenue ?? profile.totalBookingValue ?? 0) || 0;
  const recentBookings = Array.isArray(profile.bookings) ? profile.bookings.slice(0, 10) : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>

        <div className="profile-header">
          <h2>👤 {profile.name || staffName || 'Staff Member'}</h2>
          <p className="subtitle">{profile.role || 'Staff Member'} • Contact: {profile.contact || 'N/A'}</p>
        </div>

        <div className="profile-grid">
          {/* OVERVIEW */}
          <div className="card">
            <h3>📊 Overview</h3>
            <div className="stat-item">
              <label>Total Bookings:</label>
              <span className="value">{totalBookings}</span>
            </div>
            <div className="stat-item">
              <label>Total Revenue:</label>
              <span className="value">₹{totalRevenue.toLocaleString('en-IN')}</span>
            </div>
            <div className="stat-item">
              <label>Avg per Booking:</label>
              <span className="value">
                ₹{totalBookings > 0 
                  ? Math.round(totalRevenue / totalBookings).toLocaleString('en-IN') 
                  : 0}
              </span>
            </div>
          </div>

          {/* PACKAGE BREAKDOWN */}
          <div className="card">
            <h3>🎁 Package Breakdown</h3>
            <div className="stat-item">
              <label>Couple Stay:</label>
              <span className="value">{packageCounts.couple}</span>
            </div>
            <div className="stat-item">
              <label>Group Stay:</label>
              <span className="value">{packageCounts.group}</span>
            </div>
            <div className="stat-item">
              <label>One Day Picnic:</label>
              <span className="value">{packageCounts.oneDay}</span>
            </div>
          </div>

          {/* MONTHLY STATS */}
          <div className="card wide">
            <h3>📅 Monthly Breakdown</h3>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Bookings</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(profile.monthlyStats || {}).map(([month, data]) => (
                  <tr key={month}>
                    <td>{month}</td>
                    <td className="center">{data.count}</td>
                    <td className="revenue">₹{(data.revenue || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RECENT BOOKINGS */}
          <div className="card wide">
            <h3>📋 Recent Bookings</h3>
            <div className="bookings-list">
              {recentBookings.length > 0 ? (
                recentBookings.map((booking, idx) => (
                  <div key={booking?._id || idx} className="booking-item">
                    <div className="booking-info">
                      <strong>{booking?.customerName || 'Guest'}</strong>
                      <small>{booking?.createdAt ? formatDMY(booking.createdAt) : '—'}</small>
                    </div>
                    <div className="booking-package">
                      <span className="badge">
                        {booking?.packageType === 'couple' ? 'Couple' :
                         booking?.packageType === 'group' ? 'Group' : 'One Day'}
                      </span>
                    </div>
                    <div className="booking-amount">
                      ₹{(Number(booking?.totalAmount || 0) || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 p-3 italic">No recent bookings found for this staff member.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffIndividualProfile;
