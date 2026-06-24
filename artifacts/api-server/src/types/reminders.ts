/**
 * Telegram Automated Reminders - TypeScript Type Definitions
 * 
 * Defines data structures for reminder configuration, history, and queue.
 * These interfaces work with the existing Telegram session storage and transaction ledger.
 */

/**
 * Reminder frequency settings for a shop or customer
 * - daily: Send at most 1 reminder per 24-hour rolling window
 * - weekly: Send at most 1 reminder per 7-day rolling window
 * - disabled: Do not send reminders (but transaction alerts still work)
 */
export type ReminderFrequency = 'daily' | 'weekly' | 'disabled';

/**
 * Reminder delivery status
 */
export type ReminderDeliveryStatus = 'queued' | 'sent' | 'failed' | 'skipped';

/**
 * Language code for localized messages
 */
export type ReminderLanguage = 'am' | 'en';

/**
 * Shop-level or per-customer reminder frequency configuration
 * 
 * Stored in database table or KV store (e.g., `reminder:config:{shopId}:{customerId}`)
 * 
 * If `customerId` is null, this is the shop default setting.
 * Otherwise, it's a per-customer override that takes precedence over shop default.
 */
export interface ReminderConfiguration {
  /** Unique identifier */
  id: string;

  /** Reference to the shop (business_id) */
  shopId: number;

  /** Reference to the customer, or null if this is shop default */
  customerId: number | null;

  /** Frequency: daily, weekly, or disabled */
  frequency: ReminderFrequency;

  /** Timestamp of last reminder sent to this customer (for deduplication) */
  lastReminderSentAt: number | null;

  /** Is reminder sending enabled (paused for this customer if false) */
  enabled: boolean;

  /** When this configuration was created */
  createdAt: number;

  /** When this configuration was last updated */
  updatedAt: number;
}

/**
 * Audit trail entry for a sent (or failed) reminder
 * 
 * Stored in database table or KV store (e.g., `reminder:history:{shopId}:{customerId}:{timestamp}`)
 * 
 * This record is immutable once created. Used for compliance, debugging, and customer disputes.
 * Retained for at least 90 days.
 */
export interface ReminderHistoryEntry {
  /** Unique identifier */
  id: string;

  /** Reference to the shop (business_id) */
  shopId: number;

  /** Reference to the customer */
  customerId: number;

  /** Telegram chat_id at time of send */
  chatId: string;

  /** Customer balance in ETB at time of send */
  balanceAtSendTime: number;

  /** Due date of the credit (unix timestamp ms), or null if no due date */
  dueDate: number | null;

  /** Number of days the balance has been held (calculated at send time) */
  daysHeld: number;

  /** When the reminder was sent or attempted */
  sentAt: number;

  /** Delivery status: queued, sent, failed, skipped */
  status: ReminderDeliveryStatus;

  /** Language used in the reminder message (am or en) */
  language: ReminderLanguage;

  /** Telegram message_id if successfully sent, otherwise undefined */
  messageId?: string;

  /** Failure reason if status is 'failed' (e.g., "429 Too Many Requests", "400 Chat not found") */
  failureReason?: string;

  /** Number of retry attempts for this reminder */
  retryCount: number;

  /** Timestamp of the last send/retry attempt */
  lastAttemptAt: number;

  /** Optional: customer name snapshot at time of send (for audit) */
  customerNameSnapshot?: string;

  /** Optional: shop name snapshot at time of send (for audit) */
  shopNameSnapshot?: string;
}

/**
 * Eligible customer for reminder sending
 * 
 * Result of the daily scheduler query. Contains minimal info needed to decide
 * whether to queue a reminder.
 */
export interface EligibleCustomer {
  /** Customer id */
  customerId: number;

  /** Customer display name */
  customerName: string;

  /** Current outstanding balance */
  balance: number;

  /** Due date if exists (unix timestamp ms) */
  dueDate: number | null;

  /** When the customer was first created (to calculate days held) */
  customerCreatedAt: number;

  /** Telegram chat_id for this customer */
  chatId: string;

  /** Whether this customer has enabled reminders */
  updatesEnabled: boolean;

  /** Customer's Telegram language preference (detected from telegram profile) */
  telegramLanguage: ReminderLanguage;

  /** Current reminder configuration for this customer */
  reminderConfig: ReminderConfiguration;
}

/**
 * Queued reminder to be sent
 * 
 * Represents a reminder that has been validated and is ready to be sent
 * via Telegram. Created during the scheduler phase, consumed during the sender phase.
 */
export interface QueuedReminder {
  /** Unique identifier */
  id: string;

  /** Reference to the shop */
  shopId: number;

  /** Reference to the customer */
  customerId: number;

