# Telegram Automated Reminders — QA Checklist

## Pre-flight

- [ ] `artifacts/api-server` compiles without TypeScript errors
- [ ] All unit tests pass: `pnpm test` in `artifacts/api-server`
- [ ] `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` set in target environment
- [ ] Webhook URL configured in Telegram BotFather

## Admin Flows

- [ ] `GET /api/telegram/reminders/config` returns shop default frequency
- [ ] `POST /api/telegram/reminders/config` updates shop default
- [ ] `GET /api/telegram/reminders/config/:customerId` returns effective frequency
- [ ] `POST /api/telegram/reminders/config/:customerId` sets customer override
- [ ] `GET /api/telegram/reminders/history` returns paginated entries
- [ ] `POST /api/telegram/reminders/test/:customerId` sends reminder
- [ ] `POST /api/telegram/reminders/pause` and `/resume` respond correctly

## Customer Flows

- [ ] `/start` with valid token links the customer
- [ ] `/balance` returns current balance
- [ ] `/paid` records payment intent
- [ ] `/subscribe` sets `updatesEnabled=true`
- [ ] `/unsubscribe` sets `updatesEnabled=false`
- [ ] `/help` returns localized help text

## Scheduler / Run

- [ ] `POST /api/telegram/reminders/run` with `shopIds` body returns `{ success, overallStats, shopResults }`
- [ ] Customers with `frequency=daily` are re-queued after >24h
- [ ] Customers with `frequency=weekly` are re-queued after >7d
- [ ] `frequency=disabled` never queues
- [ ] Idempotent: running twice within window does not double-send

## Observability

- [ ] `reminderHistory` table populated with `queued` → `sent`/`failed`/`skipped`
- [ ] `logger` outputs info/debug/warn/error lines with timestamps
- [ ] Errors classify as `rate_limit`, `network_timeout`, `invalid_chat`, `invalid_token`, `other`
- [ ] 90-day retention cleanup (`deleteOldEntries`) removes stale rows

## Acceptance Gate

- [ ] No duplicate reminders within frequency window
- [ ] No crashes on empty balances / missing chatId / null due dates
- [ ] Amharic and English messages render correctly per `language_code`