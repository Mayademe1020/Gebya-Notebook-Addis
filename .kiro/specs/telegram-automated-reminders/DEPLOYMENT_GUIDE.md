# Telegram Automated Reminders — Deployment & Operations Guide

## 1. System Overview

The reminder system sends customers proactive Telegram notifications when they owe money. Frequency (daily/weekly/disabled) is configurable per-shop and per-customer. Customers can opt out via `/unsubscribe` and back in via `/subscribe`.

**Endpoints**
- `GET /api/telegram/reminders/config` — Shop default frequency
- `POST /api/telegram/reminders/config` — Set shop default frequency
- `GET /api/telegram/reminders/config/:customerId` — Per-customer frequency
- `POST /api/telegram/reminders/config/:customerId` — Override per-customer frequency
- `GET /api/telegram/reminders/history` — Paginated send history
- `POST /api/telegram/reminders/test/:customerId` — Manual test send
- `POST /api/telegram/reminders/pause` — Pause all reminders for shop
- `POST /api/telegram/reminders/resume` — Resume reminders for shop
- `POST /api/telegram/reminders/run` — Execute daily reminder run (scheduler entrypoint)
- Telegram bot webhook handlers: `/start`, `/balance`, `/paid`, `/help`, `/subscribe`, `/unsubscribe`

## 2. Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram bot credentials | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | Validate inbound webhook requests | Yes |
| `GEBYA_PUBLIC_API_BASE_URL` | Used for deep links in `/start` | No (auto-detected) |

## 3. Deployment Steps

1. Ensure `artifacts/api-server` builds without TypeScript errors.
2. Set Telegram environment variables in hosting platform (Vercel/Render/etc).
3. Configure Telegram webhook to point at `/api/telegram/webhook`.
4. Enable Vercel Cron or external scheduler to call `POST /api/telegram/reminders/run` with `{ "shopIds": [...] }` or provide `x-shop-id` header.
5. Verify `/api/telegram/reminders/status` returns `configured: true`.

## 4. Operator Troubleshooting

- No reminders sending: check `/api/telegram/reminders/history` for recent status codes.
- Customer not receiving: confirm `updatesEnabled=true` in session and frequency not `disabled`.
- Rate limits: sender caps at 100 messages/second; retry/backoff handles 429s automatically.
- Failed sends with `invalid_chat`: customer blocked the bot or chat ID is stale. Customer must `/start` again.

## 5. Customer Opt-In / Opt-Out

- `/subscribe` sets `updatesEnabled=true` and persists session.
- `/unsubscribe` sets `updatesEnabled=false` and persists session.
- Transaction alerts are unaffected by reminder subscription.

## 6. Compliance Notes

- Reminder history is retained for at least 90 days.
- Each send attempt is audited: timestamp, status, retry count, failure reason.
- Messages are localized based on the customer's Telegram client language.