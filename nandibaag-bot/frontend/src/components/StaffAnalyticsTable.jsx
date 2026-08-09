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
            const monthKeys = Object.keys(staff.monthlyStats || {});
            const currentMonth = staff.monthlyStats[monthKeys[0]]?.count || 0;
            const previousMonth = staff.monthlyStats[monthKeys[1]]?.count || 0;

            return (
              <tr key={staff.staffId || staff.name} className="analytics-row">
                <td className="rank">
                  {idx === 0 && '🥇'}
                  {idx === 1 && '🥈'}
                  {idx === 2 && '🥉'}
                  {idx > 2 && `#${idx + 1}`}
                </td>
                <td className="name">{staff.name}</td>
                <td className="center bold">{currentMonth}</td>
                <td className="center">{previousMonth}</td>
                <td className={`trend ${staff.trend > 0 ? 'positive' : staff.trend < 0 ? 'negative' : 'flat'}`}>
                  {staff.trendDirection} {Math.abs(staff.trendPercent)}%
                </td>
                <td className="center bold">{staff.totalCount}</td>
                <td className="center">{staff.avgPerMonth}</td>
                <td className="revenue">₹{(staff.totalRevenue || 0).toLocaleString('en-IN')}</td>
                <td className="action">
                  <button 
                    onClick={() => onSelectStaff && onSelectStaff(staff)}
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
