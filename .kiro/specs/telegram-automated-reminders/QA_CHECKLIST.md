# QA Checklist - Telegram Automated Reminders

## Pre-Testing Setup

- [ ] Deploy to staging environment
- [ ] Set up test Telegram bot
- [ ] Configure test database
- [ ] Load test data (customers with balances)

## Unit Tests

### Reminder Configuration Service
- [ ] `getShopDefault()` returns 'daily' for new shops
- [ ] `setShopDefault()` persists and retrieves correctly
- [ ] `getCustomerFrequency()` falls back to shop default
- [ ] `setCustomerFrequency()` creates override
- [ ] `clearCustomerOverride()` removes override
- [ ] `isRemindersEnabled()` returns correct boolean
- [ ] Invalid frequency throws error
- [ ] Invalid shopId/customerId throws error

### Reminder Message Builder
- [ ] `formatCurrency()` handles positive/negative/zero amounts
- [ ] `formatDate()` handles valid/invalid timestamps
- [ ] `formatDayCount()` handles singular/plural
- [ ] `buildReminderMessage()` creates correct format
- [ ] Amharic and English templates render correctly

### Reminder Sender
- [ ] Successful send records history
- [ ] Failed send updates status
- [ ] Rate limit (429) triggers backoff
- [ ] Invalid chat unlinks customer
- [ ] Retry logic works (1s, 2s, 4s backoff)

### Reminder Scheduler
- [ ] Identifies customers with balance > 0
- [ ] Respects daily frequency (24h window)
- [ ] Respects weekly frequency (7d window)
- [ ] Skips disabled frequency
- [ ] Skips customers without Telegram
- [ ] Skips customers with `updatesEnabled: false`
- [ ] Deduplicates customers in queue

### Reminder History
- [ ] `createHistoryEntry()` stores all fields
- [ ] `getHistoryByShop()` returns paginated results
- [ ] `getHistoryByCustomer()` filters correctly
- [ ] `deleteOldEntries()` removes >90 day records
- [ ] `getStats()` aggregates correctly

## Integration Tests

### Webhook Commands
- [ ] `/start TOKEN` links customer
- [ ] `/start` (no token) shows intro
- [ ] `/balance` shows current balance
- [ ] `/unsubscribe` disables reminders
- [ ] `/subscribe` enables reminders
- [ ] `/paid` acknowledges payment

### API Endpoints
- [ ] `POST /api/telegram/reminders/run` triggers scheduling
- [ ] `GET /api/telegram/reminders/config` returns frequency
- [ ] `POST /api/telegram/reminders/config` updates frequency
- [ ] `GET /api/telegram/reminders/history` returns paginated list
- [ ] `POST /api/telegram/reminders/test/:customerId` sends test

### End-to-End Flows

#### Daily Reminder Flow
1. [ ] Customer makes credit sale
2. [ ] Customer receives transaction alert
3. [ ] Scheduler runs next day
4. [ ] Customer receives reminder
5. [ ] Customer replies `/paid`
6. [ ] Balance updates correctly

#### Frequency Override Flow
1. [ ] Shop sets default to 'weekly'
2. [ ] Create customer override to 'daily'
3. [ ] Verify customer gets daily reminders
4. [ ] Clear override
5. [ ] Verify customer reverts to weekly

#### Opt-Out Flow
1. [ ] Customer sends `/unsubscribe`
2. [ ] Verify `updatesEnabled: false`
3. [ ] Verify no reminders sent
4. [ ] Customer sends `/subscribe`
5. [ ] Verify `updatesEnabled: true`
6. [ ] Verify reminders resume

## Edge Cases

- [ ] Customer blocks bot
- [ ] Network timeout during send
- [ ] Rate limit exceeded
- [ ] Invalid chat_id
- [ ] Null/undefined values in message builder
- [ ] Very large balances
- [ ] Very old debts (100+ days)

## Performance

- [ ] 10,000 customers processed in <5 minutes
- [ ] Single reminder send <500ms
- [ ] History query <200ms
- [ ] API response <100ms

## Compliance

- [ ] No more than 1 reminder per 24h (daily)
- [ ] No more than 1 reminder per 7d (weekly)
- [ ] Reminders only sent with `updatesEnabled: true`
- [ ] 90-day retention policy enforced
- [ ] No message content logged (privacy)

## Manual QA

### Test Account Setup
1. Create test shop in Gebya
2. Generate Telegram link
3. Link test customer
4. Add credit balance

### Test Scenarios
1. [ ] New customer receives welcome
2. [ ] Customer gets reminder after 24h
3. [ ] Customer can opt out/in
4. [ ] Admin can change frequency
5. [ ] History visible in dashboard