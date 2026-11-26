/**
 * Durable Database-Backed Idempotency Service
 *
 * Uses MongoDB unique index on scopeKey (`${userId}:${endpoint}:${idempotencyKey}`)
 * to guarantee atomic mutual exclusion across concurrent requests, retries, and
 * payload mismatch detection. Never uses in-memory Maps or availability checks.
 */

const crypto = require('crypto');
const { IdempotencyRecord, Booking } = require('../models');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class IdempotencyError extends Error {
  constructor(message, code = 'IDEMPOTENCY_ERROR', statusCode = 409) {
    super(message);
    this.name = 'IdempotencyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function stableStringify(val) {
  if (val === null || val === undefined) return JSON.stringify(val);
  if (typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return '[' + val.map(stableStringify).join(',') + ']';
  const keys = Object.keys(val).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(val[k])).join(',') + '}';
}

function computeBookingPayloadHash(payload = {}) {
  const canonical = {
    customerName: payload.customerName ?? payload.guestName ?? '',
    customerPhone: payload.customerPhone ?? payload.guestPhone ?? '',
    packageType: payload.packageType ?? payload.bookingType ?? '',
    checkInDate: payload.checkInDate ?? '',
    checkOutDate: payload.checkOutDate ?? '',
    adults: payload.adults ?? payload.guestComposition?.adults ?? null,
    childrenAges: payload.childrenAges ?? payload.kids ?? [],
    mealOption: payload.mealOption ?? null,
    roomAddon: Boolean(payload.roomAddon === true || payload.roomAddon?.enabled === true),
    rateOverrides: payload.rateOverrides ?? null,
    discount: payload.discount ?? null,
    payment: payload.payment ?? {
      bookingId: payload.bookingId ?? '',
      amount: payload.amount ?? payload.advancePayment ?? payload.advancePaid ?? 0,
      mode: payload.mode ?? payload.paymentMode ?? 'cash',
      utr: payload.utr ?? '',
      screenshotRef: payload.screenshotRef ?? payload.paymentScreenshotRef ?? ''
    },
    roomIds: Array.isArray(payload.roomIds) ? payload.roomIds : (payload.roomId ? [payload.roomId] : []),
    bookedBy: payload.bookedBy ?? null,
    notes: payload.notes ?? payload.specialRequests ?? ''
  };
  return crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

function extractIdempotencyKey(req) {
  const raw = req.headers?.['idempotency-key'] || req.body?.idempotencyKey || '';
  const key = String(raw).trim();
  if (!key) return null;
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9\-_:]+$/.test(key)) {
    throw new IdempotencyError(
      'Invalid idempotencyKey format (must be 8-128 alphanumeric, hyphen, underscore, or colon characters)',
      'INVALID_IDEMPOTENCY_KEY',
      400
    );
  }
  return key;
}

async function acquireIdempotencyLock({ key, userId, endpoint, payload }) {
  if (!key) return { enabled: false };

  const actorId = String(userId || 'anonymous');
  const scopeKey = `${actorId}:${endpoint}:${key}`;
  const requestHash = computeBookingPayloadHash(payload);
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);

  try {
    await IdempotencyRecord.create({
      scopeKey,
      userId: actorId,
      endpoint,
      idempotencyKey: key,
      requestHash,
      status: 'in_progress',
      expiresAt
    });
    return { enabled: true, replay: false, scopeKey, requestHash };
  } catch (err) {
    // 11000 = MongoDB duplicate key error (concurrent or retry)
    if (err.code !== 11000 && !String(err.message || '').includes('duplicate key')) {
      throw err;
    }

    const existing = await IdempotencyRecord.findOne({ scopeKey });
    if (!existing) {
      // Transient recovery race; retry lock acquisition once
      await IdempotencyRecord.create({
        scopeKey,
        userId: actorId,
        endpoint,
        idempotencyKey: key,
        requestHash,
        status: 'in_progress',
        expiresAt
      });
      return { enabled: true, replay: false, scopeKey, requestHash };
    }

    if (existing.requestHash !== requestHash) {
      throw new IdempotencyError(
        'Idempotency key was already used with a different booking payload',
        'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        409
      );
    }

    if (existing.status === 'in_progress') {
      // Recovery path: if booking was already persisted before an interruption or
      // completeIdempotency() failure, recover and replay without creating a duplicate.
      if (existing.bookingId) {
        const persistedBooking = await Booking.findById(existing.bookingId).catch(() => null);
        if (persistedBooking) {
          const bookingObj = persistedBooking.toObject ? persistedBooking.toObject() : persistedBooking;
          const recoveredBody = existing.responseBody || {
            success: true,
            recovered: true,
            booking: bookingObj,
            message: 'Recovered existing booking for idempotency key'
          };
          const recoveredStatus = existing.statusCode || (endpoint.includes('/api/pms/') ? 201 : 200);
          await IdempotencyRecord.updateOne(
            { scopeKey },
            { $set: { status: 'completed', statusCode: recoveredStatus, responseBody: recoveredBody } }
          ).catch(() => {});

          return {
            enabled: true,
            replay: true,
            recovered: true,
            scopeKey,
            statusCode: recoveredStatus,
            responseBody: recoveredBody
          };
        }
      }

      throw new IdempotencyError(
        'A booking submission with this idempotency key is already in progress',
        'IDEMPOTENCY_IN_PROGRESS',
        409
      );
    }

    return {
      enabled: true,
      replay: true,
      scopeKey,
      statusCode: existing.statusCode || 200,
      responseBody: existing.responseBody
    };
  }
}

async function attachBookingToIdempotency({ scopeKey, bookingId }) {
  if (!scopeKey || !bookingId) return;
  await IdempotencyRecord.updateOne(
    { scopeKey },
    { $set: { bookingId } }
  ).catch(() => {});
}

async function completeIdempotency({ scopeKey, statusCode, responseBody, bookingId }) {
  if (!scopeKey) return;
  await IdempotencyRecord.updateOne(
    { scopeKey },
    {
      $set: {
        status: 'completed',
        statusCode,
        responseBody,
        bookingId: bookingId || null
      }
    }
  );
}

async function releaseIdempotencyOnFailure({ scopeKey }) {
  if (!scopeKey) return;
  await IdempotencyRecord.deleteOne({ scopeKey, status: 'in_progress' }).catch(() => {});
}

module.exports = {
  IdempotencyError,
  computeBookingPayloadHash,
  extractIdempotencyKey,
  acquireIdempotencyLock,
  attachBookingToIdempotency,
  completeIdempotency,
  releaseIdempotencyOnFailure
};
