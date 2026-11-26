/**
 * P0 Security Remediation Test Suite (In-Memory / Isolated, Zero Live DB)
 *
 * Tests all Sprint 1 P0 security fixes:
 * 1. Auth backdoor removal (authRoutes.js & settingsRoutes.js)
 * 2. Hardcoded env/JWT fallback removal (config/env.js)
 * 3. API access control & RBAC (unauthenticated, staff, admin, super_admin)
 * 4. Invalid, expired, terminated-session, and inactive-user JWT rejection
 * 5. Settings key allowlist & authorization
 * 6. Fast2SMS webhook authentication (POST & GET challenge)
 * 7. Socket.IO authentication & unauthorized connection rejection
 * 8. pmsBookingRoutes.js runtime ReferenceError fixes
 *
 * Run: NODE_ENV=test node tests/p0SecurityRemediation.test.js
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-ephemeral-secret-for-p0-suite';
process.env.FAST2SMS_WEBHOOK_SECRET = 'test-webhook-secret-xyz';

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
let ioClient;
try {
  ({ io: ioClient } = require('socket.io-client'));
} catch (_) {
  ({ io: ioClient } = require(path.join(__dirname, '../../frontend/node_modules/socket.io-client')));
}

const { jwtSecret } = require('../src/config/env');
const models = require('../src/models');
const fast2smsService = require('../src/services/fast2smsService');
const channelManager = require('../src/services/channelManager');
const availabilityService = require('../src/services/availabilityService');
const settingsService = require('../src/services/settingsService');

// ── In-memory stubs for Mongoose models & services ──────────────────────────
const usersById = new Map([
  ['staff_1', { _id: 'staff_1', name: 'Staff User', email: 'staff@nandibaag.com', role: 'staff', isActive: true }],
  ['admin_1', { _id: 'admin_1', name: 'Admin User', email: 'admin@nandibaag.com', role: 'admin', isActive: true }],
  ['super_1', { _id: 'super_1', name: 'Super Admin', email: 'super@nandibaag.com', role: 'super_admin', isActive: true }],
  ['inactive_1', { _id: 'inactive_1', name: 'Inactive', email: 'inactive@nandibaag.com', role: 'staff', isActive: false }]
]);

const sessionsByJti = new Map([
  ['jti_active', { _id: 'sess_1', jti: 'jti_active', isActive: true }],
  ['jti_terminated', { _id: 'sess_2', jti: 'jti_terminated', isActive: false }]
]);

// Stub User.findById / findOne
models.User.findById = (id) => {
  const user = usersById.get(String(id)) || null;
  const doc = user
    ? {
        ...user,
        comparePassword: async (pw) => pw === 'RealStrongPass!2026'
      }
    : null;
  return {
    select: () => ({
      lean: async () => user
    }),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject)
  };
};

let adminPasswordSaved = false;
models.User.findOne = async ({ email }) => {
  if (email === 'admin@nandibaag.com') {
    return {
      _id: 'admin_1',
      name: 'Admin User',
      email: 'admin@nandibaag.com',
      role: 'admin',
      isActive: true,
      password: 'hashed_real_password',
      comparePassword: async (pw) => pw === 'RealStrongPass!2026',
      save: async () => {
        adminPasswordSaved = true;
      }
    };
  }
  return null;
};

models.Session.findOne = ({ jti }) => {
  const sess = sessionsByJti.get(jti) || null;
  return {
    lean: async () => sess,
    then: (resolve, reject) => Promise.resolve(sess).then(resolve, reject)
  };
};
models.Session.updateOne = async () => ({ acknowledged: true });

// Stub read models used by guarded routes
models.Booking.find = () => ({
  sort: () => ({
    populate: () => ({ lean: async () => [] }),
    limit: () => ({ lean: async () => [] }),
    lean: async () => []
  })
});
models.Booking.countDocuments = async () => 0;
models.Chat.countDocuments = async () => 0;
models.Chat.find = () => ({
  select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }),
  distinct: async () => []
});
models.Lead.countDocuments = async () => 0;
models.Lead.find = () => ({
  select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })
});
models.Room.find = () => ({
  populate: () => ({ lean: async () => [] }),
  lean: async () => []
});
models.Room.findById = async () => null;
models.Settings.findOne = async () => ({ whatsappNumbers: [], globalMode: 'ai' });
models.Staff.find = () => ({ sort: () => ({ lean: async () => [] }) });
models.Series.find = () => ({ sort: () => ({ lean: async () => [] }) });

availabilityService.getCapacityAvailability = async () => ({
  availableCount: 5,
  available: true,
  breakdown: {}
});
availabilityService.getDetailedAvailability = async () => [];
settingsService.updateDefaultModeOnly = async (val) => ({ defaultModeForNewChats: val });
settingsService.massUpdateAllChatMode = async () => ({ modified: 0 });

let webhookRoutedCount = 0;
channelManager.routeIncomingMessage = async () => {
  webhookRoutedCount++;
};
fast2smsService.webhookSecret = 'test-webhook-secret-xyz';

// Stub Booking constructor & findByIdAndDelete for pmsBookingRoutes catch-block test
const OrigBooking = models.Booking;
OrigBooking.prototype.save = async function () {
  throw new Error('Simulated DB save failure');
};
OrigBooking.findByIdAndDelete = async () => null;

// Stub availabilityService BEFORE requiring availabilityRoutes (which destructures it at load time)
availabilityService.getCapacityAvailability = async () => ({
  availableCount: 5,
  available: true,
  breakdown: {}
});
availabilityService.getDetailedAvailability = async () => [];
settingsService.updateDefaultModeOnly = async (val) => ({ defaultModeForNewChats: val });
settingsService.massUpdateAllChatMode = async () => ({ modified: 0 });

// ── Build test Express app with real routes & middleware ────────────────────
const { verifyToken, requireAdmin } = require('../src/middleware/auth');
const errorHandler = require('../src/middleware/errorHandler');
const authRoutes = require('../src/routes/authRoutes');
const bookingRoutes = require('../src/routes/bookingRoutes');
const dashboardRoutes = require('../src/routes/dashboardRoutes');
const maintenanceRoutes = require('../src/routes/maintenanceRoutes');
const reservationRoutes = require('../src/routes/reservationRoutes');
const roomRoutes = require('../src/routes/roomRoutes');
const staffRoutes = require('../src/routes/staffRoutes');
const settingsRoutes = require('../src/routes/settingsRoutes');
const whatsappRoutes = require('../src/routes/whatsappRoutes');
const numberRoutes = require('../src/routes/numberRoutes');
const inventoryRoutes = require('../src/routes/inventoryRoutes');
const availabilityRoutes = require('../src/routes/availabilityRoutes');
const fast2smsRoutes = require('../src/routes/fast2smsRoutes');
const pmsBookingRoutes = require('../src/routes/pmsBookingRoutes');
const teamSecurityRoutes = require('../src/routes/teamSecurityRoutes');
const { initializeSocket } = require('../src/sockets');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/pms/maintenance', maintenanceRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/fast2sms', fast2smsRoutes);
app.use('/api/pms', pmsBookingRoutes);
app.use('/api/team', teamSecurityRoutes);
app.use(errorHandler);

function makeToken(userId, jti = 'jti_active', expiresIn = '1h') {
  const user = usersById.get(userId);
  return jwt.sign(
    { id: userId, email: user?.email || 'x@test.com', role: user?.role || 'staff', jti },
    jwtSecret,
    { expiresIn }
  );
}

async function reqJson(baseUrl, method, path, { token, headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { status: res.status, text, json };
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
  }
}

async function run() {
  const server = http.createServer(app);
  initializeSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const staffToken = makeToken('staff_1');
  const adminToken = makeToken('admin_1');
  const superToken = makeToken('super_1');
  const inactiveToken = makeToken('inactive_1');
  const terminatedToken = makeToken('staff_1', 'jti_terminated');
  const expiredToken = jwt.sign({ id: 'staff_1', role: 'staff' }, jwtSecret, { expiresIn: '-10s' });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🔒 P0 SECURITY REMEDIATION TEST SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');

  // 1. Unauthenticated access blocked
  for (const [method, path] of [
    ['GET', '/api/bookings'],
    ['POST', '/api/bookings/manual-booking'],
    ['GET', '/api/dashboard/last-2-days-stats'],
    ['GET', '/api/rooms'],
    ['POST', '/api/reservations'],
    ['GET', '/api/maintenance'],
    ['GET', '/pms/maintenance'],
    ['GET', '/api/staff'],
    ['PATCH', '/api/settings/globalMode'],
    ['GET', '/api/whatsapp/restart-baileys'],
    ['DELETE', '/api/numbers/s1'],
    ['POST', '/api/inventory/series'],
    ['GET', '/api/team/users'],
    ['GET', '/api/fast2sms/status']
  ]) {
    await test(`Unauthenticated ${method} ${path} -> 401`, async () => {
      const r = await reqJson(baseUrl, method, path);
      assert.strictEqual(r.status, 401);
    });
  }

  // 2. Public availability widget route still works
  await test('Public GET /api/availability/public remains accessible (200)', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/availability/public?checkInDate=2026-12-01&checkOutDate=2026-12-02');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
  });

  // 3. Invalid, expired, terminated, inactive tokens
  await test('Invalid JWT -> 401', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/bookings', { token: 'invalid.jwt.token' });
    assert.strictEqual(r.status, 401);
  });

  await test('Expired JWT -> 401 Token expired', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/bookings', { token: expiredToken });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.message, 'Token expired');
  });

  await test('Terminated session JWT -> 401 SESSION_TERMINATED', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/bookings', { token: terminatedToken });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.code, 'SESSION_TERMINATED');
  });

  await test('Inactive user JWT -> 401', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/bookings', { token: inactiveToken });
    assert.strictEqual(r.status, 401);
  });

  // 4. Staff allowed on operational read, booking, inventory, & WhatsApp routes; blocked on Team/Security routes
  await test('Staff GET /api/bookings -> 200', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/bookings', { token: staffToken });
    assert.strictEqual(r.status, 200);
  });

  await test('Staff GET /api/rooms -> 200', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/rooms', { token: staffToken });
    assert.strictEqual(r.status, 200);
  });

  // Operational Inventory & WhatsApp routes must NOT return 403 for staff
  for (const [method, path, body] of [
    ['POST', '/api/inventory/series', {}],
    ['PATCH', '/api/inventory/rooms/invalid-id', { capacity: 4 }],
    ['PATCH', '/api/inventory/rooms/invalid-id/status', { status: 'maintenance' }],
    ['POST', '/api/whatsapp/sessions', {}],
    ['DELETE', '/api/whatsapp/s1', undefined],
    ['DELETE', '/api/numbers/s1', undefined],
    ['GET', '/api/whatsapp/restart-baileys', undefined],
    ['DELETE', '/api/pms/bookings/invalid-id', undefined]
  ]) {
    await test(`Staff operational ${method} ${path} is NOT blocked by RBAC (!== 401/403)`, async () => {
      const r = await reqJson(baseUrl, method, path, { token: staffToken, body });
      assert.notStrictEqual(r.status, 401);
      assert.notStrictEqual(r.status, 403);
    });
  }

  // Team Management & Security-Sensitive routes MUST remain 403 for staff
  for (const [method, path, body] of [
    ['GET', '/api/team/users', undefined],
    ['POST', '/api/team/users', { name: 'X' }],
    ['POST', '/api/staff', { name: 'New Staff' }],
    ['PATCH', '/api/settings/globalMode', { value: 'staff' }],
    ['POST', '/api/settings/switch-all-chats', { mode: 'staff' }],
    ['GET', '/api/fast2sms/status', undefined]
  ]) {
    await test(`Staff ${method} ${path} -> 403 Admin/SuperAdmin required`, async () => {
      const r = await reqJson(baseUrl, method, path, { token: staffToken, body });
      assert.strictEqual(r.status, 403);
    });
  }

  await test('Admin GET /api/team/users -> 403 SuperAdmin required', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/team/users', { token: adminToken });
    assert.strictEqual(r.status, 403);
  });

  await test('Super-Admin GET /api/team/users -> 200', async () => {
    models.User.find = () => ({ select: () => ({ sort: async () => [] }) });
    const r = await reqJson(baseUrl, 'GET', '/api/team/users', { token: superToken });
    assert.strictEqual(r.status, 200);
  });

  // 5. Admin & Super-Admin allowed on admin routes + settings key allowlist
  await test('Admin PATCH /api/settings/defaultModeForNewChats -> 200', async () => {
    const r = await reqJson(baseUrl, 'PATCH', '/api/settings/defaultModeForNewChats', {
      token: adminToken,
      body: { value: 'staff' }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
  });

  await test('Super-Admin GET /api/fast2sms/status -> 200', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/fast2sms/status', { token: superToken });
    assert.strictEqual(r.status, 200);
  });

  await test('Admin PATCH /api/settings/whatsappNumbers (disallowed key) -> 400', async () => {
    const r = await reqJson(baseUrl, 'PATCH', '/api/settings/whatsappNumbers', {
      token: adminToken,
      body: { value: [] }
    });
    assert.strictEqual(r.status, 400);
  });

  await test('requireAdmin with missing req.user returns 403 cleanly', async () => {
    let statusCode = null;
    const mockRes = {
      status(code) { statusCode = code; return this; },
      json() { return this; }
    };
    requireAdmin({}, mockRes, () => {});
    assert.strictEqual(statusCode, 403);
  });

  // 6. Password backdoor rejection
  await test('Login rejects hardcoded admin12345/admin123 backdoor without mutating password', async () => {
    adminPasswordSaved = false;
    const r1 = await reqJson(baseUrl, 'POST', '/api/auth/login', {
      body: { email: 'admin@nandibaag.com', password: 'admin12345' }
    });
    const r2 = await reqJson(baseUrl, 'POST', '/api/auth/login', {
      body: { email: 'admin@nandibaag.com', password: 'admin123' }
    });
    assert.strictEqual(r1.status, 401);
    assert.strictEqual(r2.status, 401);
    assert.strictEqual(adminPasswordSaved, false);
  });

  await test('POST /api/settings/switch-all-chats rejects hardcoded admin12345', async () => {
    const r = await reqJson(baseUrl, 'POST', '/api/settings/switch-all-chats', {
      token: adminToken,
      body: { mode: 'staff', confirmPassword: 'admin12345' }
    });
    assert.strictEqual(r.status, 401);
  });

  // 7. Fast2SMS webhook auth
  await test('POST /api/fast2sms/webhook without secret -> 401 & does not route message', async () => {
    webhookRoutedCount = 0;
    const r = await reqJson(baseUrl, 'POST', '/api/fast2sms/webhook', {
      body: { from: '919876543210', text: 'Hello' }
    });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(webhookRoutedCount, 0);
  });

  await test('POST /api/fast2sms/webhook with valid x-webhook-secret -> 200 & routes message', async () => {
    webhookRoutedCount = 0;
    const r = await reqJson(baseUrl, 'POST', '/api/fast2sms/webhook', {
      headers: { 'x-webhook-secret': 'test-webhook-secret-xyz' },
      body: { from: '919876543210', text: 'Couple package price?' }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(webhookRoutedCount, 1);
  });

  await test('GET /api/fast2sms/webhook rejects invalid hub.verify_token (403)', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/fast2sms/webhook?hub.challenge=ch_123&hub.verify_token=wrong');
    assert.strictEqual(r.status, 403);
  });

  await test('GET /api/fast2sms/webhook accepts valid hub.verify_token (200 text/plain)', async () => {
    const r = await reqJson(baseUrl, 'GET', '/api/fast2sms/webhook?hub.challenge=ch_123&hub.verify_token=test-webhook-secret-xyz');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.text, 'ch_123');
  });

  // 8. Socket.IO authentication
  await test('Socket.IO rejects unauthenticated connection', async () => {
    await new Promise((resolve, reject) => {
      const client = ioClient(baseUrl, { transports: ['websocket'], reconnection: false });
      client.on('connect', () => {
        client.close();
        reject(new Error('Unauthenticated socket should not connect'));
      });
      client.on('connect_error', (err) => {
        client.close();
        assert.ok(err.message.includes('Authentication required'));
        resolve();
      });
    });
  });

  await test('Socket.IO rejects invalid JWT', async () => {
    await new Promise((resolve, reject) => {
      const client = ioClient(baseUrl, {
        auth: { token: 'bad.token.value' },
        transports: ['websocket'],
        reconnection: false
      });
      client.on('connect', () => {
        client.close();
        reject(new Error('Invalid JWT socket should not connect'));
      });
      client.on('connect_error', () => {
        client.close();
        resolve();
      });
    });
  });

  await test('Socket.IO accepts valid authenticated staff JWT', async () => {
    await new Promise((resolve, reject) => {
      const client = ioClient(baseUrl, {
        auth: { token: staffToken },
        transports: ['websocket'],
        reconnection: false
      });
      client.on('connect', () => {
        client.close();
        resolve();
      });
      client.on('connect_error', (err) => {
        client.close();
        reject(new Error(`Valid socket rejected: ${err.message}`));
      });
    });
  });

  // 9. pmsBookingRoutes runtime ReferenceError fix
  await test('POST /api/pms/bookings/manual error path does not throw ReferenceError', async () => {
    const r = await reqJson(baseUrl, 'POST', '/api/pms/bookings/manual', {
      token: staffToken,
      body: {
        guestName: 'Test Guest',
        guestPhone: '9876543210',
        bookingType: 'couple',
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-02',
        adults: 2,
        totalAmount: 5500,
        acknowledgeZeroAdvance: true
      }
    });
    assert.strictEqual(r.status, 500);
    assert.ok(!String(r.json?.message || '').includes('is not defined'));
  });

  server.close();
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`P0 SECURITY SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
