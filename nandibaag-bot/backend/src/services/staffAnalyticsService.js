/**
 * Staff Analytics Service (Sprint 4 Phase 2)
 *
 * Server-side MongoDB aggregation for:
 * - Staff booking performance (bookedBy, excluding cancelled/no_show)
 * - Staff collection performance (payments[].collectedBy, filtered by payments.paidAt)
 * - Conservative legacy handling without fabricating collector or timestamp attribution
 */

const { Booking } = require('../models');
const { toISTDateString } = require('../utils/dateHelper');

const MAX_RANGE_DAYS = 366;

class StaffAnalyticsValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'StaffAnalyticsValidationError';
    this.statusCode = statusCode;
  }
}

function isValidYMD(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00.000+05:30`);
  if (Number.isNaN(d.getTime())) return false;
  return toISTDateString(d) === str;
}

function validateStaffAnalyticsParams(input = {}) {
  const query = typeof input === 'number' ? { months: input } : (input || {});
  const todayIST = toISTDateString(new Date());

  if (query.dateFrom || query.dateTo) {
    const dateFrom = query.dateFrom ? String(query.dateFrom).trim() : todayIST;
    const dateTo = query.dateTo ? String(query.dateTo).trim() : todayIST;
    if (!isValidYMD(dateFrom)) throw new StaffAnalyticsValidationError('Invalid dateFrom. Expected YYYY-MM-DD.');
    if (!isValidYMD(dateTo)) throw new StaffAnalyticsValidationError('Invalid dateTo. Expected YYYY-MM-DD.');
    const startDate = new Date(`${dateFrom}T00:00:00.000+05:30`);
    const endDate = new Date(`${dateTo}T23:59:59.999+05:30`);
    if (startDate > endDate) throw new StaffAnalyticsValidationError('dateFrom must be less than or equal to dateTo.');
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays > MAX_RANGE_DAYS) throw new StaffAnalyticsValidationError(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`);
    return { dateFrom, dateTo, startDate, endDate, months: null };
  }

  const months = query.months !== undefined ? Number(query.months) : 3;
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new StaffAnalyticsValidationError('Invalid months parameter. Must be an integer between 1 and 12.');
  }
  const startObj = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const dateFrom = toISTDateString(startObj);
  const dateTo = todayIST;
  return {
    dateFrom,
    dateTo,
    startDate: new Date(`${dateFrom}T00:00:00.000+05:30`),
    endDate: new Date(`${dateTo}T23:59:59.999+05:30`),
    months
  };
}

