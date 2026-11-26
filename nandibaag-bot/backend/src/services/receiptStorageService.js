/**
 * Secure Receipt / Payment Screenshot Storage Boundary
 *
 * Enforces:
 * - Strict MIME allowlist (JPEG, PNG, WEBP, PDF)
 * - Magic-byte content signature validation
 * - 5 MB file size limit
 * - Private object storage via configured environment credentials
 * - Never stores raw Base64 blobs in MongoDB Booking documents
 */

const crypto = require('crypto');

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

class StorageValidationError extends Error {
  constructor(message, code = 'INVALID_SCREENSHOT_UPLOAD') {
    super(message);
    this.name = 'StorageValidationError';
    this.code = code;
    this.statusCode = 400;
  }
}

class StorageNotConfiguredError extends Error {
  constructor(message = 'Private cloud object storage is not configured. Set RECEIPT_STORAGE_PROVIDER, RECEIPT_STORAGE_BUCKET, RECEIPT_STORAGE_ACCESS_KEY, and RECEIPT_STORAGE_SECRET_KEY.') {
    super(message);
    this.name = 'StorageNotConfiguredError';
    this.code = 'STORAGE_NOT_CONFIGURED';
    this.statusCode = 503;
  }
}

function getStorageConfig() {
  const provider = (process.env.RECEIPT_STORAGE_PROVIDER || '').trim().toLowerCase();
  const bucket = (process.env.RECEIPT_STORAGE_BUCKET || '').trim();
  const endpoint = (process.env.RECEIPT_STORAGE_ENDPOINT || '').trim();
  const accessKey = (process.env.RECEIPT_STORAGE_ACCESS_KEY || '').trim();
  const secretKey = (process.env.RECEIPT_STORAGE_SECRET_KEY || '').trim();
  const region = (process.env.RECEIPT_STORAGE_REGION || 'ap-south-1').trim();

  const isConfigured = Boolean(provider && bucket && accessKey && secretKey);
  return { provider, bucket, endpoint, accessKey, secretKey, region, isConfigured };
}

function verifyMagicBytes(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }
  return false;
}

function validateScreenshotPayload({ buffer, mimeType, originalName }) {
  if (!mimeType || !ALLOWED_MIME_TYPES.has(String(mimeType).toLowerCase())) {
    throw new StorageValidationError('Unsupported file type. Allowed: JPEG, PNG, WEBP, PDF', 'UNSUPPORTED_FILE_TYPE');
  }
  const normalizedMime = String(mimeType).toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new StorageValidationError('Uploaded file is empty', 'EMPTY_FILE');
  }
  if (buffer.length > MAX_SCREENSHOT_BYTES) {
    throw new StorageValidationError('File exceeds 5 MB size limit', 'FILE_TOO_LARGE');
  }
  if (!verifyMagicBytes(buffer, normalizedMime)) {
    throw new StorageValidationError('File content does not match declared file type', 'INVALID_FILE_CONTENT');
  }
  const ext = normalizedMime === 'application/pdf' ? 'pdf' : normalizedMime.split('/')[1];
  const safeKey = `receipts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  return { safeKey, normalizedMime, size: buffer.length, originalName: String(originalName || '').slice(0, 120) };
}

/**
 * Validates and uploads a payment screenshot to private cloud object storage.
 * Accepts an optional custom adapter for isolated testing or configured S3/R2 client.
 */
async function uploadPaymentScreenshot({ buffer, mimeType, originalName }, adapter = null) {
  const validated = validateScreenshotPayload({ buffer, mimeType, originalName });
  const config = getStorageConfig();

  if (adapter && typeof adapter.putObject === 'function') {
    await adapter.putObject({
      key: validated.safeKey,
      body: buffer,
      contentType: validated.normalizedMime,
      acl: 'private'
    });
    return {
      screenshotRef: validated.safeKey,
      mimeType: validated.normalizedMime,
      size: validated.size,
      privateAccess: true
    };
  }

  if (!config.isConfigured) {
    throw new StorageNotConfiguredError();
  }

  throw new StorageNotConfiguredError(
    `Storage provider '${config.provider}' configured without an active SDK adapter; install @aws-sdk/client-s3 and wire putObject in receiptStorageService.js.`
  );
}

/**
 * Generates an authenticated/signed access reference for a private receipt key.
 */
async function getSignedScreenshotAccess(screenshotRef, adapter = null) {
  if (!screenshotRef || typeof screenshotRef !== 'string' || screenshotRef.startsWith('data:')) {
    throw new StorageValidationError('Invalid screenshot reference', 'INVALID_SCREENSHOT_REF');
  }
  if (adapter && typeof adapter.getSignedUrl === 'function') {
    const url = await adapter.getSignedUrl(screenshotRef, { expiresInSeconds: 300 });
    return { screenshotRef, url, expiresInSeconds: 300 };
  }
  const config = getStorageConfig();
  if (!config.isConfigured) {
    throw new StorageNotConfiguredError();
  }
  throw new StorageNotConfiguredError('Signed URL adapter not initialized');
}

module.exports = {
  MAX_SCREENSHOT_BYTES,
  ALLOWED_MIME_TYPES,
  StorageValidationError,
  StorageNotConfiguredError,
  getStorageConfig,
  validateScreenshotPayload,
  uploadPaymentScreenshot,
  getSignedScreenshotAccess
};
