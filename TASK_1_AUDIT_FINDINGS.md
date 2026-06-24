# Task 1: Audit Findings - Telegram Automated Reminders

## Executive Summary

Reviewed existing Telegram integration, transaction ledger, and database schema. Identified all affected files and defined new TypeScript data structures for reminder configuration and history. The system can reuse existing Telegram session storage (Vercel KV) and webhook infrastructure. Balance calculation will be done via the transaction ledger (customer_transactions table).

---

## Part 1: Affected Files List

### Existing Files (No Changes Required Yet)

#### Core Telegram Integration
- `artifacts/api-server/src/services/telegramBotService.ts` — Telegram API wrapper, sends messages
- `artifacts/api-server/src/services/telegramStore.ts` — Session storage (Vercel KV + memory fallback)
- `artifacts/api-server/src/routes/telegram.ts` — Webhook handler and link endpoints

#### Database Schema
- `lib/db/src/schema/transactions.ts` — General ledger transactions
- `lib/db/src/schema/customer_transactions.ts` — **PRIMARY:** Customer credit/payment records (core for balance calc)
- `lib/db/src/schema/customers.ts` — Customer master data + Telegram linking fields
- `lib/db/src/schema/businesses.ts` — Shop master data (owner, name, language pref)

#### Existing Transaction Alert Flow
- `artifacts/api-server/api/telegram/customers/sync.ts` — Customer state sync (balance updates)
- Other customer sync and alert routes

