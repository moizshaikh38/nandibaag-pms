/**
 * Shared Authoritative Manual Booking Processor
 *
 * Used by BOTH POST /api/bookings/manual-booking and POST /api/pms/bookings/manual
 * so neither endpoint can trust client totals, bypass warnings, or desync payments.
 */

const { calculateBookingQuote, PricingValidationError, isWeekend } = require('./pricingService');
const { toISTDateString } = require('../utils/dateHelper');
const { logActivity } = require('../utils/activityLogger');

const ALLOWED_PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'other'];

class BookingBusinessError extends Error {
  constructor(message, code = 'BOOKING_VALIDATION_ERROR', statusCode = 400, extra = {}) {
    super(message);
    this.name = 'BookingBusinessError';
    this.code = code;
    this.statusCode = statusCode;
    this.extra = extra;
  }
}

function buildActor(user) {
  if (!user) return { userId: null, name: 'Staff', email: '' };
  return {
    userId: user.id || user._id || null,
    name: user.name || user.email || 'Staff',
    email: user.email || ''
  };
}

function validateAndNormalizePayment(paymentInput, finalTotal, actor, acknowledgeZeroAdvance) {
  const rawAmount = paymentInput?.amount !== undefined && paymentInput?.amount !== null && paymentInput?.amount !== ''
    ? Number(paymentInput.amount)
    : 0;

  if (!Number.isFinite(rawAmount) || rawAmount < 0) {
    throw new BookingBusinessError('Payment amount cannot be negative', 'INVALID_PAYMENT_AMOUNT');
  }
  if (rawAmount > finalTotal) {
    throw new BookingBusinessError('Payment amount cannot exceed final payable total', 'EXCESSIVE_PAYMENT_AMOUNT');
  }

  const mode = paymentInput?.mode ? String(paymentInput.mode).trim().toLowerCase() : 'cash';
  if (rawAmount > 0 && !ALLOWED_PAYMENT_MODES.includes(mode)) {
    throw new BookingBusinessError(
      `Invalid payment mode '${mode}'. Allowed: ${ALLOWED_PAYMENT_MODES.join(', ')}`,
      'INVALID_PAYMENT_MODE'
    );
  }
  if (!ALLOWED_PAYMENT_MODES.includes(mode)) {
    throw new BookingBusinessError(
      `Invalid payment mode '${mode}'. Allowed: ${ALLOWED_PAYMENT_MODES.join(', ')}`,
      'INVALID_PAYMENT_MODE'
    );
  }

  const utr = String(paymentInput?.utr || '').trim();
  if (utr.length > 100) {
    throw new BookingBusinessError('UTR / transaction reference must be 100 characters or less', 'INVALID_UTR');
  }
  if (utr && !/^[A-Za-z0-9\-_/.]+$/.test(utr)) {
    throw new BookingBusinessError('UTR / transaction reference contains invalid characters', 'INVALID_UTR');
  }

  const screenshotRef = String(paymentInput?.screenshotRef || '').trim();
  if (screenshotRef.startsWith('data:')) {
    throw new BookingBusinessError(
      'Raw Base64 payment screenshots are not permitted inside Booking documents; upload via /api/pms/uploads/payment-screenshot',
      'RAW_BASE64_DISALLOWED'
    );
  }

  if (rawAmount === 0 && !acknowledgeZeroAdvance) {
    throw new BookingBusinessError(
      'No advance payment has been collected for this booking. Please confirm before proceeding.',
      'ZERO_ADVANCE_ACK_REQUIRED',
      400,
      { requiresZeroAdvanceAck: true }
    );
  }

  const remainingBalance = Math.max(0, finalTotal - rawAmount);
  let paymentStatus = 'unpaid';
  if (remainingBalance === 0 && finalTotal > 0) {
    paymentStatus = 'paid';
  } else if (rawAmount > 0) {
    paymentStatus = 'partially_paid';
  }

  const payments = rawAmount > 0
    ? [{
        amount: rawAmount,
        mode,
        utr,
        screenshotRef,
        paidAt: paymentInput?.paidAt ? new Date(paymentInput.paidAt) : new Date(),
        collectedBy: {
          userId: actor.userId,
          name: actor.name,
          email: actor.email
        },
        notes: String(paymentInput?.notes || '').trim()
      }]
    : [];

  return {
    advanceAmount: rawAmount,
    remainingBalance,
    paymentStatus,
    payments,
    zeroAdvanceAcknowledged: rawAmount === 0 && Boolean(acknowledgeZeroAdvance)
  };
}

