import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import StaffLeaderboard from './StaffLeaderboard';
import StaffPerformanceChart from './StaffPerformanceChart';
import StaffAnalyticsTable from './StaffAnalyticsTable';
import StaffIndividualProfile from './StaffIndividualProfile';
import '../styles/StaffAnalyticsDashboard.css';

const StaffAnalyticsDashboard = () => {
  const [stats, setStats] = useState([]);
  const [months, setMonths] = useState(3);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [months]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      console.log('[Dashboard:Staff] Fetching analytics for', months, 'months');
      
      const response = await api.get('/staff/analytics', {
        params: { months }
      });
      
      console.log('[Dashboard:Staff] Data loaded:', response.data.stats?.length);
      setStats(response.data.stats || []);
    } catch (error) {
      console.error('[Dashboard:Staff] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading staff performance analytics...</div>;
  }

  return (
    <div className="staff-analytics-container">
      <div className="analytics-header">
        <div>
          <h2>📊 Staff Performance Analytics</h2>
          <p className="text-xs text-slate-500 mt-1">Track reservation volumes, revenue contributions, and staff lead trends</p>
        </div>
        
        <div className="controls">
          <select 
            value={months} 
            onChange={(e) => setMonths(parseInt(e.target.value))}
            className="month-selector"
          >
            <option value={1}>Last 1 Month</option>
            <option value={3}>Last 3 Months</option>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
      </div>

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
        <StaffPerformanceChart stats={stats} months={months} />
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

      {/* INDIVIDUAL PROFILE MODAL */}
      {showProfile && selectedStaff && (
        <StaffIndividualProfile
          staffName={selectedStaff.name}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
};

export default StaffAnalyticsDashboard;
