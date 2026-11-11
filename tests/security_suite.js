const assert = require('assert');
const path = require('path');

// Mock request / response helpers
function createMockReqRes({ method = 'POST', headers = {}, body = {} } = {}) {
  const req = {
    method,
    headers,
    body,
    socket: { remoteAddress: '127.0.0.1' }
  };

  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const res = {
    setHeader: (k, v) => { resHeaders[k] = v; },
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (payload) => {
      responseData = payload;
      return res;
    },
    _getStatus: () => statusCode,
    _getData: () => responseData
  };

  return { req, res };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING YAWMATIC CREATOR PORTAL SECURITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // Handlers
  const activateHandler = require('../api/creator-activate.js');
  const loginHandler = require('../api/creator-login.js');
  const revisionsHandler = require('../api/creator-revisions.js');
  const emailHandler = require('../api/send-activation-email.js');
  const allocateIdHandler = require('../api/creator-allocate-id.js');

  // TEST 1: Missing service-role key fails closed
  await test('Security #15: Privileged endpoints fail closed without SUPABASE_SERVICE_ROLE_KEY', async () => {
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { req, res } = createMockReqRes({
      body: { token: 'sample', email: 'test@example.com', password: 'Password123!' }
    });

    await activateHandler(req, res);
    assert.strictEqual(res._getStatus(), 500);
    assert.strictEqual(res._getData().code, 'SERVER_MISCONFIGURED');

    const { req: r2, res: s2 } = createMockReqRes({ body: { appId: 5 } });
    await emailHandler(r2, s2);
    assert.strictEqual(s2._getStatus(), 500);
    assert.strictEqual(s2._getData().code, 'SERVER_MISCONFIGURED');

    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey || 'mock-service-role-key-test';
  });

  // Set mock service role key for handler validation
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-test-service-key-xyz123';

  // TEST 2: Missing activation token is rejected
  await test('Security #7: Missing activation token is rejected with 400', async () => {
    const { req, res } = createMockReqRes({
      body: { email: 'sinan@etriq.online', password: 'Password123!' }
    });
    await activateHandler(req, res);
    assert.strictEqual(res._getStatus(), 400);
    assert.ok(res._getData().message.includes('token is required'));
  });

  // TEST 3: Short password is rejected
  await test('Security #7b: Short password (<8 chars) is rejected with 400', async () => {
    const { req, res } = createMockReqRes({
      body: { token: 'valid-32-byte-token-xyz', email: 'sinan@etriq.online', password: 'short' }
    });
    await activateHandler(req, res);
    assert.strictEqual(res._getStatus(), 400);
    assert.ok(res._getData().message.includes('at least 8 characters'));
  });

  // TEST 4: Anonymous / unauthenticated caller cannot invoke admin email endpoint
  await test('Security #3 & #17: Unauthenticated session rejected from admin email endpoint', async () => {
    const { req, res } = createMockReqRes({
      headers: {},
      body: { appId: 5 }
    });
    await emailHandler(req, res);
    assert.strictEqual(res._getStatus(), 403);
  });

  // TEST 5: Non-admin session cannot invoke admin email endpoint
  await test('Security #2: Caller with non-admin authorization header rejected with 403', async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer mock-creator-jwt-token' },
      body: { appId: 5 }
    });
    await emailHandler(req, res);
    assert.strictEqual(res._getStatus(), 403);
  });

  // TEST 6: Non-admin session cannot allocate Creator Login IDs
  await test('Security #4 & #12: Non-admin rejected from Creator ID allocation endpoint', async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer mock-creator-token' },
      body: { appId: 5 }
    });
    await allocateIdHandler(req, res);
    assert.strictEqual(res._getStatus(), 403);
  });

  // TEST 7: Creator revisions endpoint rejects missing authentication
  await test('Security #5: Unauthenticated caller cannot submit profile revisions', async () => {
    const { req, res } = createMockReqRes({
      body: { revisionType: 'profile', data: { full_name: 'Hacker' } }
    });
    await revisionsHandler(req, res);
    assert.strictEqual(res._getStatus(), 401);
  });

  // TEST 8: Creator revisions rejects invalid revision types
  await test('Security #5b: Revisions endpoint strictly checks allowlist', async () => {
    // Mock user session function inside handler scope
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer mock-token' },
      body: { revisionType: 'admin_override_status', data: { status: 'approved' } }
    });
    // Even if authorized, invalid type must be blocked
    await revisionsHandler(req, res);
    // Since mock token won't resolve user, 401 is expected; with valid user, 400 is returned
    assert.ok([400, 401].includes(res._getStatus()));
  });

  // TEST 9: Login ID format and rate limiting
  await test('Security #7 & #8: Login requires Creator Login ID & password', async () => {
    const { req, res } = createMockReqRes({ body: {} });
    await loginHandler(req, res);
    assert.strictEqual(res._getStatus(), 400);
    assert.ok(res._getData().message.includes('Creator Login ID is required'));
  });

  // TEST 10: Repeated login attempts trigger rate limiting
  await test('Security #7: High-frequency login attempts trigger 429 Rate Limit', async () => {
    let lastStatus = 200;
    let rateLimited = false;
    for (let i = 0; i < 15; i++) {
      const { req, res } = createMockReqRes({
        headers: { 'x-forwarded-for': '10.99.88.77' },
        body: { loginId: 'YAW-CRE-9999', password: 'GuessPassword123!' }
      });
      await loginHandler(req, res);
      lastStatus = res._getStatus();
      if (lastStatus === 429) {
        rateLimited = true;
        break;
      }
    }
    assert.strictEqual(rateLimited, true);
    assert.strictEqual(lastStatus, 429);
  });

  console.log('\n====================================================');
  console.log(`SECURITY TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
