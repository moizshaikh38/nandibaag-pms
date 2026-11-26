/**
 * Authoritative Payment Synchronization Service (Sprint 3)
 *
 * Single source of truth for deriving booking payment totals, remaining balance,
 * and payment status from recorded payment transactions (with legacy fallback).
 */

const VALID_PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'other'];

/**
 * Compute authoritative payment summary for a booking without mutating it.
 * Avoids double-counting legacy advance fields when payments[] is populated.
 */
function computePaymentSummary(booking) {
  const totalAmount = Math.max(0, Number(booking?.totalAmount || 0));
  const payments = Array.isArray(booking?.payments) ? booking.payments : [];

  let paidAmount = 0;
  if (payments.length > 0) {
    paidAmount = payments.reduce((sum, p) => {
      const amt = Number(p?.amount || 0);
      return sum + (Number.isFinite(amt) && amt > 0 ? amt : 0);
    }, 0);
  } else {
    const legacyAdvance = Number(booking?.advancePaid ?? booking?.advancePayment ?? 0);
    paidAmount = Number.isFinite(legacyAdvance) && legacyAdvance > 0 ? legacyAdvance : 0;
  }

  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  let paymentStatus = 'unpaid';
  if (paidAmount <= 0) {
    paymentStatus = 'unpaid';
  } else if (paidAmount >= totalAmount && totalAmount > 0) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partially_paid';
  }

  return {
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus
  };
}

/**
 * Synchronize booking compatibility fields from authoritative payment summary.
 * Never modifies booking.totalAmount.
 */
function syncBookingPaymentFields(booking) {
  const summary = computePaymentSummary(booking);
  booking.advancePayment = summary.paidAmount;
  booking.advancePaid = summary.paidAmount;
  booking.remainingPayment = summary.remainingAmount;
  booking.paymentStatus = summary.paymentStatus;
  return summary;
}

/**
 * Ensure a serialized booking object exposes consistent payment fields and paymentSummary.
 */
function attachPaymentSummary(bookingObj) {
  const summary = computePaymentSummary(bookingObj);
  return {
    ...bookingObj,
    totalAmount: summary.totalAmount,
    advancePayment: summary.paidAmount,
    advancePaid: summary.paidAmount,
    remainingPayment: summary.remainingAmount,
    paymentStatus: summary.paymentStatus,
    paymentSummary: summary
  };
}

class PaymentConcurrencyError extends Error {
  constructor(message = 'Booking was updated concurrently; please retry', statusCode = 409, code = 'PAYMENT_CONCURRENCY_CONFLICT') {
    super(message);
    this.name = 'PaymentConcurrencyError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Atomically persist a payment mutation using optimistic concurrency (__v CAS)
 * with bounded retries (max 3). Re-reads fresh booking state on conflict.
 */
async function persistPaymentAtomically(BookingModel, bookingId, buildPaymentFn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      return { notFound: true };
    }

    const currentSummary = computePaymentSummary(booking);
    const plan = buildPaymentFn(booking, currentSummary);
    if (plan.error) {
      return { validationError: plan.error };
    }

    const nextPayments = plan.nextPayments;
    const updatedSummary = computePaymentSummary({
      totalAmount: booking.totalAmount,
      payments: nextPayments
    });

    if (typeof BookingModel.findOneAndUpdate === 'function') {
      const versionFilter = booking.__v == null
        ? { __v: { $exists: false } }
        : { __v: booking.__v };
      const updated = await BookingModel.findOneAndUpdate(
        { _id: booking._id, ...versionFilter },
        {
          $set: {
            payments: nextPayments,
            advancePayment: updatedSummary.paidAmount,
            advancePaid: updatedSummary.paidAmount,
            remainingPayment: updatedSummary.remainingAmount,
            paymentStatus: updatedSummary.paymentStatus
          },
          $inc: { __v: 1 }
        },
        { new: true }
      );
      if (updated) {
        return { booking: updated, updatedSummary, currentSummary };
      }
      // Version mismatch: another concurrent request updated the booking; retry with fresh read
      continue;
    }

    // Fallback for test doubles without findOneAndUpdate
    booking.payments = nextPayments;
    syncBookingPaymentFields(booking);
    await booking.save();
    return { booking, updatedSummary, currentSummary };
  }

  throw new PaymentConcurrencyError();
}

module.exports = {
  VALID_PAYMENT_MODES,
  PaymentConcurrencyError,
  computePaymentSummary,
  syncBookingPaymentFields,
  attachPaymentSummary,
  persistPaymentAtomically
};
