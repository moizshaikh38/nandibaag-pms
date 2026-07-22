const cron = require('node-cron');
const { Booking, RoomBooking, Chat, Settings, MessageLog } = require('../models');
const { getLifecycleMessage } = require('../utils/lifecycleMessageTemplates');
const { sendMessage, getSessionStatus } = require('./whatsappService');
const logger = require('../config/logger');

/**
 * Lifecycle Message Cron — Phase F+G
 *
 * Sends automated check-in reminders, check-out messages, and review requests
 * based on actual booking dates (RoomBooking checkInDate / checkOutDate).
 *
 * WHY THIS APPROACH DIFFERS FROM followUpCron.js:
 * ──────────────────────────────────────────────────
 * followUpCron.js queries FollowUp job-documents created at schedule-time
 * (relative delays: 3h, 1d, 3d, 7d from when interest was shown).
 *
 * This cron queries Bookings directly because lifecycle messages are tied
 * to FIXED calendar dates (check-in day, check-out day) that are known
 * upfront. No need for separate job documents — the Booking IS the job.
 *
 * DUPLICATE-SAFE: Boolean sent-flags (checkinReminderSent, checkoutMessageSent,
 * reviewRequestSent) are checked before every send, then atomically set to true.
 * Even if the cron runs multiple times in the send window, each message sends once.
 *
 * CANCEL-SAFE: Every query filters Booking.status !== 'cancelled' AND
 * messagesStopped !== true. The "Stop Messages" toggle from Phase D and
 * booking cancellation both prevent sends immediately.
 *
 * Runs every hour (matching existing cron style) and checks the IST clock
 * to decide which message types are within their send window:
 *   - checkin_reminder + checkout_message: 7 AM – 11 AM IST (morning)
 *   - review_request: 5 PM – 9 PM IST (evening)
 */

let cronJob = null;

// IST time helper: gets current hour in IST (UTC+5:30)
function getISTHour() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const istMinutes = utcMinutes + 30;
  const istHours = utcHours + 5 + Math.floor(istMinutes / 60);
  return (istHours % 24);
}

function getISTDate() {
  const now = new Date();
  // Shift to IST
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0]; // YYYY-MM-DD in IST
}

/**
 * Gets the WhatsApp session ID and language for a booking.
 * Uses the linked Chat if available, otherwise defaults.
 */
async function getSessionAndLanguage(booking) {
  let sessionId = 'default';
  let language = 'hinglish';

  if (booking.chatId) {
    const chat = await Chat.findById(booking.chatId).select('whatsappNumberUsed language');
    if (chat) {
      sessionId = chat.whatsappNumberUsed || 'default';
      language = chat.language || 'hinglish';
    }
  }

  return { sessionId, language };
}

/**
 * Process check-in reminders (morning of check-in date)
 */
async function processCheckinReminders() {
  const today = getISTDate();
  const todayStart = new Date(today + 'T00:00:00.000Z');
  const todayEnd = new Date(today + 'T23:59:59.999Z');

  // Find bookings where:
  // - RoomBooking exists
  // - Linked RoomBooking's checkInDate is today
  // - Status is confirmed or checked_in
  // - checkinReminderSent is false
  // - messagesStopped is false
  // - Booking is not cancelled
  const bookings = await Booking.find({
    roomBookingId: { $ne: null },
    status: { $in: ['confirmed', 'checked_in'] },
    checkinReminderSent: false,
    messagesStopped: false
  }).populate('roomBookingId', 'checkInDate status');

  let sent = 0;
  for (const booking of bookings) {
    if (!booking.roomBookingId) continue;

    // Check if RoomBooking's checkInDate is today
    const checkInDate = new Date(booking.roomBookingId.checkInDate);
    const checkInDay = checkInDate.toISOString().split('T')[0];
    if (checkInDay !== today) continue;

    // Also skip if RoomBooking itself is cancelled
    if (booking.roomBookingId.status === 'cancelled') continue;

    try {
      const { sessionId, language } = await getSessionAndLanguage(booking);

      // Check WhatsApp session is connected
      const status = getSessionStatus(sessionId);
      if (status !== 'connected') {
        logger.info(`[LifecycleCron] WhatsApp session ${sessionId} not connected, skipping checkin_reminder for ${booking.customerPhone}`);
        continue; // Don't mark sent, will retry next hour
      }

      const message = getLifecycleMessage('checkin_reminder', language, booking.customerName);

      // Double-check the flag before sending (race condition protection)
      const freshBooking = await Booking.findById(booking._id);
      if (freshBooking.checkinReminderSent || freshBooking.messagesStopped || freshBooking.status === 'cancelled') {
        continue;
      }

      await sendMessage(sessionId, booking.customerPhone, message);

      // Mark sent atomically
      await Booking.findByIdAndUpdate(booking._id, { checkinReminderSent: true });

      await MessageLog.create({
        bookingId: booking._id,
        guestPhone: booking.customerPhone,
        messageType: 'checkin_reminder',
        status: 'sent',
        sentAt: new Date(),
        messageText: message
      });

      sent++;
      logger.info(`[LifecycleCron] checkin_reminder sent to ${booking.customerPhone}`);
    } catch (error) {
      logger.error(`[LifecycleCron] Failed to send checkin_reminder to ${booking.customerPhone}: ${error.message}`);
      // If it's a send failure (not session), log it
      if (!error.message.includes('not connected') && !error.message.includes('not initialized')) {
        await MessageLog.create({
          bookingId: booking._id,
          guestPhone: booking.customerPhone,
          messageType: 'checkin_reminder',
          status: 'failed',
          errorReason: error.message
        }).catch(() => {});
      }
    }
  }

  if (sent > 0) logger.info(`[LifecycleCron] Sent ${sent} check-in reminder(s)`);
}

