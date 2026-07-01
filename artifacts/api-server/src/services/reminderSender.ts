/**
 * ReminderSender Service
 *
 * Sends queued reminders via Telegram with retry logic and error handling.
 * - 3 retries with exponential backoff (1s, 2s, 4s)
 * - Classifies errors: rate_limit, network_timeout, invalid_chat, invalid_token, other
 * - Marks customer as unlinked on invalid_chat/invalid_token
 * - Records delivery in history
 */
import { sendTelegramTextMessage } from "./telegramBotService.js";
import { getSessionByChatId, syncTelegramCustomerState } from "./telegramStore.js";
import { createHistoryEntry } from "./reminderHistory.js";
import type {
  QueuedReminder,
  SendReminderResult,
} from "../types/reminders.js";

// ─── error classification ──────────────────────────────────────────────

const BACKOFF_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

type ErrorClass =
  | "rate_limit"
  | "network_timeout"
  | "invalid_chat"
  | "invalid_token"
  | "other";

function log(level: "info" | "warn" | "error", message: string, context?: Record<string, unknown>): void {
  const logLine = [`[ReminderSender] ${level.toUpperCase()}`, message, context ? JSON.stringify(context) : ""].join(" ");
  if (level === "error") console.error(logLine);
  else if (level === "warn") console.warn(logLine);
  else console.log(logLine);
}

function classifyError(error: unknown, httpStatus?: number): ErrorClass {
  if (httpStatus === 429) return "rate_limit";
  if (httpStatus === 401) return "invalid_token";
  if (httpStatus === 403 || httpStatus === 400) return "invalid_chat";
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "network_timeout";
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("429") || msg.includes("too many")) return "rate_limit";
    if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("token")) return "invalid_token";
    if (msg.includes("403") || msg.includes("blocked")) return "invalid_chat";
    if (msg.includes("400") || msg.includes("chat not found") || msg.includes("not found")) return "invalid_chat";
    if (msg.includes("timeout") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("econnreset")) return "network_timeout";
  }
  return "other";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── history storage (KV / in-memory) ──────────────────────────────────

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

async function storeHistoryEntry(entry: ReminderHistoryEntry): Promise<void> {
  if (kvEnabled) {
    await kvCmd([
      "SET",
      historyKey(entry.shopId, entry.customerId, entry.sentAt),
      JSON.stringify(entry),
      "EX",
      7_776_000, // 90 days in seconds
    ]);
  } else {
    memHistory.push(entry);
    // Keep only last 10k entries in memory
    if (memHistory.length > 10_000) {
      memHistory.splice(0, memHistory.length - 10_000);
    }
  }
}

/**
 * Query stored history entries (in-memory fallback only; for KV, use the API route)
 */
export async function queryHistory(
  shopId: number,
  options?: { limit?: number; offset?: number; customerId?: number },
): Promise<{ total: number; entries: ReminderHistoryEntry[] }> {
  if (kvEnabled) {
    // For KV, we return empty — the API route will implement proper scanning
    // This is a simplified version; production should use KV SCAN or a DB
    return { total: 0, entries: [] };
  }

  let filtered = memHistory.filter((e) => e.shopId === shopId);
  if (options?.customerId) {
    filtered = filtered.filter((e) => e.customerId === options.customerId);
  }

  const total = filtered.length;
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const entries = filtered.slice(offset, offset + limit).reverse(); // newest first

  return { total, entries };
}

// ─── public API ────────────────────────────────────────────────────────

/**
 * Send a single queued reminder with retry logic.
 * Returns a SendReminderResult describing the outcome.
 */
