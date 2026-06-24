import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  formatCurrencyAm,
  formatCurrencyEn,
  formatDayCountAm,
  formatDayCountEn,
  formatDateAm,
  formatDateEn,
  MONTHS_AMHARIC,
  MONTHS_ENGLISH,
  CURRENCY_SUFFIX,
  REMINDER_MESSAGE_TEMPLATES,
} from "../messageTemplates";

describe("messageTemplates", () => {
  describe("MONTHS_AMHARIC", () => {
    it("should have 12 Amharic month names", () => {
      expect(MONTHS_AMHARIC).toHaveLength(12);
    });

    it("should have correct Amharic month names", () => {
      expect(MONTHS_AMHARIC[0]).toBe("ጃንዋሪ"); // January
      expect(MONTHS_AMHARIC[6]).toBe("ሐምሌ"); // July
      expect(MONTHS_AMHARIC[11]).toBe("ታሕሳስ"); // December
    });
  });

  describe("MONTHS_ENGLISH", () => {
    it("should have 12 English month names", () => {
      expect(MONTHS_ENGLISH).toHaveLength(12);
    });

    it("should have correct English month names", () => {
      expect(MONTHS_ENGLISH[0]).toBe("January");
      expect(MONTHS_ENGLISH[6]).toBe("July");
      expect(MONTHS_ENGLISH[11]).toBe("December");
    });
  });

  describe("CURRENCY_SUFFIX", () => {
    it("should have Amharic currency suffix", () => {
      expect(CURRENCY_SUFFIX.am).toBe("ብር");
    });

    it("should have English currency suffix", () => {
      expect(CURRENCY_SUFFIX.en).toBe("ETB");
    });
  });

  describe("REMINDER_MESSAGE_TEMPLATES", () => {
    it("should have Amharic reminder templates", () => {
      expect(REMINDER_MESSAGE_TEMPLATES.am).toBeDefined();
      expect(REMINDER_MESSAGE_TEMPLATES.am.reminder).toContain("{{NAME}}");
      expect(REMINDER_MESSAGE_TEMPLATES.am.reminder).toContain("{{BALANCE}}");
      expect(REMINDER_MESSAGE_TEMPLATES.am.reminder).toContain("{{DUEDATE}}");
      expect(REMINDER_MESSAGE_TEMPLATES.am.reminder).toContain("{{DAYSHELD}}");
    });

    it("should have English reminder templates", () => {
      expect(REMINDER_MESSAGE_TEMPLATES.en).toBeDefined();
      expect(REMINDER_MESSAGE_TEMPLATES.en.reminder).toContain("{{NAME}}");
      expect(REMINDER_MESSAGE_TEMPLATES.en.reminder).toContain("{{BALANCE}}");
      expect(REMINDER_MESSAGE_TEMPLATES.en.reminder).toContain("{{DUEDATE}}");
      expect(REMINDER_MESSAGE_TEMPLATES.en.reminder).toContain("{{DAYSHELD}}");
    });

    it("should have templates without due date", () => {
      expect(REMINDER_MESSAGE_TEMPLATES.am.reminderNoDueDate).toBeDefined();
      expect(REMINDER_MESSAGE_TEMPLATES.en.reminderNoDueDate).toBeDefined();
    });
  });

  describe("renderTemplate", () => {
    it("should replace all placeholders with values", () => {
      const template = "Hello {{NAME}}, your balance is {{BALANCE}}";
      const result = renderTemplate(template, {
        NAME: "John",
        BALANCE: "100",
      });
      expect(result).toBe("Hello John, your balance is 100");
    });

    it("should handle multiple occurrences of same placeholder", () => {
      const template = "{{NAME}} owes {{BALANCE}}. {{NAME}} must pay.";
      const result = renderTemplate(template, {
        NAME: "Alice",
        BALANCE: "500",
      });
      expect(result).toBe("Alice owes 500. Alice must pay.");
    });

    it("should handle numeric values", () => {
      const template = "Balance: {{AMOUNT}}";
      const result = renderTemplate(template, {
        AMOUNT: 1234.56,
      });
      expect(result).toBe("Balance: 1234.56");
    });

    it("should leave placeholders as-is for missing variables", () => {
      const template = "Hello {{NAME}}, your balance is {{BALANCE}}";
      const result = renderTemplate(template, {
        NAME: "John",
      });
      expect(result).toBe("Hello John, your balance is {{BALANCE}}");
    });

    it("should handle null/undefined variables by leaving placeholder", () => {
      const template = "Name: {{NAME}}, Balance: {{BALANCE}}";
      const result = renderTemplate(template, {
        NAME: null,
        BALANCE: undefined,
      });
      expect(result).toBe("Name: {{NAME}}, Balance: {{BALANCE}}");
    });

    it("should handle empty template", () => {
      const result = renderTemplate("", { NAME: "John" });
      expect(result).toBe("");
    });

    it("should handle template with no placeholders", () => {
      const template = "Hello world";
      const result = renderTemplate(template, { NAME: "John" });
      expect(result).toBe("Hello world");
    });

    it("should work with Amharic text", () => {
      const template = "ስም: {{NAME}}, ሂሳብ: {{BALANCE}}";
      const result = renderTemplate(template, {
        NAME: "አሊ",
        BALANCE: "500 ብር",
      });
      expect(result).toBe("ስም: አሊ, ሂሳብ: 500 ብር");
    });
  });

  describe("formatCurrencyAm", () => {
    it("should format positive amount with thousands separator and ብር suffix", () => {
      expect(formatCurrencyAm(1000)).toBe("1,000.00 ብር");
      expect(formatCurrencyAm(1234.56)).toBe("1,234.56 ብር");
    });

    it("should handle zero amount", () => {
      expect(formatCurrencyAm(0)).toBe("0.00 ብር");
    });

    it("should handle small amounts", () => {
      expect(formatCurrencyAm(10)).toBe("10.00 ብር");
      expect(formatCurrencyAm(0.5)).toBe("0.50 ብር");
    });

    it("should handle very large amounts", () => {
      expect(formatCurrencyAm(1000000)).toBe("1,000,000.00 ብር");
    });

    it("should handle null/undefined as 0", () => {
      expect(formatCurrencyAm(null as any)).toBe("0 ብር");
      expect(formatCurrencyAm(undefined as any)).toBe("0 ብር");
    });

    it("should handle NaN as 0", () => {
      expect(formatCurrencyAm(NaN)).toBe("0 ብር");
    });

    it("should handle negative amounts", () => {
      expect(formatCurrencyAm(-100)).toBe("-100.00 ብር");
    });
  });

  describe("formatCurrencyEn", () => {
    it("should format positive amount with thousands separator and ETB suffix", () => {
      expect(formatCurrencyEn(1000)).toBe("1,000.00 ETB");
      expect(formatCurrencyEn(1234.56)).toBe("1,234.56 ETB");
    });

    it("should handle zero amount", () => {
      expect(formatCurrencyEn(0)).toBe("0.00 ETB");
    });

    it("should handle small amounts", () => {
      expect(formatCurrencyEn(10)).toBe("10.00 ETB");
      expect(formatCurrencyEn(0.5)).toBe("0.50 ETB");
    });

    it("should handle very large amounts", () => {
      expect(formatCurrencyEn(1000000)).toBe("1,000,000.00 ETB");
    });

    it("should handle null/undefined as 0", () => {
      expect(formatCurrencyEn(null as any)).toBe("0 ETB");
      expect(formatCurrencyEn(undefined as any)).toBe("0 ETB");
    });

    it("should handle NaN as 0", () => {
      expect(formatCurrencyEn(NaN)).toBe("0 ETB");
    });

    it("should handle negative amounts", () => {
      expect(formatCurrencyEn(-100)).toBe("-100.00 ETB");
    });
  });

  describe("formatDayCountAm", () => {
    it("should format day count in Amharic", () => {
      expect(formatDayCountAm(1)).toBe("1 ቀን");
      expect(formatDayCountAm(5)).toBe("5 ቀን");
      expect(formatDayCountAm(30)).toBe("30 ቀን");
    });

    it("should handle zero days", () => {
      expect(formatDayCountAm(0)).toBe("0 ቀን");
    });

    it("should handle large day counts", () => {
      expect(formatDayCountAm(365)).toBe("365 ቀን");
      expect(formatDayCountAm(1000)).toBe("1000 ቀን");
    });

    it("should floor fractional days", () => {
      expect(formatDayCountAm(5.7)).toBe("5 ቀን");
      expect(formatDayCountAm(5.2)).toBe("5 ቀን");
    });

    it("should handle null/undefined as 0", () => {
      expect(formatDayCountAm(null as any)).toBe("0 ቀን");
      expect(formatDayCountAm(undefined as any)).toBe("0 ቀን");
    });

    it("should handle NaN as 0", () => {
      expect(formatDayCountAm(NaN)).toBe("0 ቀን");
    });

    it("should handle negative as 0", () => {
      expect(formatDayCountAm(-5)).toBe("0 ቀን");
    });
  });

  describe("formatDayCountEn", () => {
    it("should format day count in English with singular/plural", () => {
      expect(formatDayCountEn(1)).toBe("1 day");
      expect(formatDayCountEn(5)).toBe("5 days");
      expect(formatDayCountEn(30)).toBe("30 days");
    });

    it("should handle zero days", () => {
      expect(formatDayCountEn(0)).toBe("0 days");
    });

    it("should handle large day counts", () => {
      expect(formatDayCountEn(365)).toBe("365 days");
      expect(formatDayCountEn(1000)).toBe("1000 days");
    });

    it("should floor fractional days", () => {
      expect(formatDayCountEn(5.7)).toBe("5 days");
      expect(formatDayCountEn(5.2)).toBe("5 days");
    });

    it("should handle null/undefined as 0", () => {
      expect(formatDayCountEn(null as any)).toBe("0 days");
      expect(formatDayCountEn(undefined as any)).toBe("0 days");
    });

    it("should handle NaN as 0", () => {
      expect(formatDayCountEn(NaN)).toBe("0 days");
    });

    it("should handle negative as 0", () => {
      expect(formatDayCountEn(-5)).toBe("0 days");
    });
  });

  describe("formatDateAm", () => {
    it("should format timestamp to Amharic date", () => {
      // July 15, 2024 (UTC)
      const timestamp = new Date("2024-07-15T00:00:00Z").getTime();
      expect(formatDateAm(timestamp)).toBe("15 ሐምሌ 2024");
    });

    it("should format January date correctly", () => {
      const timestamp = new Date("2024-01-05T00:00:00Z").getTime();
      expect(formatDateAm(timestamp)).toBe("5 ጃንዋሪ 2024");
    });

    it("should format December date correctly", () => {
      const timestamp = new Date("2024-12-25T00:00:00Z").getTime();
      expect(formatDateAm(timestamp)).toBe("25 ታሕሳስ 2024");
    });

    it("should handle null/undefined as empty string", () => {
      expect(formatDateAm(null as any)).toBe("");
      expect(formatDateAm(undefined as any)).toBe("");
    });

    it("should handle NaN as empty string", () => {
      expect(formatDateAm(NaN)).toBe("");
    });

    it("should handle zero timestamp as empty string", () => {
      expect(formatDateAm(0)).toBe("");
    });

    it("should handle negative timestamp as empty string", () => {
      expect(formatDateAm(-1000)).toBe("");
    });

    it("should handle very old dates", () => {
      // 1970-01-01 (Unix epoch)
      const timestamp = new Date("1970-01-01T00:00:00Z").getTime();
      const result = formatDateAm(timestamp);
      expect(result).toContain("ጃንዋሪ");
      expect(result).toContain("1970");
    });
  });

  describe("formatDateEn", () => {
    it("should format timestamp to English date", () => {
      // July 15, 2024 (UTC)
      const timestamp = new Date("2024-07-15T00:00:00Z").getTime();
      expect(formatDateEn(timestamp)).toBe("July 15, 2024");
    });

    it("should format January date correctly", () => {
      const timestamp = new Date("2024-01-05T00:00:00Z").getTime();
      expect(formatDateEn(timestamp)).toBe("January 5, 2024");
    });

    it("should format December date correctly", () => {
      const timestamp = new Date("2024-12-25T00:00:00Z").getTime();
      expect(formatDateEn(timestamp)).toBe("December 25, 2024");
    });

    it("should handle null/undefined as empty string", () => {
      expect(formatDateEn(null as any)).toBe("");
      expect(formatDateEn(undefined as any)).toBe("");
    });

    it("should handle NaN as empty string", () => {
      expect(formatDateEn(NaN)).toBe("");
    });

    it("should handle zero timestamp as empty string", () => {
      expect(formatDateEn(0)).toBe("");
    });

    it("should handle negative timestamp as empty string", () => {
      expect(formatDateEn(-1000)).toBe("");
    });

    it("should handle very old dates", () => {
      // 1970-01-01 (Unix epoch)
      const timestamp = new Date("1970-01-01T00:00:00Z").getTime();
      const result = formatDateEn(timestamp);
      expect(result).toContain("January");
      expect(result).toContain("1970");
    });
  });

  describe("Integration: Real reminder message rendering", () => {
    it("should render complete Amharic reminder with all variables", () => {
      const balance = 5000;
      const daysHeld = 3;
      const dueDate = new Date("2024-08-20").getTime();

      const variables = {
        NAME: "አሊ ሙሮ",
        BALANCE: formatCurrencyAm(balance),
        DUEDATE: formatDateAm(dueDate),
        DAYSHELD: formatDayCountAm(daysHeld),
      };

      const result = renderTemplate(REMINDER_MESSAGE_TEMPLATES.am.reminder, variables);

      expect(result).toContain("አሊ ሙሮ");
      expect(result).toContain("5,000.00 ብር");
      expect(result).toContain("20 ሐምሌ 2024");
      expect(result).toContain("3 ቀን");
    });

    it("should render complete English reminder with all variables", () => {
      const balance = 5000;
      const daysHeld = 3;
      const dueDate = new Date("2024-08-20").getTime();

      const variables = {
        NAME: "Alice Moore",
        BALANCE: formatCurrencyEn(balance),
        DUEDATE: formatDateEn(dueDate),
        DAYSHELD: formatDayCountEn(daysHeld),
      };

      const result = renderTemplate(REMINDER_MESSAGE_TEMPLATES.en.reminder, variables);

      expect(result).toContain("Alice Moore");
      expect(result).toContain("5,000.00 ETB");
      expect(result).toContain("August 20, 2024");
      expect(result).toContain("3 days");
    });

    it("should render reminder without due date in Amharic", () => {
      const balance = 2500;
      const daysHeld = 7;

      const variables = {
        NAME: "አብርሃም",
        BALANCE: formatCurrencyAm(balance),
        DAYSHELD: formatDayCountAm(daysHeld),
      };

      const result = renderTemplate(
        REMINDER_MESSAGE_TEMPLATES.am.reminderNoDueDate,
        variables
      );

      expect(result).toContain("አብርሃም");
      expect(result).toContain("2,500.00 ብር");
      expect(result).toContain("7 ቀን");
    });

    it("should render reminder without due date in English", () => {
      const balance = 2500;
      const daysHeld = 7;

      const variables = {
        NAME: "Abraham",
        BALANCE: formatCurrencyEn(balance),
        DAYSHELD: formatDayCountEn(daysHeld),
      };

      const result = renderTemplate(
        REMINDER_MESSAGE_TEMPLATES.en.reminderNoDueDate,
        variables
      );

      expect(result).toContain("Abraham");
      expect(result).toContain("2,500.00 ETB");
      expect(result).toContain("7 days");
    });

    it("should handle zero balance gracefully", () => {
      const variables = {
        NAME: "Test User",
        BALANCE: formatCurrencyEn(0),
        DAYSHELD: formatDayCountEn(0),
      };

      const result = renderTemplate(
        REMINDER_MESSAGE_TEMPLATES.en.reminderNoDueDate,
        variables
      );

      expect(result).toContain("Test User");
      expect(result).toContain("0.00 ETB");
      expect(result).toContain("0 days");
    });

    it("should handle very large balances", () => {
      const variables = {
        NAME: "Rich Customer",
        BALANCE: formatCurrencyEn(999999.99),
        DUEDATE: formatDateEn(new Date("2024-12-31").getTime()),
        DAYSHELD: formatDayCountEn(60),
      };

      const result = renderTemplate(REMINDER_MESSAGE_TEMPLATES.en.reminder, variables);

      expect(result).toContain("999,999.99 ETB");
      expect(result).toContain("60 days");
    });

    it("should maintain UTF-8 integrity with Amharic text", () => {
      const amharicName = "ተስ ሠብኋት ልሙ";
      const variables = {
        NAME: amharicName,
        BALANCE: formatCurrencyAm(1234),
        DAYSHELD: formatDayCountAm(2),
      };

      const result = renderTemplate(
        REMINDER_MESSAGE_TEMPLATES.am.reminderNoDueDate,
        variables
      );

      expect(result).toContain(amharicName);
      expect(result).toContain("1,234.00 ብር");
    });
  });

  describe("Edge cases and robustness", () => {
    it("should handle very old timestamps without crashing", () => {
      const result = formatDateEn(1);
      expect(typeof result).toBe("string");
    });

    it("should handle future timestamps", () => {
      const futureDate = new Date("2099-12-31T23:59:59Z").getTime();
      const result = formatDateEn(futureDate);
      expect(result).toContain("2099");
      expect(result).toContain("December");
    });

    it("should handle string coercion in renderTemplate", () => {
      const template = "Value: {{VAL}}";
      const result = renderTemplate(template, { VAL: 123 as any });
      expect(result).toBe("Value: 123");
    });

    it("should handle decimal currency rounding", () => {
      // Test that toLocaleString properly handles decimals
      const result = formatCurrencyEn(100.999);
      expect(result).toContain("100.99");
    });

    it("should handle day count with decimals correctly", () => {
      // Ensure flooring works
      expect(formatDayCountEn(3.9)).toBe("3 days");
      expect(formatDayCountEn(3.1)).toBe("3 days");
      expect(formatDayCountEn(1.99)).toBe("1 day");
    });
  });
});
