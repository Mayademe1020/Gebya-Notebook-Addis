# Design Document

## Telegram Automated Reminders

## Overview

The Telegram Automated Reminders feature extends Gebya's existing Telegram integration to send proactive reminders when customers owe money. Reminders are scheduled daily, respect frequency preferences (daily/weekly), comply with Telegram bot rules, and help reduce payment delays while maintaining trust.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Gebya Telegram Reminder System                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Reminder Scheduler (Cron Job / Polling)           │   │
│  │    - Daily: Run at shop owner's local time (8 AM)   │   │
│  │    - Query: Customers with balance > 0              │   │
│  │    - Filter: By reminder frequency preference        │   │
│  │    - Queue: Eligible reminders for sending           │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. Reminder Queue (In-Memory or Async Job Queue)    │   │
│  │    - Store pending reminders with metadata           │   │
│  │    - Track: customer_id, shop_id, due_date, balance │   │
│  │    - Deduplication: 24h or 7d windows               │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. Message Builder (Templating & Localization)      │   │
│  │    - Language detection (Amharic / English)          │   │
│  │    - Template: Balance + Due Date + Days Held        │   │
│  │    - Retry logic: 3 attempts, exponential backoff    │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 4. Telegram Bot Service (Existing)                  │   │
│  │    - sendTelegramTextMessage()                       │   │
│  │    - Rate limiting: 100 msg/sec burst               │   │
│  │    - Error handling: 429, timeout, invalid chat_id   │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 5. Session Store (Existing Vercel KV / Memory)      │   │
│  │    - TelegramLinkSession: updatesEnabled, chatId     │   │
│  │    - Last message, last updated timestamp            │   │
│  │    - Expiry: 7 days (re-link if older)              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 6. Audit Log / History (New Table or KV Entries)     │   │
│  │    - Store: customer_id, shop_id, sent_at, language │   │
│  │    - Status: sent, failed, retry_count               │   │
│  │    - Retention: 90 days                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Reminder Configuration (per shop or per customer)

```typescript
interface ReminderConfiguration {
  id: string;
  shopId: string;
  customerId?: string | null;  // null = shop default
  frequency: 'daily' | 'weekly' | 'disabled';
  lastReminderSentAt: number | null;  // timestamp
  enabled: boolean;  // false = paused
  createdAt: number;
  updatedAt: number;
}
```

### Reminder History Entry

```typescript
interface ReminderHistoryEntry {
  id: string;
  shopId: string;
  customerId: string;
  chatId: string;
  balanceAtSendTime: number;
  dueDate: number | null;
  sentAt: number;
  status: 'sent' | 'failed' | 'queued';
  language: 'am' | 'en';
  messageId?: string;  // Telegram message ID if successful
  failureReason?: string;
  retryCount: number;
  lastAttemptAt: number;
}
```

### Extended Session Storage

The existing `TelegramLinkSession` is reused without new fields. The `updatesEnabled` flag controls both transaction alerts and reminders.

## Data Models

All data models defined above plus configuration and history storage.

## Error Handling

Error handling includes Telegram API failures (429 rate limit, 400 invalid chat, 401 token), network timeouts, and graceful retry with exponential backoff. Failed reminders are logged and retried on next cycle without blocking other customers.

## Correctness Properties

### Property 1: Deduplication Enforcement

**Validates: Requirements 2.5, 2.6, 4.4**

No customer receives more than one reminder per 24-hour period (if daily frequency) or per 7-day period (if weekly). Verified by checking `lastReminderSentAt` timestamp before queueing.

### Property 2: Opt-in Consent

**Validates: Requirements 1.4, 7.1, 7.3**

Reminders are only sent to customers who have Telegram linked (`chatId != null`) and `updatesEnabled = true`. Reminders should never be sent if either condition is false.

### Property 3: Balance Accuracy

**Validates: Requirement 3.1**

Reminder message shows the current balance at send time, not stale data. Balance calculated from transaction ledger, not a cached field.

### Property 4: Failure Isolation

**Validates: Requirements 8.1, 8.2**

If a reminder fails for one customer, reminders for other customers are not blocked. A batch job continues after isolated failures.

