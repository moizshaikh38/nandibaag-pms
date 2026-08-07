import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/DashboardStats.css';

const DashboardStats = () => {
  const [stats, setStats] = useState({
    chatsCount: 0,
    hotLeadsCount: 0,
    bookingsCount: 0,
    periodStart: null,
    periodEnd: null
  });
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState(null);
  const [detailedData, setDetailedData] = useState([]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard/last-2-days-stats');
      setStats(response.data);
      console.log('[Dashboard] Stats loaded:', response.data);
    } catch (error) {
      console.error('[Dashboard] Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedData = async (section) => {
    try {
      let endpoint = '';
      if (section === 'chats') endpoint = '/dashboard/last-2-days-chats';
      else if (section === 'hotLeads') endpoint = '/dashboard/last-2-days-hot-leads';
      else if (section === 'bookings') endpoint = '/dashboard/last-2-days-bookings';

      const response = await api.get(endpoint);
      setDetailedData(response.data.chats || response.data.hotLeads || response.data.bookings || []);
      setExpandedSection(section);
    } catch (error) {
      console.error('[Dashboard] Error fetching detailed data:', error);
    }
  };

  const handleRefresh = async () => {
    try {
      await api.post('/dashboard/refresh-stats');
      fetchStats();
      console.log('[Dashboard] Manually refreshed');
    } catch (error) {
      console.error('[Dashboard] Error refreshing:', error);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading stats...</div>;
  }

  return (
    <div className="dashboard-stats-container">
      <div className="stats-header">
        <h2>📊 LAST 2 DAYS ANALYTICS</h2>
        <button 
          className="refresh-btn" 
          onClick={handleRefresh}
          title="Manually refresh stats"
        >
          🔄 REFRESH NOW
        </button>
      </div>

      <div className="period-info">
        <p>
          📅 {stats.periodStart ? new Date(stats.periodStart).toLocaleDateString() : ''} - 
          {stats.periodEnd ? new Date(stats.periodEnd).toLocaleDateString() : ''}
        </p>
      </div>

      <div className="stats-widgets">
        {/* CHATS WIDGET */}
        <div 
          className="stat-widget"
          onClick={() => fetchDetailedData('chats')}
        >
          <div className="stat-icon">💬</div>
          <div className="stat-content">
            <div className="stat-label">TODAY'S CHATS</div>
            <div className="stat-number">{stats.chatsCount}</div>
          </div>
          <div className="stat-arrow">→</div>
        </div>

        {/* HOT LEADS WIDGET */}
        <div 
          className="stat-widget hot-leads"
          onClick={() => fetchDetailedData('hotLeads')}
        >
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <div className="stat-label">HOT LEADS</div>
            <div className="stat-number">{stats.hotLeadsCount}</div>
          </div>
          <div className="stat-arrow">→</div>
        </div>

        {/* BOOKINGS WIDGET */}
        <div 
          className="stat-widget"
          onClick={() => fetchDetailedData('bookings')}
        >
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <div className="stat-label">BOOKINGS</div>
            <div className="stat-number">{stats.bookingsCount}</div>
          </div>
          <div className="stat-arrow">→</div>
        </div>
      </div>

      {/* EXPANDED SECTION */}
      {expandedSection && (
        <div className="expanded-section">
          <div className="expanded-header">
            <h3>
              {expandedSection === 'chats' && '💬 ALL CHATS (Last 2 Days)'}
              {expandedSection === 'hotLeads' && '🔥 HOT LEADS (Last 2 Days)'}
              {expandedSection === 'bookings' && '📅 BOOKINGS (Last 2 Days)'}
            </h3>
            <button onClick={() => setExpandedSection(null)}>✕ Close</button>
          </div>

          <div className="detailed-list">
            {detailedData && detailedData.length > 0 ? (
              detailedData.map((item, idx) => (
                <div key={idx} className="list-item">
                  {expandedSection === 'chats' && (
                    <>
                      <div className="item-name">{item.customerName || item.customerPhone}</div>
                      <div className="item-detail">{item.bookingStage}</div>
                      <div className="item-time">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </>
                  )}
                  {expandedSection === 'hotLeads' && (
                    <>
                      <div className="item-name">Score: {item.score}</div>
                      <div className="item-detail">{item.status}</div>
                      <div className="item-time">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </>
                  )}
                  {expandedSection === 'bookings' && (
                    <>
                      <div className="item-name">{item.customerName}</div>
                      <div className="item-detail">₹{item.totalAmount} - {item.status}</div>
                      <div className="item-time">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div className="no-data">No data available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardStats;
