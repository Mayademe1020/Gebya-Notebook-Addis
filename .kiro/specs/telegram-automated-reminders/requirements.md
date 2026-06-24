# Requirements Document

## Telegram Automated Reminders

## Introduction

Gebya's Telegram integration currently sends transaction alerts (when credit is added or payment is recorded). This feature extends that capability to include **automated reminders** that notify customers proactively when they owe money, particularly as their payment due date approaches or passes. Reminders are sent on a schedule controlled by the shop owner, comply with Telegram bot messaging rules, and help reduce payment delays while maintaining a trusting customer relationship.

## Glossary

- **Reminder_Schedule**: Owner-defined frequency (daily, weekly) for sending reminders to customers with overdue or upcoming-due credit
- **Overdue_Credit**: Customer credit where the due date has passed and balance > 0
- **Upcoming_Due_Credit**: Customer credit with a due date in the future (within threshold window)
- **Customer_Profile**: The stored customer record with Telegram linking information (chat_id, telegram_username, linking status)
- **Reminder_Message**: A templated, localized message sent to a customer on Telegram containing balance, due date, and how long debt is held
- **Message_Frequency_Override**: Shop owner setting that controls whether reminders are sent daily, weekly, or disabled per-customer
- **Compliance_Window**: Telegram rules prevent messages more frequently than daily to the same customer from a bot; reminder scheduling respects this
- **Localization**: Message content in Amharic (am) and English (en) based on customer's Telegram client language preference
- **Silent_Failure**: Reminder message failing to send (e.g., customer blocked bot) does not block transaction flows or crash the system

## Requirements

### Requirement 1: Reminder Trigger on Transaction Creation

**User Story:** As a shop owner, I want customers to be reminded of their debt automatically when I record a credit transaction for them, so they know immediately what they owe.

#### Acceptance Criteria

1. WHEN a credit transaction is created (add credit) for a customer with Telegram linked, THE system SHALL send a transaction alert (existing behavior)
2. WHEN the same customer's total balance exceeds zero after the transaction, THE system SHALL log that the customer is now "has_balance"
3. WHEN a customer transitions from "no balance" to "has balance" via credit transaction, THE system MAY schedule their first reminder immediately or after a grace period (e.g., 24 hours)
4. IF the customer's Telegram linking has `updatesEnabled: false`, THE transaction alert sends but regular reminders are NOT scheduled until the customer opts in
5. IF the Telegram message fails to send due to network error or rate limit, THE system SHALL retry asynchronously without blocking transaction save
6. THE transaction save SHALL succeed regardless of Telegram message delivery status

#### Edge Cases

- IF a customer receives a credit and already has outstanding balance, the new credit is added and reminders continue per schedule
- IF a customer receives multiple credits on the same day, only one reminder is sent per day (deduplication)
- IF a customer's balance becomes zero (full payment), the reminder schedule for that customer SHALL pause

---

### Requirement 2: Owner-Configurable Reminder Frequency

**User Story:** As a shop owner, I want to control how often customers are reminded, so I can balance collection urgency with customer relationship and Telegram bot compliance.

#### Acceptance Criteria

1. THE shop owner SHALL be able to set a default reminder frequency at the shop level: "daily" or "weekly"
2. THE shop owner SHALL be able to override reminder frequency per customer (e.g., disable reminders for a trusted customer)
3. WHEN a customer's reminder frequency is set to "weekly", THE system SHALL send at most one reminder per 7-day rolling window
4. WHEN a customer's reminder frequency is set to "daily", THE system SHALL send at most one reminder per 24-hour rolling window
5. WHEN a customer's reminder frequency is set to "disabled", NO reminders are sent regardless of balance or due date
6. WHEN a reminder frequency is changed, THE system SHALL honor the new frequency for future reminders without affecting past messages
7. THE default frequency for new customers SHALL be set from the shop's default setting

#### Edge Cases

- IF a customer is linked to multiple shops, each shop's reminder frequency is independent
- IF the owner changes the default frequency mid-month, existing customers' schedules update accordingly
- IF a customer opts out via Telegram (/unsubscribe command) in the future, their frequency is set to "disabled"

---

### Requirement 3: Scheduled Reminder Messages with Balance and Due Date

**User Story:** As a customer, I want to receive timely reminders that tell me my balance, when it's due, and how long I've owed, so I remember to pay and avoid late fees.

#### Acceptance Criteria