const getAllStaffStats = async (input = 3) => {
  const { dateFrom, dateTo, startDate, endDate, months } = validateStaffAnalyticsParams(input);

  const [bookingAgg, collectionAgg, legacyAgg, monthlyAgg] = await Promise.all([
    // 1. Booking performance by bookedBy (active bookings only)
    Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled', 'no_show'] }
        }
      },
      {
        $addFields: {
          _staffName: {
            $let: {
              vars: {
                raw: {
                  $ifNull: [
                    '$bookedBy.name',
                    { $cond: [{ $eq: [{ $type: '$bookedBy' }, 'string'] }, '$bookedBy', ''] }
                  ]
                }
              },
              in: {
                $cond: [
                  { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$$raw', ''] } } } }, 0] },
                  { $trim: { input: '$$raw' } },
                  'Unattributed'
                ]
              }
            }
          },
          _pkg: { $ifNull: ['$packageType', 'unknown'] },
          _totalAmt: { $max: [0, { $ifNull: ['$totalAmount', 0] }] }
        }
      },
      {
        $group: {
          _id: '$_staffName',
          totalBookings: { $sum: 1 },
          totalBookingValue: { $sum: '$_totalAmt' },
          coupleCount: { $sum: { $cond: [{ $eq: ['$_pkg', 'couple'] }, 1, 0] } },
          groupCount: { $sum: { $cond: [{ $eq: ['$_pkg', 'group'] }, 1, 0] } },
          oneDayCount: { $sum: { $cond: [{ $in: ['$_pkg', ['oneDay', 'picnic']] }, 1, 0] } }
        }
      }
    ]),

    // 2. Collection performance by payments[].collectedBy (filtered by payments.paidAt)
    Booking.aggregate([
      { $match: { 'payments.paidAt': { $gte: startDate, $lte: endDate } } },
      { $unwind: '$payments' },
      { $match: { 'payments.paidAt': { $gte: startDate, $lte: endDate } } },
      {
        $addFields: {
          _collectorName: {
            $let: {
              vars: { raw: { $ifNull: ['$payments.collectedBy.name', ''] } },
              in: {
                $cond: [
                  { $gt: [{ $strLenCP: { $trim: { input: '$$raw' } } }, 0] },
                  { $trim: { input: '$$raw' } },
                  'Unattributed'
                ]
              }
            }
          },
          _payAmt: { $max: [0, { $ifNull: ['$payments.amount', 0] }] },
          _isCancelled: { $eq: ['$status', 'cancelled'] }
        }
      },
      {
        $group: {
          _id: '$_collectorName',
          collectedActive: { $sum: { $cond: ['$_isCancelled', 0, '$_payAmt'] } },
          collectedCancelled: { $sum: { $cond: ['$_isCancelled', '$_payAmt', 0] } },
          collectionCountActive: { $sum: { $cond: ['$_isCancelled', 0, 1] } },
          collectionCountCancelled: { $sum: { $cond: ['$_isCancelled', 1, 0] } }
        }
      }
    ]),

    // 3. Legacy untimestamped advances (do not fabricate collector or paidAt)
    Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled', 'no_show'] },
          $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }]
        }
      },
      {
        $addFields: {
          _legacyAdv: { $max: [0, { $ifNull: ['$advancePaid', { $ifNull: ['$advancePayment', 0] }] }] }
        }
      },
      { $match: { _legacyAdv: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$_legacyAdv' } } }
    ]),

    // 4. Monthly booking trend by staff (IST YYYY-MM) for chart, table & trend calculations
    Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled', 'no_show'] }
        }
      },
      {
        $addFields: {
          _monthlyStaffName: {
            $let: {
              vars: {
                raw: {
                  $ifNull: [
                    '$bookedBy.name',
                    { $cond: [{ $eq: [{ $type: '$bookedBy' }, 'string'] }, '$bookedBy', ''] }
                  ]
                }
              },
              in: {
                $cond: [
                  { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$$raw', ''] } } } }, 0] },
                  { $trim: { input: '$$raw' } },
                  'Unattributed'
                ]
              }
            }
          },
          _monthKey: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+05:30' } },
          _monthlyAmt: { $max: [0, { $ifNull: ['$totalAmount', 0] }] }
        }
      },
      {
        $group: {
          _id: { staffName: '$_monthlyStaffName', month: '$_monthKey' },
          count: { $sum: 1 },
          revenue: { $sum: '$_monthlyAmt' }
        }
      },
      { $sort: { '_id.month': -1 } }
    ])
  ]);

  // Build ordered descending YYYY-MM keys covering the selected range
  const monthKeysDesc = [];
  const cursor = new Date(`${dateTo.slice(0, 7)}-01T00:00:00.000Z`);
  const minMonth = dateFrom.slice(0, 7);
  while (monthKeysDesc.length < 13) {
    const key = cursor.toISOString().slice(0, 7);
    monthKeysDesc.push(key);
    if (key <= minMonth) break;
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  const monthSpan = Math.max(1, months || monthKeysDesc.length || 1);

  const staffMap = new Map();
  const ensureStaff = (name) => {
    if (!staffMap.has(name)) {
      const emptyMonthly = {};
      for (const mk of monthKeysDesc) {
        emptyMonthly[mk] = { count: 0, revenue: 0 };
      }
      staffMap.set(name, {
        name,
        totalBookings: 0,
        totalCount: 0,
        totalRevenue: 0, // booking value (kept for frontend compatibility)
        totalBookingValue: 0,
        collectedAmount: 0,
        collectionCount: 0,
        cancelledCollectedAmount: 0,
        avgPerMonth: 0,
        trend: 0,
        trendDirection: '→',
        trendPercent: 0,
        monthlyStats: emptyMonthly,
        packageBreakdown: { couple: 0, group: 0, oneDay: 0 }
      });
    }
    return staffMap.get(name);
  };

  for (const row of bookingAgg || []) {
    const entry = ensureStaff(row._id);
    entry.totalBookings = row.totalBookings || 0;
    entry.totalCount = row.totalBookings || 0;
    entry.totalRevenue = row.totalBookingValue || 0;
    entry.totalBookingValue = row.totalBookingValue || 0;
    entry.avgPerMonth = Number(((row.totalBookings || 0) / monthSpan).toFixed(1));
    entry.packageBreakdown = {
      couple: row.coupleCount || 0,
      group: row.groupCount || 0,
      oneDay: row.oneDayCount || 0
    };
  }

  for (const row of collectionAgg || []) {
    const entry = ensureStaff(row._id);
    entry.collectedAmount = row.collectedActive || 0;
    entry.collectionCount = row.collectionCountActive || 0;
    entry.cancelledCollectedAmount = row.collectedCancelled || 0;
  }

  for (const row of monthlyAgg || []) {
    const staffName = row._id?.staffName;
    const monthKey = row._id?.month;
    if (!staffName || !monthKey) continue;
    const entry = ensureStaff(staffName);
    entry.monthlyStats[monthKey] = {
      count: row.count || 0,
      revenue: row.revenue || 0
    };
  }

  for (const entry of staffMap.values()) {
    const curr = monthKeysDesc[0] ? (entry.monthlyStats[monthKeysDesc[0]]?.count || 0) : 0;
    const prev = monthKeysDesc[1] ? (entry.monthlyStats[monthKeysDesc[1]]?.count || 0) : 0;
    const diff = curr - prev;
    entry.trend = diff;
    entry.trendDirection = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    if (prev === 0) {
      entry.trendPercent = curr > 0 ? 100 : 0;
    } else {
      entry.trendPercent = Math.round((diff / prev) * 100);
    }
  }

  const stats = Array.from(staffMap.values()).sort(
    (a, b) => (b.collectedAmount - a.collectedAmount) || (b.totalBookings - a.totalBookings)
  );

  const legacy = legacyAgg?.[0] || { count: 0, totalAmount: 0 };

  return {
    stats,
    filters: { dateFrom, dateTo, months },
    metadata: {
      timezone: 'Asia/Kolkata (+05:30)',
      legacyUntimestampedCount: legacy.count || 0,
      legacyUntimestampedAmount: legacy.totalAmount || 0,
      generatedAt: new Date().toISOString()
    }
  };
};

