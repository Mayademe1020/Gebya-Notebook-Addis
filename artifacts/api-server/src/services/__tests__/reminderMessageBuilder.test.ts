/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  buildReminderMessage,
  formatCurrency,
  formatDate,
  formatDayCount,
} from "../reminderMessageBuilder.js";

describe("reminderMessageBuilder", () => {
  describe("formatCurrency", () => {
    it("formats integer amounts with 2 decimals in English", () => {
      expect(formatCurrency(100, "en")).toBe("100.00 ETB");
      expect(formatCurrency(1000.5, "en")).toBe("1,000.50 ETB");
      expect(formatCurrency(1000000, "en")).toBe("1,000,000.00 ETB");
    });

    it("formats amounts in Amharic", () => {
      expect(formatCurrency(100, "am")).toBe("100.00 ብር");
      expect(formatCurrency(1000.5, "am")).toBe("1,000.50 ብር");
    });

    it("handles zero balance", () => {
      expect(formatCurrency(0, "en")).toBe("0.00 ETB");
      expect(formatCurrency(0, "am")).toBe("0.00 ብር");
    });

    it("handles large numbers", () => {
      expect(formatCurrency(999999999.99, "en")).toBe("999,999,999.99 ETB");
    });

    it("handles decimal precision", () => {
      expect(formatCurrency(10.1, "en")).toBe("10.10 ETB");
      expect(formatCurrency(10.123, "en")).toBe("10.12 ETB");
      expect(formatCurrency(10.999, "en")).toBe("11.00 ETB");
    });

    it("handles negative amounts", () => {
      expect(formatCurrency(-100, "en")).toBe("-100.00 ETB");
      expect(formatCurrency(-1000.5, "am")).toBe("-1,000.50 ብር");
    });

    it("handles invalid inputs", () => {
      expect(formatCurrency(NaN, "en")).toBe("Unknown ETB");
      expect(formatCurrency(Infinity, "am")).toBe("ያልታወቀ ብር");
      expect(formatCurrency(-Infinity, "en")).toBe("Unknown ETB");
    });
  });

  describe("formatDate", () => {
    it("formats date in English", () => {
      expect(formatDate(new Date("2026-06-24").getTime(), "en")).toMatch(/June.*24.*2026/);
    });

    it("formats date in Amharic", () => {
      const result = formatDate(new Date("2026-06-24").getTime(), "am");
      expect(result).toMatch(/24/);
      expect(result).toMatch(/2026/);
    });

    it("returns Unknown for invalid timestamps", () => {
      expect(formatDate(NaN, "en")).toBe("Unknown date");
      expect(formatDate(Infinity, "am")).toBe("ያልታወቀ ቀን");
    });
  });

  describe("formatDayCount", () => {
    it("formats singular day correctly", () => {
      expect(formatDayCount(1, "en")).toBe("1 day");
      expect(formatDayCount(1, "am")).toBe("1 ቀን");
    });

    it("formats plural days correctly", () => {
      expect(formatDayCount(2, "en")).toBe("2 days");
      expect(formatDayCount(100, "am")).toBe("100 ቀን");
    });

    it("floors fractional days", () => {
      expect(formatDayCount(1.5, "en")).toBe("1 day");
      expect(formatDayCount(2.9, "en")).toBe("2 days");
    });

    it("handles zero days", () => {
      expect(formatDayCount(0, "en")).toBe("0 days");
      expect(formatDayCount(0, "am")).toBe("0 ቀን");
    });

    it("handles invalid inputs", () => {
      expect(formatDayCount(NaN, "en")).toBe("Unknown days");
      expect(formatDayCount(Infinity, "am")).toBe("ያልታወቀ ቀናት");
    });
  });

  describe("buildReminderMessage", () => {
    const dueDate = new Date("2026-06-24").getTime();

    it("builds English reminder with all parameters", () => {
      const msg = buildReminderMessage("en", "John Doe", 1000, dueDate, 5);
      expect(msg).toContain("John Doe");
      expect(msg).toContain("1,000.00 ETB");
      expect(msg).toContain("June");
      expect(msg).toContain("/balance");
      expect(msg).toContain("/paid");
    });

    it("builds Amharic reminder", () => {
      const msg = buildReminderMessage("am", "ሐበሻ", 1000, dueDate, 5);
      expect(msg).toContain("ሐበሻ");
      expect(msg).toContain("1,000.00 ብር");
      expect(msg).toContain("2026");
    });

    it("omits due date when null", () => {
      const msg = buildReminderMessage("en", "Jane", 500, null, 10);
      expect(msg).toContain("Days held: 10 days");
      expect(msg).not.toContain("Due date:");
    });

    it("handles zero balance", () => {
      const msg = buildReminderMessage("en", "Customer", 0, null, 0);
      expect(msg).toContain("0.00 ETB");
      expect(msg).toContain("0 days");
    });

    it("handles negative balance", () => {
      const msg = buildReminderMessage("en", "Customer", -100, null, 5);
      expect(msg).toContain("-100.00 ETB");
    });

    it("uses correct currency suffix per language", () => {
      const enMsg = buildReminderMessage("en", "X", 1500, null, 1);
      const amMsg = buildReminderMessage("am", "X", 1500, null, 1);
      expect(enMsg).toContain("ETB");
      expect(enMsg).not.toContain("ብር");
      expect(amMsg).toContain("ብር");
      expect(amMsg).not.toContain("ETB");
    });
  });
});
