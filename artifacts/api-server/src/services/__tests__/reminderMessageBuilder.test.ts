/**
 * Unit tests for ReminderMessageBuilder service
 * 
 * Tests all message formatting functions with various inputs,
 * edge cases, and both Amharic and English languages.
 */

import {
  buildReminderMessage,
  formatCurrency,
  formatDate,
  formatDayCount,
} from "../reminderMessageBuilder.js";

// Simple test assertion helpers
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertContains(value: string, expected: string, message?: string) {
  if (!value.includes(expected)) {
    throw new Error(`Expected to contain "${expected}". ${message || ""}`);
  }
}

function assertNotContains(value: string, expected: string, message?: string) {
  if (value.includes(expected)) {
    throw new Error(`Expected NOT to contain "${expected}". ${message || ""}`);
  }
}

function assertMatches(value: string, pattern: RegExp | string, message?: string) {
  const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  if (!regex.test(value)) {
    throw new Error(`Expected to match ${pattern}. ${message || ""}`);
  }
}

function assertEqual(actual: string, expected: string, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected "${expected}" but got "${actual}". ${message || ""}`);
  }
}

// Test runner
interface TestCase {
  name: string;
  fn: () => void;
}

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

console.log("\n=== formatCurrency ===\n");

test("formatCurrency: should format currency with 2 decimals for English", () => {
  assertEqual(formatCurrency(100, "en"), "100.00 ETB");
  assertEqual(formatCurrency(1000.5, "en"), "1,000.50 ETB");
  assertEqual(formatCurrency(1000000, "en"), "1,000,000.00 ETB");
});

test("formatCurrency: should format currency with 2 decimals for Amharic", () => {
  assertEqual(formatCurrency(100, "am"), "100.00 ብር");
  assertEqual(formatCurrency(1000.5, "am"), "1,000.50 ብር");
  assertEqual(formatCurrency(1000000, "am"), "1,000,000.00 ብር");
});

test("formatCurrency: should handle zero balance", () => {
  assertEqual(formatCurrency(0, "en"), "0.00 ETB");
  assertEqual(formatCurrency(0, "am"), "0.00 ብር");
});

test("formatCurrency: should handle very large numbers", () => {
  assertEqual(formatCurrency(999999999.99, "en"), "999,999,999.99 ETB");
  assertEqual(formatCurrency(999999999.99, "am"), "999,999,999.99 ብር");
});

test("formatCurrency: should handle decimal precision correctly", () => {
  assertEqual(formatCurrency(10.1, "en"), "10.10 ETB");
  assertEqual(formatCurrency(10.123, "en"), "10.12 ETB");
  assertEqual(formatCurrency(10.999, "en"), "11.00 ETB");
});

test("formatCurrency: should handle negative amounts", () => {
  assertEqual(formatCurrency(-100, "en"), "-100.00 ETB");
  assertEqual(formatCurrency(-1000.5, "am"), "-1,000.50 ብር");
});

test("formatCurrency: should handle invalid inputs gracefully", () => {
  assertEqual(formatCurrency(NaN, "en"), "Unknown ETB");
  assertEqual(formatCurrency(Infinity, "am"), "ያልታወቀ ብር");
  assertEqual(formatCurrency(-Infinity, "en"), "Unknown ETB");
});

console.log("\n=== formatDate ===\n");

test("formatDate: should format date in English", () => {
  const timestamp = new Date("2026-06-24").getTime();
  const result = formatDate(timestamp, "en");
  assertMatches(result, /June.*24.*2026/);
});

test("formatDate: should format date in Amharic", () => {
  const timestamp = new Date("2026-06-24").getTime();
  const result = formatDate(timestamp, "am");
  assertMatches(result, /24/);
  assertMatches(result, /2026/);
});

test("formatDate: should handle past dates", () => {
  const pastDate = new Date("2020-01-15").getTime();
  const result = formatDate(pastDate, "en");
  assertMatches(result, /2020/);
});

test("formatDate: should handle future dates", () => {
  const futureDate = new Date("2030-12-31").getTime();
  const result = formatDate(futureDate, "en");
  assertMatches(result, /2030/);
});

test("formatDate: should handle invalid timestamps", () => {
  assertEqual(formatDate(NaN, "en"), "Unknown date");
  assertEqual(formatDate(Infinity, "am"), "ያልታወቀ ቀን");
});

test("formatDate: should handle recent past dates", () => {
  // Test with a recent past date instead of very old dates
  const pastDate = new Date("2020-01-15").getTime();
  const result = formatDate(pastDate, "en");
  assertMatches(result, /January|2020/);
});

console.log("\n=== formatDayCount ===\n");

test("formatDayCount: should format singular day in English", () => {
  assertEqual(formatDayCount(1, "en"), "1 day");
});

test("formatDayCount: should format plural days in English", () => {
  assertEqual(formatDayCount(2, "en"), "2 days");
  assertEqual(formatDayCount(7, "en"), "7 days");
  assertEqual(formatDayCount(100, "en"), "100 days");
});

test("formatDayCount: should format singular day in Amharic", () => {
  assertEqual(formatDayCount(1, "am"), "1 ቀን");
});

test("formatDayCount: should format plural days in Amharic", () => {
  assertEqual(formatDayCount(2, "am"), "2 ቀን");
  assertEqual(formatDayCount(7, "am"), "7 ቀን");
  assertEqual(formatDayCount(100, "am"), "100 ቀን");
});

test("formatDayCount: should format zero days", () => {
  assertEqual(formatDayCount(0, "en"), "0 days");
  assertEqual(formatDayCount(0, "am"), "0 ቀን");
});

test("formatDayCount: should floor fractional days", () => {
  assertEqual(formatDayCount(1.5, "en"), "1 day");
  assertEqual(formatDayCount(2.9, "en"), "2 days");
});

test("formatDayCount: should handle very large day counts", () => {
  assertEqual(formatDayCount(365, "en"), "365 days");
  assertEqual(formatDayCount(1000, "am"), "1000 ቀን");
});

test("formatDayCount: should handle invalid inputs", () => {
  assertEqual(formatDayCount(NaN, "en"), "Unknown days");
  assertEqual(formatDayCount(Infinity, "am"), "ያልታወቀ ቀናት");
});

console.log("\n=== buildReminderMessage ===\n");

test("buildReminderMessage: should build reminder message in English with all parameters", () => {
  const dueDate = new Date("2026-06-24").getTime();
  const message = buildReminderMessage("en", "John Doe", 1000, dueDate, 5);

  assertContains(message, "🏪 Gebya");
  assertContains(message, "👤 John Doe");
  assertContains(message, "💰 Balance due:");
  assertContains(message, "1,000.00 ETB");
  assertContains(message, "📅 Due date:");
  assertContains(message, "2026");
  assertContains(message, "/balance");
  assertContains(message, "/paid");
});

test("buildReminderMessage: should build reminder message in Amharic", () => {
  const dueDate = new Date("2026-06-24").getTime();
  const message = buildReminderMessage("am", "ሐበሻ", 1000, dueDate, 5);

  assertContains(message, "🏪 ጌባያ");
  assertContains(message, "👤 ሐበሻ");
  assertContains(message, "💰 ቀሪ ሂሳብ:");
  assertContains(message, "1,000.00 ብር");
  assertContains(message, "📅 ጊዜ ያበቃል:");
  assertContains(message, "2026");
});

test("buildReminderMessage: should build message without due date in English", () => {
  const message = buildReminderMessage("en", "Jane Smith", 500, null, 10);

  assertContains(message, "👤 Jane Smith");
  assertContains(message, "💰 Balance due: 500.00 ETB");
  assertContains(message, "📅 Days held: 10 days");
  assertNotContains(message, "Due date:");
});

test("buildReminderMessage: should build message without due date in Amharic", () => {
  const message = buildReminderMessage("am", "ወደገብ", 500, null, 10);

  assertContains(message, "👤 ወደገብ");
  assertContains(message, "💰 ቀሪ ሂሳብ: 500.00 ብር");
  assertContains(message, "📅 ጊዜ: 10 ቀን");
  assertNotContains(message, "ጊዜ ያበቃል:");
});

test("buildReminderMessage: should handle very long customer names", () => {
  const longName = "A".repeat(100);
  const message = buildReminderMessage("en", longName, 1000, null, 5);

  assertContains(message, "A".repeat(50));
});

test("buildReminderMessage: should handle zero balance", () => {
  const message = buildReminderMessage("en", "Customer", 0, null, 0);

  assertContains(message, "💰 Balance due: 0.00 ETB");
  assertContains(message, "📅 Days held: 0 days");
});

test("buildReminderMessage: should handle negative balance", () => {
  const message = buildReminderMessage("en", "Customer", -100, null, 5);

  assertContains(message, "💰 Balance due: -100.00 ETB");
  assertContains(message, "📅 Days held: 5 days");
});

test("buildReminderMessage: should handle very large balance", () => {
  const message = buildReminderMessage("en", "Customer", 999999999.99, null, 5);

  assertContains(message, "999,999,999.99 ETB");
});

test("buildReminderMessage: should handle very old debts", () => {
  const message = buildReminderMessage("en", "Customer", 1000, null, 365);

  assertContains(message, "365 days");
});

test("buildReminderMessage: should handle null/empty customer name", () => {
  const message1 = buildReminderMessage("en", "", 1000, null, 5);
  const message2 = buildReminderMessage("en", "Customer", 1000, null, 5);

  assertContains(message1, "👤 Customer");
  assertContains(message2, "👤 Customer");
});

test("buildReminderMessage: should handle null dueDate", () => {
  const message = buildReminderMessage("en", "Customer", 1000, null, 5);

  assertContains(message, "Days held:");
  assertNotContains(message, "Due date:");
});

test("buildReminderMessage: should handle invalid dueDate", () => {
  const message = buildReminderMessage("en", "Customer", 1000, NaN, 5);

  assertContains(message, "Days held:");
  assertNotContains(message, "Due date:");
});

test("buildReminderMessage: should handle singular day format", () => {
  const message = buildReminderMessage("en", "Customer", 1000, null, 1);

  assertContains(message, "📅 Days held: 1 day");
});

test("buildReminderMessage: should include call-to-action", () => {
  const message = buildReminderMessage("en", "Customer", 1000, null, 5);

  assertContains(message, "/balance");
  assertContains(message, "/paid");
});

test("buildReminderMessage: should use Amharic currency suffix", () => {
  const message = buildReminderMessage("am", "Customer", 1500.50, null, 5);

  assertContains(message, "1,500.50 ብር");
  assertNotContains(message, "ETB");
});

test("buildReminderMessage: should use English currency suffix", () => {
  const message = buildReminderMessage("en", "Customer", 1500.50, null, 5);

  assertContains(message, "1,500.50 ETB");
  assertNotContains(message, "ብር");
});

test("buildReminderMessage: should maintain emoji spacing", () => {
  const message = buildReminderMessage("en", "Customer", 1000, null, 5);

  assertMatches(message, /🏪 Gebya/);
  assertMatches(message, /👤 /);
  assertMatches(message, /💰 /);
  assertMatches(message, /📅 /);
});

console.log(`\n=== Test Summary ===\n`);
console.log(`Total: ${testCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  process.exit(1);
}
