# AGENTS.md

Keep edits minimal, accurate, and grounded in the current repo. If a workflow is not verified from this checkout, add a short TODO instead of inventing guidance.

## Workspace commands

Run these from the repo root:

- `pnpm run typecheck`
  - Runs `typecheck:libs` first, then package `typecheck` scripts under `artifacts/*` and `scripts`.
- `pnpm run typecheck:libs`
  - Runs the root TypeScript build check only.
- `pnpm run build`
  - Runs root typechecks, then recursive package builds where present.

Verified package-level commands:

- `pnpm --dir artifacts/gebya dev`
- `pnpm --dir artifacts/gebya serve`
- `pnpm --dir artifacts/gebya typecheck`
- `pnpm --dir artifacts/gebya test:ledger`
- `pnpm --dir artifacts/gebya test:e2e`
- `pnpm --dir artifacts/api-server dev`
- `pnpm --dir artifacts/api-server typecheck`
- `pnpm --dir artifacts/api-server build`
- `pnpm --dir scripts typecheck`

## Build and deploy caveats

- Do not treat Windows as the release build environment for `artifacts/gebya` right now. [`artifacts/gebya/README.md`](C:/Users/25191/.codex/worktrees/1f35/Gebya-Notebook-Addis/artifacts/gebya/README.md) states the current Windows blocker is Tailwind's native `@tailwindcss/oxide` binding resolution.
- The documented release path is a clean Linux x64 environment with Node 20+ and `pnpm install --frozen-lockfile`, then `PORT=4173 BASE_PATH=/ pnpm --dir artifacts/gebya build`.
- The Gebya production output path is `artifacts/gebya/dist/public`.
- The API deployment config lives in [`artifacts/api-server/vercel.json`](C:/Users/25191/.codex/worktrees/1f35/Gebya-Notebook-Addis/artifacts/api-server/vercel.json) and currently sets max durations for `api/healthz.ts`, `api/transcribe.ts`, and `api/[...route].ts`.
- The Gebya frontend deployment config lives in [`artifacts/gebya/vercel.json`](C:/Users/25191/.codex/worktrees/1f35/Gebya-Notebook-Addis/artifacts/gebya/vercel.json) and currently pins `pnpm install --no-frozen-lockfile` plus static cache headers.

## Telegram and Sentry notes

- Preserve manual Telegram contact fallback in deploy guidance.
- Do not present QR bot linking as reliable on stateless deployments unless durable Telegram session storage exists.
- If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are configured, linked customers can still receive bot updates after sync.
- After deployment, the documented Sentry smoke check is `window.__gebyaTestSentry()` from the browser console on the shipped app.

## TODO

- If root `pnpm run build` is expected to be a release gate, re-verify the full workspace build status in the intended release environment before tightening this document further.
