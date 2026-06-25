import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  formatTelegramSessionState,
  getSessionByChatId,
  getTelegramSessionStoreStatus,
  getTelegramLinkSession,
  linkTelegramChatToSession,
  storeTelegramDelivery,
  syncTelegramCustomerState,
  upsertTelegramLinkSession,
  type TelegramLinkSession,
} from "../services/telegramStore.js";
import {
  getTelegramBotUsername,
  isTelegramBotConfigured,
  sendTelegramTextMessage,
} from "../services/telegramBotService.js";

const router = Router();

const linkSessionSchema = z.object({
  token: z.string().min(6),
  customerId: z.union([z.string(), z.number()]),
  customerName: z.string().min(1),
  shopName: z.string().min(1),
  currentBalance: z.number().optional(),
  updatesEnabled: z.boolean().optional(),
});

const syncSchema = z.object({
  token: z.string().min(6),
  customerName: z.string().optional(),
  shopName: z.string().optional(),
  currentBalance: z.number().optional(),
  updatesEnabled: z.boolean().optional(),
  telegramUsername: z.string().nullable().optional(),
  chatId: z.string().nullable().optional(),
});

const sendSchema = z.object({
  token: z.string().min(6),
  currentBalance: z.number(),
  message: z.string().min(1),
  reference: z.string().min(1),
});

function getPublicApiBase(req: Request) {
  const configured = process.env.GEBYA_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers.host;
  return host ? `${proto}://${host}` : "";
}

function createDeepLink(token: string) {
  const botUsername = getTelegramBotUsername();
  if (!botUsername) return null;
  // Strip any leading '@' — TELEGRAM_BOT_USERNAME may be set as '@shopnotebookbot'
  // but a t.me URL must not contain '@' or it won't open the bot.
  const handle = botUsername.replace(/^@+/, '');
  return `https://t.me/${handle}?start=${encodeURIComponent(token)}`;
}

// Phase 2 + Q3 (bilingual): friendly replies that auto-detect Amharic vs
// English from the user's Telegram client language_code. We never force a
// language — we just match what their Telegram app is set to.

type Lang = "am" | "en";

function pickLang(code?: string | null): Lang {
  // Telegram sends a 2-letter language code from the user's app settings
  // (e.g., "am" for Amharic, "en" for English, "fr-FR" for French).
  // We currently support am + en. Anything else falls back to English.
  return code?.toLowerCase().startsWith("am") ? "am" : "en";
}

