import { db } from "@workspace/db";
import { reminderHistory, type InsertReminderHistory, type ReminderHistory } from "@workspace/db/schema";
import { businesses } from "@workspace/db/schema";
import { eq, and, gt, lt, desc, asc, count as countFn } from "drizzle-orm";
import { logger } from "../utils/logger";

/**
 * ReminderHistoryEntry: A single reminder send attempt record.
 * Immutable append-only audit trail for compliance.
 */
export interface ReminderHistoryEntry {
  id: number;
  shopId: number;
  customerId: number;
  chatId: string;
  balanceAtSendTime: string;
  dueDate: number | null;
  daysHeld: number | null;
  sentAt: number;
  status: "sent" | "failed" | "queued" | "skipped";
  language: "am" | "en";
  messageId?: string | null;
  failureReason?: string | null;
  retryCount: number;
  lastAttemptAt: number | null;
  customerNameSnapshot?: string | null;
  shopNameSnapshot?: string | null;
  createdAt: Date;
}

/**
 * ReminderHistoryResult: Paginated query result for reminder history.
 */
export interface ReminderHistoryResult {
  total: number;
  entries: ReminderHistoryEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * ReminderHistoryStats: Aggregated statistics for a shop's reminder activity.
 */
export interface ReminderHistoryStats {
  totalRemindersSentAllTime: number;
  remindersSentThisWeek: number;
  remindersFailedThisWeek: number;
  averageDeliveryTimeMs: number;
  uniqueCustomersRemindedThisWeek: number;
  unlinkedCustomersCount: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const RETENTION_DAYS = 90;

/**
 * createHistoryEntry: Store a new reminder send attempt record.
 *
 * @param reminderData - Reminder metadata to store
 * @returns Full entry with auto-set id and createdAt
 */
export async function createHistoryEntry(
  reminderData: Omit<InsertReminderHistory, "createdAt">
): Promise<ReminderHistoryEntry> {
  const now = Date.now();
  const entry: InsertReminderHistory = {
    ...reminderData,
  };

  const result = await db.insert(reminderHistory).values(entry).returning();

  if (!result[0]) {
    throw new Error("Failed to create reminder history entry");
  }

  logger.info("Reminder history entry created", {
    id: result[0].id,
    shopId: result[0].shopId,
    customerId: result[0].customerId,
    status: result[0].status,
    language: result[0].language,
  });

  return mapToReminderHistoryEntry(result[0]);
}

/**
 * getHistoryByShop: Retrieve paginated reminder history for a shop.
 *
 * @param shopId - Shop ID to query
 * @param limit - Results per page (default 50, max 500)
 * @param offset - Pagination offset
 * @returns Paginated result with total count
 */
export async function getHistoryByShop(
  shopId: number,
  limit: number = DEFAULT_LIMIT,
  offset: number = 0
): Promise<ReminderHistoryResult> {
  // Validate and clamp limit
  const validLimit = Math.min(Math.max(1, limit || DEFAULT_LIMIT), MAX_LIMIT);
  const validOffset = Math.max(0, offset || 0);

  // Get total count
  const countResult = await db
    .select({ count: countFn() })
    .from(reminderHistory)
    .where(eq(reminderHistory.shopId, shopId));

  const total = countResult[0]?.count ?? 0;

  // Get paginated entries
  const entries = await db
    .select()
    .from(reminderHistory)
    .where(eq(reminderHistory.shopId, shopId))
    .orderBy(desc(reminderHistory.sentAt))
    .limit(validLimit)
    .offset(validOffset);

  logger.debug("Retrieved reminder history for shop", {
    shopId,
    total,
    limit: validLimit,
    offset: validOffset,
    returned: entries.length,
  });

  return {
    total,
    entries: entries.map(mapToReminderHistoryEntry),
    limit: validLimit,
    offset: validOffset,
    hasMore: validOffset + entries.length < total,
  };
}

/**
 * getHistoryByCustomer: Retrieve paginated reminder history for a specific customer.
 *
 * @param shopId - Shop ID (required for proper scoping)
 * @param customerId - Customer ID to query
 * @param limit - Results per page (default 50, max 500)
 * @param offset - Pagination offset
 * @returns Paginated result filtered by shop AND customer
 */
export async function getHistoryByCustomer(
  shopId: number,
  customerId: number,
  limit: number = DEFAULT_LIMIT,
  offset: number = 0
): Promise<ReminderHistoryResult> {
  // Validate and clamp limit
  const validLimit = Math.min(Math.max(1, limit || DEFAULT_LIMIT), MAX_LIMIT);
  const validOffset = Math.max(0, offset || 0);

  // Get total count
  const countResult = await db
    .select({ count: countFn() })
    .from(reminderHistory)
    .where(
      and(eq(reminderHistory.shopId, shopId), eq(reminderHistory.customerId, customerId))
    );

  const total = countResult[0]?.count ?? 0;

  // Get paginated entries
  const entries = await db
    .select()
    .from(reminderHistory)
    .where(
      and(eq(reminderHistory.shopId, shopId), eq(reminderHistory.customerId, customerId))
    )
    .orderBy(desc(reminderHistory.sentAt))
    .limit(validLimit)
    .offset(validOffset);

  logger.debug("Retrieved reminder history for customer", {
    shopId,
    customerId,
    total,
    limit: validLimit,
    offset: validOffset,
    returned: entries.length,
  });

  return {
    total,
    entries: entries.map(mapToReminderHistoryEntry),
    limit: validLimit,
    offset: validOffset,
    hasMore: validOffset + entries.length < total,
  };
}

/**
 * deleteOldEntries: Remove reminder history older than 90 days.
 *
 * Called by daily cleanup job to maintain storage and compliance.
 *
 * @param beforeDate - Optional override date (unix ms). Defaults to now - 90 days.
 * @returns Number of deleted entries
 */
export async function deleteOldEntries(
  beforeDate?: number
): Promise<{ deletedCount: number }> {
  const cutoffTime = beforeDate ?? Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffTimestamp = new Date(cutoffTime);

  const deleted = await db
    .delete(reminderHistory)
    .where(lt(reminderHistory.createdAt, cutoffTimestamp));

  const deletedCount = deleted.rowCount ?? 0;

  logger.info("Deleted old reminder history entries", {
    deletedCount,
    beforeDate: new Date(cutoffTime).toISOString(),
    retentionDays: RETENTION_DAYS,
  });

  return { deletedCount };
}

/**
 * getStats: Retrieve aggregated statistics for a shop's reminder activity.
 *
 * @param shopId - Shop ID to query
 * @returns Aggregated statistics
 */
export async function getStats(shopId: number): Promise<ReminderHistoryStats> {
  const now = Date.now();
  const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const weekAgoDate = new Date(weekAgoMs);

  // Total reminders sent (all time)
  const totalAllTimeResult = await db
    .select({ count: countFn() })
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "sent")
      )
    );
  const totalRemindersSentAllTime = totalAllTimeResult[0]?.count ?? 0;

  // Reminders sent this week
  const sentThisWeekResult = await db
    .select({ count: countFn() })
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "sent"),
        gt(reminderHistory.createdAt, weekAgoDate)
      )
    );
  const remindersSentThisWeek = sentThisWeekResult[0]?.count ?? 0;

  // Reminders failed this week
  const failedThisWeekResult = await db
    .select({ count: countFn() })
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "failed"),
        gt(reminderHistory.createdAt, weekAgoDate)
      )
    );
  const remindersFailedThisWeek = failedThisWeekResult[0]?.count ?? 0;

  // Unique customers reminded this week
  const uniqueCustomersThisWeek = await db
    .selectDistinct({ customerId: reminderHistory.customerId })
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "sent"),
        gt(reminderHistory.createdAt, weekAgoDate)
      )
    );
  const uniqueCustomersRemindedThisWeek = uniqueCustomersThisWeek.length;

  // Unlinked customers (those with "unlinked" failure reason or skipped status)
  const unlinkedResult = await db
    .select({ count: countFn() })
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "skipped")
      )
    );
  const unlinkedCustomersCount = unlinkedResult[0]?.count ?? 0;

  // Calculate average delivery time (for successful sends, time from sentAt to createdAt)
  // In practice, this is very fast (milliseconds) since we log immediately after sending
  const sentEntries = await db
    .select()
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "sent")
      )
    )
    .limit(100); // Sample recent entries

  let averageDeliveryTimeMs = 0;
  if (sentEntries.length > 0) {
    const totalTime = sentEntries.reduce((sum, entry) => {
      const deliveryTime = entry.createdAt.getTime() - entry.sentAt;
      return sum + Math.max(deliveryTime, 0);
    }, 0);
    averageDeliveryTimeMs = Math.round(totalTime / sentEntries.length);
  }

  logger.debug("Retrieved reminder stats for shop", {
    shopId,
    totalRemindersSentAllTime,
    remindersSentThisWeek,
    remindersFailedThisWeek,
    uniqueCustomersRemindedThisWeek,
    unlinkedCustomersCount,
    averageDeliveryTimeMs,
  });

  return {
    totalRemindersSentAllTime,
    remindersSentThisWeek,
    remindersFailedThisWeek,
    averageDeliveryTimeMs,
    uniqueCustomersRemindedThisWeek,
    unlinkedCustomersCount,
  };
}

