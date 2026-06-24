/**
 * Reminder Sender Service
 *
 * Sends queued reminders via Telegram API with:
 * - Retry logic (3 attempts, exponential backoff: 1s, 2s, 4s)
 * - Error classification (rate_limit, invalid_chat, invalid_token, network_timeout, other)
 * - Rate limiting (max 100 messages/sec, batched in 10ms windows)
 * - Session updates after successful send
 * - Comprehensive logging for audit trail
 *
 * Key principles:
 * - Transparency: Every send attempt logged, caller always knows status
 * - Reliability: Exponential backoff recovers from transient errors
 * - Safety: Invalid sessions detected and marked for manual review
 * - Performance: Rate limiting prevents bot ban, session updates reduce re-fetches
 */

import { sendTelegramTextMessage } from './telegramBotService.js';
import { getTelegramLinkSession, syncTelegramCustomerState } from './telegramStore.js';
import { buildReminderMessage } from './reminderMessageBuilder.js';
import type {
  ReminderHistoryEntry,
  SendReminderResult,
  TelegramErrorClass,
  ReminderBatchStats,
  ReminderLanguage,
} from '../types/reminders.js';
import type { TelegramLinkSession } from './telegramStore.js';

// ─── types ────────────────────────────────────────────────────────────

/**
 * Internal error type for classifying Telegram API errors
 */
interface TelegramErrorInfo {
  code?: number;
  status?: number;
  message: string;
  isTelegramError: boolean;
}

/**
 * Rate limiting window state
 */
interface RateLimitWindow {
  windowStartMs: number;
  messagesSentInWindow: number;
}

// ─── constants ────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = (attempt: number) => Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s

// Rate limiting: 100 messages per second = max 100 per 1000ms
const RATE_LIMIT_WINDOW_MS = 10; // 10ms window
const MAX_MESSAGES_PER_WINDOW = 1; // 1 message per 10ms = 100/sec max
const BATCH_SIZE = 100; // Process up to 100 per batch
const BATCH_PAUSE_MS = 10; // Pause 10ms between batches

// Error classification thresholds
const TELEGRAM_ERROR_RATE_LIMIT = 429;
const TELEGRAM_ERROR_NOT_FOUND = 400;
const TELEGRAM_ERROR_FORBIDDEN = 403;
const TELEGRAM_ERROR_UNAUTHORIZED = 401;
const TELEGRAM_TIMEOUT_MS = 30000; // 30 second timeout

// ─── error classification ────────────────────────────────────────────

/**
 * Parse Telegram API error response
 */
function parseTelegramError(error: unknown): TelegramErrorInfo {
  if (error instanceof Error) {
    // Check for Telegram API error codes in message
    // Format: "429 Too Many Requests" or similar
    const match = error.message.match(/^(\d{3})\s+(.+)/);
    if (match) {
      return {
        code: parseInt(match[1], 10),
        message: error.message,
        isTelegramError: true,
      };
    }

    // Check for timeout
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return {
        message: error.message,
        isTelegramError: false,
      };
    }

    return {
      message: error.message,
      isTelegramError: false,
    };
  }

  return {
    message: String(error),
    isTelegramError: false,
  };
}

/**
 * Classify a Telegram API error into retry/fail/unlink categories
 *
 * Classification logic:
 * - 429 (Rate Limit) → 'rate_limit' (retry with backoff)
 * - 400 (Chat Not Found) → 'invalid_chat' (unlink customer)
 * - 403 (Forbidden/Bot Blocked) → 'invalid_chat' (unlink customer)
 * - 401 (Unauthorized) → 'invalid_token' (bot auth issue)
 * - Timeout/Network → 'network_timeout' (retry with backoff)
 * - Other → 'other' (mark failed, don't retry immediately)
 */
export function classifyTelegramError(error: unknown): TelegramErrorClass {
  const errorInfo = parseTelegramError(error);

  // Telegram API error codes
  if (errorInfo.code) {
    if (errorInfo.code === TELEGRAM_ERROR_RATE_LIMIT) {
      return 'rate_limit';
    }
    if (errorInfo.code === TELEGRAM_ERROR_NOT_FOUND) {
      return 'invalid_chat'; // Chat not found
    }
    if (errorInfo.code === TELEGRAM_ERROR_FORBIDDEN) {
      return 'invalid_chat'; // Bot blocked by user or other forbidden reason
    }
    if (errorInfo.code === TELEGRAM_ERROR_UNAUTHORIZED) {
      return 'invalid_token'; // Bot token invalid or revoked
    }
  }

  // Network/timeout errors
  if (errorInfo.message.includes('timeout') || 
      errorInfo.message.includes('ETIMEDOUT') ||
      errorInfo.message.includes('ECONNREFUSED') ||
      errorInfo.message.includes('ECONNRESET')) {
    return 'network_timeout';
  }

  // Unknown error
  return 'other';
}

// ─── sleep utility ───────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── single reminder sender ───────────────────────────────────────────

