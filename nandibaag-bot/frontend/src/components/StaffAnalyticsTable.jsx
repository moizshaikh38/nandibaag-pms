import React from 'react';

const StaffAnalyticsTable = ({ stats = [], onSelectStaff, months = 3 }) => {
  if (!stats || stats.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
        No breakdown table data available.
      </div>
    );
  }

  return (
    <div className="analytics-table-wrapper">
      <table className="analytics-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Staff Name</th>
            <th>Current Month</th>
            <th>Previous Month</th>
            <th>Trend</th>
            <th>{months}-Month Total</th>
            <th>Avg/Month</th>
            <th>Revenue</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((staff, idx) => {
            const safeStaff = staff || {};
            const monthlyStats =
              safeStaff.monthlyStats && typeof safeStaff.monthlyStats === 'object'
                ? safeStaff.monthlyStats
                : {};
            const monthKeys = Object.keys(monthlyStats);
            const currentMonth = monthKeys[0] ? (monthlyStats[monthKeys[0]]?.count ?? 0) : 0;
            const previousMonth = monthKeys[1] ? (monthlyStats[monthKeys[1]]?.count ?? 0) : 0;
            const trend = Number(safeStaff.trend ?? 0);
            const trendPercent = Number.isFinite(Number(safeStaff.trendPercent))
              ? Math.abs(Number(safeStaff.trendPercent))
              : 0;
            const totalCount = safeStaff.totalCount ?? safeStaff.totalBookings ?? 0;
            const avgPerMonth = safeStaff.avgPerMonth ?? 0;
            const revenue = Number(safeStaff.totalBookingValue ?? safeStaff.totalRevenue ?? 0) || 0;
            const staffName = safeStaff.name || 'Unknown';

            return (
              <tr key={safeStaff.staffId || staffName || idx} className="analytics-row">
                <td className="rank">
                  {idx === 0 && '🥇'}
                  {idx === 1 && '🥈'}
                  {idx === 2 && '🥉'}
                  {idx > 2 && `#${idx + 1}`}
                </td>
                <td className="name">{staffName}</td>
                <td className="center bold">{currentMonth}</td>
                <td className="center">{previousMonth}</td>
                <td className={`trend ${trend > 0 ? 'positive' : trend < 0 ? 'negative' : 'flat'}`}>
                  {safeStaff.trendDirection || '→'} {trendPercent}%
                </td>
                <td className="center bold">{totalCount}</td>
                <td className="center">{avgPerMonth}</td>
                <td className="revenue">₹{revenue.toLocaleString('en-IN')}</td>
                <td className="action">
                  <button 
                    onClick={() => onSelectStaff && onSelectStaff(safeStaff)}
                    className="view-btn"
                  >
                    View Profile
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default StaffAnalyticsTable;