const getStaffMonthlyStats = async (staffName, monthsBack = 3) => {
  const { startDate, endDate } = validateStaffAnalyticsParams({ months: monthsBack });
  const escaped = String(staffName || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $nin: ['cancelled', 'no_show'] },
        $or: [
          { 'bookedBy.name': { $regex: `^${escaped}$`, $options: 'i' } },
          { bookedBy: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+05:30' } },
        count: { $sum: 1 },
        revenue: { $sum: { $max: [0, { $ifNull: ['$totalAmount', 0] }] } }
      }
    },
    { $sort: { _id: -1 } }
  ]);

  const stats = {};
  for (const r of rows || []) {
    stats[r._id] = { count: r.count, revenue: r.revenue };
  }
  return stats;
};

const getIndividualStaffProfile = async (staffName, monthsBack = 6) => {
  const monthlyStats = await getStaffMonthlyStats(staffName, monthsBack);
  const { stats } = await getAllStaffStats({ months: monthsBack });
  const staffSummary = stats.find((s) => s.name.toLowerCase() === String(staffName || '').trim().toLowerCase()) || {
    name: staffName,
    totalBookings: 0,
    totalRevenue: 0,
    totalBookingValue: 0,
    collectedAmount: 0,
    collectionCount: 0,
    cancelledCollectedAmount: 0,
    packageBreakdown: { couple: 0, group: 0, oneDay: 0 }
  };

  return {
    ...staffSummary,
    monthlyStats
  };
};

module.exports = {
  StaffAnalyticsValidationError,
  validateStaffAnalyticsParams,
  getStaffMonthlyStats,
  getAllStaffStats,
  getIndividualStaffProfile
};
