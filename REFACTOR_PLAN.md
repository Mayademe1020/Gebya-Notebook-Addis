# Gebya App.jsx Refactoring Plan

## Current State

- **App.jsx**: ~3,800 lines
- **SettingsPage.jsx**: ~2,400 lines
- **Pattern**: All business logic, state, and JSX in monolithic components
- **Risk**: Every change touches the same file; new features are hard to add

## Target Architecture

### File Size Guidelines

| Type | Target Size | Hard Limit |
|------|-------------|------------|
| Components (JSX) | 100–250 lines | 400 lines |
| Custom Hooks (logic) | 80–200 lines | 300 lines |
| Utility functions | 20–80 lines | 150 lines |
| Pages (composition) | 150–300 lines | 500 lines |

> **Why**: A 200-line file fits on one screen. A developer can read it, understand it, and modify it without scrolling. This is critical for a team (or future you) maintaining the codebase.

### State Management Strategy

We use a **hybrid approach** — no heavy library needed:

1. **Zustand for global app state** (lightweight, no providers, ~1KB)
   - Auth, sync status, active tab, modals, toast queue
2. **Custom hooks for feature logic** (useTransactions, useCustomers, etc.)
   - Local business rules, Dexie operations, calculations
3. **Context kept for** (already working, don't change)
   - Lang, Theme, Privacy
4. **Props for** (keep it simple)
   - Component-specific UI state (open/closed, form values)

> **Why not Redux?** Overkill. This app has no complex inter-feature dependencies. Zustand + custom hooks is the sweet spot for React 19.

## Proposed File Structure

```
src/
  stores/                    # Zustand global stores
    appStore.ts              # activeTab, modals, loading, toast
    authStore.ts             # token, user, isLoggedIn
    syncStore.ts             # sync status, lastSyncAt, error
    shopStore.ts             # shopProfile, paymentChannels
  hooks/                     # Feature business logic
    useTransactions.ts       # CRUD, sorting, filtering
    useCustomers.ts          # CRUD, ledger, balance calc
    useSuppliers.ts          # CRUD, ledger, balance calc
    useCatalog.ts            # items/services CRUD
    useStaff.ts              # staff members, actor selection
    useSettings.ts           # profile, channels, preferences
    useAnalytics.ts          # usage tracking, metrics
    useSync.ts               # push/pull, queue, engine init
    useVoice.ts              # voice recorder (if re-enabled)
  components/                # UI components (already partially here)
    TodayTab.jsx             # Today's transactions view
    LedgerTab.jsx            # Customer/Supplier credit tab
    ReportsTab.jsx             # Analytics, charts, summary
    SettingsTab.jsx            # Settings (already exists, needs splitting)
    ...existing components...
  utils/                     # Pure utility functions (keep existing)
    ...existing utils...
  App.jsx                    # ~150 lines: composition + providers only
```

## Migration Plan (Incremental — Zero Downtime)

We do NOT rewrite the app in one go. We migrate **one feature at a time**, testing after each step.

### Phase A: Foundation (Week 1)

**Goal**: Set up the infrastructure without touching App.jsx logic.

1. **Install Zustand** in `artifacts/gebya`
2. **Create `stores/`** — empty store files with types
3. **Create `hooks/`** — empty hook files with the same interface signatures
4. **Verify build still passes** — no changes to App.jsx yet

### Phase B: Extract Global State (Week 1–2)

**Goal**: Move state OUT of App.jsx into stores, but keep App.jsx reading from them.

| State | Moved To | Impact on App.jsx |
|-------|----------|-------------------|
| `activeTab` | `appStore.ts` | Replace `useState` with `useAppStore()` |
| `authUser` / `authChecked` | `authStore.ts` | Replace with `useAuthStore()` |
| `syncStatus` / `lastSyncAt` | `syncStore.ts` | Replace with `useSyncStore()` |
| `shopProfile` / `paymentChannels` | `shopStore.ts` | Replace with `useShopStore()` |
| Modals (`showForm`, `showCustomerForm`, etc.) | `appStore.ts` | Centralized modal state |
| Toast queue | `appStore.ts` | `fireToast` becomes a store action |

**Result**: App.jsx loses ~500 lines of state declarations. Still works exactly the same.

### Phase C: Extract Feature Hooks (Week 2–4)

**Goal**: Move business logic (useCallback handlers) into custom hooks.

1. **useTransactions** hook
   - Extracts: `handleAddTransaction`, `handleUpdateTransaction`, `handleDeleteTransaction`, `handleUndoDelete`, `todaySales`, `todayExpenses`, `todayProfit`
   - Interface: `const { transactions, add, update, remove, todayStats } = useTransactions()`

2. **useCustomers** hook
   - Extracts: `handleAddCustomer`, `handleEditCustomer`, `handleDeleteCustomer`, `handleAddCustomerTransaction`, `handleEditCustomerTransaction`, `handleDeleteCustomerTransaction`, `customerSummaries`, `getCustomerBalance`
   - Interface: `const { customers, summaries, add, edit, deleteCustomer, addTransaction } = useCustomers()`

3. **useSuppliers** hook (mirror of customers)
   - Extracts: supplier CRUD + ledger transactions

4. **useCatalog** hook
   - Extracts: `handleSaveCatalogEntry`, `handleToggleCatalogEntryActive`, `catalogEntries`

5. **useStaff** hook
   - Extracts: `handleAddStaffMember`, `handleEditStaffMember`, `handleDeactivateStaff`, `activeStaffMemberId`

6. **useSettings** hook
   - Extracts: `handleProfileSave`, `handleSavePaymentChannels`, `handleClearData`, `recurringExpenses`, `ownerAlertSettings`

**Result**: App.jsx loses ~1,500 lines of useCallback handlers. Each hook is 100–200 lines and independently testable.

### Phase D: Extract Tab Components (Week 4–5)

**Goal**: Move JSX for each tab into its own component file.

1. **TodayTab.jsx** — today's transactions, quick add, profit card, trust card
2. **LedgerTab.jsx** — customer list, supplier list, transaction sheets, credit metrics
3. **ReportsTab.jsx** — usage stats, share, analytics cards
4. **SettingsTab.jsx** — already exists as SettingsPage, but inline it as a tab component

**Result**: App.jsx becomes a router/shell:
```jsx
function AppInner() {
  const { activeTab } = useAppStore();
  return (
    <div className="app">
      <AppHeader />
      {activeTab === 'today' && <TodayTab />}
      {activeTab === 'ledger' && <LedgerTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'settings' && <SettingsTab />}
      <BottomNav />
      <GlobalModals />
    </div>
  );
}
```

**Final App.jsx**: ~150 lines.

### Phase E: Extract Modals & Sheets (Week 5–6)

**Goal**: Move modal components into separate files with lazy loading.

- `TransactionSheet.jsx` — add/edit sale or expense
- `CustomerSheet.jsx` — add/edit customer
- `CustomerTransactionSheet.jsx` — add/edit dubie entry
- `SupplierSheet.jsx` — add/edit supplier
- `SupplierTransactionSheet.jsx` — add/edit supplier dubie
- `ReminderSheet.jsx` — send reminders
- `ShareModal.jsx` — already exists
- `EditTransactionSheet.jsx` — edit existing transaction
- `OnboardingScreen.jsx` — already exists
- `AuthGate.jsx` — already exists

All modals use `appStore` to know when to open/close.

### Phase F: Cleanup & QA (Week 6)

1. Remove dead code (voice subsystem, unused imports)
2. Fix Amharic encoding
3. Add unit tests for hooks
4. Add integration tests for stores
5. Verify PWA still works (service worker, offline)

## Total Timeline: ~6 Weeks (Part-time, 1 dev)

## Consistency Rules (Non-negotiable)

1. **File naming**: PascalCase for components, camelCase for hooks, kebab-case for utils
2. **Hook return signature**: Always return an object, never an array
   ```ts
   // Good
   const { transactions, add, isLoading } = useTransactions();
   // Bad
   const [transactions, setTransactions] = useTransactions();
   ```
3. **Store actions**: Named as verbs (`setActiveTab`, `openModal`, `syncNow`)
4. **State access**: Read from stores via selectors (prevents re-renders)
   ```ts
   const activeTab = useAppStore(s => s.activeTab); // not the whole store
   ```
5. **Dexie access**: Only inside hooks, never in components directly
6. **Side effects**: Only inside hooks or store actions, never in render

## Scalability: How This Grows

| Future Feature | Where It Goes |
|----------------|---------------|
| Multi-currency support | `shopStore.ts` + `useTransactions.ts` |
| Inventory tracking | New `useInventory.ts` + `InventoryTab.jsx` |
| Multi-shop support | New field on `users` table + `shopStore.ts` |
| Voice re-enabled | `useVoice.ts` + `VoiceRecorder.jsx` |
| Export to PDF | New `useExport.ts` + `ExportModal.jsx` |
| Barcode scanner | New `useBarcode.ts` + `BarcodeSheet.jsx` |
| Offline queue | `useSync.ts` already handles this |

Each new feature adds **2 files** (hook + component), not 200 lines to App.jsx.

## Immediate Next Steps (What I Will Do Now)

If you approve this plan, I will start:

1. **Install Zustand** in `artifacts/gebya`
2. **Create `stores/appStore.ts`** — move `activeTab`, `loading`, modals
3. **Create `stores/authStore.ts`** — move `authUser`, `authChecked`, token
4. **Create `stores/syncStore.ts`** — move sync status, `lastSyncAt`
5. **Create `stores/shopStore.ts`** — move `shopProfile`, `paymentChannels`
6. **Wire them into App.jsx** — replace the first 500 lines of state

This is **zero-risk** — the UI looks identical. We just moved where the state lives.

**Do you approve this plan?** Should I start with Phase A (foundation + stores)?
