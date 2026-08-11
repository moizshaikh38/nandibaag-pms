import React from 'react';

const StaffLeaderboard = ({ stats = [], onSelectStaff }) => {
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  if (!stats || stats.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
        No staff analytics data available for this period.
      </div>
    );
  }

  return (
    <div className="leaderboard">
      {stats.slice(0, 5).map((staff, idx) => (
        <div
          key={staff.staffId || staff.name}
          className={`leaderboard-item rank-${idx + 1}`}
          onClick={() => onSelectStaff && onSelectStaff(staff)}
        >
          <div className="leaderboard-header-row flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="rank">
                <span className="medal">{medals[idx] || `#${idx + 1}`}</span>
                <span className="rank-number">#{idx + 1}</span>
              </div>

              <div className="staff-info">
                <h4>{staff.name}</h4>
                <p className="role">{staff.role || 'Booking Manager'}</p>
              </div>
            </div>

            <div className="trend">
              <span className={`direction ${staff.trend > 0 ? 'up' : staff.trend < 0 ? 'down' : 'flat'}`}>
                {staff.trendDirection}
              </span>
              <span className="percent">{Math.abs(staff.trendPercent)}%</span>
            </div>
          </div>

          <div className="stats-display">
            <div className="stat">
              <span className="label">Bookings</span>
              <span className="value">{staff.totalCount}</span>
            </div>
            <div className="stat">
              <span className="label">Revenue</span>
              <span className="value">₹{(staff.totalRevenue || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="stat">
              <span className="label">Avg/Month</span>
              <span className="value">{staff.avgPerMonth}</span>
            </div>
          </div>

          <div className="text-right w-full pt-1">
            <span className="view-btn">View Profile →</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StaffLeaderboard;
