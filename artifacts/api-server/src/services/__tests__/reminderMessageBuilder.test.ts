/**
 * Unit tests for ReminderMessageBuilder service
 */

import { describe, it } from "vitest";
import {
  buildReminderMessage,
  formatCurrency,
  formatDate,
  formatDayCount,
} from "../reminderMessageBuilder.js";

function assertEqual(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected "${expected}" but got "${actual}"`);
  }
}
function assertContains(value: string, expected: string) {
  if (!value.includes(expected)) {
    throw new Error(`Expected to contain "${expected}"`);
  }
}
function assertNotContains(value: string, expected: string) {
  if (value.includes(expected)) {
    throw new Error(`Expected NOT to contain "${expected}"`);
  }
}
function assertMatches(value: string, pattern: RegExp | string) {
  const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  if (!regex.test(value)) {
    throw new Error(`Expected to match ${pattern}`);
  }
}

describe("reminderMessageBuilder", () => {
  describe("formatCurrency", () => {
    it("formats English currency with 2 decimals", () => {
      assertEqual(formatCurrency(100, "en"), "100.00 ETB");
      assertEqual(formatCurrency(1000.5, "en"), "1,000.50 ETB");
      assertEqual(formatCurrency(1000000, "en"), "1,000,000.00 ETB");
    });
    it("formats Amharic currency with 2 decimals", () => {
      assertEqual(formatCurrency(100, "am"), "100.00 ብር");
      assertEqual(formatCurrency(1000.5, "am"), "1,000.50 ብር");
      assertEqual(formatCurrency(1000000, "am"), "1,000,000.00 ብር");
    });
    it("handles zero balance", () => {
      assertEqual(formatCurrency(0, "en"), "0.00 ETB");
      assertEqual(formatCurrency(0, "am"), "0.00 ብር");
    });
    it("handles very large numbers", () => {
      assertEqual(formatCurrency(999999999.99, "en"), "999,999,999.99 ETB");
      assertEqual(formatCurrency(999999999.99, "am"), "999,999,999.99 ብር");
    });
    it("handles decimal precision correctly", () => {
      assertEqual(formatCurrency(10.1, "en"), "10.10 ETB");
      assertEqual(formatCurrency(10.123, "en"), "10.12 ETB");
      assertEqual(formatCurrency(10.999, "en"), "11.00 ETB");
    });
    it("handles negative amounts", () => {
      assertEqual(formatCurrency(-100, "en"), "-100.00 ETB");
      assertEqual(formatCurrency(-1000.5, "am"), "-1,000.50 ብር");
    });
    it("handles invalid inputs gracefully", () => {
      assertEqual(formatCurrency(NaN, "en"), "Unknown ETB");
      assertEqual(formatCurrency(Infinity, "am"), "ያልታወቀ ብር");
      assertEqual(formatCurrency(-Infinity, "en"), "Unknown ETB");
    });
  });

  describe("formatDate", () => {
    it("formats date in English", () => {
      const timestamp = new Date("2026-06-24").getTime();
      assertMatches(formatDate(timestamp, "en"), /June.*24.*2026/);
    });
    it("formats date in Amharic", () => {
      const timestamp = new Date("2026-06-24").getTime();
      const result = formatDate(timestamp, "am");
      assertMatches(result, /24/);
      assertMatches(result, /2026/);
    });
    it("handles past dates", () => {
      const pastDate = new Date("2020-01-15").getTime();
      assertMatches(formatDate(pastDate, "en"), /2020/);
    });
    it("handles future dates", () => {
      const futureDate = new Date("2030-12-31").getTime();
      assertMatches(formatDate(futureDate, "en"), /2030/);
    });
    it("handles invalid timestamps", () => {
      assertEqual(formatDate(NaN, "en"), "Unknown date");
      assertEqual(formatDate(Infinity, "am"), "ያልታወቀ ቀን");
    });
    it("handles recent past dates", () => {
      const pastDate = new Date("2020-01-15").getTime();
      assertMatches(formatDate(pastDate, "en"), /January|2020/);
    });
  });

  describe("formatDayCount", () => {
    it("formats singular day in English", () => {
      assertEqual(formatDayCount(1, "en"), "1 day");
    });
    it("formats plural days in English", () => {
      assertEqual(formatDayCount(2, "en"), "2 days");
      assertEqual(formatDayCount(7, "en"), "7 days");
      assertEqual(formatDayCount(100, "en"), "100 days");
    });
    it("formats singular day in Amharic", () => {
      assertEqual(formatDayCount(1, "am"), "1 ቀን");
    });
    it("formats plural days in Amharic", () => {
      assertEqual(formatDayCount(2, "am"), "2 ቀን");
      assertEqual(formatDayCount(7, "am"), "7 ቀን");
      assertEqual(formatDayCount(100, "am"), "100 ቀን");
    });
    it("formats zero days", () => {
      assertEqual(formatDayCount(0, "en"), "0 days");
      assertEqual(formatDayCount(0, "am"), "0 ቀን");
    });
    it("floors fractional days", () => {
      assertEqual(formatDayCount(1.5, "en"), "1 day");
      assertEqual(formatDayCount(2.9, "en"), "2 days");
    });
    it("handles very large day counts", () => {
      assertEqual(formatDayCount(365, "en"), "365 days");
      assertEqual(formatDayCount(1000, "am"), "1000 ቀን");
    });
    it("handles invalid inputs", () => {
      assertEqual(formatDayCount(NaN, "en"), "Unknown days");
      assertEqual(formatDayCount(Infinity, "am"), "ያልታወቀ ቀናት");
    });
  });

  describe("buildReminderMessage", () => {
    it("builds reminder message in English with all parameters", () => {
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
    it("builds reminder message in Amharic", () => {
      const dueDate = new Date("2026-06-24").getTime();
      const message = buildReminderMessage("am", "ሐበሻ", 1000, dueDate, 5);
      assertContains(message, "🏪 ጌባያ");
      assertContains(message, "👤 ሐበሻ");
      assertContains(message, "💰 ቀሪ ሂሳብ:");
      assertContains(message, "1,000.00 ብር");
      assertContains(message, "📅 ጊዜ ያበቃል:");
      assertContains(message, "2026");
    });
    it("builds message without due date in English", () => {
      const message = buildReminderMessage("en", "Jane Smith", 500, null, 10);
      assertContains(message, "👤 Jane Smith");
      assertContains(message, "💰 Balance due: 500.00 ETB");
      assertContains(message, "📅 Days held: 10 days");
      assertNotContains(message, "Due date:");
    });
    it("builds message without due date in Amharic", () => {
      const message = buildReminderMessage("am", "ወደገብ", 500, null, 10);
      assertContains(message, "👤 ወደገብ");
      assertContains(message, "💰 ቀሪ ሂሳብ: 500.00 ብር");
      assertContains(message, "📅 ጊዜ: 10 ቀን");
      assertNotContains(message, "ጊዜ ያበቃል:");
    });
    it("handles very long customer names", () => {
      const longName = "A".repeat(100);
      const message = buildReminderMessage("en", longName, 1000, null, 5);
      assertContains(message, "A".repeat(50));
    });
    it("handles zero balance", () => {
      const message = buildReminderMessage("en", "Customer", 0, null, 0);
      assertContains(message, "💰 Balance due: 0.00 ETB");
      assertContains(message, "📅 Days held: 0 days");
    });
    it("handles negative balance", () => {
      const message = buildReminderMessage("en", "Customer", -100, null, 5);
      assertContains(message, "💰 Balance due: -100.00 ETB");
      assertContains(message, "📅 Days held: 5 days");
    });
    it("handles very large balance", () => {
      const message = buildReminderMessage("en", "Customer", 999999999.99, null, 5);
      assertContains(message, "999,999,999.99 ETB");
    });
    it("handles very old debts", () => {
      const message = buildReminderMessage("en", "Customer", 1000, null, 365);
      assertContains(message, "365 days");
    });
    it("handles null/empty customer name", () => {
      const message1 = buildReminderMessage("en", "", 1000, null, 5);
      const message2 = buildReminderMessage("en", "Customer", 1000, null, 5);
      assertContains(message1, "👤 Customer");
      assertContains(message2, "👤 Customer");
    });
    it("handles null dueDate", () => {
      const message = buildReminderMessage("en", "Customer", 1000, null, 5);
      assertContains(message, "Days held:");
      assertNotContains(message, "Due date:");
    });
    it("handles invalid dueDate", () => {
      const message = buildReminderMessage("en", "Customer", 1000, NaN, 5);
      assertContains(message, "Days held:");
      assertNotContains(message, "Due date:");
    });
    it("handles singular day format", () => {
      const message = buildReminderMessage("en", "Customer", 1000, null, 1);
      assertContains(message, "📅 Days held: 1 day");
    });
    it("includes call-to-action", () => {
      const message = buildReminderMessage("en", "Customer", 1000, null, 5);
      assertContains(message, "/balance");
      assertContains(message, "/paid");
    });
    it("uses Amharic currency suffix", () => {
      const message = buildReminderMessage("am", "Customer", 1500.5, null, 5);
      assertContains(message, "1,500.50 ብር");
      assertNotContains(message, "ETB");
    });
    it("uses English currency suffix", () => {
      const message = buildReminderMessage("en", "Customer", 1500.5, null, 5);
      assertContains(message, "1,500.50 ETB");
      assertNotContains(message, "ብር");
    });
    it("maintains emoji spacing", () => {
      const message = buildReminderMessage("en", "Customer", 1000, null, 5);
      assertMatches(message, /🏪 Gebya/);
      assertMatches(message, /👤 /);
      assertMatches(message, /💰 /);
      assertMatches(message, /📅 /);
    });
  });
});