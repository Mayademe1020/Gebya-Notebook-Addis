/**
 * telegramIntentParser.ts — Parses customer Telegram messages into structured
 * intents so the bot can respond conversationally ("I'll pay Friday", "paid 200")
 * without requiring the customer to learn slash commands.
 *
 * Pure, side-effect-free, fully unit-testable. No DB, no network.
 */

export type Lang = "am" | "en";

export type TelegramIntent =
  | { intent: "code"; code: string }
  | { intent: "balance" }
  | { intent: "help" }
  | { intent: "promise"; dateTs: number; note?: string }
  | { intent: "paid"; amount?: number }
  | { intent: "unknown"; text: string };

const DAY_MS = 1000 * 60 * 60 * 24;

// Amharic weekday names → JS getDay() (0 = Sunday)
const AM_WEEKDAYS: Record<string, number> = {
  "ሰኞ": 1, "ማክሰኞ": 2, "ማክሰን": 2, "ረቡዕ": 3, "ሮብ": 3,
  "ሐሙስ": 4, "ሐምስ": 4, "ዓርብ": 5, "አርብ": 5, "ቅዳሜ": 6,
  "እሑድ": 0, "እሁድ": 0,
};

const EN_WEEKDAYS: Record<string, number> = {
  "sunday": 0, "sun": 0, "monday": 1, "mon": 1,
  "tuesday": 2, "tue": 2, "tues": 2, "wednesday": 3, "wed": 3,
  "thursday": 4, "thu": 4, "thur": 4, "friday": 5, "fri": 5,
  "saturday": 6, "sat": 6,
};

/** Normalize a message: lowercase, strip punctuation, collapse spaces. */
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[.,!?;:'"]/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** End-of-day timestamp (23:59:59.999) for a given date. */
function endOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Next occurrence of a Gregorian weekday (0=Sun..6=Sat), at EOD. Future only. */
function nextWeekdayEod(day: number): number {
  const now = new Date();
  const today = now.getDay();
  let diff = day - today;
  if (diff < 0) diff += 7;
  if (diff === 0) diff = 7; // "this Friday" → next Friday, not today
  const target = new Date(now);
  target.setDate(target.getDate() + diff);
  return endOfDay(target);
}
/** Resolve a promise date from "today/tomorrow/next week/<weekday>" keywords. */
function resolvePromiseDate(textLower: string): number | null {
  const n = normalize(textLower);

  if (n.includes("ዛሬ") || n.includes("today")) {
    return endOfDay(new Date());
  }
  if (n.includes("ነገ") || n.includes("tomorrow") || n.includes("tmrw")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return endOfDay(tomorrow);
  }
  if (n.includes("ሳም") || n.includes("next week")) {
    const week = new Date();
    week.setDate(week.getDate() + 7);
    return endOfDay(week);
  }

  for (const [word, day] of Object.entries(AM_WEEKDAYS)) {
    if (n.includes(word)) return nextWeekdayEod(day);
  }
  for (const [word, day] of Object.entries(EN_WEEKDAYS)) {
    if (n.includes(word)) return nextWeekdayEod(day);
  }

  return null;
}

/** Extract the first non-negative number from a message (for "paid 200"). */
function extractAmount(textLower: string): number | null {
  const match = textLower.match(/\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const num = Number(match[0].replace(",", ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Parse an incoming customer message into a structured intent.
 * Language detection is passed in (from the customer's Telegram client code).
 */
export function parseTelegramIntent(text: string, _lang: Lang = "en"): TelegramIntent {
  const raw = String(text || "").trim();
  if (!raw) return { intent: "unknown", text: raw };

  const lower = raw.toLowerCase();
  const first = lower.split(/\s+/)[0] || "";

  // 1. Slash commands + natural-language command words.
  //    These run BEFORE the 4-character code check on purpose: "help" and
  //    "paid" are themselves 4 characters from the code alphabet, so a code
  //    matcher in front of them swallowed the two most likely customer
  //    messages and answered with an empty reply.
  if (first === "/balance" || first === "balance" || first === "ሒሳብ" || first === "ሒሳብዎ"
      || lower.includes("/balance") || lower.includes("how much") || lower.includes("ቀሪ")) {
    return { intent: "balance" };
  }
  if (first === "/help" || first === "help" || first === "ረዳት" || first === "ረዲት"
      || lower.includes("እንዴት")) {
    return { intent: "help" };
  }

  // 2. Promise — customer says when they'll pay
  const holdsPromiseWord =
    lower.includes("ከፍላለሁ") || lower.includes("ከፍል") || lower.includes("ከፍያለሁ") ||
    lower.includes("መክፈል") || lower.includes("ቀን") || lower.includes("ከሳም") ||
    lower.includes("pay") || lower.includes("payment") || lower.includes("promise") ||
    /አርብ|ሰኞ|ማክሰኞ|ረቡዕ|ሐሙስ|ዓርብ|ቅዳሜ|እሑድ|እሁድ|friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|next week/.test(lower);

  if (holdsPromiseWord) {
    const dateTs = resolvePromiseDate(lower);
    if (dateTs) {
      return { intent: "promise", dateTs, note: raw.slice(0, 140) };
    }
  }

  // 3. Paid — customer reports a payment
  if (first === "/paid" || lower.includes("ከፍያለሁ") || lower.includes("ከፍያለሁ") ||
      lower.includes("paid")) {
    return { intent: "paid", amount: extractAmount(lower) ?? undefined };
  }

  // 4. One-time code: exactly 4 chars from the unambiguous alphabet
  //    Last of the positive matches: a real code is a bare 4-character token,
  //    and any word a customer might mean as a command has already been
  //    claimed above. "ሒሳብ" and the slash commands never reach here.
  if (/^[A-Z0-9]{4}$/i.test(raw)) {
    return { intent: "code", code: raw.toUpperCase() };
  }

  return { intent: "unknown", text: raw };
}