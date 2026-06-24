/**
 * Message Templates and Localization Utilities
 *
 * Centralized message templates and localization helpers for Telegram reminders.
 * Supports Amharic (am) and English (en) with cultural formatting.
 */

/**
 * Amharic month names (ጃንዋሪ, ሕዳር, etc.)
 */
export const MONTHS_AMHARIC = [
  "ጃንዋሪ",   // January
  "ሕዳር",     // February
  "ማርች",    // March
  "ሚያዝያ",    // April
  "ግንቦት",    // May
  "ሰኞ",      // June
  "ሐምሌ",     // July
  "ነሐሴ",     // August
  "መስከረም",   // September
  "ጠቅምት",    // October
  "ሕዳር",     // November
  "ታሕሳስ",    // December
];

/**
 * English month names
 */
export const MONTHS_ENGLISH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Currency suffixes by language
 */
export const CURRENCY_SUFFIX = {
  am: "ብር",  // Amharic: ብር (Birr)
  en: "ETB",  // English: ETB (Ethiopian Birr)
};

/**
 * Plural forms for day/month terms
 */
export const PLURAL_FORMS = {
  am: {
    day: "ቀን",      // ቀን (day) - same for singular and plural in Amharic
    month: "ወር",     // ወር (month) - same for singular and plural
  },
  en: {
    day: (count: number) => (count === 1 ? "day" : "days"),
    month: (count: number) => (count === 1 ? "month" : "months"),
  },
};

/**
 * Reminder message templates
 */
export const REMINDER_MESSAGE_TEMPLATES = {
  am: {
    reminder: `🏪 [Shop]\n👤 {{NAME}}\n💰 {{BALANCE}}\n📅 {{DUEDATE}}\n⏰ {{DAYSHELD}} ያለፈ\n\nType /balance ወይም /paid`,
    reminderNoDueDate: `🏪 [Shop]\n👤 {{NAME}}\n💰 {{BALANCE}}\n⏰ {{DAYSHELD}} ቀን ያለፈ\n\nType /balance ወይም /paid`,
  },
  en: {
    reminder: `🏪 [Shop]\n👤 {{NAME}}\n💰 {{BALANCE}}\n📅 {{DUEDATE}}\n⏰ {{DAYSHELD}} held\n\nType /balance or /paid`,
    reminderNoDueDate: `🏪 [Shop]\n👤 {{NAME}}\n💰 {{BALANCE}}\n⏰ {{DAYSHELD}} held\n\nType /balance or /paid`,
  },
};

/**
 * Render a template by replacing {{PLACEHOLDER}} with values
 * @param template The template string with {{PLACEHOLDER}} markers
 * @param variables Object with key-value pairs for replacement
 * @returns Rendered string with placeholders replaced
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  if (!template) return "";

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      // Leave placeholder as-is if variable not provided
      return match;
    }
    return String(value);
  });
}

/**
 * Format currency in Amharic (ETB/ብር)
 * @param amount Numeric amount
 * @returns Formatted string like "1,234.56 ብር"
 */
export function formatCurrencyAm(amount: number): string {
  if (amount === null || amount === undefined) {
    return `0 ${CURRENCY_SUFFIX.am}`;
  }
  if (typeof amount !== "number" || isNaN(amount)) {
    return `0 ${CURRENCY_SUFFIX.am}`;
  }
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SUFFIX.am}`;
}

/**
 * Format currency in English (ETB)
 * @param amount Numeric amount
 * @returns Formatted string like "1,234.56 ETB"
 */
export function formatCurrencyEn(amount: number): string {
  if (amount === null || amount === undefined) {
    return `0 ${CURRENCY_SUFFIX.en}`;
  }
  if (typeof amount !== "number" || isNaN(amount)) {
    return `0 ${CURRENCY_SUFFIX.en}`;
  }
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SUFFIX.en}`;
}

/**
 * Format day count in Amharic with plural handling
 * @param days Number of days
 * @returns Formatted string like "5 ቀን ያለፈ" (5 days held)
 */
export function formatDayCountAm(days: number): string {
  if (days === null || days === undefined) {
    days = 0;
  }
  if (typeof days !== "number" || isNaN(days)) {
    days = 0;
  }
  days = Math.max(0, Math.floor(days));
  return `${days} ${PLURAL_FORMS.am.day}`;
}

/**
 * Format day count in English with plural handling
 * @param days Number of days
 * @returns Formatted string like "5 days held"
 */
export function formatDayCountEn(days: number): string {
  if (days === null || days === undefined) {
    days = 0;
  }
  if (typeof days !== "number" || isNaN(days)) {
    days = 0;
  }
  days = Math.max(0, Math.floor(days));
  const unit = PLURAL_FORMS.en.day(days);
  return `${days} ${unit}`;
}

/**
 * Format timestamp to date string in Amharic
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted date string like "15 ሐምሌ 2024"
 */
export function formatDateAm(timestamp: number): string {
  if (timestamp === null || timestamp === undefined) {
    return "";
  }
  if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp <= 0) {
    return "";
  }

  try {
    const date = new Date(timestamp);
    const day = date.getDate();
    const month = MONTHS_AMHARIC[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return "";
  }
}

/**
 * Format timestamp to date string in English
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted date string like "July 15, 2024"
 */
export function formatDateEn(timestamp: number): string {
  if (timestamp === null || timestamp === undefined) {
    return "";
  }
  if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp <= 0) {
    return "";
  }

  try {
    const date = new Date(timestamp);
    const day = date.getDate();
    const month = MONTHS_ENGLISH[date.getMonth()];
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
  } catch {
    return "";
  }
}
