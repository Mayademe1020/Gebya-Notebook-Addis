// telegramStore.ts — session storage for the Telegram bot.
//
// Commit KV (launch-critical 2b): sessions now persist in Vercel KV (Upstash)
// when KV_REST_API_URL + KV_REST_API_TOKEN are present. This fixes the bug
// where a serverless cold-start wiped the in-memory Map between a shop
// generating a link and the customer tapping /start (the "This link is no
// longer valid" failure).
//
// We talk to Upstash via its REST command API using plain fetch — NO
// @vercel/kv package, so the monorepo pnpm lockfile stays untouched (adding a
// dep would break the frozen-lockfile CI install, a trap we already hit).
//
// Falls back to an in-memory Map when KV env vars are absent, so local dev and
// un-provisioned deploys still work (ephemeral, as before).

export type TelegramLinkSession = {
  token: string;
  customerId: string;
  customerName: string;
  shopName: string;
  currentBalance: number;
  createdAt: number;
  expiresAt: number;
  requestedAt: number;
  linkedAt: number | null;
  chatId: string | null;
  telegramUsername: string | null;
  updatesEnabled: boolean;
  lastMessage: string | null;
  lastReference: string | null;
  lastUpdatedAt: number | null;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_TTL_SEC = Math.floor(SESSION_TTL_MS / 1000);

// ─── storage backend selection ────────────────────────────────────────
// Accept BOTH naming conventions: the classic Vercel KV names
// (KV_REST_API_URL / KV_REST_API_TOKEN) and the native Upstash names
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). The Vercel Marketplace
// → Upstash integration may inject either set depending on how the store is
// connected, so reading both means provisioning "just works" either way.
const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
const KV_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
const kvEnabled = Boolean(KV_URL && KV_TOKEN);
const isServerlessEnvironment = process.env.VERCEL === "1";

// In-memory fallback (used only when KV is not configured)
const memSessions = new Map<string, TelegramLinkSession>();
const memChatToToken = new Map<string, string>();

const sKey = (token: string) => `tg:s:${token}`;
const cKey = (chatId: string) => `tg:c:${chatId}`;

// Upstash REST command API: POST the command as a JSON array, e.g.
// ["SET","key","value","EX","604800"] → { "result": "OK" }
// ["GET","key"] → { "result": "value-or-null" }
async function kvCmd(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(KV_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`KV command failed (${res.status})`);
  }
  const data = (await res.json()) as { result?: unknown };
  return data?.result ?? null;
}

// ─── low-level session accessors (KV or memory) ───────────────────────

async function readSession(token: string): Promise<TelegramLinkSession | null> {
  if (kvEnabled) {
    const raw = await kvCmd(["GET", sKey(token)]);
    if (!raw || typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as TelegramLinkSession;
    } catch {
      return null;
    }
  }
  return memSessions.get(token) ?? null;
}

async function writeSession(session: TelegramLinkSession): Promise<void> {
  if (kvEnabled) {
    await kvCmd(["SET", sKey(session.token), JSON.stringify(session), "EX", SESSION_TTL_SEC]);
    return;
  }
  memSessions.set(session.token, session);
}

async function deleteSession(token: string): Promise<void> {
  if (kvEnabled) {
    await kvCmd(["DEL", sKey(token)]);
    return;
  }
  memSessions.delete(token);
}

async function readTokenByChat(chatId: string): Promise<string | null> {
  if (kvEnabled) {
    const raw = await kvCmd(["GET", cKey(chatId)]);
    return typeof raw === "string" && raw ? raw : null;
  }
  return memChatToToken.get(chatId) ?? null;
}

async function writeChatLink(chatId: string, token: string): Promise<void> {
  if (kvEnabled) {
    await kvCmd(["SET", cKey(chatId), token, "EX", SESSION_TTL_SEC]);
    return;
  }
  memChatToToken.set(chatId, token);
}

async function deleteChatLink(chatId: string): Promise<void> {
  if (kvEnabled) {
    await kvCmd(["DEL", cKey(chatId)]);
    return;
  }
  memChatToToken.delete(chatId);
}

function normalizeAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

// ─── public API ───────────────────────────────────────────────────────

export function getTelegramSessionStoreStatus() {
  // KV-backed = persistent. Otherwise memory (ephemeral on serverless).
  const persistent = kvEnabled;
  const mode = kvEnabled ? "vercel-kv" : (process.env.TELEGRAM_SESSION_STORE?.trim() || "memory");
  const linkingAvailable =
    persistent || !isServerlessEnvironment || process.env.ALLOW_EPHEMERAL_TELEGRAM_LINKING === "true";

  return {
    mode,
    persistent,
    linkingAvailable,
    reason: linkingAvailable
      ? null
      : "Telegram QR linking is disabled on stateless deployments without persistent session storage.",
  };
}

