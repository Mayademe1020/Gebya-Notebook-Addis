# Design Regression Smoke Guard

Run this guard before future PRs that touch onboarding, owner home, Settings, Team & Staff, Report, staff identity, sync, or navigation:

```bash
pnpm --dir artifacts/gebya run test:design-smoke
```

The smoke starts from a fresh browser origin, creates a mocked owner shop, and captures Playwright screenshot attachments for:

- Onboarding
- Owner home / Today
- Settings / More
- Settings -> Team & Staff
- Report

Future PRs should include screenshots of those five screens in the PR notes when any touched code can affect the rendered merchant UI.

Design guardrails:

- Do not replace Gebya's polished merchant-facing UI with plain forms, admin-looking pages, or older/basic layouts.
- Staff and sync work must be layered into the existing polished surfaces.
- Preserve local-first/offline trust copy and bank/payment safety copy.
- Keep Settings -> Team & Staff understandable for shop owners; avoid adding advanced permission concepts until owner/staff behavior is validated.
- Do not start PR 1B event sync or sale/Dubie/payment sync work as part of this guard.
