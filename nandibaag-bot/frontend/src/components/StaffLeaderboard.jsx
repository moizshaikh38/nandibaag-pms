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
      {stats.slice(0, 5).map((staff, idx) => {
        const safeStaff = staff || {};
        const trend = Number(safeStaff.trend ?? 0);
        const trendPercent = Number.isFinite(Number(safeStaff.trendPercent))
          ? Math.abs(Number(safeStaff.trendPercent))
          : 0;
        const totalBookings = safeStaff.totalCount ?? safeStaff.totalBookings ?? 0;
        const revenue = Number(safeStaff.totalBookingValue ?? safeStaff.totalRevenue ?? 0) || 0;
        const avgPerMonth = safeStaff.avgPerMonth ?? 0;
        const staffName = safeStaff.name || 'Unknown';

        return (
          <div
            key={safeStaff.staffId || staffName || idx}
            className={`leaderboard-item rank-${idx + 1}`}
            onClick={() => onSelectStaff && onSelectStaff(safeStaff)}
          >
            <div className="leaderboard-header-row flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="rank">
                  <span className="medal">{medals[idx] || `#${idx + 1}`}</span>
                  <span className="rank-number">#{idx + 1}</span>
                </div>

                <div className="staff-info">
                  <h4>{staffName}</h4>
                  <p className="role">{safeStaff.role || 'Booking Manager'}</p>
                </div>
              </div>

              <div className="trend">
                <span className={`direction ${trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}`}>
                  {safeStaff.trendDirection || '→'}
                </span>
                <span className="percent">{trendPercent}%</span>
              </div>
            </div>

            <div className="stats-display">
              <div className="stat">
                <span className="label">Bookings</span>
                <span className="value">{totalBookings}</span>
              </div>
              <div className="stat">
                <span className="label">Revenue</span>
                <span className="value">₹{revenue.toLocaleString('en-IN')}</span>
              </div>
              <div className="stat">
                <span className="label">Avg/Month</span>
                <span className="value">{avgPerMonth}</span>
              </div>
            </div>

            <div className="text-right w-full pt-1">
              <span className="view-btn">View Profile →</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StaffLeaderboard;
