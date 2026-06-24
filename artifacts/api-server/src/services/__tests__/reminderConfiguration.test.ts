/**
 * Unit tests for ReminderConfigurationService
 * 
 * Tests cover:
 * - Shop default creation and retrieval
 * - Customer override creation and retrieval
 * - Fallback to shop default when no override
 * - Input validation
 * - Error handling
 * - State clearing between tests
 */

import {
  getShopDefault,
  setShopDefault,
  getCustomerFrequency,
  setCustomerFrequency,
  isRemindersEnabled,
  clearCustomerOverride,
  clearAllConfigs,
  getStorageStatus,
} from '../reminderConfiguration.js';

import type { ReminderFrequency } from '../../types/reminders.js';

// ─── test utilities ───────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✓ ${name}`);
  } catch (error) {
    const duration = Date.now() - start;
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
    });
    console.error(`✗ ${name}\n  ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertEqual<T>(actual: T, expected: T, message: string): Promise<void> {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

async function assertThrows(fn: () => Promise<any> | any, message: string): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected to throw: ${message}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Expected to throw')) {
      throw error;
    }
    // Expected path: function threw
  }
}

async function beforeEach(): Promise<void> {
  clearAllConfigs();
}

// ─── test suite ───────────────────────────────────────────────────────

async function runAllTests(): Promise<void> {
  console.log('\n=== Reminder Configuration Service Tests ===\n');

  // Test 1: getShopDefault returns 'daily' for new shop
  await test('getShopDefault returns "daily" for new shop', async () => {
    await beforeEach();
    const result = await getShopDefault(1);
    await assertEqual(result, 'daily', 'Shop default should be "daily"');
  });

  // Test 2: setShopDefault persists and is retrievable
  await test('setShopDefault persists and is retrievable', async () => {
    await beforeEach();
    await setShopDefault(2, 'weekly');
    const result = await getShopDefault(2);
    await assertEqual(result, 'weekly', 'Shop default should be "weekly" after setting');
  });

  // Test 3: setShopDefault can update existing value
  await test('setShopDefault can update existing value', async () => {
    await beforeEach();
    await setShopDefault(3, 'daily');
    await assertEqual(await getShopDefault(3), 'daily', 'Initial value');
    await setShopDefault(3, 'weekly');
    await assertEqual(await getShopDefault(3), 'weekly', 'Updated value');
  });

  // Test 4: getCustomerFrequency falls back to shop default when no override
  await test('getCustomerFrequency falls back to shop default when no override', async () => {
    await beforeEach();
    await setShopDefault(4, 'weekly');
    const result = await getCustomerFrequency(4, 100);
    await assertEqual(result, 'weekly', 'Customer should get shop default');
  });

  // Test 5: setCustomerFrequency creates override
  await test('setCustomerFrequency creates override', async () => {
    await beforeEach();
    await setShopDefault(5, 'daily');
    await setCustomerFrequency(5, 200, 'disabled');
    const result = await getCustomerFrequency(5, 200);
    await assertEqual(result, 'disabled', 'Customer override should be "disabled"');
  });

  // Test 6: setCustomerFrequency takes precedence over shop default
  await test('setCustomerFrequency takes precedence over shop default', async () => {
    await beforeEach();
    await setShopDefault(6, 'daily');
    await setCustomerFrequency(6, 300, 'weekly');
    const shopDefault = await getShopDefault(6);
    const customerFreq = await getCustomerFrequency(6, 300);
    await assertEqual(shopDefault, 'daily', 'Shop default should be "daily"');
    await assertEqual(customerFreq, 'weekly', 'Customer override should be "weekly"');
  });

  // Test 7: clearCustomerOverride deletes override and reverts to shop default
  await test('clearCustomerOverride deletes override and reverts to shop default', async () => {
    await beforeEach();
    await setShopDefault(7, 'daily');
    await setCustomerFrequency(7, 400, 'disabled');
    await assertEqual(await getCustomerFrequency(7, 400), 'disabled', 'Override set');
    await clearCustomerOverride(7, 400);
    const result = await getCustomerFrequency(7, 400);
    await assertEqual(result, 'daily', 'Should revert to shop default');
  });

  // Test 8: isRemindersEnabled returns true for 'daily'
  await test('isRemindersEnabled returns true for "daily"', async () => {
    await beforeEach();
    await setShopDefault(8, 'daily');
    const result = await isRemindersEnabled(8, 500);
    await assertEqual(result, true, 'Reminders should be enabled for "daily"');
  });

  // Test 9: isRemindersEnabled returns true for 'weekly'
  await test('isRemindersEnabled returns true for "weekly"', async () => {
    await beforeEach();
    await setShopDefault(9, 'weekly');
    const result = await isRemindersEnabled(9, 600);
    await assertEqual(result, true, 'Reminders should be enabled for "weekly"');
  });

  // Test 10: isRemindersEnabled returns false for 'disabled'
  await test('isRemindersEnabled returns false for "disabled"', async () => {
    await beforeEach();
    await setCustomerFrequency(10, 700, 'disabled');
    const result = await isRemindersEnabled(10, 700);
    await assertEqual(result, false, 'Reminders should be disabled for "disabled"');
  });

  // Test 11: Input validation rejects invalid frequency (setShopDefault)
  await test('Input validation rejects invalid frequency (setShopDefault)', async () => {
    await beforeEach();
    await assertThrows(
      () => setShopDefault(11, 'invalid' as ReminderFrequency),
      'Should reject invalid frequency'
    );
  });

  // Test 12: Input validation rejects invalid frequency (setCustomerFrequency)
  await test('Input validation rejects invalid frequency (setCustomerFrequency)', async () => {
    await beforeEach();
    await assertThrows(
      () => setCustomerFrequency(12, 800, 'invalid' as ReminderFrequency),
      'Should reject invalid frequency'
    );
  });

  // Test 13: Input validation rejects invalid shopId (non-positive)
  await test('Input validation rejects invalid shopId (non-positive)', async () => {
    await beforeEach();
    await assertThrows(
      () => getShopDefault(0),
      'Should reject shopId <= 0'
    );
  });

  // Test 14: Input validation rejects invalid shopId (non-integer)
  await test('Input validation rejects invalid shopId (non-integer)', async () => {
    await beforeEach();
    await assertThrows(
      () => getShopDefault(14.5 as unknown as number),
      'Should reject non-integer shopId'
    );
  });

  // Test 15: Input validation rejects invalid customerId
  await test('Input validation rejects invalid customerId', async () => {
    await beforeEach();
    await assertThrows(
      () => getCustomerFrequency(15, -1),
      'Should reject negative customerId'
    );
  });

  // Test 16: Multiple shops have independent settings
  await test('Multiple shops have independent settings', async () => {
    await beforeEach();
    await setShopDefault(16, 'daily');
    await setShopDefault(17, 'weekly');
    const shop16 = await getShopDefault(16);
    const shop17 = await getShopDefault(17);
    await assertEqual(shop16, 'daily', 'Shop 16 should be "daily"');
    await assertEqual(shop17, 'weekly', 'Shop 17 should be "weekly"');
  });

  // Test 17: Multiple customers in same shop can have different overrides
  await test('Multiple customers in same shop can have different overrides', async () => {
    await beforeEach();
    await setShopDefault(18, 'daily');
    await setCustomerFrequency(18, 900, 'weekly');
    await setCustomerFrequency(18, 901, 'disabled');
    const cust900 = await getCustomerFrequency(18, 900);
    const cust901 = await getCustomerFrequency(18, 901);
    await assertEqual(cust900, 'weekly', 'Customer 900 should be "weekly"');
    await assertEqual(cust901, 'disabled', 'Customer 901 should be "disabled"');
  });

  // Test 18: Storage status reflects in-memory backend
  await test('Storage status reflects in-memory backend', async () => {
    await beforeEach();
    const status = getStorageStatus();
    // Note: this test reflects the in-memory backend used in tests
    // KV backend would report 'kv' if env vars were set
    if (status.backend !== 'memory') {
      throw new Error(`Expected backend "memory", got "${status.backend}"`);
    }
  });

  // ─── summary ──────────────────────────────────────────────────────

  console.log('\n=== Test Summary ===');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${results.length}`);
  console.log(`Duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log('\n=== Failed Tests ===');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`\n${r.name}`);
      console.log(`  ${r.error}`);
    });
    process.exit(1);
  }
}

// ─── run tests ─────────────────────────────────────────────────────────

runAllTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