1. WHEN a reminder is scheduled and the customer has a balance with a due date, THE reminder message SHALL include: customer name, current balance, due date, and days overdue (if applicable)
2. WHEN a reminder is scheduled and the customer has a balance WITHOUT a due date, THE reminder message SHALL include: customer name, current balance, and days the balance has been held
3. THE message format SHALL be localized: Amharic if customer's Telegram language is "am", English otherwise
4. THE message content SHALL be friendly and non-threatening, written to maintain customer relationship
5. THE message SHALL include a call-to-action such as "Reply /paid if you've sent payment" to enable customer confirmation
6. WHEN the message is sent, THE system SHALL log: timestamp, customer_id, message_id, delivery status, language used
7. IF the message fails to send, THE system SHALL mark the delivery as "failed" and retry on the next reminder cycle (do not retry immediately within same hour)

#### Edge Cases

- IF the customer's balance changed since the reminder was scheduled, send the current balance, not the stale one
- IF the customer paid in full between reminder scheduling and sending, DO NOT send the reminder
- IF the balance is negative (overpaid), do not send a reminder
- IF the customer has multiple outstanding debts to the same shop (not consolidated), send ONE reminder with total balance

---

### Requirement 4: Reminder Schedule Execution

**User Story:** As a system, I need to execute reminders on a reliable schedule without overwhelming the Telegram bot API or the customer.

#### Acceptance Criteria

1. THE system SHALL identify customers with outstanding balance daily (batch job or polling)
2. WHEN a daily schedule window opens (e.g., 8 AM shop local time), THE system SHALL queue eligible reminders based on frequency rules
3. WHEN a reminder is queued, THE system SHALL check: customer has balance, customer linked to Telegram, reminder frequency allows sending today
4. WHEN all checks pass, THE reminder message is sent via Telegram
5. THE system SHALL NOT send more than one reminder per customer per day (enforce 24-hour deduplication)
6. THE system SHALL NOT send more than one reminder per customer per 7-day window if weekly frequency is set
7. IF the Telegram API returns a rate-limit error (429), THE system SHALL back off and retry after the cooldown period
8. IF the Telegram API indicates the customer blocked the bot or the chat is invalid, THE system SHALL mark the customer's linking as "unlinked" and stop attempting reminders

#### Edge Cases

- IF the shop is in a timezone-aware region, reminders queue at the owner's local time, not UTC
- IF a scheduled reminder time falls outside business hours, defer to the next business day
- IF the system restarts during a reminder batch, resume from the last checkpoint without duplicating sent messages
- IF a customer is linked to multiple shops, each shop's reminder schedule is independent

---

### Requirement 5: Message Compliance with Telegram Bot Rules

**User Story:** As a responsible integrator, I want reminders to comply with Telegram's bot messaging rules so the bot is not rate-limited or banned.

#### Acceptance Criteria

1. THE system SHALL respect Telegram's rule: a bot can send multiple messages per day to the same customer, but should not spam
2. THE system SHALL enforce: maximum 1 reminder message per customer per 24 hours during "daily" frequency
3. THE system SHALL enforce: maximum 1 reminder message per customer per 7 days during "weekly" frequency
4. WHEN a reminder fails with Telegram error code 429 (Too Many Requests), THE system SHALL back off exponentially and retry after the suggested delay
5. IF the bot is flagged by Telegram for spam, THE system SHALL suspend reminder sending and alert the shop owner
6. THE system SHALL include a mechanism for customers to /unsubscribe or disable reminders directly via bot command (implemented in webhook handler)
7. THE message content SHALL NOT include clickable payment links or external redirects to avoid triggering Telegram's phishing detection

#### Edge Cases

- IF a customer is on vacation and blocks the bot, the reminder still counts as "sent" (not delivered) and the schedule continues
- IF Telegram changes its rate-limit rules, the system configuration can be updated without code changes
- IF a customer reports the bot as spam, Telegram notifies and the bot's rights may be revoked; the shop must reauthorize

---

### Requirement 6: Localized Reminder Messages (Amharic & English)

**User Story:** As a customer in Ethiopia, I want reminders in my language so I understand the message and feel respected.

#### Acceptance Criteria

1. WHEN a reminder is sent, THE system SHALL detect the customer's language from their Telegram profile (`language_code`)
2. IF `language_code` starts with "am" (Amharic), THE message SHALL be in Amharic
3. IF `language_code` is not recognized or is "en", THE message SHALL be in English
4. THE Amharic message SHALL use cultural terminology (e.g., "dubie" for credit/debt) familiar to Ethiopian retailers
5. THE message content SHALL be identical in meaning across languages; translation SHALL be reviewed for accuracy
6. BOTH language versions SHALL include the same data: name, balance, due date, days held/overdue
7. IF the system cannot translate a message reliably, send the English fallback and log a warning

#### Edge Cases

