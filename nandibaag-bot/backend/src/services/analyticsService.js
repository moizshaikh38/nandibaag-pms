/**
 * Dashboard Analytics Service (Sprint 4 Phase 1)
 *
 * Server-side MongoDB aggregation pipelines for booking value, payment position,
 * period collections (by paidAt), creation trends (IST +05:30), stay analytics,
 * and package breakdown. Never loads the full Booking collection into memory.
 */

const { Booking } = require('../models');
const { toISTDateString } = require('../utils/dateHelper');

const MAX_RANGE_DAYS = 366;
const VALID_DATE_BASIS = ['created', 'stay'];
const VALID_GRANULARITIES = ['daily', 'weekly', 'monthly'];

class AnalyticsValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AnalyticsValidationError';
    this.statusCode = statusCode;
  }
}

function isValidYMD(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00.000+05:30`);
  if (Number.isNaN(d.getTime())) return false;
  return toISTDateString(d) === str;
}

function validateAnalyticsParams(query = {}) {
  const todayIST = toISTDateString(new Date());
  const defaultFromDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const defaultFromIST = toISTDateString(defaultFromDate);

  const dateFrom = query.dateFrom ? String(query.dateFrom).trim() : defaultFromIST;
  const dateTo = query.dateTo ? String(query.dateTo).trim() : todayIST;
  const dateBasis = query.dateBasis ? String(query.dateBasis).trim() : 'created';
  const granularity = query.granularity ? String(query.granularity).trim() : 'daily';

  if (!isValidYMD(dateFrom)) {
    throw new AnalyticsValidationError('Invalid dateFrom. Expected YYYY-MM-DD.');
  }
  if (!isValidYMD(dateTo)) {
    throw new AnalyticsValidationError('Invalid dateTo. Expected YYYY-MM-DD.');
  }
  if (!VALID_DATE_BASIS.includes(dateBasis)) {
    throw new AnalyticsValidationError(`Invalid dateBasis. Allowed: ${VALID_DATE_BASIS.join(', ')}`);
  }
  if (!VALID_GRANULARITIES.includes(granularity)) {
    throw new AnalyticsValidationError(`Invalid granularity. Allowed: ${VALID_GRANULARITIES.join(', ')}`);
  }

  const startDate = new Date(`${dateFrom}T00:00:00.000+05:30`);
  const endDate = new Date(`${dateTo}T23:59:59.999+05:30`);

  if (startDate > endDate) {
    throw new AnalyticsValidationError('dateFrom must be less than or equal to dateTo.');
  }

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > MAX_RANGE_DAYS) {
    throw new AnalyticsValidationError(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`);
  }

  return { dateFrom, dateTo, dateBasis, granularity, startDate, endDate };
}

function getTrendFormat(granularity) {
  if (granularity === 'weekly') return '%Y-W%V';
  if (granularity === 'monthly') return '%Y-%m';
  return '%Y-%m-%d';
}

/**
 * Authoritative MongoDB expression for paid amount per booking:
 * uses sum(payments[].amount) when payments[] is non-empty,
 * otherwise falls back to advancePaid ?? advancePayment ?? 0.
 */
const EFFECTIVE_PAID_EXPR = {
  $cond: [
    { $gt: [{ $size: { $ifNull: ['$payments', []] } }, 0] },
    { $sum: '$payments.amount' },
    { $ifNull: ['$advancePaid', { $ifNull: ['$advancePayment', 0] }] }
  ]
};