/**
 * Computes authoritative pricing, enforces warnings & payment rules, and returns
 * sanitized fields ready to persist on Booking.
 */
function prepareAuthoritativeBookingData(payload = {}, user = null) {
  const actor = buildActor(user);

  const checkInStr = toISTDateString(payload.checkInDate);
  if (!checkInStr) {
    throw new BookingBusinessError('Valid checkInDate is required', 'INVALID_CHECKIN_DATE');
  }

  const childrenAges = payload.childrenAges !== undefined
    ? payload.childrenAges
    : (Array.isArray(payload.kids) ? payload.kids : []);

  const adults = Number(payload.adults ?? payload.guestComposition?.adults ?? 2);

  let quote;
  try {
    quote = calculateBookingQuote({
      packageType: payload.packageType || payload.bookingType || 'couple',
      checkInDate: checkInStr,
      checkOutDate: payload.checkOutDate ? toISTDateString(payload.checkOutDate) : undefined,
      adults,
      childrenAges,
      mealOption: payload.mealOption,
      roomAddon: payload.roomAddon,
      rateOverrides: payload.rateOverrides ? { ...payload.rateOverrides, actor } : null,
      discount: payload.discount ? { ...payload.discount, actor } : null,
      customTotal: payload.customTotal,
      acknowledgeCoupleWarning: Boolean(payload.acknowledgeCoupleWarning),
      actor
    });
  } catch (err) {
    if (err instanceof PricingValidationError || err.name === 'PricingValidationError') {
      throw new BookingBusinessError(err.message, err.code, 400);
    }
    throw err;
  }

  // Enforce Couple 3/5 adult warning acknowledgment
  const requiredCoupleWarning = quote.warnings.find(w => w.requiresAcknowledgment);
  if (requiredCoupleWarning) {
    const acked = Boolean(payload.acknowledgeCoupleWarning);
    const ackedCode = payload.acknowledgedCoupleWarningCode || null;
    if (!acked || (ackedCode && ackedCode !== requiredCoupleWarning.code)) {
      throw new BookingBusinessError(
        requiredCoupleWarning.message,
        'COUPLE_WARNING_ACK_REQUIRED',
        400,
        { warnings: quote.warnings, requiredCode: requiredCoupleWarning.code }
      );
    }
  }

  // Normalize payment input (supports both payload.payment object and legacy advancePayment/advancePaid)
  const paymentInput = payload.payment && typeof payload.payment === 'object'
    ? payload.payment
    : {
        amount: payload.advancePayment ?? payload.advancePaid ?? 0,
        mode: payload.paymentMode || 'cash',
        utr: payload.utr || '',
        screenshotRef: payload.paymentScreenshotRef || ''
      };

  const paymentResult = validateAndNormalizePayment(
    paymentInput,
    quote.totalAmount,
    actor,
    Boolean(payload.acknowledgeZeroAdvance)
  );

  // Build IST Date objects at local midnight for DB storage
  const checkInDateObj = new Date(`${quote.checkInDate}T00:00:00+05:30`);
  const checkOutDateObj = quote.packageType === 'oneDay'
    ? new Date(`${quote.checkOutDate}T23:59:59+05:30`)
    : new Date(`${quote.checkOutDate}T00:00:00+05:30`);

  return {
    actor,
    quote,
    date: quote.checkInDate,
    checkInDate: checkInDateObj,
    checkOutDate: checkOutDateObj,
    isWeekend: isWeekend(quote.checkInDate),
    adults: quote.guestSummary.effectiveAdults,
    guestComposition: {
      adults: quote.guestSummary.effectiveAdults,
      children: quote.guestSummary.inputChildren
    },
    kids: (quote.guestSummary.childAges || []).map(age => ({
      age,
      rate: quote.snapshot.ratesApplied.childRate || 0
    })),
    totalAmount: quote.totalAmount,
    pricingSnapshot: quote.snapshot,
    rateOverrides: quote.rateOverrides.length > 0 ? quote.rateOverrides : null,
    discount: quote.discountAmount > 0 ? quote.discount : null,
    advancePayment: paymentResult.advanceAmount,
    advancePaid: paymentResult.advanceAmount,
    remainingPayment: paymentResult.remainingBalance,
    paymentStatus: paymentResult.paymentStatus,
    payments: paymentResult.payments,
    acknowledgments: {
      coupleWarningAcknowledged: Boolean(requiredCoupleWarning && payload.acknowledgeCoupleWarning),
      coupleWarningCode: requiredCoupleWarning ? requiredCoupleWarning.code : null,
      coupleWarningAcknowledgedAt: requiredCoupleWarning ? new Date() : null,
      zeroAdvanceAcknowledged: paymentResult.zeroAdvanceAcknowledged,
      zeroAdvanceAcknowledgedAt: paymentResult.zeroAdvanceAcknowledged ? new Date() : null
    },
    priceBreakdown: quote.formatted
  };
}