function buildStartReply(
  session: TelegramLinkSession | null,
  existingSession: TelegramLinkSession | null,
  hadToken: boolean,
  lang: Lang,
) {
  // Case A — they came from a fresh shop-generated link and got linked
  if (session && hadToken) {
    if (lang === "am") {
      return [
        `🏪 ${session.shopName}`,
        "",
        `✓ ተገናኝተዋል! እንደ ${session.customerName} ተመዝግበዋል።`,
        "የቀሪ ሂሳብ ማስታወሻዎችን እና አስታዋሾችን እዚህ እልክልዎታለሁ።",
        "",
        "የቀሪ ሂሳብዎን ለመፈተሽ /balance ይተይቡ።",
        "ሌላ ምን ማድረግ እንደምችል ለማየት /help ይተይቡ።",
      ].join("\n");
    }
    return [
      `🏪 ${session.shopName}`,
      "",
      `✓ Linked! You're connected as ${session.customerName}.`,
      "I'll send you balance updates and reminders here.",
      "",
      "Type /balance any time to check your latest balance.",
      "Type /help to see what else I can do.",
    ].join("\n");
  }

  // Case B — they typed /start with an invalid/expired token
  if (hadToken && !session) {
    if (lang === "am") {
      return [
        "ጌባያ",
        "",
        "ይህ አገናኝ ጊዜው አልፎበታል።",
        "ከሱቅ ባለቤትዎ አዲስ የቴሌግራም አገናኝ ይጠይቁ።",
        "",
        "ተጨማሪ መረጃ ከፈለጉ /help ይተይቡ።",
      ].join("\n");
    }
    return [
      "Gebya",
      "",
      "That link is no longer valid.",
      "Ask your shop owner to share a fresh Telegram link.",
      "",
      "Type /help if you need more info.",
    ].join("\n");
  }

  // Case C — they're already linked from a previous /start
  if (existingSession) {
    if (lang === "am") {
      return [
        `🏪 ${existingSession.shopName}`,
        "",
        `👋 በደህና ተመለሱ፣ ${existingSession.customerName}።`,
        "አሁንም ተገናኝተዋል። ማስታወሻዎችን ማላክን እቀጥላለሁ።",
        "",
        "የቀሪ ሂሳብዎን ለመፈተሽ /balance ይተይቡ።",
        "ሌላ ምን ማድረግ እንደምችል ለማየት /help ይተይቡ።",
      ].join("\n");
    }
    return [
      `🏪 ${existingSession.shopName}`,
      "",
      `👋 Welcome back, ${existingSession.customerName}.`,
      "You're still linked. I'll keep sending you updates.",
      "",
      "Type /balance to check your latest balance.",
      "Type /help to see what else I can do.",
    ].join("\n");
  }

  // Case D — plain /start with no token and no prior link → friendly intro
  if (lang === "am") {
    return [
      "👋 ወደ ጌባያ እንኳን ደህና መጡ!",
      "",
      "እኔ የሱቅ ረዳት ቦት ነኝ። የሱቅ ባለቤቶች የደንበኞቻቸውን ዱቤ",
      "(ብድር) ለመከታተል ጌባያን ይጠቀማሉ — እኔ የቀሪ ሂሳብ",
      "ማስታወሻዎችን እና ወዳጃዊ አስታዋሾችን እንዲልኩልዎ እረዳቸዋለሁ።",
      "",
      "ማስታወሻዎችን መቀበል ለመጀመር፣ የጌባያ አገናኛቸውን",
      "እንዲያጋሩልዎ ከሱቅ ባለቤትዎ ይጠይቁ።",
      "",
      "ተጨማሪ ለማወቅ /help ይተይቡ።",
    ].join("\n");
  }
  return [
    "👋 Welcome to Gebya!",
    "",
    "I'm a shop assistant bot. Shop owners use Gebya to track dubie",
    "(credit) for their customers — I help them send you balance",
    "updates and friendly reminders.",
    "",
    "To start receiving updates, ask your shop owner to share their",
    "Gebya link with you. When you tap it, I'll connect you to their shop.",
    "",
    "Type /help to learn more.",
  ].join("\n");
}

