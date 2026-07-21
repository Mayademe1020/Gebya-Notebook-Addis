#!/usr/bin/env node
/**
 * End-to-end test for admin broadcast and push endpoints.
 *
 * Usage:
 *   node scripts/test-admin-endpoints.mjs [--url http://localhost:3000]
 *
 * Requires:
 *   - API server running (local or deployed)
 *   - JWT_SECRET set in environment
 *   - At least one business with an owner in the database
 *
 * What it tests:
 *   1. Auth required (401 without token)
 *   2. Broadcast creates notifications for all shops
 *   3. Push sends to all subscribed devices
 *   4. Validation rejects missing fields (400)
 */

const API_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:3000';

const RESULTS = [];
let AUTH_TOKEN = null;

function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function pass(name, detail) { RESULTS.push({ name, pass: true, detail }); log('✅', `${name}: ${detail}`); }
function fail(name, detail) { RESULTS.push({ name, pass: false, detail }); log('❌', `${name}: ${detail}`); }

async function api(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ─── Step 1: Get auth token ─────────────────────────────────────────────
async function getAuthToken() {
  log('🔑', 'Getting auth token...');

  // Request OTP (in dev mode, OTP is returned in response)
  const otpRes = await api('POST', '/api/auth/otp', { phone_number: '+251911000999' });
  if (otpRes.status !== 200) {
    fail('Auth OTP', `Status ${otpRes.status}: ${otpRes.text}`);
    return false;
  }

  const otp = otpRes.json?.otp;
  if (!otp) {
    fail('Auth OTP', 'No OTP returned (not in dev mode?)');
    return false;
  }

  // Verify OTP
  const verifyRes = await api('POST', '/api/auth/verify', { phone_number: '+251911000999', otp });
  if (verifyRes.status !== 200) {
    fail('Auth Verify', `Status ${verifyRes.status}: ${verifyRes.text}`);
    return false;
  }

  AUTH_TOKEN = verifyRes.json?.token;
  if (!AUTH_TOKEN) {
    fail('Auth Verify', 'No token returned');
    return false;
  }

  pass('Auth', `Got token for ${verifyRes.json?.user?.phone_number}`);
  return true;
}

// ─── Step 2: Test auth required ─────────────────────────────────────────
async function testAuthRequired() {
  log('🔒', 'Testing auth required...');

  const res = await api('POST', '/api/admin/broadcast', { title: 'Test', body: 'Test' });
  if (res.status === 401) {
    pass('Auth Required', 'Returns 401 without token');
  } else {
    fail('Auth Required', `Expected 401, got ${res.status}`);
  }
}

// ─── Step 3: Test broadcast validation ──────────────────────────────────
async function testBroadcastValidation() {
  log('📝', 'Testing broadcast validation...');

  // Missing title
  const res1 = await api('POST', '/api/admin/broadcast', { body: 'Test body' }, AUTH_TOKEN);
  if (res1.status === 400) {
    pass('Broadcast Validation (no title)', 'Returns 400');
  } else {
    fail('Broadcast Validation (no title)', `Expected 400, got ${res1.status}`);
  }

  // Missing body
  const res2 = await api('POST', '/api/admin/broadcast', { title: 'Test title' }, AUTH_TOKEN);
  if (res2.status === 400) {
    pass('Broadcast Validation (no body)', 'Returns 400');
  } else {
    fail('Broadcast Validation (no body)', `Expected 400, got ${res2.status}`);
  }
}

// ─── Step 4: Test broadcast success ─────────────────────────────────────
async function testBroadcast() {
  log('📢', 'Testing broadcast...');

  const res = await api('POST', '/api/admin/broadcast', {
    title: `Test Broadcast ${Date.now()}`,
    body: 'This is a test broadcast from the admin dashboard.',
    type: 'announcement',
  }, AUTH_TOKEN);

  if (res.status === 200 && res.json?.ok) {
    pass('Broadcast', `Sent to ${res.json.sent}/${res.json.total} shops`);
  } else {
    fail('Broadcast', `Status ${res.status}: ${res.text}`);
  }
}

// ─── Step 5: Test push validation ───────────────────────────────────────
async function testPushValidation() {
  log('📝', 'Testing push validation...');

  const res = await api('POST', '/api/admin/push-all', { title: 'Test' }, AUTH_TOKEN);
  if (res.status === 400) {
    pass('Push Validation (no body)', 'Returns 400');
  } else {
    fail('Push Validation (no body)', `Expected 400, got ${res.status}`);
  }
}

// ─── Step 6: Test push success ──────────────────────────────────────────
async function testPush() {
  log('🔔', 'Testing push notification...');

  const res = await api('POST', '/api/admin/push-all', {
    title: `Test Push ${Date.now()}`,
    body: 'This is a test push notification.',
  }, AUTH_TOKEN);

  if (res.status === 200 && res.json?.ok) {
    pass('Push', `Sent: ${res.json.sent}, Failed: ${res.json.failed}, Businesses: ${res.json.businesses}`);
  } else {
    fail('Push', `Status ${res.status}: ${res.text}`);
  }
}

// ─── Step 7: Test overview endpoint ─────────────────────────────────────
async function testOverview() {
  log('📊', 'Testing overview endpoint...');

  const res = await api('GET', '/api/admin/overview', null, AUTH_TOKEN);
  if (res.status === 200 && res.json?.ok) {
    const d = res.json;
    pass('Overview', `Shops: ${d.platformNumbers?.shops}, Users: ${d.platformNumbers?.users}, Txns: ${d.platformNumbers?.transactions}`);
  } else {
    fail('Overview', `Status ${res.status}: ${res.text}`);
  }
}

// ─── Step 8: Test shops endpoint ────────────────────────────────────────
async function testShops() {
  log('🏪', 'Testing shops endpoint...');

  const res = await api('GET', '/api/admin/shops', null, AUTH_TOKEN);
  if (res.status === 200 && res.json?.ok) {
    pass('Shops', `${res.json.shops?.length || 0} shops returned`);
  } else {
    fail('Shops', `Status ${res.status}: ${res.text}`);
  }
}

// ─── Step 9: Test features endpoint ─────────────────────────────────────
async function testFeatures() {
  log('⚙️', 'Testing features endpoint...');

  const res = await api('GET', '/api/admin/features', null, AUTH_TOKEN);
  if (res.status === 200 && res.json?.ok) {
    pass('Features', `Credit: ${res.json.features?.shopsUsingCredit}, Suppliers: ${res.json.features?.shopsUsingSuppliers}, Telegram: ${res.json.features?.shopsUsingTelegram}`);
  } else {
    fail('Features', `Status ${res.status}: ${res.text}`);
  }
}

// ─── Step 10: Test export endpoint ──────────────────────────────────────
async function testExport() {
  log('📥', 'Testing export endpoint...');

  const res = await api('GET', '/api/admin/export-shops', null, AUTH_TOKEN);
  if (res.status === 200 && res.text?.includes('Shop Name')) {
    const lines = res.text.split('\n').length;
    pass('Export', `CSV returned with ${lines} rows (including header)`);
  } else {
    fail('Export', `Status ${res.status}`);
  }
}

// ─── Run all tests ──────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 Admin Endpoint Tests — ${API_URL}\n${'─'.repeat(50)}`);

  const authOk = await getAuthToken();
  if (!authOk) {
    console.log('\n⚠️  Could not get auth token. Skipping authenticated tests.\n');
    // Still test unauthenticated access
    await testAuthRequired();
  } else {
    await testAuthRequired();
    await testBroadcastValidation();
    await testBroadcast();
    await testPushValidation();
    await testPush();
    await testOverview();
    await testShops();
    await testFeatures();
    await testExport();
  }

  // Summary
  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.filter(r => !r.pass).length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${RESULTS.length} total`);
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    RESULTS.filter(r => !r.pass).forEach(r => console.log(`   - ${r.name}: ${r.detail}`));
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
