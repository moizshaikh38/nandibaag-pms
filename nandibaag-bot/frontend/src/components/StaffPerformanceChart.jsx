import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const StaffPerformanceChart = ({ stats = [], months = 3 }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  if (!Array.isArray(stats) || stats.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
        No performance chart data available.
      </div>
    );
  }

  // Collect union of month keys across staff entries (sorted ascending for left-to-right chart)
  const monthKeySet = new Set();
  stats.forEach((staff) => {
    if (staff?.monthlyStats && typeof staff.monthlyStats === 'object') {
      Object.keys(staff.monthlyStats).forEach((k) => monthKeySet.add(k));
    }
  });
  const monthKeys = Array.from(monthKeySet).sort();

  if (monthKeys.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
        No monthly trend data available for this period.
      </div>
    );
  }

  const validStaff = stats.filter((s) => s && typeof s.name === 'string' && s.name.trim().length > 0);
  const chartData = monthKeys.map((monthKey) => {
    const dataPoint = { month: monthKey };

    validStaff.forEach((staff) => {
      const val = Number(staff.monthlyStats?.[monthKey]?.count ?? 0);
      dataPoint[staff.name] = Number.isFinite(val) ? val : 0;
    });

    return dataPoint;
  });

  const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#10b981', '#f59e0b'];

  return (
    <div className="chart-container overflow-x-auto no-scrollbar">
      <ResponsiveContainer width="100%" height={isMobile ? 260 : 380}>
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: isMobile ? 10 : 12, fontWeight: 600 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: isMobile ? 10 : 12 }} allowDecimals={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
            itemStyle={{ color: '#67e8f9' }}
          />
          <Legend wrapperStyle={{ paddingTop: '10px', fontSize: isMobile ? '10px' : '12px' }} />
          
          {validStaff.slice(0, 6).map((staff, idx) => (
            <Bar
              key={staff.staffId || staff.name || idx}
              dataKey={staff.name}
              fill={colors[idx % colors.length]}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StaffPerformanceChart;
