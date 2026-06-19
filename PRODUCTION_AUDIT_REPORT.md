# Gebya Production Readiness Audit & Roadmap

> **Audit Date:** 2025-06-18  
> **Auditor:** Senior Staff Engineer / Technical Product Manager  
> **Branch:** `codex/shop-check-polish-clean` (with uncommitted working-tree changes)  
> **Scope:** Full codebase, git history, architecture, and production gaps.

---

## 1. Executive Summary

Gebya is a **functional, offline-first PWA** with a working IndexedDB layer, cloud sync engine, Telegram bot integration, and a rich React UI. However, it is still architecturally a **"working prototype"** rather than a **production-ready SaaS**. The single biggest blocker is the **3,725-line `App.jsx` monolith** that contains all business logic, state management, and JSX rendering. A refactoring plan exists (`REFACTOR_PLAN.md`) but only ~30% is executed. The cloud sync works but uses primitive last-write-wins conflict resolution. There is no dedicated Team page, no marketing landing page, and no automated backup/restore flow beyond manual CSV/JSON export.

---

## 2. Current Status Report

| # | Workstream | Status | Evidence |
|---|---|---|---|
| 1 | **Codebase Refactoring** | **In Progress** | `REFACTOR_PLAN.md` defines 6 phases (A–F). **Phase B (Zustand stores)** is complete: `appStore.js` (110 lines), `authStore.js` (44 lines), `syncStore.js` (15 lines), `shopStore.js` (43 lines) all exist and wired. `useStaff.js` (126 lines) is created **and consumed**. `useTransactions.js` (294 lines) is created **but NOT imported or used** by `App.jsx` — all transaction logic still lives inline. **Phase C (feature hooks)** ~30% done. **Phase D–F (tab extraction, modals, cleanup)** not started. `SettingsPage.jsx` remains **2,349 lines** untouched. |
| 2 | **Sales Page (Today Tab)** | **Completed** | Today tab is fully functional: `ProfitCard`, `DailySuggestions`, `TxRow` with inline breakdown, action bar (Sale/Expense/Credit), privacy toggle, offline status strip, backup nudge, and toast undo. **No separate marketing/sales landing page exists** — the app is PWA-only. |
| 3 | **Report & Team Pages** | **In Progress** | `ReportView.jsx` (942 lines) is a standalone component with time-range filters, staff sales, owner alerts, CSV/JSON export, search, actor filter, and lazy `HistoryView`. **Active branch** `feature/report-hardening-pass` adds responsive workflows and compact views. **Team/Staff** exists via `useStaff` hook but there is **no dedicated Team page** — staff management is embedded inside `SettingsPage`. |
| 4 | **Cloud & Offline Architecture** | **In Progress** | Offline-first IndexedDB (Dexie) is solid. Sync engine (`syncEngine.js`) implements push/pull over JWT with 5-minute periodic sync. Cloud proof (`cloudProof.js`) has idempotency keys, device IDs, and a sync queue. Telegram sync queue handles offline fallback. **Primitive last-write-wins** conflict resolution on `updated_at`. No automated cloud backup/restore beyond manual export. **Auth gate** (`AuthGate.jsx`) implemented with skip option. **PWA** offline-ready via `vite-plugin-pwa`. |

---

## 3. Prioritized Backlog

| Task | Priority | Business Value | Technical Complexity |
|---|---|---|---|
| **Extract `App.jsx` business logic into feature hooks** (`useCustomers`, `useSuppliers`, `useCatalog`, `useSettings`) and consume `useTransactions` | **Critical** | Unblocks all future feature work; currently every change touches 3,725 lines | High (2–3 weeks) |
| **Extract tab-level JSX** into `TodayTab.jsx`, `LedgerTab.jsx`, `ReportsTab.jsx`, `SettingsTab.jsx` and reduce `App.jsx` to ~150 lines | **Critical** | Enables parallel development, reduces merge conflicts, makes the app testable per-tab | High (1–2 weeks) |
| **Implement robust conflict resolution** for sync (server-side merge or at-field CRDT logic) | **Critical** | Prevents data loss when the same record is edited on two devices before sync | High (1–2 weeks) |
| **Build automated cloud backup / restore** (JSON snapshot upload/download + scheduled nudge) | **Critical** | User data lives only on one phone; a lost phone = lost business records | Medium (1 week) |
| **Split `SettingsPage.jsx` (2,349 lines)** into focused sub-components (Profile, Channels, Staff, Catalog, etc.) | **High** | Settings is the second-biggest monolith; blocks team page work | Medium (1 week) |
| **Add pagination / lazy loading** to transaction lists and report views | **High** | Memory and render performance will degrade as real shops accumulate months of data | Medium (3–4 days) |
| **Create dedicated Team / Staff page** with role management, activity feed, and permissions | **High** | Core feature for multi-staff shops; `feature/shop-sync-pr1b2` has a foundation | Medium (1 week) |
| **Add database indexing** on `created_at`, `updated_at`, `customer_id`, `supplier_id` in Postgres schema | **High** | Sync and report queries will slow down at scale | Low (1–2 days) |
| **Implement structured error handling & logging** (Sentry breadcrumbs for sync failures, Dexie errors, network timeouts) | **High** | Currently errors are silently swallowed or only logged in `DEV` | Medium (3–4 days) |
| **Add Row-Level Security (RLS) in API** and validate JWT on every sync route | **High** | Currently required for multi-tenant safety; `auth.ts` exists but middleware needs audit | Medium (3–4 days) |
| **Add a marketing landing page** (separate from the PWA app) | **Medium** | Sales/conversion tool for customer acquisition | Medium (3–4 days) |
| **Clean up disabled voice subsystem** (remove `VOICE_ENABLED = false` dead code, `StubTranscriptionService`) | **Medium** | Reduces bundle size and cognitive load | Low (1 day) |
| **Fix Amharic encoding** in hardcoded strings (e.g., `getTimeGreeting` garbled characters) | **Medium** | Affects Amharic UX quality | Low (1 day) |
| **Add proper ErrorBoundary** around `AppInner` and each lazy tab boundary | **Medium** | Prevents white-screen crashes from taking down the whole app | Low (1–2 days) |
| **Add unit tests for hooks** (`useStaff`, `useTransactions`, etc.) | **Medium** | Currently only e2e tests exist; no hook-level unit coverage | Medium (2–3 days) |

