/**
 * ReminderScheduler Service
 *
 * Daily job to identify eligible customers and queue reminders.
 * - Queries customers with outstanding balance
 * - Checks frequency windows (24h for daily, 7d for weekly)
 * - Checks updatesEnabled from Telegram session
 * - Deduplicates customers (max 1 reminder per window)
 * - Passes eligible reminders to ReminderSender for delivery
 */
import { getSessionByChatId, getTelegramLinkSession } from "./telegramStore.js";
import { getCustomerFrequency, isRemindersEnabled } from "./reminderConfiguration.js";
import type {
  EligibleCustomer,
  QueuedReminder,
  ReminderBatchStats,
  ReminderLanguage,
} from "../types/reminders.js";

// ─── helper: language detection ────────────────────────────────────────

function detectLanguage(langCode?: string | null): ReminderLanguage {
  return langCode?.toLowerCase().startsWith("am") ? "am" : "en";
}

// ─── helper: time windows ──────────────────────────────────────────────

const DAY_MS = 86_400_000; // 24 hours
const WEEK_MS = 7 * DAY_MS; // 7 days

/**
 * Check if a customer is eligible to receive a reminder today
 * based on their frequency setting and last reminder send time.
 */
export function isEligibleToday(
  frequency: "daily" | "weekly" | "disabled",
  lastSentAt: number | null,
): boolean {
  if (frequency === "disabled") return false;
  if (lastSentAt === null) return true; // never sent → eligible

  const now = Date.now();
  const windowMs = frequency === "daily" ? DAY_MS : WEEK_MS;

  // Eligible if sufficient time has passed since last reminder
  return now - lastSentAt >= windowMs;
}

/**
 * Calculate the number of days since a given timestamp.
 */
export function daysSince(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / DAY_MS);
}

// ─── queue implementation ──────────────────────────────────────────────

const queue: QueuedReminder[] = [];

/**
 * Queue a reminder for sending.
 * Deduplicates: if a reminder for the same customer+shop already exists in queue, skip.
 */
export function queueReminder(reminder: QueuedReminder): void {
  // Deduplicate: check if same customer already in queue
  const exists = queue.some(
    (r) => r.shopId === reminder.shopId && r.customerId === reminder.customerId,
  );
  if (exists) {
    console.log(
      `[ReminderScheduler] Skipping duplicate queue for customer ${reminder.customerId}`,
    );
    return;
  }
  queue.push(reminder);
}

/**
 * Get all currently queued reminders and clear the queue.
 */
export function drainQueue(): QueuedReminder[] {
  const items = queue.splice(0, queue.length);
  return items;
}

/**
 * Get queue size without draining.
 */
export function queueSize(): number {
  return queue.length;
}

/**
 * Clear queue (for testing).
 */
export function clearQueueForTest(): void {
  queue.length = 0;
}

// ─── main scheduler ────────────────────────────────────────────────────

/**
 * Query eligible customers for a shop (via the existing transaction ledger).
 *
 * This is a simplified version that assumes the shop provides its own
 * customer balance data. In production, this would query the transaction
 * ledger database. The caller passes in pre-computed customer data.
 *
 * @param shopId - The shop ID
 * @param customersWithBalance - Array of customers with calculated balance info
 * @param shopName - Shop name for message context
 * @returns ReminderBatchStats summarizing the run
 */
export async function scheduleReminders(
  shopId: number,
  customersWithBalance: EligibleCustomer[],
  shopName?: string,
): Promise<ReminderBatchStats> {
  const startedAt = Date.now();
  const stats: ReminderBatchStats = {
    startedAt,
    completedAt: startedAt,
    customersScanned: customersWithBalance.length,
    customersWithBalance: 0,
    remindersQueued: 0,
    remindersSent: 0,
    remindersFailed: 0,
    remindersSkipped: 0,
    errors: [],
    shopsProcessed: 1,
    success: false,
  };

  for (const customer of customersWithBalance) {
    try {
      // Only process customers with positive balance
      if (customer.balance <= 0) {
        stats.remindersSkipped++;
        continue;
      }
      stats.customersWithBalance++;

      // Check Telegram session
      const session = await getSessionByChatId(customer.chatId);
      if (!session) {
        stats.remindersSkipped++;
        continue;
      }

      // Check updatesEnabled
      if (!session.updatesEnabled && !customer.updatesEnabled) {
        stats.remindersSkipped++;
        continue;
      }

      // Check frequency settings
      const frequency = customer.reminderConfig?.frequency
        ?? await getCustomerFrequency(shopId, customer.customerId);
      if (frequency === "disabled") {
        stats.remindersSkipped++;
        continue;
      }

      const lastSentAt = customer.reminderConfig?.lastReminderSentAt ?? null;
      if (!isEligibleToday(frequency, lastSentAt)) {
        stats.remindersSkipped++;
        continue;
      }

      // Determine language
      const language = customer.telegramLanguage
        ?? detectLanguage(session.telegramUsername);

      // Calculate days held
      const heldDays = daysSince(customer.customerCreatedAt);

      // Queue the reminder
      const queuedReminder: QueuedReminder = {
        id: `${shopId}-${customer.customerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shopId,
        customerId: customer.customerId,
        chatId: customer.chatId,
        balance: customer.balance,
        dueDate: customer.dueDate,
        daysHeld: heldDays,
        language,
        queuedAt: Date.now(),
        priority: 0,
        customerName: customer.customerName,
        shopName: shopName,
      };

      queueReminder(queuedReminder);
      stats.remindersQueued++;
    } catch (error) {
      stats.errors.push({
        customerId: customer.customerId,
        shopId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stats.completedAt = Date.now();
  stats.success = stats.errors.length === 0;

  console.log(
    `[ReminderScheduler] Shop ${shopId}: scanned=${stats.customersScanned}, ` +
    `withBalance=${stats.customersWithBalance}, queued=${stats.remindersQueued}, ` +
    `skipped=${stats.remindersSkipped}, errors=${stats.errors.length}`,
  );

  return stats;
}

/**
 * Run reminders for a single shop: schedule + send.
 * This is the high-level entry point called by the cron endpoint.
 */
export async function runRemindersForShop(
  shopId: number,
  customersWithBalance: EligibleCustomer[],
  shopName?: string,
): Promise<ReminderBatchStats> {
  const stats = await scheduleReminders(shopId, customersWithBalance, shopName);

  // Send the queued reminders
  if (queueSize() > 0) {
    const { sendBatchReminders } = await import("./reminderSender.js");
    const results = await sendBatchReminders(drainQueue());
    stats.remindersSent = results.sent;
    stats.remindersFailed = results.failed;
  }

  console.log(
    `[ReminderScheduler] Shop ${shopId}: sent=${stats.remindersSent}, ` +
    `failed=${stats.remindersFailed}, success=${stats.success}`,
  );

  return stats;
}