async function getDashboardAnalytics(rawQuery = {}) {
  const { dateFrom, dateTo, dateBasis, granularity, startDate, endDate } = validateAnalyticsParams(rawQuery);

  const scopeMatch = dateBasis === 'stay'
    ? {
        $or: [
          { packageType: 'oneDay', checkInDate: { $gte: startDate, $lte: endDate } },
          { packageType: { $ne: 'oneDay' }, checkInDate: { $lte: endDate }, checkOutDate: { $gt: startDate } }
        ]
      }
    : { createdAt: { $gte: startDate, $lte: endDate } };

  const trendFormat = getTrendFormat(granularity);

  const [
    overviewFacet,
    collectionsAgg,
    legacyUntimestampedAgg,
    trendsAgg,
    stayAgg
  ] = await Promise.all([
    Booking.aggregate([
      { $match: scopeMatch },
      {
        $addFields: {
          _totalAmt: { $max: [0, { $ifNull: ['$totalAmount', 0] }] },
          _paidAmt: { $max: [0, EFFECTIVE_PAID_EXPR] },
          _pkg: { $ifNull: ['$packageType', 'unknown'] },
          _isCancelled: { $eq: ['$status', 'cancelled'] }
        }
      },
      {
        $addFields: {
          _balAmt: { $max: [0, { $subtract: ['$_totalAmt', '$_paidAmt'] }] },
          _payStatus: {
            $cond: [
              { $lte: ['$_paidAmt', 0] },
              'unpaid',
              {
                $cond: [
                  { $and: [{ $gt: ['$_totalAmt', 0] }, { $gte: ['$_paidAmt', '$_totalAmt'] }] },
                  'paid',
                  'partially_paid'
                ]
              }
            ]
          }
        }
      },
      {
        $facet: {
          activeSummary: [
            { $match: { _isCancelled: false } },
            {
              $group: {
                _id: null,
                totalBookings: { $sum: 1 },
                totalBookingValue: { $sum: '$_totalAmt' },
                totalCollected: { $sum: '$_paidAmt' },
                outstandingBalance: { $sum: '$_balAmt' },
                fullyPaidCount: { $sum: { $cond: [{ $eq: ['$_payStatus', 'paid'] }, 1, 0] } },
                partiallyPaidCount: { $sum: { $cond: [{ $eq: ['$_payStatus', 'partially_paid'] }, 1, 0] } },
                unpaidCount: { $sum: { $cond: [{ $eq: ['$_payStatus', 'unpaid'] }, 1, 0] } }
              }
            }
          ],
          byStatus: [
            { $group: { _id: { $ifNull: ['$status', 'unknown'] }, count: { $sum: 1 } } }
          ],
          packageBreakdown: [
            { $match: { _isCancelled: false } },
            {
              $group: {
                _id: '$_pkg',
                bookingCount: { $sum: 1 },
                bookingValue: { $sum: '$_totalAmt' },
                collectedAmount: { $sum: '$_paidAmt' },
                outstandingBalance: { $sum: '$_balAmt' }
              }
            },
            { $sort: { bookingValue: -1 } }
          ]
        }
      }
    ]),

    // Actual collections during selected period by payments.paidAt
    Booking.aggregate([
      { $match: { 'payments.paidAt': { $gte: startDate, $lte: endDate } } },
      { $unwind: '$payments' },
      { $match: { 'payments.paidAt': { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $eq: ['$status', 'cancelled'] },
          totalAmount: { $sum: { $max: [0, { $ifNull: ['$payments.amount', 0] }] } },
          transactionCount: { $sum: 1 }
        }
      }
    ]),

    // Detect legacy bookings with advance > 0 but no timestamped payments[]
    Booking.aggregate([
      {
        $match: {
          ...scopeMatch,
          status: { $ne: 'cancelled' },
          $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }]
        }
      },
      {
        $addFields: {
          _legacyAdv: { $max: [0, { $ifNull: ['$advancePaid', { $ifNull: ['$advancePayment', 0] }] }] }
        }
      },
      { $match: { _legacyAdv: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$_legacyAdv' }
        }
      }
    ]),

    // Booking creation trends (always by createdAt in IST +05:30)
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: { $dateToString: { format: trendFormat, date: '$createdAt', timezone: '+05:30' } },
          bookingsCreated: { $sum: 1 },
          bookingValue: { $sum: { $max: [0, { $ifNull: ['$totalAmount', 0] }] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    // Stay-date analytics (separate One Day vs overnight)
    Booking.aggregate([
      {
        $match: {
          status: { $ne: 'cancelled' },
          $or: [
            { packageType: 'oneDay', checkInDate: { $gte: startDate, $lte: endDate } },
            { packageType: { $ne: 'oneDay' }, checkInDate: { $lte: endDate }, checkOutDate: { $gt: startDate } }
          ]
        }
      },
      {
        $group: {
          _id: { $eq: ['$packageType', 'oneDay'] },
          bookingCount: { $sum: 1 },
          bookingValue: { $sum: { $max: [0, { $ifNull: ['$totalAmount', 0] }] } }
        }
      }
    ])
  ]);

  const facet = overviewFacet?.[0] || {};
  const active = facet.activeSummary?.[0] || {};
  const totalBookings = active.totalBookings || 0;
  const totalBookingValue = active.totalBookingValue || 0;

  const byStatus = {};
  for (const row of facet.byStatus || []) {
    byStatus[row._id] = row.count;
  }

  const activeColl = (collectionsAgg || []).find(r => r._id === false) || { totalAmount: 0, transactionCount: 0 };
  const cancelledColl = (collectionsAgg || []).find(r => r._id === true) || { totalAmount: 0, transactionCount: 0 };
  const legacyUntimestamped = legacyUntimestampedAgg?.[0] || { count: 0, totalAmount: 0 };

  const oneDayStay = (stayAgg || []).find(r => r._id === true) || { bookingCount: 0, bookingValue: 0 };
  const overnightStay = (stayAgg || []).find(r => r._id === false) || { bookingCount: 0, bookingValue: 0 };

  return {
    filters: { dateFrom, dateTo, dateBasis, granularity },
    bookingOverview: {
      totalBookings,
      totalBookingValue,
      averageBookingValue: totalBookings > 0 ? Math.round(totalBookingValue / totalBookings) : 0,
      byStatus
    },
    paymentPosition: {
      totalCollected: active.totalCollected || 0,
      outstandingBalance: active.outstandingBalance || 0,
      fullyPaidCount: active.fullyPaidCount || 0,
      partiallyPaidCount: active.partiallyPaidCount || 0,
      unpaidCount: active.unpaidCount || 0,
      asOf: 'current_state'
    },
    collections: {
      periodCollectedActive: activeColl.totalAmount || 0,
      periodTransactionsActive: activeColl.transactionCount || 0,
      periodCollectedCancelled: cancelledColl.totalAmount || 0,
      periodTransactionsCancelled: cancelledColl.transactionCount || 0,
      legacyUntimestampedCount: legacyUntimestamped.count || 0,
      legacyUntimestampedAmount: legacyUntimestamped.totalAmount || 0
    },
    bookingTrends: (trendsAgg || []).map(r => ({
      period: r._id,
      bookingsCreated: r.bookingsCreated,
      bookingValue: r.bookingValue
    })),
    stayAnalytics: {
      overnightBookings: overnightStay.bookingCount || 0,
      overnightBookingValue: overnightStay.bookingValue || 0,
      oneDayBookings: oneDayStay.bookingCount || 0,
      oneDayBookingValue: oneDayStay.bookingValue || 0
    },
    packageBreakdown: (facet.packageBreakdown || []).map(r => ({
      packageType: r._id || 'unknown',
      bookingCount: r.bookingCount,
      bookingValue: r.bookingValue,
      collectedAmount: r.collectedAmount,
      outstandingBalance: r.outstandingBalance
    })),
    metadata: {
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata (+05:30)',
      appliedFilters: { dateFrom, dateTo, dateBasis, granularity },
      legacyPaymentsAffected: (legacyUntimestamped.count || 0) > 0,
      limitations: [
        'Legacy bookings with advancePaid/advancePayment but empty payments[] lack individual paidAt timestamps and are excluded from period collections by paidAt.'
      ]
    }
  };
}

module.exports = {
  AnalyticsValidationError,
  validateAnalyticsParams,
  getDashboardAnalytics
};