---

## 4. Gap Analysis & Technical Debt

### 4.1 Discussed but Unimplemented

| Feature | Where It Was Planned | Current State |
|---|---|---|
| `useCustomers` hook | `REFACTOR_PLAN.md` Phase C | **Missing** — all customer logic is inline in `App.jsx` (~600 lines) |
| `useSuppliers` hook | `REFACTOR_PLAN.md` Phase C | **Missing** — all supplier logic is inline in `App.jsx` (~400 lines) |
| `useCatalog` hook | `REFACTOR_PLAN.md` Phase C | **Missing** — catalog logic is inline in `App.jsx` (~100 lines) |
| `useSettings` hook | `REFACTOR_PLAN.md` Phase C | **Missing** — settings logic is inline in `App.jsx` and `SettingsPage.jsx` |
| `useAnalytics` hook | `REFACTOR_PLAN.md` Phase C | **Missing** — analytics tracking is inline in `App.jsx` |
| `useSync` hook | `REFACTOR_PLAN.md` Phase C | **Missing** — sync is handled by `syncEngine.js` utility class, not a React hook |
| `TodayTab.jsx` / `LedgerTab.jsx` / `ReportsTab.jsx` / `SettingsTab.jsx` | `REFACTOR_PLAN.md` Phase D | **Not started** — all tab JSX is inline in `App.jsx` lines 2967–3301 |
| `ExportModal.jsx` | `REFACTOR_PLAN.md` Scalability table | **Missing** — export UI is inline in `ReportView.jsx` |
| `InventoryTab.jsx` | `REFACTOR_PLAN.md` Scalability table | **Missing** — no inventory feature exists yet |
| Voice subsystem re-enable | `App.jsx` comment: "flip `VOICE_ENABLED` to true" | **Stubbed** — `StubTranscriptionService` in API server; no real STT backend |
| Marketing landing page | Implied by SaaS needs | **Missing** — no public site exists |
| Automated backup / restore | Implied by data-loss nudge in Today tab | **Missing** — only manual CSV/JSON export |

### 4.2 Configuration & Setup Tweaks (Working but Need Refactoring)

| Setup | Current State | Risk | Recommendation |
|---|---|---|---|
| **Sync conflict resolution** | Last-write-wins on `updated_at` | Data loss if two devices edit the same customer or transaction before syncing | Implement server-side merge or at-least field-level tombstones |
| **Sync push/pull** | No pagination; pulls **all** tables | Will fail or timeout as shops scale to 10k+ records | Add pagination (`limit`/`offset` or `cursor`) to `/sync/pull` and `/sync/push` |
| **Rate limiting** | 200 requests / 15 min | May be too generous for sync endpoints; no per-user rate limit | Add stricter per-user limits on `/sync/*` and `/telegram/*` |
| **JWT secret** | Warns if default in production | Still reads `JWT_SECRET` from env without validation at startup | Fail-fast on startup if secret is missing or < 32 chars |
| **Dexie schema** | No explicit schema versioning | Adding new indexes requires manual migration logic | Add `db.version(x).stores(...)` migration chain |
| **Cloud proof upload** | Behind `VITE_CLOUD_PROOF_UPLOAD_ENABLED` flag | Unclear if this is enabled in production; queue grows unbounded if upload is off | Add queue retention policy (e.g., auto-drop after 30 days) |
| **Telegram sync queue** | Queues in `db.sync_queue` with no cleanup | Table grows indefinitely with failed records | Add a scheduled cleanup job or TTL on queue entries |
| **Analytics / usage stats** | Stored in IndexedDB only | Lost on device switch or data clear | Persist to server or export as part of cloud backup |
| **Payment channels** | Dual storage (canonical `channels[]` + legacy keys) | Risk of drift; legacy keys may be accidentally read by old code | Deprecate and remove legacy keys after 2 releases |
| **CORS origin** | Allows any origin in non-production | Safe for dev, but production fallback is strict | Add `CORS_ORIGIN` to deployment checklist |

