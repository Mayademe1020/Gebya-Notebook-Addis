/**
 * Unit tests for messageTemplates utilities
 */

import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  formatCurrencyAm,
  formatCurrencyEn,
  formatDayCountAm,
  formatDayCountEn,
  formatDateAm,
  formatDateEn,
  REMINDER_MESSAGE_TEMPLATES,
} from "../messageTemplates.js";

describe("messageTemplates", () => {
  describe("renderTemplate", () => {
    it("replaces placeholders with values", () => {
      expect(renderTemplate("Hello {{NAME}}", { NAME: "John" })).toBe("Hello John");
    });
    it("handles multiple placeholders", () => {
      expect(
        renderTemplate("{{NAME}} owes {{BALANCE}}", { NAME: "Alice", BALANCE: "500" })
      ).toBe("Alice owes 500");
    });
    it("coerces numbers to strings", () => {
      expect(renderTemplate("Val: {{N}}", { N: 123 })).toBe("Val: 123");
    });
    it("leaves missing placeholders unchanged", () => {
      expect(renderTemplate("Hi {{NAME}}", {})).toBe("Hi {{NAME}}");
    });
    it("handles empty template", () => {
      expect(renderTemplate("", {})).toBe("");
    });
  });

  describe("formatCurrencyAm", () => {
    it("formats positive amounts", () => {
      expect(formatCurrencyAm(1000)).toBe("1,000.00 ብር");
      expect(formatCurrencyAm(1234.56)).toBe("1,234.56 ብር");
    });
    it("handles zero", () => {
      expect(formatCurrencyAm(0)).toBe("0.00 ብር");
    });
    it("handles null/undefined/NaN", () => {
      expect(formatCurrencyAm(null as any)).toBe("0 ብር");
      expect(formatCurrencyAm(undefined as any)).toBe("0 ብር");
      expect(formatCurrencyAm(NaN)).toBe("0 ብር");
    });
    it("handles negative", () => {
      expect(formatCurrencyAm(-100)).toBe("-100.00 ብር");
    });
  });

  describe("formatCurrencyEn", () => {
    it("formats positive amounts", () => {
      expect(formatCurrencyEn(1000)).toBe("1,000.00 ETB");
      expect(formatCurrencyEn(1234.56)).toBe("1,234.56 ETB");
    });
    it("handles zero", () => {
      expect(formatCurrencyEn(0)).toBe("0.00 ETB");
    });
    it("handles null/undefined/NaN", () => {
      expect(formatCurrencyEn(null as any)).toBe("0 ETB");
      expect(formatCurrencyEn(undefined as any)).toBe("0 ETB");
      expect(formatCurrencyEn(NaN)).toBe("0 ETB");
    });
    it("handles negative", () => {
      expect(formatCurrencyEn(-100)).toBe("-100.00 ETB");
    });
  });

  describe("formatDayCountAm", () => {
    it("formats day counts", () => {
      expect(formatDayCountAm(1)).toBe("1 ቀን");
      expect(formatDayCountAm(5)).toBe("5 ቀን");
      expect(formatDayCountAm(0)).toBe("0 ቀን");
    });
    it("floors fractional days", () => {
      expect(formatDayCountAm(5.7)).toBe("5 ቀን");
    });
    it("handles invalid as 0", () => {
      expect(formatDayCountAm(NaN as any)).toBe("0 ቀን");
    });
  });

  describe("formatDayCountEn", () => {
    it("formats singular/plural", () => {
      expect(formatDayCountEn(1)).toBe("1 day");
      expect(formatDayCountEn(5)).toBe("5 days");
    });
    it("handles zero", () => {
      expect(formatDayCountEn(0)).toBe("0 days");
    });
    it("floors fractional days", () => {
      expect(formatDayCountEn(3.9)).toBe("3 days");
    });
    it("handles invalid as 0", () => {
      expect(formatDayCountEn(NaN as any)).toBe("0 days");
    });
  });

  describe("formatDateAm", () => {
    it("formats Amharic date", () => {
      const ts = new Date("2024-07-15T00:00:00Z").getTime();
      expect(formatDateAm(ts)).toBe("15 ሐምሌ 2024");
    });
    it("handles null/undefined/NaN/0 as empty string", () => {
      expect(formatDateAm(null as any)).toBe("");
      expect(formatDateAm(undefined as any)).toBe("");
      expect(formatDateAm(NaN)).toBe("");
      expect(formatDateAm(0)).toBe("");
    });
  });

  describe("formatDateEn", () => {
    it("formats English date", () => {
      const ts = new Date("2024-07-15T00:00:00Z").getTime();
      expect(formatDateEn(ts)).toBe("July 15, 2024");
    });
    it("handles null/undefined/NaN/0 as empty string", () => {
      expect(formatDateEn(null as any)).toBe("");
      expect(formatDateEn(undefined as any)).toBe("");
      expect(formatDateEn(NaN)).toBe("");
      expect(formatDateEn(0)).toBe("");
    });
  });
});