/**
 * Process check-out messages (morning of check-out date)
 */
async function processCheckoutMessages() {
  const today = getISTDate();

  const bookings = await Booking.find({
    roomBookingId: { $ne: null },
    status: { $in: ['confirmed', 'checked_in'] },
    checkoutMessageSent: false,
    messagesStopped: false
  }).populate('roomBookingId', 'checkOutDate status');

  let sent = 0;
  for (const booking of bookings) {
    if (!booking.roomBookingId) continue;

    const checkOutDate = new Date(booking.roomBookingId.checkOutDate);
    const checkOutDay = checkOutDate.toISOString().split('T')[0];
    if (checkOutDay !== today) continue;

    if (booking.roomBookingId.status === 'cancelled') continue;

    try {
      const { sessionId, language } = await getSessionAndLanguage(booking);

      const status = getSessionStatus(sessionId);
      if (status !== 'connected') {
        logger.info(`[LifecycleCron] WhatsApp session ${sessionId} not connected, skipping checkout_message for ${booking.customerPhone}`);
        continue;
      }

      const message = getLifecycleMessage('checkout_message', language, booking.customerName);

      const freshBooking = await Booking.findById(booking._id);
      if (freshBooking.checkoutMessageSent || freshBooking.messagesStopped || freshBooking.status === 'cancelled') {
        continue;
      }

      await sendMessage(sessionId, booking.customerPhone, message);
      await Booking.findByIdAndUpdate(booking._id, { checkoutMessageSent: true });

      await MessageLog.create({
        bookingId: booking._id,
        guestPhone: booking.customerPhone,
        messageType: 'checkout_message',
        status: 'sent',
        sentAt: new Date(),
        messageText: message
      });

      sent++;
      logger.info(`[LifecycleCron] checkout_message sent to ${booking.customerPhone}`);
    } catch (error) {
      logger.error(`[LifecycleCron] Failed to send checkout_message to ${booking.customerPhone}: ${error.message}`);
      if (!error.message.includes('not connected') && !error.message.includes('not initialized')) {
        await MessageLog.create({
          bookingId: booking._id,
          guestPhone: booking.customerPhone,
          messageType: 'checkout_message',
          status: 'failed',
          errorReason: error.message
        }).catch(() => {});
      }
    }
  }

  if (sent > 0) logger.info(`[LifecycleCron] Sent ${sent} checkout message(s)`);
}

/**
 * Process review requests (evening of check-out date, only for checked_out guests)
 * NO_SHOW bookings: mark reviewRequestSent=true WITHOUT sending, log as cancelled
 */