  /** Telegram chat_id */
  chatId: string;

  /** Balance to include in message */
  balance: number;

  /** Due date to include in message */
  dueDate: number | null;

  /** Days the balance has been held */
  daysHeld: number;

  /** Language for the message */
  language: ReminderLanguage;

  /** When this reminder was queued */
  queuedAt: number;

  /** Priority (lower = higher priority, for sorting queue) */
  priority: number;

  /** Optional: customer name for message context */
  customerName?: string;

  /** Optional: shop name for message context */
  shopName?: string;
}

/**
 * Reminder batch job statistics
 * 
 * Summary of a single reminder scheduler run.
 */
export interface ReminderBatchStats {
  /** When the batch started */
  startedAt: number;

  /** When the batch completed */
  completedAt: number;

  /** Total customers scanned */
  customersScanned: number;

  /** Customers with outstanding balance */
  customersWithBalance: number;

  /** Reminders queued for sending */
  remindersQueued: number;

  /** Reminders successfully sent */
  remindersSent: number;

  /** Reminders that failed to send */
  remindersFailed: number;

  /** Reminders skipped (e.g., not yet eligible per frequency) */
  remindersSkipped: number;

  /** Errors encountered during the batch */
  errors: Array<{
    customerId?: number;
    shopId?: number;
    error: string;
  }>;

  /** Shops processed */
  shopsProcessed: number;

  /** Success status */
  success: boolean;
}

/**
 * Telegram API error classification
 * 
 * Used to determine whether a failed reminder should be retried, marked failed, or unlinked.
 */
export type TelegramErrorClass = 
  | 'rate_limit'        // 429 Too Many Requests — retry with backoff
  | 'network_timeout'   // Network error — retry with exponential backoff
  | 'invalid_chat'      // 400 Chat not found, 403 Bot blocked — unlink customer
  | 'invalid_token'     // 401 Unauthorized token — unlink customer (bot auth issue)
  | 'other'             // Unknown error — mark failed, don't retry immediately
;

/**
 * Result of sending a single reminder
 */
export interface SendReminderResult {
  /** Whether the send was successful */
  success: boolean;

  /** Telegram message_id if successful */
  messageId?: string;

  /** Error message if failed */
  error?: string;

  /** Error classification */
  errorClass?: TelegramErrorClass;

  /** How many retries have been attempted */
  retryCount: number;

  /** Timestamp of last attempt */
  lastAttemptAt: number;

  /** Should this reminder be retried? */
  shouldRetry: boolean;

  /** If shouldRetry=false, should the customer be unlinked? */
  shouldUnlink: boolean;
}

/**
 * Summary info for reminder config endpoint
 */
export interface ReminderConfigSummary {
  /** Shop default frequency */
  shopDefault: ReminderFrequency;

  /** Total customers with reminders enabled */
  enabledCount: number;

  /** Total customers with reminders disabled */
  disabledCount: number;

  /** Reminders sent this week */
  sentThisWeek: number;

  /** Reminders failed this week */
  failedThisWeek: number;

  /** Whether reminders are paused globally for this shop */
  paused: boolean;
}

/**
 * Request/response for setting shop default reminder frequency
 */
export interface SetReminderConfigRequest {
  frequency: ReminderFrequency;
}

/**
 * Request/response for setting customer-specific reminder frequency override
 */
export interface SetCustomerReminderRequest {
  frequency: ReminderFrequency;
}

/**
 * Reminder history query options
 */
export interface ReminderHistoryQuery {
  /** Limit number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Filter by customer_id */
  customerId?: number;

  /** Filter by status */
  status?: ReminderDeliveryStatus;

  /** Filter by date range (unix timestamp ms) */
  fromDate?: number;
  toDate?: number;
}

/**
 * Reminder history query result
 */
export interface ReminderHistoryResult {
  /** Total entries matching the query */
  total: number;

  /** Paginated results */
  entries: ReminderHistoryEntry[];

  /** Pagination info */
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Helper type: Customer with transaction ledger balance calculated
 * 
 * Used internally by the scheduler to compute outstanding balance.
 */
export interface CustomerWithBalance {
  id: number;
  name: string;
  balance: number;
  dueDate: number | null;
  createdAt: number;
  telegramChatId: string | null;
  updatesEnabled: boolean;
  telegramLanguage: ReminderLanguage;
}

/**
 * Helper type: Telegram session info needed for reminder sending
 * 
 * Subset of TelegramLinkSession from telegramStore.ts
 */
export interface ReminderTelegramSession {
  token: string;
  chatId: string;
  telegramUsername: string | null;
  customerId: string;
  customerName: string;
  shopName: string;
  updatesEnabled: boolean;
  lastUpdatedAt: number | null;
}
