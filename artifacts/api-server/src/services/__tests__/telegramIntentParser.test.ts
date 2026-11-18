/**
 * @vitest-environment node
 *
 * Gate D — the reminder pipeline must never crash silently.
 *
 * The webhook hands whatever the customer typed to `parseTelegramIntent` and
 * then routes on `intent`. Two paths used to be able to take the whole handler
 * down (or answer nothing at all): a message that arrives with no text
 * (empty/undefined — e.g. a Telegram update without a text field) and the
 * catch-all "unknown" branch. Both are now pinned here: parse must always
 * return a well-formed intent, and "unknown" must carry the raw text back so
 * the caller can decide to answer instead of throwing.
 */
import { describe, it, expect } from "vitest";
import { parseTelegramIntent } from "../telegramIntentParser.js";
import type { TelegramIntent } from "../telegramIntentParser.js";

describe("parseTelegramIntent — no-argument / empty message", () => {
  const emptyish: Array<[string, () => TelegramIntent]> = [
    ["no argument at all", () => parseTelegramIntent()],
    ["undefined", () => parseTelegramIntent(undefined as unknown as string)],
    ["null", () => parseTelegramIntent(null as unknown as string)],
    ["empty string", () => parseTelegramIntent("")],
    ["only whitespace", () => parseTelegramIntent("   \n\t  ")],
  ];

  for (const [label, run] of emptyish) {
    it(`does not throw on ${label} and returns unknown with empty text`, () => {
      expect(run).not.toThrow();
      expect(run()).toEqual({ intent: "unknown", text: "" });
    });
  }

  it("coerces non-string payloads instead of crashing", () => {
    expect(parseTelegramIntent(123 as unknown as string)).toEqual({
      intent: "unknown",
      text: "123",
    });
    expect(() => parseTelegramIntent({} as unknown as string)).not.toThrow();
  });
});

describe("parseTelegramIntent — unknown branch", () => {
  it("returns the raw message untouched on the catch-all branch", () => {
    const text = "Salam, how are you?";
    expect(parseTelegramIntent(text, "am")).toEqual({ intent: "unknown", text });
  });

  it("keeps emoji-only messages on the catch-all branch", () => {
    expect(parseTelegramIntent("🤑🤑", "en")).toEqual({
      intent: "unknown",
      text: "🤑🤑",
    });
  });

  it("does not treat a bare greeting as a promise or payment", () => {
    const intent = parseTelegramIntent("hello", "en");
    expect(intent.intent).toBe("unknown");
  });
});

describe("parseTelegramIntent — the intents the webhook routes on", () => {
  it("recognises a 4-character collection code", () => {
    expect(parseTelegramIntent("a7k2")).toEqual({ intent: "code", code: "A7K2" });
  });

  it("orders command words ahead of the code matcher", () => {
    // "help" and "paid" are both valid 4-character codes alphabet-wise, so the
    // code matcher must stay behind the command words or a customer asking for
    // help gets an empty reply.
    expect(parseTelegramIntent("help").intent).toBe("help");
    expect(parseTelegramIntent("paid").intent).toBe("paid");
    expect(parseTelegramIntent("HELP").intent).toBe("help");
  });

  it("recognises balance requests in both languages", () => {
    expect(parseTelegramIntent("/balance").intent).toBe("balance");
    expect(parseTelegramIntent("how much do I owe").intent).toBe("balance");
    expect(parseTelegramIntent("ቀሪ").intent).toBe("balance");
  });

  it("recognises help in both languages", () => {
    expect(parseTelegramIntent("/help").intent).toBe("help");
    expect(parseTelegramIntent("help").intent).toBe("help");
  });

  it("recognises a payment report with and without an amount", () => {
    const withAmount = parseTelegramIntent("paid 200");
    expect(withAmount.intent).toBe("paid");
    expect(withAmount.intent === "paid" && withAmount.amount).toBe(200);

    const withoutAmount = parseTelegramIntent("I paid already");
    expect(withoutAmount.intent).toBe("paid");
  });

  it("recognises a promise and resolves a future date", () => {
    const now = Date.now();
    const intent = parseTelegramIntent("I will pay on friday");
    expect(intent.intent).toBe("promise");
    if (intent.intent === "promise") {
      expect(intent.dateTs).toBeGreaterThan(now);
      expect(intent.note).toContain("friday");
    }
  });

  it("recognises an Amharic weekday promise", () => {
    const intent = parseTelegramIntent("አርብ");
    expect(intent.intent).toBe("promise");
    if (intent.intent === "promise") expect(intent.dateTs).toBeGreaterThan(Date.now());
  });
});