function buildBalanceReply(
  session: TelegramLinkSession | null,
  lang: Lang,
) {
  if (!session) {
    if (lang === "am") {
      return [
        "ጌባያ",
        "",
        "ገና ከሱቅ ጋር አልተገናኙም።",
        "የጌባያ አገናኛቸውን እንዲያጋሩልዎ ከሱቅ ባለቤትዎ ይጠይቁ።",
        "",
        "ተጨማሪ መረጃ ለማግኘት /help ይተይቡ።",
      ].join("\n");
    }
    return [
      "Gebya",
      "",
      "You're not linked to a shop yet.",
      "Ask your shop owner to share their Gebya link with you.",
      "",
      "Type /help for more info.",
    ].join("\n");
  }

  if (lang === "am") {
    return [
      `🏪 ${session.shopName}`,
      "",
      `👤 ${session.customerName}`,
      `💰 የአሁኑ ቀሪ ሂሳብ: ${session.currentBalance.toFixed(2)} ብር`,
      session.lastReference ? `🔢 የመጨረሻ ማጣቀሻ: ${session.lastReference}` : null,
      "",
      "ክፍያ ከከፈሉ /paid ይተይቡ — ሱቁን አሳውቃለሁ።",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `🏪 ${session.shopName}`,
    "",
    `👤 ${session.customerName}`,
    `💰 Current balance: ${session.currentBalance.toFixed(2)} ETB`,
    session.lastReference ? `🔢 Latest ref: ${session.lastReference}` : null,
    "",
    "Type /paid if you've sent payment — I'll let the shop know.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHelpReply(linked: boolean, lang: Lang) {
  if (lang === "am") {
    const lines = [
      "📒 ጌባያ ቦት · እንዴት እንደሚሰራ",
      "",
      "እኔ ጌባያን (የንግድ ማስታወሻ) ለሚጠቀሙ ሱቆች የደንበኛ ጎን ቦት ነኝ።",
      "የሱቅ ባለቤቶች የዱቤ / ብድር ማስታወሻዎችን እና አስታዋሾችን ለመላክ ይጠቀሙኛል።",
      "",
      "ትዕዛዞች:",
      "  /start — ከሱቅዎ ጋር መገናኘት ይጀምሩ",
      "  /balance — የአሁኑን ቀሪ ሂሳብዎን ይፈትሹ",
      "  /paid — ሱቁን እንደከፈሉ ይንገሩ",
      "  /help — ይህን መልዕክት አሳይ",
      "",
    ];
    if (!linked) {
      lines.push("ከ/start በላይ ትዕዛዞችን ለመጠቀም፣ የጌባያ አገናኛቸውን");
      lines.push("እንዲያጋሩልዎ ከሱቅ ባለቤትዎ ይጠይቁ። አገናኙን ይንኩ፣ ከዚያ Start ይንኩ።");
    } else {
      lines.push("አስቀድመው ተገናኝተዋል — አሁን /balance ይሞክሩ።");
    }
    return lines.join("\n");
  }
  const lines = [
    "📒 Gebya Bot · how it works",
    "",
    "I'm a customer-side bot for shops using Gebya (የንግድ ማስታወሻ).",
    "Shop owners use me to send dubie/credit updates and reminders.",
    "",
    "Commands:",
    "  /start — Begin linking with your shop",
    "  /balance — Check your current balance",
    "  /paid — Tell the shop you've paid",
    "  /help — Show this message",
    "",
  ];
  if (!linked) {
    lines.push("To use commands beyond /start, ask your shop owner to share");
    lines.push("their Gebya link with you. Tap the link, then tap Start.");
  } else {
    lines.push("You're already linked — try /balance now.");
  }
  return lines.join("\n");
}

function buildPaidReply(
  session: TelegramLinkSession | null,
  amount: string | null,
  lang: Lang,
) {
  if (!session) {
    if (lang === "am") {
      return [
        "ጌባያ",
        "",
        "ገና ከሱቅ ጋር አልተገናኙም፣ ስለዚህ ማንንም ማሳወቅ አልችልም።",
        "በቅድሚያ የጌባያ አገናኛቸውን እንዲያጋሩልዎ ከሱቅ ባለቤትዎ ይጠይቁ።",
      ].join("\n");
    }
    return [
      "Gebya",
      "",
      "You're not linked to a shop yet, so I can't notify anyone.",
      "Ask your shop owner to share their Gebya link with you first.",
    ].join("\n");
  }
  if (lang === "am") {
    const amountLineAm = amount
      ? `መጠን: ${amount}`
      : `በመዝገብ ላይ ያለ ቀሪ ሂሳብ: ${session.currentBalance.toFixed(2)} ብር`;
    return [
      `🏪 ${session.shopName}`,
      "",
      `✓ እናመሰግናለን፣ ${session.customerName} — ክፍያዎን አስቀምጫለሁ።`,
      amountLineAm,
      "",
      "የሱቅ ባለቤቱ በጌባያ መተግበሪያ ውስጥ ያረጋግጣል እና",
      "ቀሪ ሂሳብዎ ይዘምናል። በኋላ ለማረጋገጥ እንደገና /balance ይተይቡ።",
    ].join("\n");
  }
  const amountLine = amount
    ? `Amount: ${amount}`
    : `Current balance on file: ${session.currentBalance.toFixed(2)} ETB`;
  return [
    `🏪 ${session.shopName}`,
    "",
    `✓ Thanks, ${session.customerName} — I've noted your payment.`,
    amountLine,
    "",
    "The shop owner will confirm in their Gebya app and your balance",
    "will be updated. You can /balance again later to verify.",
  ].join("\n");
}

function buildFallbackReply(linked: boolean, lang: Lang) {
  if (lang === "am") {
    const lines = [
      "ያንን በትክክል አልገባኝም።",
      "",
      "ይሞክሩ:",
      "  /balance — ምን እንደተበደሩ ይፈትሹ",
      "  /paid — ሱቁን እንደከፈሉ ይንገሩ",
      "  /help — ሁሉንም ትዕዛዞች ይመልከቱ",
    ];
    if (!linked) {
      lines.push("");
      lines.push("ወይም የሱቅ ባለቤትዎ እንዲያገናኝዎት አገናኝ እንዲያጋሩ ይጠይቁ።");
    }
    return lines.join("\n");
  }
  const lines = [
    "I didn't quite understand that.",
    "",
    "Try:",
    "  /balance — check what you owe",
    "  /paid — tell the shop you've paid",
    "  /help — see all commands",
  ];
  if (!linked) {
    lines.push("");
    lines.push("Or ask your shop owner to share a link to connect you.");
  }
  return lines.join("\n");
}

router.get("/status", (_req: Request, res: Response) => {
  const store = getTelegramSessionStoreStatus();

  res.json({
    configured: isTelegramBotConfigured(),
    bot_username: getTelegramBotUsername() || null,
    linking_available: store.linkingAvailable,
    updates_available: isTelegramBotConfigured(),
    session_store: store.mode,
    session_persistent: store.persistent,
    warning: store.reason,
  });
});

router.post("/link-sessions", async (req: Request, res: Response) => {
  const store = getTelegramSessionStoreStatus();
  if (!store.linkingAvailable) {
    return res.status(503).json({
      error: store.reason || "Telegram linking is unavailable",
      session_store: store.mode,
    });
  }

  const parsed = linkSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid link session payload" });
  }

  const input = parsed.data;
  const session = await upsertTelegramLinkSession({
    token: input.token,
    customerId: String(input.customerId),
    customerName: input.customerName.trim(),
    shopName: input.shopName.trim(),
    currentBalance: input.currentBalance ?? 0,
    updatesEnabled: input.updatesEnabled ?? false,
  });
  const deepLink = createDeepLink(session.token);

  return res.json({
    token: session.token,
    state: formatTelegramSessionState(session),
    deep_link: deepLink,
    qr_value: deepLink,
    webhook_url: getPublicApiBase(req) ? `${getPublicApiBase(req)}/api/telegram/webhook` : null,
    bot_username: getTelegramBotUsername() || null,
    requested_at: session.requestedAt,
    linked_at: session.linkedAt,
    telegram_username: session.telegramUsername,
    chat_id: session.chatId,
    current_balance: session.currentBalance,
  });
});

router.get("/link-sessions/:token", async (req: Request, res: Response) => {
  const session = await getTelegramLinkSession(String(req.params.token || ""));
  if (!session) {
    return res.status(404).json({ error: "Link session not found" });
  }

  return res.json({
    token: session.token,
    state: formatTelegramSessionState(session),
    deep_link: createDeepLink(session.token),
    qr_value: createDeepLink(session.token),
    requested_at: session.requestedAt,
    linked_at: session.linkedAt,
    telegram_username: session.telegramUsername,
    chat_id: session.chatId,
    current_balance: session.currentBalance,
    last_reference: session.lastReference,
  });
});

router.post("/customers/sync", async (req: Request, res: Response) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid sync payload" });
  }

  const session = await syncTelegramCustomerState(parsed.data);
  if (!session) {
    return res.status(404).json({ error: "Customer link session not found" });
  }

  return res.json({
    token: session.token,
    state: formatTelegramSessionState(session),
    linked_at: session.linkedAt,
    chat_id: session.chatId,
    telegram_username: session.telegramUsername,
    current_balance: session.currentBalance,
  });
});