export async function sendReminder(
  reminder: QueuedReminder,
): Promise<SendReminderResult> {
  let retryCount = 0;

  // Build message using the reminderMessageBuilder
  const { buildReminderMessage } = await import("./reminderMessageBuilder.js");
  const message = buildReminderMessage(
    reminder.language,
    reminder.customerName || "Customer",
    reminder.balance,
    reminder.dueDate,
    reminder.daysHeld,
  );

  log("info", "Sending reminder", { customerId: reminder.customerId, shopId: reminder.shopId });

  for (let attempt = 0; attempt <= BACKOFF_DELAYS.length; attempt++) {
    try {
      const result = await sendTelegramTextMessage(reminder.chatId, message);
      // Success
      const messageId = String(
        (result as { message_id?: string })?.message_id ?? "",
      );

      await createHistoryEntry({
        shopId: reminder.shopId,
        customerId: reminder.customerId,
        chatId: reminder.chatId,
        balanceAtSendTime: String(reminder.balance),
        dueDate: reminder.dueDate ?? undefined,
        daysHeld: reminder.daysHeld,
        sentAt: Date.now(),
        status: "sent",
        language: reminder.language,
        messageId,
        retryCount,
        lastAttemptAt: Date.now(),
        customerNameSnapshot: reminder.customerName,
      });

      return {
        success: true,
        messageId,
        retryCount,
        lastAttemptAt: Date.now(),
        shouldRetry: false,
        shouldUnlink: false,
      };
    } catch (error) {
      const httpStatus =
        error instanceof Error
          ? parseInt(error.message.match(/\b(\d{3})\b/)?.[1] ?? "", 10)
          : undefined;
      const errorClass = classifyError(error, httpStatus);
      const isLastAttempt = attempt >= BACKOFF_DELAYS.length;

      // Non-retryable errors
      if (errorClass === "invalid_chat" || errorClass === "invalid_token") {
        // Mark customer as unlinked
        try {
          const session = await getSessionByChatId(reminder.chatId);
          if (session) {
            await syncTelegramCustomerState({
              token: session.token,
              updatesEnabled: false,
            });
          }
        } catch {
          // silent — don't let unlink failure mask the original error
        }

        await createHistoryEntry({
          shopId: reminder.shopId,
          customerId: reminder.customerId,
          chatId: reminder.chatId,
          balanceAtSendTime: String(reminder.balance),
          dueDate: reminder.dueDate ?? undefined,
          daysHeld: reminder.daysHeld,
          sentAt: Date.now(),
          status: "failed",
          language: reminder.language,
          failureReason: error instanceof Error ? error.message : String(error),
          retryCount,
          lastAttemptAt: Date.now(),
        });

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorClass,
          retryCount,
          lastAttemptAt: Date.now(),
          shouldRetry: false,
          shouldUnlink: true,
        };
      }

      // Retryable error
      if (!isLastAttempt) {
        const delay = BACKOFF_DELAYS[attempt];
        console.log(
          `[ReminderSender] Retry ${attempt + 1}/${BACKOFF_DELAYS.length} for customer ${reminder.customerId} in ${delay}ms — ${error instanceof Error ? error.message : String(error)}`,
        );
        retryCount++;
        await sleep(delay);
        continue;
      }

      // All retries exhausted
      await createHistoryEntry({
        shopId: reminder.shopId,
        customerId: reminder.customerId,
        chatId: reminder.chatId,
        balanceAtSendTime: String(reminder.balance),
        dueDate: reminder.dueDate ?? undefined,
        daysHeld: reminder.daysHeld,
        sentAt: Date.now(),
        status: "failed",
        language: reminder.language,
        failureReason: `All retries exhausted: ${error instanceof Error ? error.message : String(error)}`,
        retryCount,
        lastAttemptAt: Date.now(),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorClass,
        retryCount,
        lastAttemptAt: Date.now(),
        shouldRetry: false,
        shouldUnlink: false,
      };
    }
  }

  // Should never reach here, but TypeScript needs a return
  return {
    success: false,
    error: "Unexpected: loop exited without result",
    retryCount,
    lastAttemptAt: Date.now(),
    shouldRetry: false,
    shouldUnlink: false,
  };
}

/**
 * Send a batch of queued reminders sequentially (with rate limiting).
 * Returns summary counts.
 */
export async function sendBatchReminders(
  reminders: QueuedReminder[],
  maxPerSecond = 100,
): Promise<{ sent: number; failed: number; results: SendReminderResult[] }> {
  let sent = 0;
  let failed = 0;
  const results: SendReminderResult[] = [];

  for (let i = 0; i < reminders.length; i++) {
    const reminder = reminders[i];
    try {
      const result = await sendReminder(reminder);
      results.push(result);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      results.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryCount: 0,
        lastAttemptAt: Date.now(),
        shouldRetry: false,
        shouldUnlink: false,
      });
    }

    // Rate limiting: if we've sent maxPerSecond in this second, wait
    if ((i + 1) % maxPerSecond === 0 && i < reminders.length - 1) {
      await sleep(1000);
    }
  }

  return { sent, failed, results };
}

// ─── test utilities ────────────────────────────────────────────────────

export function clearHistoryForTest(): void {
  memHistory.length = 0;
}

export function getStoredHistoryCount(): number {
  return memHistory.length;
}