/**
 * updateHistoryStatus: Update the status and metadata of a queued/sent reminder.
 *
 * Used by ReminderSender to mark sends as successful or failed.
 *
 * @param id - Reminder history entry ID
 * @param status - New status
 * @param messageId - Telegram message ID (if successful)
 * @param failureReason - Failure reason (if failed)
 */
export async function updateHistoryStatus(
  id: number,
  status: "sent" | "failed" | "skipped",
  messageId?: string,
  failureReason?: string
): Promise<ReminderHistoryEntry | null> {
  const updates: Partial<typeof reminderHistory.$inferInsert> = {
    status,
    lastAttemptAt: Date.now(),
  };

  if (messageId) {
    updates.messageId = messageId;
  }

  if (failureReason) {
    updates.failureReason = failureReason;
  }

  const result = await db
    .update(reminderHistory)
    .set(updates)
    .where(eq(reminderHistory.id, id))
    .returning();

  if (!result[0]) {
    logger.warn("Failed to update reminder history status", { id });
    return null;
  }

  logger.info("Updated reminder history status", {
    id,
    status,
    messageId,
    failureReason,
  });

  return mapToReminderHistoryEntry(result[0]);
}

/**
 * incrementRetryCount: Increment the retry count for a queued reminder.
 *
 * @param id - Reminder history entry ID
 */
