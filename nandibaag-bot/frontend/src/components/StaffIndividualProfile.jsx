import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const StaffIndividualProfile = ({ staffName, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [staffName]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      console.log('[Profile] Fetching profile for', staffName);
      
      const response = await api.get(`/staff/${encodeURIComponent(staffName)}/profile`, {
        params: { months: 6 }
      });
      
      setProfile(response.data.profile);
    } catch (error) {
      console.error('[Profile] Error:', error);
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

  if (!profile) {
    return null;
  }

  // Package breakdown aggregation
  const packageCounts = Object.values(profile.monthlyStats || {}).reduce(
    (acc, month) => {
      acc.couple += month.packageBreakdown?.couple || 0;
      acc.group += month.packageBreakdown?.group || 0;
      acc.oneDay += month.packageBreakdown?.oneDay || 0;
      return acc;
    },
    { couple: 0, group: 0, oneDay: 0 }
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>

        <div className="profile-header">
          <h2>👤 {profile.name}</h2>
          <p className="subtitle">{profile.role || 'Staff Member'} • Contact: {profile.contact || 'N/A'}</p>
        </div>

        <div className="profile-grid">
          {/* OVERVIEW */}
          <div className="card">
            <h3>📊 Overview</h3>
            <div className="stat-item">
              <label>Total Bookings:</label>
              <span className="value">{profile.totalBookings}</span>
            </div>
            <div className="stat-item">
              <label>Total Revenue:</label>
              <span className="value">₹{(profile.totalRevenue || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="stat-item">
              <label>Avg per Booking:</label>
              <span className="value">
                ₹{profile.totalBookings > 0 
                  ? Math.round((profile.totalRevenue || 0) / profile.totalBookings).toLocaleString('en-IN') 
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
              {(profile.bookings || []).length > 0 ? (
                profile.bookings.slice(0, 10).map((booking, idx) => (
                  <div key={booking._id || idx} className="booking-item">
                    <div className="booking-info">
                      <strong>{booking.customerName}</strong>
                      <small>{new Date(booking.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</small>
                    </div>
                    <div className="booking-package">
                      <span className="badge">
                        {booking.packageType === 'couple' ? 'Couple' :
                         booking.packageType === 'group' ? 'Group' : 'One Day'}
                      </span>
                    </div>
                    <div className="booking-amount">
                      ₹{(booking.totalAmount || 0).toLocaleString('en-IN')}
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
