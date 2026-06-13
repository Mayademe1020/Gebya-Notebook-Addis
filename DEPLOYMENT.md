# Gebya Vercel Deployment

Gebya deploys as two explicit Vercel projects. Do not deploy from the repository root.

## Frontend / PWA

- Vercel project: `gebya-notebook-addis-gebya`
- Project root: `artifacts/gebya`
- Build command: `pnpm --filter @workspace/gebya build`
- Output directory: `dist/public`
- Source output path in the repo: `artifacts/gebya/dist/public`
- Vercel config: `artifacts/gebya/vercel.json`

The frontend `vercel.json` currently sets install and cache headers only. The project root, build command, and output directory must be set in the Vercel dashboard or equivalent project settings.

Required frontend environment variables:

```text
VITE_API_BASE_URL=https://<api-project-domain>
```

Optional frontend environment variables:

```text
VITE_SENTRY_DSN=<sentry dsn>
VITE_SENTRY_ENVIRONMENT=<environment name>
VITE_SENTRY_RELEASE=<release id>
SENTRY_SOURCE_MAPS=true
```

## API Server

- Vercel project: `gebya-notebook-addis-api-server`
- Project root: `artifacts/api-server`
- Build command: `pnpm --filter @workspace/api-server build`
- Runtime: Node.js 20.x
- Vercel config: `artifacts/api-server/vercel.json`

The API package currently has `dev`, `build`, and `typecheck` scripts. It does not have `start` or `deploy` scripts. That is expected for the current Vercel Functions layout because request entrypoints live under `artifacts/api-server/api`.

Required API environment variables:

```text
CORS_ORIGIN=https://<frontend-project-domain>
```

Telegram bot delivery environment variables:

```text
TELEGRAM_BOT_TOKEN=<telegram bot token>
TELEGRAM_BOT_USERNAME=<telegram bot username>
GEBYA_PUBLIC_API_BASE_URL=https://<api-project-domain>
```

Telegram QR linking requires persistent session storage. Configure one of these pairs:

```text
KV_REST_API_URL=<vercel kv rest url>
KV_REST_API_TOKEN=<vercel kv rest token>
```

or:

```text
UPSTASH_REDIS_REST_URL=<upstash redis rest url>
UPSTASH_REDIS_REST_TOKEN=<upstash redis rest token>
```

Voice transcription environment variables, if using backend transcription providers:

```text
GROQ_API_KEY=<groq api key>
OPENAI_API_KEY=<openai api key>
```

Optional transcription provider overrides:

```text
GROQ_TRANSCRIPTION_MODEL=<groq model>
GROQ_BASE_URL=<groq-compatible api base>
GROQ_TRANSCRIPTION_PROMPT=<prompt>
OPENAI_TRANSCRIPTION_MODEL=<openai model>
OPENAI_BASE_URL=<openai-compatible api base>
OPENAI_TRANSCRIPTION_PROMPT=<prompt>
```

## Smoke Test Checklist

Run this checklist against the deployed frontend with the production API environment connected:

- Open the frontend URL and complete onboarding.
- Add a sale.
- Create a customer.
- Add first credit.
- Add second credit.
- Record a partial payment.
- Confirm overpayment is blocked.
- Open the Telegram connect sheet.
- Confirm Telegram manual fallback save works.
- If KV or Upstash is configured, confirm QR linking works across a cold API restart.
- Open Settings.
- If Sentry is configured, run `window.__gebyaTestSentry()` in the browser console and confirm the event arrives.

## What Not To Deploy

Do not use the repository root as a Vercel project root for Gebya.

The root `package.json` build runs workspace-wide checks and builds. That includes non-release workspaces such as `artifacts/mockup-sandbox`, so a repo-root deploy can fail before the Gebya PWA or API packages are built. It can also cause Vercel to infer the wrong framework, output directory, or environment scope.

Use only these roots:

```text
artifacts/gebya
artifacts/api-server
```

Ignored local Vercel metadata directories may exist at the repository root and under `artifacts/api-server`. Treat those as local CLI state, not deployment source of truth. The dashboard project root must still be checked before deploying.

The untracked `artifacts/whisper-service` directory is not part of the current frontend or API deployment path.