router.post("/send-ledger-update", async (req: Request, res: Response) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Telegram message payload" });
  }

  const input = parsed.data;
  const session = await getTelegramLinkSession(input.token);
  if (!session) {
    return res.status(404).json({ error: "Customer link session not found" });
  }

  await storeTelegramDelivery({
    token: input.token,
    currentBalance: input.currentBalance,
    message: input.message,
    reference: input.reference,
  });

  if (!session.chatId) {
    return res.json({
      delivered: false,
      delivery: "unlinked",
      state: formatTelegramSessionState(session),
    });
  }

  try {
    await sendTelegramTextMessage(session.chatId, input.message);
    return res.json({
      delivered: true,
      delivery: "bot",
      state: formatTelegramSessionState(await getTelegramLinkSession(input.token)),
    });
  } catch (error) {
    console.error("[telegram:send-ledger-update]", {
      token: input.token,
      requestId: res.locals.requestId,
      message: error instanceof Error ? error.message : "Telegram send failed",
    });

    return res.status(502).json({
      delivered: false,
      delivery: "bot",
      error: error instanceof Error ? error.message : "Telegram send failed",
      state: formatTelegramSessionState(await getTelegramLinkSession(input.token)),
    });
  }
});

router.post("/resend-latest", async (req: Request, res: Response) => {
  const token = String(req.body?.token || "");
  const session = await getTelegramLinkSession(token);
  if (!session) {
    return res.status(404).json({ error: "Customer link session not found" });
  }
  if (!session.chatId || !session.lastMessage) {
    return res.status(400).json({ error: "No linked borrower message to resend" });
  }

  try {
    await sendTelegramTextMessage(session.chatId, session.lastMessage);
    return res.json({
      delivered: true,
      delivery: "bot",
      state: formatTelegramSessionState(session),
    });
  } catch (error) {
    console.error("[telegram:resend-latest]", {
      token,
      requestId: res.locals.requestId,
      message: error instanceof Error ? error.message : "Telegram resend failed",
    });

    return res.status(502).json({
      delivered: false,
      delivery: "bot",
      error: error instanceof Error ? error.message : "Telegram resend failed",
      state: formatTelegramSessionState(session),
    });
  }
});

