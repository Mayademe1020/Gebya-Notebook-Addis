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
  return `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`;
}

// Phase 2: friendlier replies for un-tokenized commands.
// Previously, /start (without a token) said "This link is no longer valid"
// which felt cold to anyone who naturally explored the bot. Now we warmly
// welcome strangers AND fall back to bound-session replies for linked users.

function buildStartReply(
  session: ReturnType<typeof getTelegramLinkSession>,
  existingSession: ReturnType<typeof getSessionByChatId>,
  hadToken: boolean,
) {
  // Case A — they came from a fresh shop-generated link and got linked
  if (session && hadToken) {
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

function buildBalanceReply(session: ReturnType<typeof getSessionByChatId>) {
  if (!session) {
    return [
      "Gebya",
      "",
      "You're not linked to a shop yet.",
      "Ask your shop owner to share their Gebya link with you.",
      "",
      "Type /help for more info.",
    ].join("\n");
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

// Phase 2: /help command — explains the bot's capabilities.
function buildHelpReply(linked: boolean) {
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

// Phase 2: /paid command — customer reports they've paid.
// MVP behavior: friendly acknowledgement; the shop owner reconciles manually
// via the Gebya app when they next open the customer detail page.
// Future: persist the report on the session so the Gebya app can surface
// "Customer reported paid X birr · confirm or reject" on the customer card.
function buildPaidReply(
  session: ReturnType<typeof getSessionByChatId>,
  amount: string | null,
) {
  if (!session) {
    return [
      "Gebya",
      "",
      "You're not linked to a shop yet, so I can't notify anyone.",
      "Ask your shop owner to share their Gebya link with you first.",
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

// Phase 2: fallback reply for unrecognized text.
function buildFallbackReply(linked: boolean) {
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

router.post("/link-sessions", (req: Request, res: Response) => {
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
  const session = upsertTelegramLinkSession({
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

router.get("/link-sessions/:token", (req: Request, res: Response) => {
  const session = getTelegramLinkSession(String(req.params.token || ""));
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

router.post("/customers/sync", (req: Request, res: Response) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid sync payload" });
  }

  const session = syncTelegramCustomerState(parsed.data);
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
  const session = getTelegramLinkSession(input.token);
  if (!session) {
    return res.status(404).json({ error: "Customer link session not found" });
  }

  storeTelegramDelivery({
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
      state: formatTelegramSessionState(getTelegramLinkSession(input.token)),
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
      state: formatTelegramSessionState(getTelegramLinkSession(input.token)),
    });
  }
});

router.post("/resend-latest", async (req: Request, res: Response) => {
  const token = String(req.body?.token || "");
  const session = getTelegramLinkSession(token);
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
  const update = req.body ?? {};
  const message = update.message ?? update.edited_message ?? null;
  const chatId = message?.chat?.id ? String(message.chat.id) : null;
  const text = String(message?.text || "").trim();
  const username = message?.from?.username ? `@${message.from.username}` : null;

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
    // If a token was provided, try to link this chat to that session
    const newlyLinkedSession = hadToken
      ? linkTelegramChatToSession({
          token: arg as string,
          chatId,
          telegramUsername: username,
        })
      : null;
    // Whether or not a fresh token was sent, fall back to any existing
    // session bound to this chat (for the "already linked" case).
    const existingSession = getSessionByChatId(chatId);

    try {
      await sendTelegramTextMessage(
        chatId,
        buildStartReply(newlyLinkedSession, existingSession, hadToken)
      );
    } catch (error) {
      console.error("[telegram:webhook:start]", {
        token: arg,
        chatId,
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
    const session = getSessionByChatId(chatId);
    try {
      await sendTelegramTextMessage(chatId, buildBalanceReply(session));
    } catch (error) {
      console.error("[telegram:webhook:balance]", {
        chatId,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram balance reply failed",
      });
    }
    return res.json({ ok: true });
  }

  // ─── /help ──────────────────────────────────────────────────────
  if (cmd === "/help") {
    const session = getSessionByChatId(chatId);
    try {
      await sendTelegramTextMessage(chatId, buildHelpReply(Boolean(session)));
    } catch (error) {
      console.error("[telegram:webhook:help]", {
        chatId,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram help reply failed",
      });
    }
    return res.json({ ok: true });
  }

  // ─── /paid [amount] ────────────────────────────────────────────
  // Customer reports they paid. Friendly acknowledgement; shop owner
  // reconciles in the Gebya app. Future: persist on session for surfacing.
  if (cmd === "/paid") {
    const session = getSessionByChatId(chatId);
    try {
      await sendTelegramTextMessage(chatId, buildPaidReply(session, arg));
    } catch (error) {
      console.error("[telegram:webhook:paid]", {
        chatId,
        requestId: res.locals.requestId,
        message: error instanceof Error ? error.message : "Telegram paid reply failed",
      });
    }
    return res.json({ ok: true });
  }

  // ─── Fallback for anything else ──────────────────────────────────
  // The bot shouldn't be silent on free-form text — that confuses users.
  // Reply with a short guidance pointing at the known commands.
  const session = getSessionByChatId(chatId);
  try {
    await sendTelegramTextMessage(chatId, buildFallbackReply(Boolean(session)));
  } catch (error) {
    console.error("[telegram:webhook:fallback]", {
      chatId,
      text: text.slice(0, 80),
      requestId: res.locals.requestId,
      message: error instanceof Error ? error.message : "Telegram fallback reply failed",
    });
  }
  return res.json({ ok: true });
});

export default router;