/**
 * Emits non-blocking ActivityLog audit entries for pricing, overrides, discounts,
 * acknowledgments, and initial payment.
 */
async function logManualBookingAuditEvents(userId, booking, prepared, req = null) {
  if (!userId || !booking?._id) return;
  const bookingRef = String(booking._id);

  await logActivity(userId, 'pricing_snapshot_generated', {
    bookingId: bookingRef,
    packageType: prepared.quote.packageType,
    originalTotal: prepared.quote.originalTotal,
    finalTotal: prepared.totalAmount,
    ruleVersion: prepared.quote.pricingRuleVersion
  }, req);

  if (prepared.quote.customTotalApplied) {
    await logActivity(userId, 'custom_total_applied', {
      bookingId: bookingRef,
      calculatedTotal: prepared.quote.calculatedTotal,
      customTotal: prepared.totalAmount,
      manualTotalAdjustment: prepared.quote.manualTotalAdjustment
    }, req);
  }

  if (prepared.rateOverrides && prepared.rateOverrides.length > 0) {
    await logActivity(userId, 'rate_override_applied', {
      bookingId: bookingRef,
      overrides: prepared.rateOverrides
    }, req);
  }

  if (prepared.discount && prepared.discount.amount > 0) {
    await logActivity(userId, 'discount_applied', {
      bookingId: bookingRef,
      discount: prepared.discount
    }, req);
  }

  if (prepared.acknowledgments.coupleWarningAcknowledged) {
    await logActivity(userId, 'couple_warning_acknowledged', {
      bookingId: bookingRef,
      code: prepared.acknowledgments.coupleWarningCode
    }, req);
  }

  if (prepared.acknowledgments.zeroAdvanceAcknowledged) {
    await logActivity(userId, 'zero_advance_acknowledged', {
      bookingId: bookingRef,
      finalTotal: prepared.totalAmount
    }, req);
  }

  if (prepared.payments && prepared.payments.length > 0) {
    await logActivity(userId, 'initial_payment_recorded', {
      bookingId: bookingRef,
      amount: prepared.payments[0].amount,
      mode: prepared.payments[0].mode,
      utr: prepared.payments[0].utr || null,
      hasScreenshot: Boolean(prepared.payments[0].screenshotRef)
    }, req);
  }
}

module.exports = {
  ALLOWED_PAYMENT_MODES,
  BookingBusinessError,
  prepareAuthoritativeBookingData,
  logManualBookingAuditEvents
};