export async function upsertTelegramLinkSession(payload: {
  token: string;
  customerId: string;
  customerName: string;
  shopName: string;
  currentBalance?: number;
  updatesEnabled?: boolean;
}): Promise<TelegramLinkSession> {
  const now = Date.now();
  const existing = await readSession(payload.token);
  const next: TelegramLinkSession = {
    token: payload.token,
    customerId: payload.customerId,
    customerName: payload.customerName,
    shopName: payload.shopName,
    currentBalance: normalizeAmount(payload.currentBalance),
    createdAt: existing?.createdAt ?? now,
    expiresAt: now + SESSION_TTL_MS,
    requestedAt: existing?.requestedAt ?? now,
    linkedAt: existing?.linkedAt ?? null,
    chatId: existing?.chatId ?? null,
    telegramUsername: existing?.telegramUsername ?? null,
    updatesEnabled: payload.updatesEnabled ?? existing?.updatesEnabled ?? false,
    lastMessage: existing?.lastMessage ?? null,
    lastReference: existing?.lastReference ?? null,
    lastUpdatedAt: existing?.lastUpdatedAt ?? null,
  };
  await writeSession(next);
  return next;
}

export async function getTelegramLinkSession(token: string): Promise<TelegramLinkSession | null> {
  const session = await readSession(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await deleteSession(token);
    if (session.chatId) await deleteChatLink(session.chatId);
    return null;
  }
  return session;
}

export async function linkTelegramChatToSession(payload: {
  token: string;
  chatId: string;
  telegramUsername?: string | null;
}): Promise<TelegramLinkSession | null> {
  const session = await getTelegramLinkSession(payload.token);
  if (!session) return null;
  const next: TelegramLinkSession = {
    ...session,
    linkedAt: Date.now(),
    chatId: payload.chatId,
    telegramUsername: payload.telegramUsername || session.telegramUsername || null,
    lastUpdatedAt: Date.now(),
  };
  await writeSession(next);
  await writeChatLink(payload.chatId, payload.token);
  return next;
}

export async function syncTelegramCustomerState(payload: {
  token: string;
  customerName?: string;
  shopName?: string;
  currentBalance?: number;
  updatesEnabled?: boolean;
  telegramUsername?: string | null;
  chatId?: string | null;
}): Promise<TelegramLinkSession | null> {
  const session = await getTelegramLinkSession(payload.token);
  const fallback = !session && payload.chatId
    ? await upsertTelegramLinkSession({
        token: payload.token,
        customerId: "unknown",
        customerName: payload.customerName || "Customer",
        shopName: payload.shopName || "Gebya",
        currentBalance: payload.currentBalance,
        updatesEnabled: payload.updatesEnabled,
      })
    : null;
  const baseSession = session || fallback;
  if (!baseSession) return null;
  const next: TelegramLinkSession = {
    ...baseSession,
    customerName: payload.customerName || baseSession.customerName,
    shopName: payload.shopName || baseSession.shopName,
    currentBalance: payload.currentBalance != null ? normalizeAmount(payload.currentBalance) : baseSession.currentBalance,
    updatesEnabled: payload.updatesEnabled ?? baseSession.updatesEnabled,
    telegramUsername: payload.telegramUsername ?? baseSession.telegramUsername,
    chatId: payload.chatId ?? baseSession.chatId,
    lastUpdatedAt: Date.now(),
  };
  await writeSession(next);
  if (next.chatId) await writeChatLink(next.chatId, next.token);
  return next;
}

export async function storeTelegramDelivery(payload: {
  token: string;
  currentBalance: number;
  message: string;
  reference: string;
}): Promise<TelegramLinkSession | null> {
  const session = await getTelegramLinkSession(payload.token);
  if (!session) return null;
  const next: TelegramLinkSession = {
    ...session,
    currentBalance: normalizeAmount(payload.currentBalance),
    lastMessage: payload.message,
    lastReference: payload.reference,
    lastUpdatedAt: Date.now(),
  };
  await writeSession(next);
  return next;
}

export async function getSessionByChatId(chatId: string): Promise<TelegramLinkSession | null> {
  const token = await readTokenByChat(chatId);
  if (!token) return null;
  return getTelegramLinkSession(token);
}

/**
 * Look up a session by phone number.
 * Currently unsupported in KV mode (no phone → session index).
 * Intended for invite notifications. Returns null until phone-indexing is added.
 */
export async function getSessionByPhone(_phone: string): Promise<TelegramLinkSession | null> {
  return null;
}

export function formatTelegramSessionState(session: TelegramLinkSession | null) {
  if (!session) return 'not_linked';
  if (session.chatId) return session.updatesEnabled ? 'updates_enabled' : 'linked';
  return 'link_pending';
}
