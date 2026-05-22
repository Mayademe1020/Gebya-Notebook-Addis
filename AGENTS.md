# AGENTS.md

## Workspace

- Use `pnpm` for workspace commands. The root `preinstall` script rejects `npm` and `yarn`.
- The main notebook app lives in `artifacts/gebya`.
- The API server lives in `artifacts/api-server`.

## Common Commands

From the repo root:

```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
```

For the Gebya app:

```powershell
pnpm --dir artifacts/gebya dev
pnpm --dir artifacts/gebya serve
pnpm --dir artifacts/gebya typecheck
pnpm --dir artifacts/gebya test:ledger
pnpm --dir artifacts/gebya test:e2e
```

## Browser Verification

- The local Gebya app is typically reviewed at `http://127.0.0.1:4173`.
- Playwright is already configured for `http://127.0.0.1:4173` and starts `pnpm serve` from `artifacts/gebya`.
- For manual review, use a phone-sized viewport around `390x844`.

## Notes

- Customer and Dubie flows currently rely on app-owned local Dexie state in `artifacts/gebya/src/App.jsx`; avoid reintroducing React Query hooks in `CustomerList` or `CustomerDetail` unless a provider is wired end-to-end.
- TODO: `artifacts/gebya/README.md` still documents an older Windows build blocker. Re-verify that note before relying on it for current release guidance.