async function processReviewRequests() {
  const today = getISTDate();

  const bookings = await Booking.find({
    roomBookingId: { $ne: null },
    status: { $in: ['checked_out', 'no_show'] },
    reviewRequestSent: false,
    messagesStopped: false
  }).populate('roomBookingId', 'checkOutDate status');

  let sent = 0;
  for (const booking of bookings) {
    if (!booking.roomBookingId) continue;

    const checkOutDate = new Date(booking.roomBookingId.checkOutDate);
    const checkOutDay = checkOutDate.toISOString().split('T')[0];
    if (checkOutDay !== today) continue;

    // NO_SHOW: mark as sent WITHOUT sending, log as cancelled
    if (booking.status === 'no_show' || booking.roomBookingId.status === 'no_show') {
      await Booking.findByIdAndUpdate(booking._id, { reviewRequestSent: true });
      await MessageLog.create({
        bookingId: booking._id,
        guestPhone: booking.customerPhone,
        messageType: 'review_request',
        status: 'cancelled',
        errorReason: 'guest was no-show'
      }).catch(() => {});
      logger.info(`[LifecycleCron] review_request skipped (no-show) for ${booking.customerPhone}, logged as cancelled`);
      continue;
    }

    try {
      const { sessionId, language } = await getSessionAndLanguage(booking);

      const status = getSessionStatus(sessionId);
      if (status !== 'connected') {
        logger.info(`[LifecycleCron] WhatsApp session ${sessionId} not connected, skipping review_request for ${booking.customerPhone}`);
        continue;
      }

      const message = getLifecycleMessage('review_request', language, booking.customerName);

      const freshBooking = await Booking.findById(booking._id);
      if (freshBooking.reviewRequestSent || freshBooking.messagesStopped || freshBooking.status === 'cancelled') {
        continue;
      }

      await sendMessage(sessionId, booking.customerPhone, message);
      await Booking.findByIdAndUpdate(booking._id, { reviewRequestSent: true });

      await MessageLog.create({
        bookingId: booking._id,
        guestPhone: booking.customerPhone,
        messageType: 'review_request',
        status: 'sent',
        sentAt: new Date(),
        messageText: message
      });

      sent++;
      logger.info(`[LifecycleCron] review_request sent to ${booking.customerPhone}`);
    } catch (error) {
      logger.error(`[LifecycleCron] Failed to send review_request to ${booking.customerPhone}: ${error.message}`);
      if (!error.message.includes('not connected') && !error.message.includes('not initialized')) {
        await MessageLog.create({
          bookingId: booking._id,
          guestPhone: booking.customerPhone,
          messageType: 'review_request',
          status: 'failed',
          errorReason: error.message
        }).catch(() => {});
      }
    }
  }

  if (sent > 0) logger.info(`[LifecycleCron] Sent ${sent} review request(s)`);
}

/**
 * Main cron job function — runs every hour.
 * Checks IST clock to decide which message types to process:
 *   - Morning (7–11 IST): checkin_reminder + checkout_message
 *   - Evening (17–21 IST): review_request
 */
async function runLifecycleJob() {
  try {
    const istHour = getISTHour();
    logger.debug(`[LifecycleCron] Running lifecycle job, IST hour: ${istHour}`);

    // Morning window: 7 AM – 11 AM IST
    if (istHour >= 7 && istHour <= 11) {
      await processCheckinReminders();
      await processCheckoutMessages();
    }

    // Evening window: 5 PM – 9 PM IST
    if (istHour >= 17 && istHour <= 21) {
      await processReviewRequests();
    }

  } catch (error) {
    logger.error(`[LifecycleCron] Lifecycle cron job failed: ${error.message}`);
    // Don't throw — cron will continue running
  }
}

/**
 * Starts the lifecycle message cron job.
 * Runs every hour.
 */
function startLifecycleCron() {
  if (cronJob) {
    logger.warn('Lifecycle message cron already running');
    return;
  }

  cronJob = cron.schedule('0 * * * *', runLifecycleJob, {
    timezone: 'Asia/Kolkata'
  });

  logger.info('Lifecycle message cron started (runs every hour)');
}

/**
 * Stops the lifecycle message cron job.
 */
function stopLifecycleCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Lifecycle message cron stopped');
  }
}

/**
 * Manually triggers the lifecycle job (for testing).
 * Processes ALL message types regardless of time window.
 */
async function triggerLifecycleJob() {
  logger.info('Manually triggering lifecycle message job (all types)');
  await processCheckinReminders();
  await processCheckoutMessages();
  await processReviewRequests();
}

module.exports = {
  startLifecycleCron,
  stopLifecycleCron,
  triggerLifecycleJob,
  runLifecycleJob
};