### New Files to Create (in Implementation Tasks 2-8)
- `artifacts/api-server/src/services/reminderConfiguration.ts` — Config mgmt service
- `artifacts/api-server/src/services/reminderMessageBuilder.ts` — Message templating + i18n
- `artifacts/api-server/src/services/reminderSender.ts` — Send with retry logic
- `artifacts/api-server/src/services/reminderScheduler.ts` — Daily job, identify eligible customers
- `artifacts/api-server/src/routes/reminders.ts` — API endpoints (/api/telegram/reminders/*)
- `artifacts/api-server/src/types/reminders.ts` — **CREATED (this task)** TypeScript definitions
- `artifacts/api-server/src/utils/messageTemplates.ts` — Amharic + English message templates
- `artifacts/api-server/src/utils/reminderCron.ts` — Cron entry point

### Files to Modify (in Implementation Tasks)
- `artifacts/api-server/src/routes/telegram.ts` — Add /unsubscribe and /subscribe command handlers (Task 7)

---

## Part 2: Current Architecture Summary

### Telegram Session Storage Mechanism

**Architecture:** Hybrid Vercel KV + In-Memory Fallback

1. **Storage Backend Selection** (`telegramStore.ts`)
   - Primary: **Vercel KV (Upstash Redis REST API)** when `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_*`) are set
   - Fallback: **In-memory Map** for local dev and deployments without KV provisioning
   - Persistent: Only KV backend is persistent; memory fallback is ephemeral per cold-start

2. **Session Data Structure** (`TelegramLinkSession` type)
   ```typescript
   {
     token: string,                    // Unique session token
     customerId: string,
     customerName: string,
     shopName: string,
     currentBalance: number,
     createdAt: number,                // Unix ms
     expiresAt: number,                // Created + 7 days
     requestedAt: number,              // When link was first requested
     linkedAt: number | null,          // When customer tapped /start
     chatId: string | null,            // Telegram chat_id (null until linked)
     telegramUsername: string | null,  // @username from Telegram
     updatesEnabled: boolean,          // Controls both alerts AND reminders
     lastMessage: string | null,       // Last message sent
     lastReference: string | null,     // Last transaction reference
     lastUpdatedAt: number | null      // Last sync timestamp
   }
   ```

3. **KV Key Scheme**
   - Session by token: `tg:s:{token}` → JSON-stringified TelegramLinkSession
   - Chat to token mapping: `tg:c:{chatId}` → token string
   - TTL: 604,800 seconds (7 days)

4. **Lifespan of a Session**
   - Shop owner generates link → creates session with `token`, no `chatId` yet
   - Customer taps `/start {token}` → webhook resolves token, calls `linkTelegramChatToSession()` → sets `chatId`, `linkedAt`, `updatesEnabled = true` (default)
   - Session persists in KV for 7 days
   - If session expires and customer types a command, they get "no longer valid" → must re-link

### Transaction Ledger Structure

**Core Table:** `customer_transactions`

```typescript
{
  id: number (PK),
  customerId: number,
  amount: number,          // Positive = credit, negative = payment
  type: varchar,           // e.g., "credit", "payment"
  dueDate: bigint | null,  // When credit is due (unix ms)
  createdAt: bigint,       // When transaction was recorded
  businessId: number (FK), // References businesses table
  // ... other fields (note, reference_code, telegram delivery state, etc.)
}
```

**Balance Calculation Method**
- Query all `customer_transactions` where `customerId = X` and `businessId = Y`
- Sum up amounts: `balance = SUM(amount)`
  - Positive amounts = credit (customer owes)
  - Negative amounts = payment (reduces balance)
  - If balance > 0, customer has outstanding debt
- Extract earliest `dueDate` from credits with amount > 0 (or calculate days held from earliest credit's `createdAt`)

**Key Insight:** Balance is always calculated on-demand from the transaction ledger, never cached. This ensures reminder messages always show current, accurate balance.

---

## Part 3: Data Structures Defined

All new interfaces are defined in: **`artifacts/api-server/src/types/reminders.ts`**

### Core Structures

1. **ReminderConfiguration** — Shop-level or per-customer frequency settings (daily/weekly/disabled)
   - Persisted in database table or KV
   - If `customerId = null`, it's the shop default
   - Tracks `lastReminderSentAt` for deduplication

2. **ReminderHistoryEntry** — Immutable audit trail for each sent/failed reminder
   - Includes: customer, balance at send time, due date, language, delivery status
   - Kept for 90+ days for compliance
   - Recorded whether message succeeded, failed, or was skipped

3. **EligibleCustomer** — Result of scheduler query
   - Contains: customer ID, balance, due date, chat_id, updates enabled flag, language
   - Used to determine if reminder should be queued today

4. **QueuedReminder** — Validated reminder ready to send
   - Contains: all info needed to build and send message
   - Priority field for queue ordering

5. **ReminderBatchStats** — Summary of daily scheduler run
   - Counts: scanned, queued, sent, failed, skipped
   - Used for monitoring and debugging

6. **SendReminderResult** — Outcome of a single send attempt
   - Indicates success, failure, error class, whether to retry or unlink

### Supporting Types

- **ReminderFrequency** → `'daily' | 'weekly' | 'disabled'`
- **ReminderDeliveryStatus** → `'queued' | 'sent' | 'failed' | 'skipped'`
- **ReminderLanguage** → `'am' | 'en'`
- **TelegramErrorClass** → Error classification for retry logic
- **ReminderConfigSummary, ReminderHistoryQuery, etc.** → API request/response types

---

## Part 4: Storage Strategy

### Recommendation: Hybrid Approach

#### **Option A (Recommended): Database Tables** ✅
- **For:** `ReminderConfiguration` and `ReminderHistoryEntry`
- **Why:**
  - Queryable: easily fetch history per customer, per shop, by date range
  - Auditable: immutable append-only log
  - Scalable: database indexes on (shop_id, customer_id, created_at)
  - 90-day retention: simple cleanup query with DELETE WHERE created_at < now() - 90 days
  - Not rate-sensitive: queries don't happen in hot paths

#### **Implementation:**
Create two new Drizzle schema files in `lib/db/src/schema/`:
- `reminder_configurations.ts` — Table for reminder frequency settings
- `reminder_history.ts` — Table for audit trail

**Schema Sketch (reminder_configurations):**
```typescript
{
  id: serial PK,
  shopId: int FK(businesses),
  customerId: int nullable FK(customers),
  frequency: varchar(32) — 'daily'|'weekly'|'disabled',
  lastReminderSentAt: bigint nullable — unix ms,
  enabled: boolean,
  createdAt: timestamp,
  updatedAt: timestamp,
  indices: (shopId, customerId)
}
```

**Schema Sketch (reminder_history):**
```typescript
{
  id: serial PK,
  shopId: int FK(businesses),
  customerId: int FK(customers),
  chatId: text,
  balanceAtSendTime: float,
  dueDate: bigint nullable,
  daysHeld: int,
  sentAt: bigint — unix ms,
  status: varchar(32) — 'sent'|'failed'|'queued'|'skipped',
  language: varchar(2) — 'am'|'en',
  messageId: text nullable,
  failureReason: text nullable,
  retryCount: int,
  lastAttemptAt: bigint,
  customerNameSnapshot: text nullable,
  shopNameSnapshot: text nullable,
  createdAt: timestamp,
  indices: (shopId, customerId, sentAt)
}
```

### Session Storage: Reuse Existing KV

- **Do NOT create a new reminder-specific session table**
- Reminders check the existing `TelegramLinkSession.updatesEnabled` flag from KV
- After sending a reminder, update the session's `lastMessage` and `lastUpdatedAt` fields
- Query customer balance from the database, not cached in session

---

## Part 5: How to Query Customers with Balance > 0

### Query Logic (SQL-like pseudocode)

```sql
SELECT 
  c.id,
  c.name,
  c.telegram_chat_id,
  c.telegram_notify_enabled,
  c.telegram_username,
  SUM(ct.amount) as balance,
  MIN(ct.due_date) as earliest_due_date,
  c.created_at as customer_created_at
FROM customers c
LEFT JOIN customer_transactions ct ON c.id = ct.customer_id AND ct.business_id = c.business_id
WHERE c.business_id = :shopId
  AND c.active = true
  AND c.telegram_chat_id IS NOT NULL  -- linked to Telegram
  AND SUM(ct.amount) > 0               -- has outstanding balance
GROUP BY c.id, c.name, c.telegram_chat_id, c.telegram_notify_enabled, c.telegram_username, c.created_at
ORDER BY c.id;
```

### Implementation Steps (will be in Task 5)

1. Use Drizzle ORM to query `customers` table filtered by `businessId` and `active = true`
2. LEFT JOIN with `customer_transactions` to sum amounts per customer
3. Filter where sum > 0
4. Fetch customer's Telegram session from KV (using `chatId` key) to get `updatesEnabled` + language
5. Build `EligibleCustomer[]` with all needed info for scheduler

### Database Indexes Needed

For performance, ensure these indices exist on `customer_transactions`:
- `(business_id, customer_id)` — for joining to find all transactions per customer per shop
- `(customer_id)` — for quick lookup of a customer's transactions

---

## Part 6: Risk Assessment & Assumptions

### Assumptions

1. **Balance is always positive or zero** — system doesn't support negative balances (overpayment). If balance < 0, reminders won't queue (no debt).

2. **Due date is optional** — credit transaction may not have a `dueDate`. In that case, reminder calculates "days held" from transaction creation date.

3. **One chat_id per customer per shop** — a customer links once to each shop. Multi-shop support means they have separate sessions per shop KV.

4. **Telegram session TTL = 7 days** — if customer hasn't re-linked in 7 days and session expires, they must tap the link again. Reminders stop during the gap.

5. **`updatesEnabled` flag controls both alerts and reminders** — if a customer unsubscribes, they lose both transaction alerts and reminders. A future feature may decouple these.

6. **Shop timezone is UTC for MVP** — daily scheduler runs at 08:00 UTC. Production will add per-shop timezone support.

7. **Message templating is in code, not in database** — Amharic and English messages are hardcoded strings or constants, not fetched from a config table. Easier to deploy, but requires code change to customize.

8. **Reminder history is immutable** — once a record is written, it's never updated. New attempts create new records.

### Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **KV backend down** | No reminder sending; scheduler fails | Add circuit breaker; log alerts; continue with memory-only sessions (lose persistence) |
| **Database connection error** | Balance query fails; reminders skipped for that shop | Retry with exponential backoff; alert owner; continue with other shops |
| **Telegram API rate limit (429)** | Reminders fail; backlog grows | Implement rate limiter on sender (max 100 msg/sec); retry with exponential backoff |
| **Customer chat_id becomes invalid** | All future reminders to that customer fail | After 3 failed attempts, mark session as unlinked; operator can investigate |
| **Reminder history table grows unbounded** | Query performance degradation | Automatic cleanup: DELETE records older than 90 days; consider partitioning for large shops |
| **Scheduler crashes mid-batch** | Some reminders sent, some skipped, risk of duplicates | Add idempotency key to history; checkpoint progress; resume from last processed customer |
| **Message templating bug** | Incorrect reminder text sent to all customers | Review message templates carefully; unit tests; manual QA before production rollout |
| **Session data corruption** | Customer gets linked to wrong shop/balance | Validate session invariants; checksums; periodic audit of KV data |

---

## Part 7: Implementation Roadmap (Tasks 2-15)

### Wave 1: Foundation (Task 1 — DONE)
- ✅ Audit complete
- ✅ Data structures defined
- ✅ Storage strategy clear
- ✅ Risks identified

### Wave 2: Core Services (Tasks 2-3, 10 in parallel)
- Task 2: ReminderConfigurationService — read/write frequency settings
- Task 3: ReminderMessageBuilder — build localized messages
- Task 10: MessageTemplates — Amharic + English constant strings

### Wave 3: Integration Services (Tasks 4-5, 9 in parallel)
- Task 4: ReminderSender — send with retry + error handling
- Task 5: ReminderScheduler — daily job to identify & queue reminders
- Task 9: ReminderHistoryPersistence — store in database table

### Wave 4: API & Webhook (Tasks 6-7 in parallel)
- Task 6: RemindersRoutes — /api/telegram/reminders/* endpoints
- Task 7: WebhookUpdates — /unsubscribe & /subscribe commands

### Wave 5: Execution & Logging (Tasks 8, 12 in parallel)
- Task 8: ReminderCron — POST /api/telegram/reminders/run entry point
- Task 12: LoggingAndMonitoring — structured logs + metrics

### Wave 6: Testing & Documentation (Tasks 11, 13 in parallel)
- Task 11: Unit & Integration Tests — >80% coverage
- Task 13: Documentation & Deployment Guide

### Wave 7: QA & Production (Tasks 14-15 in parallel)
- Task 14: Integration Testing & QA
- Task 15: Production Deployment & Monitoring

---

## Part 8: Follow-Up Notes for Task 2+

### For Task 2 (ReminderConfigurationService)
- Need to define database table or KV key scheme for `ReminderConfiguration`
- Implement: getShopDefault(), setShopDefault(), getCustomerFrequency(), setCustomerFrequency(), isRemindersEnabled()
- Add unit tests: default fallback, override precedence, persistence

### For Task 3 (ReminderMessageBuilder)
- Create `src/utils/messageTemplates.ts` with Amharic and English templates
- Implement: buildReminderMessage(language, name, balance, dueDate, daysHeld) → string
- Test: placeholder replacement, currency formatting (ETB/ብር), edge cases (very long names, zero balance, etc.)

### For Task 4 (ReminderSender)
- Implement sendReminder(historyEntry, session) → SendReminderResult
- Add retry logic: 3 attempts, exponential backoff (1s, 2s, 4s)
- Error classification: rate_limit → retry, invalid_chat → unlink, etc.
- Rate limiter: 100 msg/sec max

### For Task 5 (ReminderScheduler)
- Implement scheduleReminders(shopId) — main entry point
- Query customers with balance > 0, check frequency windows, queue reminders
- Handle timezone (MVP: UTC)
- Deduplication: check `lastReminderSentAt` before queueing

### For Task 6 (RemindersRoutes)
- Endpoints: GET/POST /api/telegram/reminders/config, /history, /test/{customerId}, /pause, /resume
- Auth: owner only (check JWT or business membership)
- Validation: frequency enum, pagination, date range filters

### For Task 7 (Webhook /unsubscribe & /subscribe)
- Add command handlers to `telegram.ts` webhook
- /unsubscribe → set updatesEnabled = false in session
- /subscribe → set updatesEnabled = true in session
- Confirmation messages in Amharic and English

### For Task 8 (ReminderCron)
- Create POST /api/telegram/reminders/run endpoint
- Loop through all shops (or single shop if passed as param)
- Call ReminderScheduler.scheduleReminders() then ReminderSender.sendQueuedReminders()
- Return ReminderBatchStats summary
- Callable by Vercel Cron or external scheduler

### For Task 9 (History Persistence)
- Create `reminder_history` database table (schema outline provided above)
- Implement: insertHistoryEntry(), getHistory(), deleteOldEntries()
- Cleanup cron: daily DELETE WHERE sentAt < now() - 90 days

---

## Conclusion

The audit is complete. All affected files have been identified. New data structures are defined in TypeScript. The storage strategy uses database tables for configuration and history (queryable, auditable, compliant with 90-day retention). Telegram session storage is reused as-is. Balance calculation will query the transaction ledger on-demand to ensure accuracy.

**Next Step:** Proceed to Task 2 (ReminderConfigurationService).