### Property 5: Session Integrity

**Validates: Requirement 12.6**

Sending a reminder does not corrupt or lose session data (chatId, updatesEnabled, etc.). Session state is immutable except for `lastMessage` and `lastUpdatedAt` fields.

### Property 6: Telegram Compliance

**Validates: Requirements 5.1, 5.2, 5.3**

Reminders respect Telegram bot rate limiting (max 100 msg/sec) and do not violate Telegram's terms of service. No repeated sending if flagged as spam.Reminders respect Telegram bot rate limiting (max 100 msg/sec) and do not violate Telegram's terms of service. No repeated sending if flagged as spam.

## Testing Strategy

Unit tests mock Telegram API and session storage. Integration tests verify end-to-end reminder sending. Tests cover: message templating, frequency rules, retry logic, error classification, deduplication, and pagination.

## Services Overview

**Purpose**: Query customers with outstanding balance and queue reminders per frequency rules.

```typescript
interface ReminderSchedulerService {
  // Run daily at owner's local time (8 AM)
  scheduleReminders(shopId: string): Promise<void>;

  // Find customers eligible for reminder today
  getEligibleCustomers(shopId: string): Promise<EligibleCustomer[]>;

  // Check if customer is due for reminder (24h or 7d window)
  isCustomerEligibleToday(
    customerId: string,
    frequency: 'daily' | 'weekly',
    lastReminderSentAt: number | null
  ): boolean;

  // Queue reminder for sending
  queueReminder(
    shopId: string,
    customerId: string,
    balance: number,
    dueDate: number | null
  ): Promise<ReminderHistoryEntry>;
}
```

### 2. **ReminderMessageBuilder Service** (New)

**Purpose**: Build localized reminder messages with balance, due date, days held.

```typescript
interface ReminderMessageBuilderService {
  // Build message in customer's language
  buildReminderMessage(
    language: 'am' | 'en',
    customerName: string,
    balance: number,
    dueDate: number | null,
    daysHeld: number
  ): string;

  // Amharic template example:
  // "🏪 [Shop Name]\n\n👤 [Customer Name]\n💰 ቀሪ ሂሳብ: [Balance] ብር\n📅 ጊዜ ያበቃ: [DaysHeld] ቀን\n\n/balance ይተይቡ ወይም /paid ያረጋግጡ።"

  // English template example:
  // "🏪 [Shop Name]\n\n👤 [Customer Name]\n💰 Balance due: [Balance] ETB\n📅 Days held: [DaysHeld]\n\nType /balance or /paid to confirm."
}
```

### 3. **ReminderSender Service** (New)

**Purpose**: Send queued reminders via Telegram with retry logic and error handling.

```typescript
interface ReminderSenderService {
  // Send all queued reminders for a shop (up to 100/sec)
  sendQueuedReminders(shopId: string): Promise<void>;

  // Send single reminder with retry (3x, exponential backoff)
  sendReminder(
    history: ReminderHistoryEntry,
    session: TelegramLinkSession
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  // Handle Telegram errors
  handleSendError(
    error: TelegramError,
    history: ReminderHistoryEntry
  ): Promise<'retry' | 'failed' | 'unlink'>;

  // Record delivery in history
  recordDelivery(
    historyId: string,
    status: 'sent' | 'failed',
    messageId?: string,
    error?: string
  ): Promise<void>;
}
```

### 4. **ReminderConfigurationService** (New)

**Purpose**: Manage shop and per-customer reminder settings.

```typescript
interface ReminderConfigurationService {
  // Get or create shop default frequency
  getShopDefault(shopId: string): Promise<'daily' | 'weekly' | 'disabled'>;

  // Set shop default
  setShopDefault(
    shopId: string,
    frequency: 'daily' | 'weekly' | 'disabled'
  ): Promise<void>;

  // Get customer-specific override
  getCustomerFrequency(
    shopId: string,
    customerId: string
  ): Promise<'daily' | 'weekly' | 'disabled'>;

  // Set customer-specific override
  setCustomerFrequency(
    shopId: string,
    customerId: string,
    frequency: 'daily' | 'weekly' | 'disabled'
  ): Promise<void>;

  // Check if reminders are enabled for this customer
  isRemindersEnabled(
    shopId: string,
    customerId: string
  ): Promise<boolean>;
}
```