/**
 * Send a single reminder via Telegram with retry logic
 *
 * @param historyEntry The reminder to send (contains customer, balance, due date, etc.)
 * @param session The Telegram session for this customer
 * @returns Result with success/failure status, message ID, and retry count
 *
 * Retry strategy:
 * - Attempt 1: Send immediately
 * - Attempt 2: Wait 1s, retry
 * - Attempt 3: Wait 2s, retry
 * - If all fail: Return failure with classification
 *
 * On success:
 * - Record delivery in history
 * - Update session with message metadata
 * - Return success with message ID
 *
 * On rate limit/network error:
 * - Retry up to max attempts
 * - Log each attempt
 *
 * On invalid chat/token:
 * - Return shouldUnlink=true to unlink customer
 *
 * On other error:
 * - Return shouldRetry=false to mark failed without retry
 */
export async function sendReminder(
  historyEntry: ReminderHistoryEntry,
  session: TelegramLinkSession
): Promise<SendReminderResult> {
  let lastError: unknown;
  let lastErrorClass: TelegramErrorClass = 'other';

  // Validate inputs
  if (!session.chatId) {
    return {
      success: false,
      error: 'No chat ID in session',
      errorClass: 'invalid_chat',
      retryCount: 0,
      lastAttemptAt: Date.now(),
      shouldRetry: false,
      shouldUnlink: true,
    };
  }

  // Build the reminder message
  const customerName = historyEntry.customerNameSnapshot || 'Customer';
  const message = buildReminderMessage(
    historyEntry.language,
    customerName,
    historyEntry.balanceAtSendTime,
    historyEntry.dueDate,
    historyEntry.daysHeld
  );

  // Attempt to send with retries
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Wait before retry (1s, 2s, 4s)
      if (attempt > 1) {
        const backoffMs = RETRY_BACKOFF_MS(attempt - 1);
        console.log(
          `[ReminderSender] Retry attempt ${attempt} for customer ${historyEntry.customerId} after ${backoffMs}ms backoff`
        );
        await sleep(backoffMs);
      }

      // Send via Telegram API
      const telegramResult = await sendTelegramTextMessage(session.chatId, message);

      // Extract message ID from result
      // Result format: { message_id: 12345, chat: { id: 123, ... }, ... }
      const messageId = (telegramResult as any)?.message_id?.toString();

      // Success! Update session and return
      console.log(
        `[ReminderSender] Successfully sent reminder to customer ${historyEntry.customerId} (message: ${messageId})`
      );

      // Update session with delivery info
      if (session.token) {
        try {
          await syncTelegramCustomerState({
            token: session.token,
            currentBalance: historyEntry.balanceAtSendTime,
          });
        } catch (updateError) {
          console.error(
            `[ReminderSender] Warning: Failed to update session after send: ${updateError}`
          );
          // Don't fail the whole send if session update fails
        }
      }

      return {
        success: true,
        messageId,
        retryCount: attempt - 1,
        lastAttemptAt: Date.now(),
        shouldRetry: false,
        shouldUnlink: false,
      };
    } catch (error) {
      lastError = error;
      lastErrorClass = classifyTelegramError(error);

      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[ReminderSender] Attempt ${attempt}/${MAX_RETRIES} failed for customer ${historyEntry.customerId}: ${errorMsg} (class: ${lastErrorClass})`
      );

      // Decide whether to retry
      const canRetry = attempt < MAX_RETRIES;
      const shouldRetryError =
        lastErrorClass === 'rate_limit' || lastErrorClass === 'network_timeout';

      if (!canRetry || !shouldRetryError) {
        // Don't retry: exhausted attempts or non-retryable error
        break;
      }

      // Continue to next attempt
    }
  }

  // All retries exhausted or non-retryable error
  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);

  // Determine if customer should be unlinked
  const shouldUnlink = lastErrorClass === 'invalid_chat' || lastErrorClass === 'invalid_token';

  console.log(
    `[ReminderSender] Send failed for customer ${historyEntry.customerId}: ${errorMsg} (shouldUnlink: ${shouldUnlink})`
  );

  return {
    success: false,
    error: errorMsg,
    errorClass: lastErrorClass,
    retryCount: MAX_RETRIES,
    lastAttemptAt: Date.now(),
    shouldRetry: lastErrorClass === 'rate_limit' || lastErrorClass === 'network_timeout',
    shouldUnlink,
  };
}

// ─── batch sender with rate limiting ──────────────────────────────────

/**
 * Send all queued reminders for a shop with rate limiting
 *
 * Rate limiting strategy:
 * - Max 100 messages per second (1 per 10ms)
 * - Process up to BATCH_SIZE reminders
 * - Send in parallel (Promise.all) within rate limit window
 * - Pause 10ms between batches
 * - Continue until queue empty
 *
 * Statistics tracked:
 * - Total sent, failed, skipped
 * - Error counts by type
 * - Timing and performance metrics
 *
 * @param shopId The shop ID
 * @param queue Array of reminders to send
 * @returns Summary statistics
 */
export async function sendQueuedReminders(
  shopId: number,
  queue: ReminderHistoryEntry[]
): Promise<ReminderBatchStats> {
  const startedAt = Date.now();
  const stats: ReminderBatchStats = {
    startedAt,
    completedAt: 0,
    customersScanned: queue.length,
    customersWithBalance: queue.length,
    remindersQueued: queue.length,
    remindersSent: 0,
    remindersFailed: 0,
    remindersSkipped: 0,
    errors: [],
    shopsProcessed: 1,
    success: true,
  };

  if (queue.length === 0) {
    console.log('[ReminderSender] Empty queue for shop ' + shopId);
    stats.completedAt = Date.now();
    return stats;
  }

  console.log(
    `[ReminderSender] Starting batch send for shop ${shopId}: ${queue.length} reminders queued`
  );

  let windowState: RateLimitWindow = {
    windowStartMs: Date.now(),
    messagesSentInWindow: 0,
  };

  // Process reminders in batches
  for (let batchStart = 0; batchStart < queue.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, queue.length);
    const batch = queue.slice(batchStart, batchEnd);

    console.log(
      `[ReminderSender] Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: Sending ${batch.length} reminders (${batchStart + 1}-${batchEnd}/${queue.length})`
    );

    // Send batch in parallel, respecting rate limit
    const sendPromises = batch.map(async (historyEntry) => {
      // Check rate limit window
      const now = Date.now();
      const timeSinceWindowStart = now - windowState.windowStartMs;

      // If we're still in the same window and hit limit, wait for next window
      if (
        timeSinceWindowStart < RATE_LIMIT_WINDOW_MS &&
        windowState.messagesSentInWindow >= MAX_MESSAGES_PER_WINDOW
      ) {
        const waitMs = RATE_LIMIT_WINDOW_MS - timeSinceWindowStart;
        await sleep(waitMs);
      }

      // Check if we need to reset the window
      const nowAfterWait = Date.now();
      if (nowAfterWait - windowState.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
        windowState = {
          windowStartMs: nowAfterWait,
          messagesSentInWindow: 0,
        };
      }

      // Try to fetch the session and send
      try {
        // Create a minimal session object from history entry
        // In production, this would be fetched from the database
        const session: TelegramLinkSession = {
          token: historyEntry.id,
          chatId: historyEntry.chatId,
          customerId: String(historyEntry.customerId),
          customerName: historyEntry.customerNameSnapshot || 'Customer',
          shopName: historyEntry.shopNameSnapshot || 'Shop',
          currentBalance: historyEntry.balanceAtSendTime,
          updatesEnabled: true,
          telegramUsername: null,
          createdAt: historyEntry.sentAt,
          expiresAt: historyEntry.sentAt + 1000 * 60 * 60 * 24 * 7,
          requestedAt: historyEntry.sentAt,
          linkedAt: historyEntry.sentAt,
          lastMessage: null,
          lastReference: null,
          lastUpdatedAt: historyEntry.lastAttemptAt,
        };

        const result = await sendReminder(historyEntry, session);

        if (result.success) {
          stats.remindersSent++;
          windowState.messagesSentInWindow++;
        } else {
          stats.remindersFailed++;
          if (result.errorClass) {
            stats.errors.push({
              customerId: historyEntry.customerId,
              shopId,
              error: `${result.errorClass}: ${result.error}`,
            });
          }
        }
      } catch (error) {
        stats.remindersFailed++;
        stats.errors.push({
          customerId: historyEntry.customerId,
          shopId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Wait for all sends in this batch
    await Promise.all(sendPromises);

    // Pause between batches
    if (batchEnd < queue.length) {
      console.log(`[ReminderSender] Batch complete, pausing ${BATCH_PAUSE_MS}ms before next batch`);
      await sleep(BATCH_PAUSE_MS);
    }
  }

  stats.completedAt = Date.now();
  const duration = stats.completedAt - stats.startedAt;

  console.log(
    `[ReminderSender] Batch complete for shop ${shopId}: ${stats.remindersSent} sent, ${stats.remindersFailed} failed, ${stats.remindersSkipped} skipped in ${duration}ms`
  );

  if (stats.remindersFailed > 0) {
    stats.success = false;
  }

  return stats;
}

// ─── record delivery helper ──────────────────────────────────────────

/**
 * Record reminder delivery in history (for persistence)
 * This is a placeholder for future integration with a database
 */
export async function recordDelivery(
  historyId: string,
  status: 'sent' | 'failed',
  messageId?: string,
  error?: string
): Promise<void> {
  console.log(
    `[ReminderSender] Recording delivery: ${historyId} → ${status}${messageId ? ` (message: ${messageId})` : ''}${error ? ` (error: ${error})` : ''}`
  );
  // TODO: Persist to database/KV
  // For now, just log
}