router.post("/webhook", async (req: Request, res: Response) => {
  // Phase 5: Verify Telegram webhook secret token
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  if (expectedSecret && receivedSecret !== expectedSecret) {
    return res.status(403).json({ error: "Invalid webhook secret" });
  }

  const update = req.body ?? {};
  const message = update.message ?? update.edited_message ?? null;
  const chatId = message?.chat?.id ? String(message.chat.id) : null;
  const text = String(message?.text || "").trim();
  const username = message?.from?.username ? `@${message.from.username}` : null;
  // Q3: detect language from the user's Telegram client (am | en).
  const lang: Lang = pickLang(message?.from?.language_code);

  if (!chatId || !text) {
    return res.json({ ok: true });
  }

  // Phase 2: parse command + arg. "/start abc" → ["/start", "abc"]
  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = (rawCmd || "").toLowerCase();
  const arg = args.join(" ").trim() || null;

  // ─── /start [TOKEN] ───────────────────────────────────────────────
  if (cmd === "/start") {
    const hadToken = !!arg;
    const newlyLinkedSession = hadToken
      ? await linkTelegramChatToSession({
          token: arg as string,
          chatId,
          telegramUsername: username,
        })
      : null;
    const existingSession = await getSessionByChatId(chatId);

    try {
      await sendTelegramTextMessage(
        chatId,
        buildStartReply(newlyLinkedSession, existingSession, hadToken, lang)
      );
    } catch (error) {
      console.error("[telegram:webhook:start]", {
        token: arg,
        chatId,
        lang,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram webhook reply failed",
      });
    }

    return res.json({
      ok: true,
      linked: Boolean(newlyLinkedSession || existingSession),
    });
  }

  // ─── /balance ────────────────────────────────────────────────────
  if (cmd === "/balance") {
    const session = await getSessionByChatId(chatId);
    try {
      await sendTelegramTextMessage(chatId, buildBalanceReply(session, lang));
    } catch (error) {
      console.error("[telegram:webhook:balance]", {
        chatId,
        lang,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram balance reply failed",
      });
    }
    return res.json({ ok: true });
  }

  // ─── /help ──────────────────────────────────────────────────────
  if (cmd === "/help") {
    const session = await getSessionByChatId(chatId);
    try {
      await sendTelegramTextMessage(chatId, buildHelpReply(Boolean(session), lang));
    } catch (error) {
      console.error("[telegram:webhook:help]", {
        chatId,
        lang,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram help reply failed",
      });
    }
    return res.json({ ok: true });
  }

  // ─── /unsubscribe ─────────────────────────────────────────────
  if (cmd === "/unsubscribe") {
    const session = await getSessionByChatId(chatId);
    if (session) {
      try {
        await syncTelegramCustomerState({
          token: session.token,
          updatesEnabled: false,
        });
      } catch (error) {
        console.error("[telegram:webhook:unsubscribe]", {
          chatId,
          requestId: res.locals.requestId,
          message: error instanceof Error ? error.message : "Unsubscribe failed",
        });
      }
    }
    try {
      await sendTelegramTextMessage(
        chatId,
        lang === "am"
          ? "ማሳወቂያዎችን ማጥፋት ተሳክቷል። ለማንቃት /subscribe ይተይቡ።"
          : "You've unsubscribed from reminders. Type /subscribe to opt back in.",
      );
    } catch (error) {
      console.error("[telegram:webhook:unsubscribe:reply]", {
        chatId,
        lang,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Reply failed",
      });
    }
    return res.json({ ok: true, unsubscribed: true });
  }

  // ─── /subscribe ────────────────────────────────────────────────
  if (cmd === "/subscribe") {
    const session = await getSessionByChatId(chatId);
    if (session) {
      try {
        await syncTelegramCustomerState({
          token: session.token,
          updatesEnabled: true,
        });
      } catch (error) {
        console.error("[telegram:webhook:subscribe]", {
          chatId,
          requestId: res.locals.requestId,
          message: error instanceof Error ? error.message : "Subscribe failed",
        });
      }
    }
    try {
      await sendTelegramTextMessage(
        chatId,
        lang === "am"
          ? "ማሳወቂያዎች እንደገና ተበርተዋል። ለማጥፋት /unsubscribe ይተይቡ።"
          : "You'll receive reminders again. Type /unsubscribe to opt out.",
      );
    } catch (error) {
      console.error("[telegram:webhook:subscribe:reply]", {
        chatId,
        lang,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Reply failed",
      });
    }
    return res.json({ ok: true, subscribed: true });
  }

  // ─── /paid [amount] ────────────────────────────────────────────
  if (cmd === "/paid") {
    const session = await getSessionByChatId(chatId);
    try {
      await sendTelegramTextMessage(chatId, buildPaidReply(session, arg, lang));
    } catch (error) {
      console.error("[telegram:webhook:paid]", {
        chatId,
        lang,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram paid reply failed",
      });
    }
    return res.json({ ok: true });
  }

  // ─── Fallback for anything else ──────────────────────────────────
  const session = await getSessionByChatId(chatId);
  try {
    await sendTelegramTextMessage(chatId, buildFallbackReply(Boolean(session), lang));
  } catch (error) {
    console.error("[telegram:webhook:fallback]", {
      chatId,
      lang,
      text: text.slice(0, 80),
      requestId: res.locals.requestId,
      message: error instanceof Error ? error.message : "Telegram fallback reply failed",
    });
  }
  return res.json({ ok: true });
});

export default router;
