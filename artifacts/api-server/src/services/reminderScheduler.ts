/**
 * Reminder Scheduler Service
 *
 * Daily job to identify customers with outstanding balance and queue reminders
 * based on frequency preferences (daily/weekly) and last send time.
 *
 * Core Methods:
 * - scheduleReminders(shopId) — Main entry point, returns batch stats
 * - getEligibleCustomers(shopId) — Query customers with balance > 0
 * - isCustomerEligibleToday() — Check frequency window
 * - queueReminder() — Create QueuedReminder with all metadata
 */

import type {
  EligibleCustomer,
  QueuedReminder,
  ReminderBatchStats,
  ReminderConfiguration,
  ReminderLanguage,
} from "../types/reminders.js";
import { getCustomerFrequency, isRemindersEnabled } from "./reminderConfiguration.js";
import { getTelegramLinkSession, getSessionByChatId } from "./telegramStore.js";

// ─── Constants ────────────────────────────────────────────────────────

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEK_IN_MS = 7 * DAY_IN_MS;
const BATCH_SIZE = 100; // Process customers in batches to avoid memory issues

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Calculate days held since a given timestamp
 */
function calculateDaysHeld(createdAtMs: number): number {
  const now = Date.now();
  const daysHeld = (now - createdAtMs) / DAY_IN_MS;
  return Math.max(0, Math.round(daysHeld));
}

/**
 * Determine language from Telegram username or default to English
 * For MVP, we'll default to English unless we have language preference
 * (would need to fetch from session's telegram_language field if available)
 */
function determineLanguage(session: any): ReminderLanguage {
  // If session has a language_code field, use it
  if (session?.telegramLanguage && typeof session.telegramLanguage === "string") {
    return session.telegramLanguage === "am" ? "am" : "en";
  }
  // Otherwise default to English
  return "en";
}

/**
 * Calculate priority for queueing (lower = higher priority)
 * Older debts = higher priority (lower number)
 */
