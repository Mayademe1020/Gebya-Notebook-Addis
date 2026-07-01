# Telegram Automated Reminders - Deployment Guide

## Overview

This guide covers deploying the Telegram Automated Reminders feature to production.

## Prerequisites

- Node.js 22.x+
- PostgreSQL database (for Drizzle ORM)
- Telegram Bot Token (from @BotFather)
- Upstash Redis (optional, for KV storage)
- Vercel account (recommended)

## Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
JWT_SECRET=your_strong_jwt_secret_min_32_chars

# Optional (for Upstash Redis storage)
KV_REST_API_URL=https://your-key.upstashedb.com
KV_REST_API_TOKEN=your_token_here

# Optional (for cron scheduling)
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret

# Optional (for production)
NODE_ENV=production
```

## Deployment Steps

### 1. Database Migration

```bash
# From project root
npm run db:migrate
```

### 2. Deploy to Vercel

```bash
# Install Vercel CLI if not already
npm install -g vercel

# Deploy
vercel --prod
```

### 3. Configure Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/telegram/reminders/run",
      "schedule": "0 8 * * *"
    }
  ]
}
```

### 4. Set Environment Variables in Vercel

```bash
vercel env add TELEGRAM_BOT_TOKEN
vercel env add JWT_SECRET
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
```

## Configuration

### Default Settings

- **Frequency**: Daily (can be changed in shop settings)
- **Time**: 8:00 AM local time (UTC until timezone support added)
- **Retention**: 90 days

### Shop Owner Setup

1. Get bot username from `@username_bot`
2. Share bot with shop: `https://t.me/username_bot?start=TOKEN`
3. Customer links via deep link
4. Customer receives `/start` confirmation

## Monitoring

### Health Check Endpoint

```
GET /api/telegram/status
```

Response:
```json
{
  "configured": true,
  "bot_username": "gebya_bot",
  "linking_available": true,
  "updates_available": true,
  "session_store": "memory",
  "session_persistent": false,
  "warning": null
}
```

### Logs

All services log with structured format:
- `[ReminderConfig]` - Configuration changes
- `[ReminderScheduler]` - Scheduling activity
- `[ReminderSender]` - Sending attempts
- `[ReminderHistory]` - Persistence operations

### Metrics to Monitor

- Reminders sent per day
- Failed deliveries
- Retry attempts
- Queue depth

## Troubleshooting

### Bot Not Sending Messages

1. Check `/api/telegram/status` - ensure `configured: true`
2. Verify bot token is valid
3. Check customer `updatesEnabled` flag
4. Verify customer has linked Telegram (`chatId` exists)

### Rate Limiting

- Bot handles 100 messages/second burst
- Automatic backoff on 429 errors
- Monitor logs for rate limit warnings

### Customer Not Receiving

1. Verify customer linked via `/start`
2. Check `updatesEnabled` is `true`
3. Confirm `chatId` is valid (not blocked)
4. Customer may have blocked the bot

## Production Checklist

- [ ] Bot token verified
- [ ] Database migrated
- [ ] Environment variables set
- [ ] Cron job configured
- [ ] Health check passes
- [ ] Test reminder sent
- [ ] Monitoring alerts configured