---

## 5. Production-Readiness & Scalability Roadmap

### 5.1 Security & Auth

- **Row-Level Security (RLS):** Every database query in the API must be scoped to the authenticated `user_id`. The Drizzle schema has `users` and `customers` tables, but the sync routes (`sync.ts`) need an audit to ensure no cross-tenant data leakage.
- **Token Management:** JWTs are stored in IndexedDB (`db.settings`). Implement token refresh before expiry and a secure logout that clears both client and server sessions.
- **Offline Auth:** The skip option (`onSkip`) sets `authUser = { skipped: true }`. This is fine for single-device use, but **skipped users must not be allowed to sync** — the sync engine already blocks this (`status = 'unauthenticated'`), but verify server-side.
- **Input Validation:** The API uses `zod` schemas, but some routes (e.g., `/sync/push`) accept large nested payloads. Add payload size limits and deep validation.
- **Helmet & Rate Limit:** Already configured, but review `helmet` defaults for CSP rules that may block PWA service workers.

### 5.2 Data Sync & Conflict Resolution

- **Current:** `_pullAll` uses `local.updated_at >= remote.updated_at` to skip. This is **unsafe** for concurrent edits.
- **Required:** Implement one of:
  1. **Server-side merge:** On push, the server reads the existing record, compares fields, and merges non-conflicting changes. Conflicting fields are flagged for manual resolution.
  2. **Operational Transform / CRDT:** For simple numeric fields (e.g., `amount`), use max-wins or additive merge. For text fields, use a simple LWW with a conflict marker.
  3. **Conflict UI:** When a conflict is detected, show the user both versions and let them pick.
- **Offline Queue:** The sync engine schedules pushes on Dexie hooks (`creating`/`updating`). This is good, but the queue needs:
  - Exponential backoff for retries (currently none).
  - Dead-letter queue for records that fail > 5 times.
  - A manual "Force Sync Now" button with visual feedback.

### 5.3 Scalability

- **Database Indexing:** Add Postgres indexes on `transactions(created_at)`, `transactions(updated_at)`, `transactions(user_id)`, `customer_transactions(customer_id)`, `supplier_transactions(supplier_id)`, and `staff_members(user_id)`.
- **Pagination:** The `/sync/pull` endpoint and the report views must paginate. For the frontend, use virtualized lists (e.g., `react-window`) for the Today entries and History views.
- **Lazy Loading:** Tab components are already lazy-loaded (`lazyWithRetry`), but the **data** is not — `loadData()` fetches everything into memory on mount. Implement per-tab data loading so the Credit tab only loads customer data when first visited.
- **Bundle Size:** `App.jsx` is 3,725 lines. After refactoring, the main bundle should shrink significantly. The voice subsystem (disabled) still bundles ~4 components and a hook. Remove it or code-split it more aggressively.
- **Multi-Shop / Multi-Tenant:** The schema currently has `users` and `staff_members` but no explicit `shop` or `organization` table. If multi-tenant SaaS is the goal, add a `shops` table and foreign-key all records to `shop_id`.

### 5.4 Error Handling & Logging

- **Graceful Offline:** The app already handles offline well (saves to IndexedDB, shows "saved on this phone" toast). Improve by:
  - Adding a visual "sync pending" badge with a count of unsynced records.
  - Showing the last successful sync timestamp in Settings.
- **Cloud Backup Verification:** After a backup upload, the server should return a checksum or snapshot ID. The client stores this and shows "Last verified backup: [date]" in the UI.
- **Error Logging:** Sentry React is installed (`@sentry/react`) but not configured with breadcrumbs for Dexie errors, sync failures, or network timeouts. Add:
  - Breadcrumbs for every sync attempt (push/pull counts).
  - Capture exceptions for `db.transaction` failures.
  - Alert on repeated sync auth failures (token expiry).
- **Health Checks:** The API has `/health` but the client never polls it. Add a lightweight online check that pings `/health` before attempting sync.

---

## 6. Recommended Execution Order

Based on the audit, the recommended path to production is:

1. **Week 1–2:** Finish Phase C/D of the refactor — extract `useCustomers`, `useSuppliers`, `useCatalog`, `useSettings`, and split `App.jsx` into tab components. This is the **foundation** for everything else.
2. **Week 3:** Split `SettingsPage.jsx` into sub-components and build a dedicated **Team / Staff page**.
3. **Week 4:** Harden sync — add pagination, conflict resolution, and exponential backoff.
4. **Week 5:** Add automated cloud backup/restore, RLS audit, and error logging.
5. **Week 6:** Performance — pagination in UI, database indexing, bundle analysis, and dead-code removal (voice subsystem).
6. **Week 7:** Polish — marketing landing page, Amharic encoding fixes, design regression tests, and PWA hardening.

---

*End of Audit Report*
