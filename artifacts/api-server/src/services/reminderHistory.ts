import type {
  ReminderHistoryEntry,
  ReminderHistoryResult,
  ReminderHistoryQuery,
  ReminderHistoryStats,
} from "../types/reminders.js";

const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
const KV_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
const kvEnabled = Boolean(KV_URL && KV_TOKEN);

const memHistory: ReminderHistoryEntry[] = [];

const historyKey = (shopId: number, customerId: number, sentAt: number) =>
  `reminder:history:${shopId}:${customerId}:${sentAt}`;

async function kvCmd(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(KV_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`KV command failed (${res.status})`);
  const data = (await res.json()) as { result?: unknown };
  return data?.result ?? null;
}

export async function createHistoryEntry(
  data: Omit<ReminderHistoryEntry, "id" | "createdAt"> & { shopId: number; customerId: number; chatId: string; balanceAtSendTime: number | string; sentAt: number; status: "queued" | "sent" | "failed" | "skipped"; language: "am" | "en" }
): Promise<ReminderHistoryEntry> {
  const entry: ReminderHistoryEntry = {
    id: `${data.shopId}-${data.customerId}-${data.sentAt}-${Math.random().toString(36).slice(2, 8)}`,
    shopId: data.shopId,
    customerId: data.customerId,
    chatId: data.chatId,
    balanceAtSendTime: typeof data.balanceAtSendTime === "number" ? String(data.balanceAtSendTime) : String(data.balanceAtSendTime ?? "0"),
    dueDate: data.dueDate ?? undefined,
    daysHeld: data.daysHeld,
    sentAt: data.sentAt,
    status: data.status,
    language: data.language,
    messageId: data.messageId,
    failureReason: data.failureReason,
    retryCount: data.retryCount ?? 0,
    lastAttemptAt: data.lastAttemptAt,
    customerNameSnapshot: data.customerNameSnapshot,
    shopNameSnapshot: data.shopNameSnapshot,
    createdAt: new Date(),
  };

  if (kvEnabled) {
    await kvCmd(["SET", historyKey(data.shopId, data.customerId, data.sentAt), JSON.stringify(entry), "EX", 7_776_000]);
  } else {
    memHistory.push(entry);
    if (memHistory.length > 10_000) {
      memHistory.splice(0, memHistory.length - 10_000);
    }
  }

  return entry;
}

export async function getHistoryByShop(
  shopId: number,
  options?: ReminderHistoryQuery
): Promise<ReminderHistoryResult> {
  if (kvEnabled) {
    return { total: 0, entries: [], pagination: { limit: options?.limit ?? 50, offset: options?.offset ?? 0, hasMore: false } };
  }

  let filtered = memHistory.filter((e) => e.shopId === shopId);

  const total = filtered.length;
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500);
  const offset = Math.max(options?.offset ?? 0, 0);
  const entries = filtered.slice(offset, offset + limit).reverse();

  return {
    total,
    entries,
    pagination: { limit, offset, hasMore: offset + limit < total },
  };
}

export async function getHistoryByCustomer(
  shopId: number,
  customerId: number,
  options?: ReminderHistoryQuery
): Promise<ReminderHistoryResult> {
  if (kvEnabled) {
    return { total: 0, entries: [], pagination: { limit: options?.limit ?? 50, offset: options?.offset ?? 0, hasMore: false } };
  }

  let filtered = memHistory.filter((e) => e.shopId === shopId && e.customerId === customerId);

  const total = filtered.length;
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500);
  const offset = Math.max(options?.offset ?? 0, 0);
  const entries = filtered.slice(offset, offset + limit).reverse();

  return {
    total,
    entries,
    pagination: { limit, offset, hasMore: offset + limit < total },
  };
}

export async function deleteOldEntries(beforeDate?: number): Promise<{ deletedCount: number }> {
  const cutoff = beforeDate ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
  const beforeCount = memHistory.length;

  for (let i = memHistory.length - 1; i >= 0; i--) {
    if (memHistory[i].createdAt.getTime() < cutoff) {
      memHistory.splice(i, 1);
    }
  }

  const deletedCount = beforeCount - memHistory.length;
  console.log(`[ReminderHistory] Deleted ${deletedCount} old entries (before ${new Date(cutoff).toISOString()})`);

  return { deletedCount };
}

export async function getStats(shopId: number): Promise<ReminderHistoryStats> {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const shopEntries = memHistory.filter((e) => e.shopId === shopId);

  return {
    totalRemindersSentAllTime: shopEntries.filter((e) => e.status === "sent").length,
    remindersSentThisWeek: shopEntries.filter((e) => e.status === "sent" && e.sentAt >= weekAgo).length,
    remindersFailedThisWeek: shopEntries.filter((e) => e.status === "failed" && e.sentAt >= weekAgo).length,
    averageDeliveryTimeMs: 0,
    uniqueCustomersRemindedThisWeek: new Set(shopEntries.filter((e) => e.sentAt >= weekAgo).map((e) => e.customerId)).size,
    unlinkedCustomersCount: 0,
  };
}

export async function updateHistoryStatus(
  id: number | string,
  status: "queued" | "sent" | "failed" | "skipped",
  messageId?: string,
  failureReason?: string
): Promise<ReminderHistoryEntry | null> {
  const entry = memHistory.find((e) => e.id === String(id) || e.id === id);
  if (!entry) return null;

  entry.status = status;
  entry.messageId = messageId;
  entry.failureReason = failureReason;
  entry.lastAttemptAt = Date.now();

  return entry;
}

export async function acknowledgeReminder(
  id: number | string,
): Promise<ReminderHistoryEntry | null> {
  const entry = memHistory.find((e) => e.id === String(id) || e.id === id);
  if (!entry) return null;

  entry.acknowledged = true;
  entry.acknowledgedAt = Date.now();

  return entry;
}

export async function incrementRetryCount(id: number | string): Promise<void> {
  const entry = memHistory.find((e) => e.id === String(id) || e.id === id);
  if (!entry) return;

  entry.retryCount = (entry.retryCount ?? 0) + 1;
  entry.lastAttemptAt = Date.now();
}

export async function getQueuedReminders(shopId: number, limit = 100): Promise<ReminderHistoryEntry[]> {
  return memHistory
    .filter((e) => e.shopId === shopId && e.status === "queued")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit);
}

/**
 * Get the most recent queued reminder for a specific customer across all shops.
 */
export async function getLatestQueuedReminderForCustomer(customerId: number): Promise<ReminderHistoryEntry | undefined> {
  return memHistory
    .filter((e) => e.customerId === customerId && e.status === "queued")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

export function clearHistoryForTest(): void {
  memHistory.length = 0;
}

export function getStoredHistoryCount(): number {
  return memHistory.length;
}