/**
 * ReminderMessageBuilder Service
 * 
 * Builds localized reminder messages for Amharic and English with balance,
 * due date, and days held information. All functions are pure (no side effects).
 */

import type { ReminderLanguage } from "../types/reminders.js";

/**
 * Format a currency amount as a localized string with proper suffix and decimals
 * 
 * @param amount - The amount in ETB
 * @param language - 'am' for Amharic or 'en' for English
 * @returns Formatted string like "1,234.56 ETB" or "1,234.56 ብር"
 * 
 * Edge cases handled:
 * - Zero amount
 * - Very large numbers (millions)
 * - Decimal precision (always 2 decimals)
 * - Negative amounts (should not occur for reminders, but handled gracefully)
 */
export function formatCurrency(amount: number, language: ReminderLanguage): string {
  // Ensure we have a valid number
  if (!Number.isFinite(amount)) {
    return language === "am" ? "ያልታወቀ ብር" : "Unknown ETB";
  }

  // Format with 2 decimal places and thousand separators
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Handle negative amounts
  const prefix = amount < 0 ? "-" : "";
  const suffix = language === "am" ? "ብር" : "ETB";

  return `${prefix}${formatted} ${suffix}`;
}

/**
 * Format a Unix timestamp (in milliseconds) to a human-readable date
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param language - 'am' for Amharic or 'en' for English
 * @returns Formatted date string
 * 
 * English: "June 24, 2026"
 * Amharic: "ሰኞ ሰኞ 24, 2026" (simplified version without full localization)
 */
export function formatDate(timestamp: number, language: ReminderLanguage): string {
  // Validate timestamp
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return language === "am" ? "ያልታወቀ ቀን" : "Unknown date";
  }

  try {
    const date = new Date(timestamp);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return language === "am" ? "ያልታወቀ ቀን" : "Unknown date";
    }

    if (language === "am") {
      // For Amharic, use Ethiopian calendar-friendly format
      // Day names in Amharic
      const dayNames = [
        "ሰኞ", "ማክሮ", "ሮብ", "ሐሙስ", "ዓርብ", "ቅዳሜ", "እሁድ"
      ];
      // Month names in Amharic
      const monthNames = [
        "ጃንዋሪ", "ፌብርዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን",
        "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"
      ];

      const dayOfWeek = dayNames[date.getDay()];
      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();

      return `${dayOfWeek} ${month} ${day}, ${year}`;
    }

    // English format
    try {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      // Fallback for very old dates that toLocaleDateString cannot handle
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const month = monthNames[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    }
  } catch {
    return language === "am" ? "ያልታወቀ ቀን" : "Unknown date";
  }
}

/**
 * Format a day count with proper singular/plural handling
 * 
 * @param days - Number of days
 * @param language - 'am' for Amharic or 'en' for English
 * @returns Formatted string like "1 day" or "2 days" (English) or "1 ቀን" or "2 ቀን" (Amharic)
 * 
 * Edge cases:
 * - Zero days
 * - Single day (singular)
 * - Multiple days (plural)
 * - Very large numbers
 */
export function formatDayCount(days: number, language: ReminderLanguage): string {
  // Validate input
  if (!Number.isFinite(days) || days < 0) {
    return language === "am" ? "ያልታወቀ ቀናት" : "Unknown days";
  }

  const roundedDays = Math.floor(days);

  if (language === "am") {
    // Amharic: singular vs plural
    if (roundedDays === 0) {
      return "0 ቀን";
    }
    if (roundedDays === 1) {
      return "1 ቀን";
    }
    // Plural form for 2+ (Amharic uses same form for 2+)
    return `${roundedDays} ቀን`;
  }

  // English: singular vs plural
  if (roundedDays === 1) {
    return "1 day";
  }
  return `${roundedDays} days`;
}

/**
 * Build a localized reminder message with balance, due date, and days held
 * 
 * @param language - 'am' for Amharic or 'en' for English
 * @param customerName - The customer's display name
 * @param balance - Outstanding balance in ETB (should be > 0 for reminders)
 * @param dueDate - Unix timestamp (ms) of when payment is due, or null if no due date
 * @param daysHeld - How many days the customer has owed this balance
 * @returns Formatted reminder message with emojis and localized text
 * 
 * Message includes:
 * - Shop emoji (🏪) + Customer emoji (👤)
 * - Balance with currency formatting (💰)
 * - Due date (if provided) or days held (📅)
 * - Call-to-action: /balance or /paid
 * - Culturally appropriate tone
 * 
 * Edge cases handled:
 * - Very long customer names (truncated gracefully)
 * - Zero or negative balance (returns friendly message, though reminders shouldn't send)
 * - Null/undefined inputs (validated before use)
 * - Very old debts (100+ days)
 */
export function buildReminderMessage(
  language: ReminderLanguage,
  customerName: string,
  balance: number,
  dueDate: number | null,
  daysHeld: number,
): string {
  // Validate inputs
  const validName = String(customerName || "Customer").slice(0, 50);
  const validBalance = Number.isFinite(balance) ? balance : 0;
  const validDaysHeld = Number.isFinite(daysHeld) && daysHeld >= 0 ? Math.floor(daysHeld) : 0;

  const formattedBalance = formatCurrency(validBalance, language);
  const formattedDaysHeld = formatDayCount(validDaysHeld, language);

  if (language === "am") {
    // Amharic message template
    const lines = [
      "🏪 ጌባያ",
      "",
      `👤 ${validName}`,
      `💰 ቀሪ ሂሳብ: ${formattedBalance}`,
    ];

    // Add due date or days held
    if (dueDate !== null && Number.isFinite(dueDate) && dueDate > 0) {
      const formattedDate = formatDate(dueDate, "am");
      lines.push(`📅 ጊዜ ያበቃል: ${formattedDate}`);
    } else {
      lines.push(`📅 ጊዜ: ${formattedDaysHeld}`);
    }

    lines.push("");
    lines.push("ክፍያ ከሚያስቀምጡ በኋላ /balance ይተይቡ።");
    lines.push("ወይም ክፍያ ከከፈሉ /paid ይተይቡ።");

    return lines.join("\n");
  }

  // English message template
  const lines = [
    "🏪 Gebya",
    "",
    `👤 ${validName}`,
    `💰 Balance due: ${formattedBalance}`,
  ];

  // Add due date or days held
  if (dueDate !== null && Number.isFinite(dueDate) && dueDate > 0) {
    const formattedDate = formatDate(dueDate, "en");
    lines.push(`📅 Due date: ${formattedDate}`);
  } else {
    lines.push(`📅 Days held: ${formattedDaysHeld}`);
  }

  lines.push("");
  lines.push("Type /balance to check your account.");
  lines.push("Type /paid if you've sent payment.");

  return lines.join("\n");
}