## Workflow

### Workflow 1: Daily Reminder Scheduling

```
1. Cron job triggers at 08:00 (shop owner's local time)
   └─> ReminderScheduler.scheduleReminders(shopId)

2. Query database for all customers with balance > 0
   └─> Fetch from transaction ledger, not from a separate balance table

3. For each customer:
   a. Lookup Telegram session (chatId, updatesEnabled, lastMessage, lastUpdatedAt)
   b. Check reminder configuration (frequency, lastReminderSentAt)
   c. Calculate balance, due date, days held
   d. Determine language from session.telegramUsername or default to 'en'
   e. Check eligibility (frequency window)

4. Queue eligible reminders
   └─> Store in ReminderHistoryEntry with status='queued'

5. ReminderSender.sendQueuedReminders(shopId)
   └─> Iterate through queue, send to Telegram, update status

6. If Telegram error:
   └─> Classify as 'retry', 'failed', or 'unlink' based on error type
   └─> Update ReminderHistoryEntry.retryCount, lastAttemptAt, failureReason
   └─> If max retries exceeded, set status='failed'

7. Log success/failure for audit
   └─> Record timestamp, language, balance, messageId (if successful)
```

### Workflow 2: Customer Links via /start

```
1. Customer taps bot deep link (t.me/bot?start=TOKEN)
2. Webhook receives /start with TOKEN
3. linkTelegramChatToSession(chatId, token, username)
   └─> Sets linkedAt, chatId, updatesEnabled = true
4. Session stored in KV with 7-day TTL
5. Future reminder scheduler checks updatesEnabled before queueing
```

### Workflow 3: Customer Unsubscribes (/unsubscribe)

```
1. Customer types /unsubscribe in bot chat
2. Webhook receives /unsubscribe command
3. Lookup session by chatId
4. Update: updatesEnabled = false
5. No more reminders sent, but transaction alerts still work
6. Customer sees: "You will no longer receive reminders. Type /subscribe to opt back in."
```

### Workflow 4: Transaction Alert → Reminder

```
1. Shop owner records new credit transaction
2. Webhook sends transaction alert (existing behavior)
   └─> "✓ [Amount] added. Balance: [NewBalance]. Type /balance."
3. System checks: if balance > 0 and updatesEnabled, schedule reminder
   └─> Set reminder queue entry with status='queued'
   └─> Reminder will be sent on next scheduler run (not immediately)
4. If updatesEnabled=false, transaction alert still sends, reminder does not queue
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Start of Day (8 AM)                                            │
│  ReminderScheduler.scheduleReminders()                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ Query Customers        │
        │ with Balance > 0        │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ For each customer:                      │
        │  - Lookup Telegram session (KV)         │
        │  - Check reminder config (DB)           │
        │  - Calc: balance, due_date, days_held  │
        │  - Check frequency window (24h/7d)      │
        │  - Determine language (am/en)           │
        └────────────┬──────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ Queue Reminder (ReminderHistoryEntry)   │
        │  status='queued'                        │
        └────────────┬──────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │ ReminderSender.sendQueuedReminders()    │
        │  - Rate limit: 100/sec                  │
        │  - Retry: 3x, exponential backoff       │
        │  - Error handling: 429, timeout, etc    │
        └────────────┬──────────────────────────┘
                     │
        ┌────────────┴──────────────┬───────────┐
        ▼                          ▼            ▼
     SUCCESS              RETRY (1s, 2s, 4s)   FAILED
     status='sent'        Retry count++        status='failed'
     Record messageId     lastAttemptAt        failureReason
     Update session:      Try again            Mark unlinked?
       lastMessage
       lastUpdatedAt
```

## API Endpoints (New)

### GET `/api/telegram/reminders/config`
- Get shop's default reminder frequency
- Response: `{ frequency: 'daily' | 'weekly' | 'disabled' }`

### POST `/api/telegram/reminders/config`
- Set shop's default reminder frequency
- Body: `{ frequency: 'daily' | 'weekly' | 'disabled' }`
- Auth: Owner only