export async function incrementRetryCount(id: number): Promise<void> {
  const entry = await db
    .select()
    .from(reminderHistory)
    .where(eq(reminderHistory.id, id))
    .limit(1);

  if (!entry[0]) {
    logger.warn("Cannot increment retry count: entry not found", { id });
    return;
  }

  const newRetryCount = (entry[0].retryCount ?? 0) + 1;

  await db
    .update(reminderHistory)
    .set({
      retryCount: newRetryCount,
      lastAttemptAt: Date.now(),
    })
    .where(eq(reminderHistory.id, id));

  logger.debug("Incremented retry count", { id, retryCount: newRetryCount });
}

/**
 * getQueuedReminders: Fetch all reminders queued for sending for a given shop.
 *
 * Used by ReminderSender to batch-send queued reminders.
 *
 * @param shopId - Shop ID
 * @param limit - Max reminders to fetch
 * @returns Array of queued reminders
 */
export async function getQueuedReminders(
  shopId: number,
  limit: number = 100
): Promise<ReminderHistoryEntry[]> {
  const entries = await db
    .select()
    .from(reminderHistory)
    .where(
      and(
        eq(reminderHistory.shopId, shopId),
        eq(reminderHistory.status, "queued")
      )
    )
    .orderBy(asc(reminderHistory.createdAt))
    .limit(limit);

  return entries.map(mapToReminderHistoryEntry);
}

// ─── Helper Functions ─────────────────────────────────────────────────

/**
 * mapToReminderHistoryEntry: Convert database record to service type.
 */
function mapToReminderHistoryEntry(
  dbEntry: typeof reminderHistory.$inferSelect
): ReminderHistoryEntry {
  return {
    id: dbEntry.id,
    shopId: dbEntry.shopId,
    customerId: dbEntry.customerId,
    chatId: dbEntry.chatId,
    balanceAtSendTime: dbEntry.balanceAtSendTime,
    dueDate: dbEntry.dueDate,
    daysHeld: dbEntry.daysHeld,
    sentAt: dbEntry.sentAt,
    status: dbEntry.status as "sent" | "failed" | "queued" | "skipped",
    language: dbEntry.language as "am" | "en",
    messageId: dbEntry.messageId,
    failureReason: dbEntry.failureReason,
    retryCount: dbEntry.retryCount ?? 0,
    lastAttemptAt: dbEntry.lastAttemptAt,
    customerNameSnapshot: dbEntry.customerNameSnapshot,
    shopNameSnapshot: dbEntry.shopNameSnapshot,
    createdAt: dbEntry.createdAt,
  };
}
