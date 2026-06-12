# AGENTS.md

## Workspace

- Monorepo uses `pnpm` workspaces. Do not use `npm` or `yarn`; `preinstall` enforces `pnpm`.
- Root validation should start with `pnpm run typecheck`.
- Root libs-only validation is `pnpm run typecheck:libs`.
- Root build path is `pnpm run build`.

## Main Artifact

- Primary app lives in `artifacts/gebya`.
- Local dev server: `pnpm --dir artifacts/gebya dev`
- Package typecheck: `pnpm --dir artifacts/gebya typecheck`
- Local preview server: `pnpm --dir artifacts/gebya serve`
- Ledger smoke test: `pnpm --dir artifacts/gebya test:ledger`
- E2E tests: `pnpm --dir artifacts/gebya test:e2e`

## API Server

- Telegram API server lives in `artifacts/api-server`.
- Local dev server: `pnpm --dir artifacts/api-server dev`
- Package typecheck: `pnpm --dir artifacts/api-server typecheck`
- Package build: `pnpm --dir artifacts/api-server build`

## Scripts Package

- Shared scripts live in `scripts`.
- Package typecheck: `pnpm --dir scripts typecheck`

## Current Build Notes

- Current Windows workspaces should not be treated as the release build environment for `artifacts/gebya`.
- Known blocker: `pnpm --dir artifacts/gebya build` currently fails on Windows because Tailwind native bindings resolve incorrectly. Use a clean Linux x64 environment for release builds.
- Release build command from repo root on Linux: `PORT=4173 BASE_PATH=/ pnpm --dir artifacts/gebya build`
- Production build output is written to `artifacts/gebya/dist/public`.

## Telegram Workflow

- `artifacts/gebya` supports manual Telegram contact fallback even when bot linking is unavailable.
- QR bot linking should only be treated as reliable when Telegram session storage is durable.
- API-side bot delivery depends on `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.

## Post-Deploy Smoke

- After deploying a shipped build, the README-backed Sentry smoke check is `window.__gebyaTestSentry()` from the browser console.