- IF a customer changes their Telegram language mid-reminder, send the message in the old language (don't re-queue)
- IF a shop wants to add a custom message (future feature), custom text must be provided in both languages
- IF Telegram detects translated content as suspicious, review and ensure compliance

---

### Requirement 7: Opt-In / Opt-Out and Preference Management

**User Story:** As a customer, I want to control whether I receive reminders, so I'm not annoyed by too many messages.

#### Acceptance Criteria

1. WHEN a customer links to the bot via /start, THE system SHALL set `updatesEnabled: true` by default for that shop
2. WHEN a customer types /unsubscribe (future command in webhook), THE system SHALL set `updatesEnabled: false` for that customer at that shop
3. WHEN `updatesEnabled: false`, transaction alerts still send, but reminders do NOT send automatically
4. WHEN `updatesEnabled: false`, the shop owner SHALL still be able to manually send a one-time message to that customer via the app
5. WHEN a customer types /subscribe (future command in webhook), THE system SHALL set `updatesEnabled: true` and resume reminders
6. THE bot SHALL acknowledge subscription/unsubscription with a confirmation message
7. THE shop owner SHALL see each customer's opt-in/opt-out status in the app (future UI feature)

#### Edge Cases

- IF a customer unsubscribes but the shop still needs to notify them, the owner can send a manual one-time message
- IF a customer re-subscribes after unsubscribing, their reminder schedule resumes from today (no backlog)
- IF multiple shops send reminders to the same customer, each shop's opt-in/opt-out status is independent

---

### Requirement 8: Error Handling and Graceful Degradation

**User Story:** As a system, I want reminders to fail gracefully so one customer's issue doesn't break reminders for all customers.

#### Acceptance Criteria

1. IF a reminder fails to send due to invalid chat_id, THE system SHALL mark that customer's linking as stale and NOT retry that customer
2. IF a reminder fails due to network timeout, THE system SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s)
3. IF all retries are exhausted, THE system SHALL log the failure with customer_id, shop_id, timestamp, and error message
4. IF a reminder fails for one customer, THE batch job SHALL continue processing other customers (isolation)
5. THE system SHALL surface reminder failures in a log or dashboard so the owner can investigate
6. IF the reminder scheduling service is down, customers still receive transaction alerts (reminder system is optional)
7. WHEN the reminder service recovers, it SHALL resume from where it left off without duplicate sending

#### Edge Cases

- IF a customer's chat_id is lost (corrupted in database), treat as "unlinked" and skip reminders for that customer
- IF the Telegram bot token expires, all reminders fail; the owner must re-authorize the bot
- IF a shop owner deletes their Telegram bot integration, all customers' linking is invalidated and reminders stop

---

### Requirement 9: Persistence and Audit Trail

**User Story:** As a shop owner, I want to see a history of reminders sent to each customer so I can track communication and debug issues.

#### Acceptance Criteria

1. WHEN a reminder is sent, THE system SHALL store: customer_id, shop_id, message_id (from Telegram), sent_at timestamp, language used, balance at time of sending
2. WHEN a reminder fails, THE system SHALL store: customer_id, shop_id, failure reason, retry count, last_attempt_at timestamp
3. THE shop owner SHALL be able to view reminder history per customer in the future (not in MVP)
4. THE system SHALL retain reminder history for at least 90 days for debugging and compliance
5. IF a customer disputes a debt, the reminder history serves as evidence of communication
6. THE audit trail SHALL NOT log message content (for privacy) but SHALL log: sent/failed, recipient, timestamp, language

#### Edge Cases

- IF a reminder message is deleted by Telegram, the system still maintains the record of sending
- IF storage quota is exceeded, the oldest reminder records (>90 days) are archived or deleted
- IF the shop owner requests a data export, reminder history is included

---

### Requirement 10: Admin & Owner Controls (Future)

**User Story:** As a shop owner, I want to manage reminder settings for my shop and see how many reminders are being sent.

#### Acceptance Criteria

1. THE shop owner SHALL be able to set the default reminder frequency (daily/weekly) in shop settings
2. THE shop owner SHALL be able to override reminder frequency per customer (e.g., disable for a trusted regular)
3. THE shop owner SHALL see a dashboard showing: total customers with balance, customers with reminders enabled, reminders sent this week
4. THE shop owner SHALL be able to manually send a one-time reminder to a customer
5. THE shop owner SHALL be able to pause all reminders (e.g., during a promotion or crisis)
6. THE shop owner SHALL receive a summary report each week showing: reminders sent, failed, customer responses (via /paid)
7. THE owner SHALL NOT be able to change a customer's opt-in/opt-out status directly; customers control it via bot commands

#### Edge Cases

- IF an owner has multiple shops, each shop has independent reminder settings
- IF an owner changes frequency for all customers, existing schedules adjust automatically
- IF a frequency setting conflicts with Telegram rules, the system warns and enforces the rule anyway

---

### Requirement 11: System Performance and Scalability

**User Story:** As a system, I need to handle reminders at scale so the feature works when Gebya has thousands of customers.

#### Acceptance Criteria

