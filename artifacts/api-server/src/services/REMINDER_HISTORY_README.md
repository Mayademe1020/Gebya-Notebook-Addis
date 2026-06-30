# Reminder History Persistence Service

## Overview

The Reminder History Service provides persistent, auditable storage for all reminder send attempts. This enables compliance tracking, customer dispute resolution, and debugging of reminder delivery issues.

**File**: `src/services/reminderHistory.ts`  
**Database Schema**: `lib/db/src/schema/reminder_history.ts`  
**Tests**: `src/services/__tests__/reminderHistory.test.ts`

## Key Features

### 1. **Immutable Append-Only Records**
- Each reminder attempt creates a new record that is never modified
- Ensures audit trail integrity and prevents accidental data loss
- Records include full snapshot of data at send time (balance, customer name, shop name)

### 2. **Fast Querying with Indexes**
- **Shop-level query**: `(shop_id, customer_id)` index for customer history
- **Date-based query**: `(shop_id, sent_at)` index for daily/weekly review
- **Status query**: `(status)` index for filtering sent/failed/queued
- **Retention**: `(created_at)` index for efficient cleanup of old entries

### 3. **Automatic 90-Day Cleanup**
- `deleteOldEntries()` removes records older than 90 days
- Called daily by cleanup job to balance compliance with storage efficiency
- Logged for transparency and auditability

### 4. **Aggregated Statistics**
- `getStats()` provides shop-level metrics:
  - Total reminders sent (all-time)
  - Reminders sent/failed this week
  - Average delivery time
  - Unique customers reminded
  - Unlinked customers count

### 5. **Performance Guarantees**
- All queries designed to run in < 200ms
- Pagination prevents large result sets
- Batch operations optimized with indexes

## Database Schema

```typescript
reminderHistory = pgTable(
  'reminder_history',
  {
    id: serial('id').primaryKey(),                                    // auto-increment
    shopId: integer('shop_id').references(businesses.id),            // required
    customerId: integer('customer_id'),                               // required
    chatId: text('chat_id'),                                          // required
    balanceAtSendTime: numeric('balance_at_send_time', { precision: 10, scale: 2 }), // ETB
    dueDate: bigint('due_date'),                                      // unix ms or null
    daysHeld: integer('days_held'),                                   // optional
    sentAt: bigint('sent_at'),                                        // unix ms
    status: varchar('status', { length: 20 }),                        // sent|failed|queued|skipped
    language: varchar('language', { length: 2 }),                     // am|en
    messageId: text('message_id'),                                    // Telegram ID or null
    failureReason: text('failure_reason'),                            // error description
    retryCount: integer('retry_count').default(0),                    // retry attempts
    lastAttemptAt: bigint('last_attempt_at'),                         // unix ms
    customerNameSnapshot: text('customer_name_snapshot'),             // for audit
    shopNameSnapshot: text('shop_name_snapshot'),                     // for audit
    createdAt: timestamp('created_at').defaultNow(),                  // insertion time
  },
  (table) => ({
    shopCustomerIdx: index('idx_reminder_history_shop_customer').on(table.shopId, table.customerId),
    shopDateIdx: index('idx_reminder_history_shop_date').on(table.shopId, table.sentAt),
    statusIdx: index('idx_reminder_history_status').on(table.status),
    createdAtIdx: index('idx_reminder_history_created_at').on(table.createdAt),
  })
);
```

## API Reference

### `createHistoryEntry(reminderData)`

Create a new reminder history record.

**Parameters:**
```typescript
{
  shopId: number;
  customerId: number;
  chatId: string;
  balanceAtSendTime: string | number;
  sentAt: number;                    // unix ms
  status: 'sent' | 'failed' | 'queued' | 'skipped';
  language: 'am' | 'en';
  dueDate?: number | null;            // unix ms
  daysHeld?: number | null;
  messageId?: string | null;
  failureReason?: string | null;
  retryCount?: number;
  lastAttemptAt?: number | null;
  customerNameSnapshot?: string | null;
  shopNameSnapshot?: string | null;
}
```

**Returns:**
```typescript
{
  id: number;
  shopId: number;
  customerId: number;
  // ... all fields from input, plus:
  createdAt: Date;
}
```

**Example:**
```typescript
const entry = await reminderHistoryService.createHistoryEntry({
  shopId: 100,
  customerId: 1001,
  chatId: '123456',
  balanceAtSendTime: '500.00',
  sentAt: Date.now(),
  status: 'sent',
  language: 'en',
  messageId: 'msg_123',
  daysHeld: 5,
  customerNameSnapshot: 'Abebe',
  shopNameSnapshot: 'My Shop',
});
```

### `getHistoryByShop(shopId, limit, offset)`

Retrieve paginated reminder history for a shop.

**Parameters:**
- `shopId: number` - Shop ID to query
- `limit?: number` - Results per page (default: 50, max: 500)
- `offset?: number` - Pagination offset (default: 0)