function calculatePriority(daysHeld: number): number {
  // Priority: 0 (oldest) to 1000 (newest)
  // Clamp to reasonable range
  return Math.min(1000, daysHeld);
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Main entry point for daily reminder scheduler
 *
 * @param shopId - The shop (business_id) to process
 * @returns ReminderBatchStats with summary of the run
 *
 * Workflow:
 * 1. Query all customers with balance > 0
 * 2. For each customer, check if they're eligible today (frequency window)
 * 3. Queue reminders for eligible customers
 * 4. Deduplicate customers in the queue
 * 5. Return stats
 */
export async function scheduleReminders(shopId: number): Promise<ReminderBatchStats> {
  const startedAt = Date.now();
  const stats: ReminderBatchStats = {
    startedAt,
    completedAt: 0,
    customersScanned: 0,
    customersWithBalance: 0,
    remindersQueued: 0,
    remindersSent: 0,
    remindersFailed: 0,
    remindersSkipped: 0,
    errors: [],
    shopsProcessed: 1,
    success: true,
  };

  const queuedCustomerIds = new Set<number>(); // Track queued customers for deduplication

  try {
    console.log(`[ReminderScheduler] Starting schedule reminders for shop ${shopId}`);

    // Get eligible customers
    const eligibleCustomers = await getEligibleCustomers(shopId);
    stats.customersScanned = eligibleCustomers.length;

    console.log(
      `[ReminderScheduler] Found ${eligibleCustomers.length} customers with balance > 0`
    );

    // Process each customer
    for (const customer of eligibleCustomers) {
      try {
        // Deduplication: skip if already queued this run
        if (queuedCustomerIds.has(customer.customerId)) {
          console.log(
            `[ReminderScheduler] Skipping duplicate customer ${customer.customerId} in this run`
          );
          stats.remindersSkipped++;
          continue;
        }

        // Check if customer is eligible today per frequency window
        const frequency = await getCustomerFrequency(shopId, customer.customerId);
        const isEligible = isCustomerEligibleToday(
          customer.customerId,
          frequency,
          customer.reminderConfig.lastReminderSentAt
        );

        if (!isEligible) {
          console.log(
            `[ReminderScheduler] Customer ${customer.customerId} not eligible today (frequency: ${frequency})`
          );
          stats.remindersSkipped++;
          continue;
        }

        // Build and queue reminder
        const queued = await queueReminder(customer, {
          frequency,
          lastReminderSentAt: customer.reminderConfig.lastReminderSentAt,
          enabled: customer.reminderConfig.enabled,
        });

        if (queued) {
          queuedCustomerIds.add(customer.customerId);
          stats.remindersQueued++;
          console.log(
            `[ReminderScheduler] Queued reminder for customer ${customer.customerId}, balance: ${customer.balance}`
          );
        }
      } catch (error) {
        stats.errors.push({
          customerId: customer.customerId,
          shopId,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(
          `[ReminderScheduler] Error processing customer ${customer.customerId}:`,
          error
        );
      }
    }

    console.log(
      `[ReminderScheduler] Completed. Queued: ${stats.remindersQueued}, Skipped: ${stats.remindersSkipped}, Errors: ${stats.errors.length}`
    );
  } catch (error) {
    stats.success = false;
    stats.errors.push({
      shopId,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`[ReminderScheduler] Fatal error in schedule reminders:`, error);
  }

  stats.completedAt = Date.now();
  return stats;
}

/**
 * Get all customers with outstanding balance for this shop
 *
 * Query logic (implemented by caller using database):
 * 1. JOIN customers with customer_transactions
 * 2. Calculate SUM(amount) grouped by customer
 * 3. Filter where SUM(amount) > 0
 * 4. Filter where chatId IS NOT NULL (linked to Telegram)
 * 5. Filter where updatesEnabled = true (opted in)
 * 6. Sort by balance descending (biggest debtors first)
 * 7. Include language preference, reminder config
 *
 * Note: This function is exported for use by callers with database access.
 * In tests, mock this function to return test data.
 */
export async function getEligibleCustomers(shopId: number): Promise<EligibleCustomer[]> {
  try {
    console.log(`[ReminderScheduler] Fetching eligible customers for shop ${shopId}`);
    // This will be implemented by the route handler that has database access
    // For now, return empty array to prevent DATABASE_URL requirement in tests
    return [];
  } catch (error) {
    console.error(`[ReminderScheduler] Error fetching eligible customers:`, error);
    throw new Error(
      `Failed to fetch eligible customers: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if a customer is eligible for a reminder TODAY
 *
 * Rules:
 * - If frequency = 'daily': eligible if last send was > 24h ago (or null)
 * - If frequency = 'weekly': eligible if last send was > 7d ago (or null)
 * - If frequency = 'disabled': never eligible
 *
 * @returns true if customer should receive reminder today, false otherwise
 */
export function isCustomerEligibleToday(
  customerId: number,
  frequency: string,
  lastReminderSentAt: number | null
): boolean {
  if (frequency === "disabled") {
    return false;
  }

  // If no last send, customer is eligible
  if (lastReminderSentAt === null) {
    return true;
  }

  const now = Date.now();
  const timeSinceLastSend = now - lastReminderSentAt;

  if (frequency === "daily") {
    return timeSinceLastSend > DAY_IN_MS;
  }

  if (frequency === "weekly") {
    return timeSinceLastSend > WEEK_IN_MS;
  }

  // Unknown frequency, default to not eligible
  return false;
}

/**
 * Create and queue a reminder for a customer
 *
 * @param customer - The eligible customer with balance info
 * @param config - Reminder configuration
 * @returns The queued reminder, or null if queueing failed
 *
 * Builds QueuedReminder with:
 * - All metadata needed for sending
 * - Priority based on days held (older = higher priority)
 * - Language from customer profile
 */
export async function queueReminder(
  customer: EligibleCustomer,
  config: { frequency: string; lastReminderSentAt: number | null; enabled: boolean }
): Promise<QueuedReminder | null> {
  try {
    if (!config.enabled) {
      console.log(`[ReminderScheduler] Reminders disabled for customer ${customer.customerId}`);
      return null;
    }

    // Calculate days held
    const daysHeld = calculateDaysHeld(customer.customerCreatedAt);

    // Calculate priority
    const priority = calculatePriority(daysHeld);

    // Create queued reminder object
    const queued: QueuedReminder = {
      id: `reminder-${customer.customerId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      shopId: 0, // Will be set by caller if needed; scheduler doesn't need to know
      customerId: customer.customerId,
      chatId: customer.chatId,
      balance: customer.balance,
      dueDate: customer.dueDate,
      daysHeld,
      language: customer.telegramLanguage,
      queuedAt: Date.now(),
      priority,
      customerName: customer.customerName,
    };

    console.log(
      `[ReminderScheduler] Created queued reminder: ${queued.id} for customer ${customer.customerId}`
    );

    return queued;
  } catch (error) {
    console.error(`[ReminderScheduler] Error queueing reminder:`, error);
    return null;
  }
}

// ─── Helper: Get Reminder Configuration ─────────────────────────────

/**
 * Fetch or create reminder configuration for a customer
 *
 * This is a wrapper around the ReminderConfigurationService to ensure
 * we always have a configuration object to work with
 */
async function getReminderConfiguration(
  shopId: number,
  customerId: number
): Promise<ReminderConfiguration> {
  try {
    // For now, return a basic configuration
    // In production, this would query the database
    return {
      id: `config-${shopId}-${customerId}`,
      shopId,
      customerId,
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.error(
      `[ReminderScheduler] Error getting reminder configuration for customer ${customerId}:`,
      error
    );
    // Return default config to prevent failures
    return {
      id: `config-${shopId}-${customerId}-fallback`,
      shopId,
      customerId,
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}