1. THE reminder batch job SHALL complete within 5 minutes for up to 10,000 customers
2. THE system SHALL send at most 100 Telegram messages per second (burst) without overwhelming the Telegram API
3. THE system SHALL queue reminders asynchronously so the web API response time is NOT blocked by reminder sending
4. IF the reminder queue backs up, new reminders queue behind existing ones; no messages are dropped
5. THE system SHALL implement circuit breaker: if Telegram API is down, pause reminders and alert the owner
6. THE system SHALL monitor and log reminder service health (uptime, success rate, latency)
7. FOR shops with millions of customers (future), implement sharding or separate worker processes

#### Edge Cases

- IF a single shop has 1 million customers, reminders are batched over multiple cycles (not all sent in one window)
- IF the system scales horizontally, reminder de-duplication is coordinated across servers
- IF reminder latency exceeds 1 hour, alert the owner and investigate

---

### Requirement 12: Integration with Existing Telegram Session System

**User Story:** As a system, I need to reuse the existing Telegram session storage and webhook infrastructure to send reminders reliably.

#### Acceptance Criteria

1. THE reminder system SHALL use the existing `TelegramLinkSession` type from `telegramStore.ts`
2. THE reminder system SHALL query sessions from the same storage backend (Vercel KV or in-memory) as the webhook
3. WHEN a customer is linked via webhook, their `updatesEnabled` flag is checked before scheduling reminders
4. THE reminder system SHALL update the `lastMessage` and `lastUpdatedAt` fields in the session after sending
5. THE reminder system SHALL NOT modify the `createdAt`, `linkedAt`, or `chatId` fields of a session
6. WHEN a session expires (> 7 days), the reminder system skips that customer and does not queue reminders
7. THE session storage backend is the single source of truth; no separate reminder table is needed in MVP

#### Edge Cases

- IF the KV backend is slow to respond, the reminder batch job retries and may skip some customers that cycle
- IF a session is deleted while a reminder is queued, treat as "customer unlinked" and send to available contacts instead
- IF the session was created but `chatId` is null, the reminder waits until the customer completes /start linking

---

### Requirement 13: Testing and Validation

**User Story:** As a developer, I want to test reminders reliably so I can ensure they send correctly and don't break production.

#### Acceptance Criteria

1. THE reminder system SHALL be testable with mock Telegram API responses
2. THE reminder system SHALL include unit tests for: message templating, frequency rules, deduplication, error handling
3. THE reminder system SHALL include integration tests for: end-to-end reminder sending, session lookup, retry logic
4. WHEN running tests, the system SHALL NOT send real Telegram messages (mock the API)
5. THE system SHALL support a test mode where reminders are queued but not sent, allowing validation without side effects
6. THE reminder history SHALL be queryable in tests to verify which messages were sent and to whom
7. WHEN a test fails, the error message SHALL include customer_id, shop_id, and the reason for failure

#### Edge Cases

- IF a test timeout occurs, the system continues instead of hanging
- IF mock data includes invalid timestamps or balances, the system handles them gracefully

---

## Acceptance Criteria Summary

This requirements document defines 13 core requirements covering:
- **Triggering and Scheduling** (Requirements 1-4): When and how reminders are sent
- **Compliance and Safety** (Requirements 5, 8): Telegram rules, error handling, graceful degradation
- **Localization and UX** (Requirements 6-7): Amharic & English, customer choice
- **Persistence and Audit** (Requirement 9): History and tracking
- **Future Admin Features** (Requirement 10): Owner controls
- **Scale and Performance** (Requirement 11): System reliability
- **Technical Integration** (Requirements 12-13): Using existing infrastructure, testing

All requirements prioritize:
- Customer trust and consent (opt-in/opt-out)
- Telegram bot compliance (no spam, respect rate limits)
- System reliability (graceful failure, isolation)
- Localization (Amharic + English)
- Audit trail (tracking communication)

## Correctness Properties

1. **Deduplication**: No customer receives more than one reminder per 24-hour period (if daily frequency) or per 7-day period (if weekly).
2. **Opt-in Consent**: Reminders are only sent to customers who have Telegram linked (`chatId != null`) and `updatesEnabled = true`.
3. **Balance Accuracy**: Reminder message shows the current balance at send time, not stale data.
4. **Failure Isolation**: If a reminder fails for one customer, reminders for other customers are not blocked.
5. **Session Integrity**: Sending a reminder does not corrupt or lose session data (chatId, updatesEnabled, etc.).
6. **Telegram Compliance**: Reminders respect Telegram bot rate limiting (max 100 msg/sec) and do not violate terms of service.
7. **Language Detection**: Reminders use the customer's Telegram client language (Amharic if available, else English).
8. **Audit Trail**: Every reminder send attempt is recorded (success or failure) for at least 90 days.