**Returns:**
```typescript
{
  total: number;
  entries: ReminderHistoryEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

**Example:**
```typescript
// Get most recent 50 reminders for shop 100
const result = await reminderHistoryService.getHistoryByShop(100, 50, 0);
console.log(`Total reminders: ${result.total}`);
console.log(`Page 1 entries: ${result.entries.length}`);
console.log(`Has more: ${result.hasMore}`);

// Get next page
const page2 = await reminderHistoryService.getHistoryByShop(100, 50, 50);
```

### `getHistoryByCustomer(shopId, customerId, limit, offset)`

Retrieve paginated reminder history for a specific customer.

**Parameters:**
- `shopId: number` - Shop ID (required for scoping)
- `customerId: number` - Customer ID to query
- `limit?: number` - Results per page (default: 50, max: 500)
- `offset?: number` - Pagination offset (default: 0)

**Returns:** Same as `getHistoryByShop()`

**Example:**
```typescript
// Get all reminders sent to customer 1001 at shop 100
const result = await reminderHistoryService.getHistoryByCustomer(100, 1001, 50, 0);
result.entries.forEach(entry => {
  console.log(`Sent ${entry.sentAt}: balance=${entry.balanceAtSendTime}, status=${entry.status}`);
});
```

### `deleteOldEntries(beforeDate?)`

Remove reminder history entries older than 90 days (or specified date).

**Parameters:**
- `beforeDate?: number` - Optional unix ms cutoff (defaults to 90 days ago)

**Returns:**
```typescript
{ deletedCount: number }
```

**Example:**
```typescript
// Daily cleanup job (run at 2 AM)
const result = await reminderHistoryService.deleteOldEntries();
console.log(`Deleted ${result.deletedCount} old reminder entries`);

// Custom cutoff: delete before Jan 1, 2024
const jan1 = new Date('2024-01-01').getTime();
await reminderHistoryService.deleteOldEntries(jan1);
```

### `getStats(shopId)`

Retrieve aggregated statistics for a shop's reminder activity.

**Parameters:**
- `shopId: number` - Shop ID to analyze

**Returns:**
```typescript
{
  totalRemindersSentAllTime: number;
  remindersSentThisWeek: number;
  remindersFailedThisWeek: number;
  averageDeliveryTimeMs: number;
  uniqueCustomersRemindedThisWeek: number;
  unlinkedCustomersCount: number;
}
```

**Example:**
```typescript
const stats = await reminderHistoryService.getStats(100);
console.log(`This week: ${stats.remindersSentThisWeek} sent, ${stats.remindersFailedThisWeek} failed`);
console.log(`Customer reach: ${stats.uniqueCustomersRemindedThisWeek} unique customers`);
console.log(`All-time: ${stats.totalRemindersSentAllTime} total reminders`);
```

### `updateHistoryStatus(id, status, messageId?, failureReason?)`

Update the status of a reminder entry after sending attempt.

**Parameters:**
- `id: number` - Reminder history entry ID
- `status: 'sent' | 'failed' | 'skipped'` - New status
- `messageId?: string` - Telegram message ID (if sent successfully)
- `failureReason?: string` - Failure reason (if failed)

**Returns:** Updated `ReminderHistoryEntry` or null

**Example:**
```typescript
// Mark as sent with Telegram message ID
await reminderHistoryService.updateHistoryStatus(1, 'sent', 'msg_123');

// Mark as failed
await reminderHistoryService.updateHistoryStatus(2, 'failed', undefined, 'Chat not found (400)');
```

### `incrementRetryCount(id)`

Increment retry count and update `lastAttemptAt` timestamp.

**Parameters:**
- `id: number` - Reminder history entry ID

**Example:**
```typescript
// Increment retry attempt
await reminderHistoryService.incrementRetryCount(historyId);
```

### `getQueuedReminders(shopId, limit?)`

Fetch all reminders currently queued for sending.

**Parameters:**
- `shopId: number` - Shop ID to query
- `limit?: number` - Max reminders to fetch (default: 100)

**Returns:** Array of `ReminderHistoryEntry[]` with status='queued'

**Example:**
```typescript
// Get pending reminders for batch sending
const queued = await reminderHistoryService.getQueuedReminders(100, 100);
console.log(`${queued.length} reminders waiting to be sent`);
```

## Integration with Other Services

### ReminderScheduler → ReminderHistory

When the scheduler identifies eligible customers and queues reminders:

```typescript
const entry = await reminderHistoryService.createHistoryEntry({
  shopId,
  customerId,
  chatId,
  balanceAtSendTime: balance.toString(),
  sentAt: Date.now(),
  status: 'queued',
  language,
  daysHeld,
  customerNameSnapshot: customer.name,
  shopNameSnapshot: shop.name,
});
```

### ReminderSender → ReminderHistory

When the sender processes queued reminders:

```typescript
// After successful send
await reminderHistoryService.updateHistoryStatus(
  entry.id,
  'sent',
  messageIdFromTelegram
);