### GET `/api/telegram/reminders/config/:customerId`
- Get customer-specific reminder override
- Response: `{ frequency: 'daily' | 'weekly' | 'disabled', override: true|false }`

### POST `/api/telegram/reminders/config/:customerId`
- Set customer-specific override
- Body: `{ frequency: 'daily' | 'weekly' | 'disabled' }`
- Auth: Owner only

### GET `/api/telegram/reminders/history?limit=50&offset=0`
- Get reminder history for shop
- Response: `{ total, entries: [{ customerId, sentAt, status, language, ... }] }`

### POST `/api/telegram/reminders/test/:customerId`
- Send test reminder to customer (manual)
- Body: `{}`
- Response: `{ sent: true, messageId?: string, error?: string }`
- Auth: Owner only

### POST `/api/telegram/reminders/pause`
- Pause all reminders for shop
- Body: `{}`
- Auth: Owner only

### POST `/api/telegram/reminders/resume`
- Resume reminders for shop
- Body: `{}`
- Auth: Owner only

## Webhook Updates (Existing)

### Add to `/webhook` handler:

```typescript
// Detect /unsubscribe command
if (cmd === "/unsubscribe") {
  const session = await getSessionByChatId(chatId);
  if (session) {
    await syncTelegramCustomerState({
      token: session.token,
      updatesEnabled: false,
    });
  }
  await sendTelegramTextMessage(
    chatId,
    "You will no longer receive reminders. Type /subscribe to opt back in."
  );
  return res.json({ ok: true, unsubscribed: true });
}

// Detect /subscribe command
if (cmd === "/subscribe") {
  const session = await getSessionByChatId(chatId);
  if (session) {
    await syncTelegramCustomerState({
      token: session.token,
      updatesEnabled: true,
    });
  }
  await sendTelegramTextMessage(
    chatId,
    "You'll receive reminders again. Thanks for staying connected!"
  );
  return res.json({ ok: true, subscribed: true });
}
```

## Implementation Notes

1. **MVP Scope**: Reminders require a **background job** (cron or serverless function). Vercel cron or a separate Node.js scheduler can trigger `POST /api/telegram/reminders/run` at 8 AM daily.

2. **Queue Storage**: Use Redis (existing Vercel KV) or an in-memory queue. For MVP, in-memory is fine; for scale, use a proper job queue library (Bull, BullMQ).

3. **Customer Balance**: Query the transaction ledger (existing `customer_credit` and `customer_payment` events), NOT a cached balance table. Ensure balance is correct at send time.

4. **Timezone Handling**: Store shop owner's timezone in `shops` table (future). For MVP, default to UTC or 08:00 UTC daily.

5. **Telegram Session Storage**: Reuse existing Vercel KV + in-memory fallback. No new database table needed.

6. **Language Detection**: Use `message.from.language_code` from Telegram webhook (already available). Map "am-ET" → "am", anything else → "en".

7. **Compliance**: Enforce 24-hour and 7-day windows via `lastReminderSentAt` timestamp. Store all send attempts for audit.

8. **Testing**: Mock Telegram API, mock session storage, test message templating, frequency logic, retry backoff.

---

## Components / Files to Create or Modify

### New Services

- `src/services/reminderScheduler.ts` — Daily job to identify and queue reminders
- `src/services/reminderMessageBuilder.ts` — Localized message templating
- `src/services/reminderSender.ts` — Send queued reminders with retry logic
- `src/services/reminderConfiguration.ts` — Manage shop/customer reminder settings

### New Routes

- `src/routes/reminders.ts` — API endpoints for config, history, manual send, pause/resume

### Existing Routes to Update

- `src/routes/telegram.ts` — Add /unsubscribe, /subscribe commands to webhook handler

### New Database / KV

- `ReminderConfiguration` table (or KV entries like `reminder:config:{shopId}:{customerId}`)
- `ReminderHistoryEntry` table (or KV entries like `reminder:history:{shopId}:{customerId}:{timestamp}`)

### New Utilities

- `src/utils/reminderCron.ts` — Cron job entry point for daily scheduler
- `src/utils/messageTemplates.ts` — Amharic and English reminder message templates

---