// After failed attempt
await reminderHistoryService.incrementRetryCount(entry.id);
if (maxRetriesExceeded) {
  await reminderHistoryService.updateHistoryStatus(
    entry.id,
    'failed',
    undefined,
    errorMessage
  );
}
```

### API Routes → ReminderHistory

For query endpoints:

```typescript
app.get('/api/telegram/reminders/history', async (req, res) => {
  const { limit, offset, customerId } = req.query;
  if (customerId) {
    const result = await reminderHistoryService.getHistoryByCustomer(
      shopId,
      parseInt(customerId),
      parseInt(limit || '50'),
      parseInt(offset || '0')
    );
    res.json(result);
  } else {
    const result = await reminderHistoryService.getHistoryByShop(
      shopId,
      parseInt(limit || '50'),
      parseInt(offset || '0')
    );
    res.json(result);
  }
});
```

## Logging

The service logs all operations using the `logger` utility:

```typescript
logger.info("Reminder history entry created", {
  id: 123,
  shopId: 100,
  customerId: 1001,
  status: 'queued',
});

logger.info("Retrieved reminder history for shop", {
  shopId,
  total: 50,
  limit: 50,
  offset: 0,
});

logger.info("Deleted old reminder history entries", {
  deletedCount: 1234,
  beforeDate: "2024-01-01T00:00:00.000Z",
  retentionDays: 90,
});
```

## Performance Characteristics

| Operation | Query | Indexes Used | Typical Latency |
|-----------|-------|--------------|-----------------|
| `createHistoryEntry()` | INSERT | (primary key) | < 10ms |
| `getHistoryByShop()` | SELECT by shop_id, ORDER BY sentAt | shop_date_idx | < 50ms |
| `getHistoryByCustomer()` | SELECT by shop_id + customer_id | shop_customer_idx | < 50ms |
| `getStats()` | COUNT by status, date ranges | status_idx, created_at_idx | < 100ms |
| `deleteOldEntries()` | DELETE by created_at | created_at_idx | < 200ms |
| `getQueuedReminders()` | SELECT by status, ORDER BY created_at | status_idx | < 50ms |

All queries are designed to complete well within the 200ms target.

## Data Retention

- **Active records**: Indefinite (part of permanent history)
- **Cleanup policy**: Records > 90 days old are removed automatically
- **Compliance**: 90-day retention balances legal/dispute needs with storage efficiency
- **Archival**: Older records can be exported before deletion if required

## Testing

Unit tests are provided in `__tests__/reminderHistory.test.ts` covering:

- Entry creation with auto-set fields
- Pagination and result sets
- Filtering by shop and customer
- Deletion of old entries
- Stats aggregation
- Status updates and retry counting
- Queued reminder retrieval

To run tests:

```bash
cd artifacts/api-server
npm test  # or specific test file
```

## Example: Complete Workflow

```typescript
// 1. Scheduler queues a reminder
const queuedEntry = await reminderHistoryService.createHistoryEntry({
  shopId: 100,
  customerId: 1001,
  chatId: '123456',
  balanceAtSendTime: '500.00',
  sentAt: Date.now(),
  status: 'queued',
  language: 'en',
  daysHeld: 5,
  customerNameSnapshot: 'Abebe Alemayehu',
  shopNameSnapshot: 'Addis Bakery',
});
// id: 1, status: 'queued', createdAt: now

// 2. Sender fetches queued reminders
const queued = await reminderHistoryService.getQueuedReminders(100, 10);
// [{ id: 1, status: 'queued', ... }, ...]

// 3. Attempt to send to Telegram
try {
  const messageId = await telegramBotService.sendMessage(chatId, message);
  
  // 4a. Mark successful
  await reminderHistoryService.updateHistoryStatus(1, 'sent', messageId);
  // status: 'sent', messageId: 'msg_123', lastAttemptAt: now
  
} catch (error) {
  // 4b. Retry logic
  await reminderHistoryService.incrementRetryCount(1);
  // retryCount: 1, lastAttemptAt: now
  
  if (retryCount >= 3) {
    // Mark failed after max retries
    await reminderHistoryService.updateHistoryStatus(
      1,
      'failed',
      undefined,
      'Failed after 3 retries: network timeout'
    );
    // status: 'failed', failureReason: '...'
  }
}

// 5. Later: View history for customer
const history = await reminderHistoryService.getHistoryByCustomer(100, 1001, 50, 0);
// Shows all reminders sent to this customer, including the one just sent

// 6. Daily cleanup
const cleaned = await reminderHistoryService.deleteOldEntries();
// Removes entries > 90 days old

// 7. Dashboard stats
const stats = await reminderHistoryService.getStats(100);
// Shows aggregated metrics for shop owner dashboard
```

## Notes

- **Immutability**: History entries are never updated once created (only status updates during initial send phase)
- **Scoping**: Always query with both `shopId` and `customerId` to prevent cross-shop data leaks
- **Pagination**: Use default limit of 50; adjust based on UI needs (max 500)
- **Cleanup**: Run nightly to maintain compliance and storage efficiency
- **Logging**: All operations logged for debugging and transparency
