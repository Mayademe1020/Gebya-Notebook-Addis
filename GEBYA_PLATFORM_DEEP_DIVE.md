# Gebya Platform — Comprehensive Technical & Product Documentation

**Prepared for**: Google AI Studio Evaluation  
**Platform Name**: Gebya (ገበያ) — "Market" in Amharic  
**Version**: 1.0 (MVP + Phase 1 Features)  
**Date**: June 2026

---

## 1. EXECUTIVE SUMMARY

Gebya is a **voice-first, mobile-first Progressive Web App (PWA)** designed for Ethiopian micro-retailers, shop owners, and informal sellers who currently rely on paper notebooks to track their business finances.

**Core Value Proposition**: Replace the paper notebook with a digital tool that is faster, private, and actually calculates true profit — without requiring accounting knowledge or constant internet connectivity.

**Platform Type**: Business Notebook / Retail Operations Tool  
**Category**: Vertical SaaS for Emerging Markets  
**Primary Interface**: Mobile Web (PWA)  
**Deployment**: Client-side local storage with optional cloud sync backend

---

## 2. PROBLEM STATEMENT — THE CORE ISSUES WE SOLVE

### 2.1 The Paper Notebook Trap
- **70% of Ethiopian micro-businesses** use paper notebooks exclusively
- Notebooks are **lost, damaged, or burned** with no backup
- No way to calculate **true profit** (revenue minus actual cost)
- No way to verify daily totals without manual addition
- No search, filter, or historical analysis

### 2.2 The Credit Blind Spot
- Ethiopian retail is heavily **credit-based** ("Merro" / ዱቤ)
- Shop owners cannot remember who owes what
- No payment tracking or due date management
- No way to send payment reminders to customers
- Relationships deteriorate over forgotten debts

### 2.3 The Privacy Paradox
- Shop owners fear **showing true profit** to:
  - Customers (who might demand discounts)
  - Employees (who might ask for raises)
  - Tax authorities (who might over-assess)
- Current digital tools show everything by default
- Paper can be hidden under the counter; phones cannot

### 2.4 The Trust Gap
- No existing tool is built for Ethiopian retail context
- Most tools assume:
  - English-only UI
  - Stable high-speed internet
  - Gregorian calendar familiarity
  - Formal accounting terminology
- Ethiopian sellers need a tool that **speaks their language** and **fits their workflow**

---

## 3. TARGET USER PERSONA

### 3.1 Primary User: "Ato Kebede"
- **Age**: 28–55 years old
- **Education**: Grade 8–12 (basic literacy)
- **Language**: Amharic (primary), mixed Amharic/English for product names
- **Device**: Basic Android smartphone ($100–200)
- **Connectivity**: Intermittent 3G; data costs money per MB
- **Tech Comfort**: Can use WhatsApp; intimidated by "login/password"
- **Daily Transactions**: 10–50 per day
- **Business Type**: Small kiosk, grocery, clothing, electronics accessories, or mixed retail

### 3.2 Secondary Users
- **Wholesalers**: Track bulk inventory costs vs selling prices
- **Street Vendors**: Fast, voice-only entry while moving
- **Service Providers**: Record service fees and expenses

### 3.3 User Environment Constraints
- Works in noisy merkato environments
- Hands often dirty or busy
- Intermittent electricity
- Limited data packages (turns data off between uses)
- Strong preference for zero-learning-curve tools

---

## 4. PRODUCT TYPE & POSITIONING

### 4.1 What Gebya Is
- **Business notebook replacement** — not accounting software
- **Voice-first transaction recorder** — not a POS system
- **Privacy-first local ledger** — not a cloud dashboard
- **Relationship-aware credit tracker** — not a bank ledger

### 4.2 What Gebya Is NOT
- ❌ Full inventory management system
- ❌ Multi-shop enterprise platform
- ❌ Tax preparation or compliance tool
- ❌ Complex analytics dashboard
- ❌ E-commerce or marketplace

### 4.3 Strategic Positioning
```
┌──────────────────────────────────────────────────┐
│                                                  │
│  PAPER NOTEBOOK    →    GEBYA    →    QUICKBOOKS │
│  (Current)              (Us)         (Too complex)│
│                                                  │
│  • Fast              • Fast      • Powerful     ️│
│  • Private          • Private   • Expensive      │
│  • Lost easily      • Voice     • Training req.  │
│  • No calculations  • Profit    • English-only   │
│                      • Credit    • Online-only   │
│                      • Offline                   │
│                      • Amharic                   │
└──────────────────────────────────────────────────┘
```

---

## 5. CORE FEATURES — COMPLETE INVENTORY

### 5.1 Transaction Entry (Primary Action)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Voice Recording** | Tap-to-speak sale/expense entry; transcript auto-detects total amount | MVP |
| **Manual Entry** | Keyboard fallback form with item name, quantity, amount, type | MVP |
| **Quick Amounts** | Predefined and custom quick-amount buttons for fast entry | Phase 1 |
| **Privacy Toggle** | Eye icon to reveal/hide monetary values; auto-hides after 30s or minimize | MVP |
| **Transaction Types** | Sale, Expense, Credit Add, Payment | MVP |
| **Payment Method** | Cash, Bank Transfer, TeleBirr, CBE Birr, custom channels | Phase 1 |

### 5.2 Credit (Merro) Management Module
| Feature | Description | Priority |
|---------|-------------|----------|
| **Customer Registry** | Free-text customer identifiers; no mandatory fields | MVP |
| **Credit Recording** | Add credit with amount, optional item note, optional due date | MVP |
| **Payment Recording** | Record partial or full payments; auto-updates balance | MVP |
| **Balance Calculation** | Auto sum of credits minus payments; never manually editable | MVP |
| **Transaction History** | Time-ordered list per customer; immutable audit trail | MVP |
| **Telegram Notifications** | Optional alerts to linked Telegram accounts on new credit or payment | Phase 1 |

### 5.3 Dashboard & Reporting
| Feature | Description | Priority |
|---------|-------------|----------|
| **Today Screen** | Daily sales total, expenses, net profit, top items, entry list | MVP |
| **Past Days List** | Scrollable daily summaries with per-day drill-down | MVP |
| **Credit Overview** | Customer balances, overdue indicators, total exposure | MVP |
| **Shop Check Report** | Shareable daily summary (WhatsApp/Telegram); KPIs, streaks, top sellers | Phase 1 |
| **Owner Alerts** | Threshold-based notifications for high-value sales | Phase 1 |

### 5.4 Supplier Tracking (Extended Ledger)
| Feature | Description | Priority |
|---------|-------------|----------|
| **Supplier Registry** | Track suppliers with contact info and notes | Phase 1 |
| **Supplier Credit** | Record purchases on credit from suppliers | Phase 1 |
| **Supplier Payments** | Track repayments to suppliers | Phase 1 |
| **Dual Ledger** | Separate but parallel customer + supplier bookkeeping | Phase 1 |

### 5.5 Team & Role Management
| Feature | Description | Priority |
|---------|-------------|----------|
| **Staff Invites** | Owner generates join codes; staff accepts via link | Phase 1 |
| **RBAC** | Owner, Cashier, Viewer roles with granular permissions | Phase 1 |
| **Activity Dashboard** | Per-staff sales tracking; daily performance visibility | Phase 1 |
| **Actor Attribution** | Each transaction tagged with who recorded it | Phase 1 |

### 5.6 Offline & Sync Architecture
| Feature | Description | Priority |
|---------|-------------|----------|
| **Local-First Storage** | Dexie.js (IndexedDB wrapper); all data lives on device | MVP |
| **Zero-Internet Operation** | Full functionality without connectivity | MVP |
| **Background Sync Engine** | Syncs to cloud when connection available | Phase 2 |
| **Conflict Resolution** | Last-write-wins with audit preservation | Phase 2 |
| **Queue-Based Telegram** | Offline transactions queued for Telegram delivery | Phase 1 |

### 5.7 Voice Intelligence Layer
| Feature | Description | Priority |
|---------|-------------|----------|
| **Speech-to-Text** | Web Speech API / OpenAI Whisper integration | MVP |
| **Total Extraction** | Regex-based largest-number detection from transcript | MVP |
| **Amharic + English** | Mixed-language speech handling | Phase 1 |
| **Confidence Scoring** | Parsing confidence stored for future ML training | MVP |

### 5.8 Localization & Cultural Context
| Feature | Description | Priority |
|---------|-------------|----------|
| **Bilingual UI** | English / Amharic toggle (EN / አማ) | MVP |
| **Ethiopian Calendar** | Date display in EC format | Phase 1 |
| **Birr Formatting** | Ethiopian Birr currency with proper locale symbols | MVP |
| **Ethiopian Mobile Money** | TeleBirr, CBE Birr integration in payment methods | Phase 1 |

### 5.9 Data Portability & Backup
| Feature | Description | Priority |
|---------|-------------|----------|
| **CSV Export** | Export transactions, customers, suppliers to CSV | MVP |
| **PWA Install** | Add-to-home-screen; no Play Store required | Phase 1 |
| **QR-Based Onboarding** | Telegram bot connection via QR scan | Phase 1 |

---

## 6. USER INTERFACE & EXPERIENCE DESIGN

### 6.1 Design Philosophy: "Notebook Feel"
- **No accounting jargon**: Use "I Sold Something" not "Record Sale"
- **No tax language**: Use "Spent" not "Deductible Expense"
- **Privacy by default**: Money hidden until user reveals it
- **30-Second Rule**: Any complete action finishes in ≤30 seconds
- **Large tap targets**: Minimum 44px buttons for thumbs and rough hands
- **Minimal text**: Short labels, icon-driven, space-efficient

### 6.2 Screen Architecture

#### Screen 1: Today (Home)
```
┌──────────────────────────────────────┐
│  🏪 [Shop Initial]   Shop Name   ⚙️ │
│  [EN] [አማ]                          │
├──────────────────────────────────────┤
│  📊 TODAY                           │
│  ┌────────┬────────┬────────┐       │
│  │ Sales  │ Spent  │ Profit │       │
│  │ 3,200  │ 1,500  │ 1,700  │       │
│  └────────┴────────┴────────┘       │
│  [ Tap to reveal ]                  │
├──────────────────────────────────────┤
│  🎤 RECORD BY VOICE (Primary)       │
│  [   Tap to Speak   ]               │
├──────────────────────────────────────┤
│  FAST ADD                           │
│  [ + Type Sale ] [ + I Spent ]      │
│  [ + Credit ]                       │
├──────────────────────────────────────┤
│  📒 TODAY'S ENTRIES                 │
│  + Bread 10x100    1,000 birr      │
│  + Shoe size 41    2,000 birr      │
│  - Transport         100 birr      │
├──────────────────────────────────────┤
│  🔥 4 day streak  📅 4 days 5 entries│
└──────────────────────────────────────┘
  [Today] [Credit] [Report] [Activity] [More]
```

#### Screen 2: Voice Recording Flow
```
FLOW: [Tap Mic] → [Listening... 00:08] → [Stop] → [Result]

┌──────────────────────────────────────┐
│  🎤 Listening...                     │
│                                      │
│  Speak your sale clearly             │
│                                      │
│  ⏱ 00:08 / 00:30                    │
│  ████████████████░░░░░░             │
│                                      │
│  ⚠️ Try to finish soon               │
│                                      │
│  [ ⬛ Stop ]                         │
│  [ ⌨️ Type instead ]                 │
└──────────────────────────────────────┘
```

#### Screen 3: Voice Result (Critical Screen)
```
┌──────────────────────────────────────┐
│  ✅ Got it                           │
│                                      │
│  I heard:                            │
│  "bread ten birr one hundred pieces  │
│   total one thousand"                │
│                                      │
│  ----------------------------------  │
│  💰 Total: 1,000 birr               │
│  ----------------------------------  │
│                                      │
│  [ ✅ Save ]                         │
│  [ ✏️ Fix ]                          │
│  [ 🔄 Re-record ]                    │
└──────────────────────────────────────┘
```

#### Screen 4: Quick Fix (Lightweight Edit)
```
┌──────────────────────────────────────┐
│  ✏️ Fix Sale                         │
│                                      │
│  Total: [ 1,000 ]                   │
│                                      │
│  Payment: [ Cash ▼ ]                │
│                                      │
│  Note (optional):                   │
│  [________________]                 │
│                                      │
│  [ ✅ Save ]                         │
└──────────────────────────────────────┘
```

#### Screen 5: Customer Credit List
```
┌──────────────────────────────────────┐
│  📒 CREDIT CUSTOMERS                │
│                                      │
│  [ + Add Customer ]                  │
│                                      │
│  🔴 kebede             2,400 birr   │
│     Last: Mar 18                    │
│                                      │
│  🟡 almaz              800 birr     │
│     Last: Mar 17                    │
│                                      │
│  🟢 tigist             150 birr     │
│     Last: Mar 19                    │
│                                      │
│  TOTAL OWING: 3,350 birr            │
└──────────────────────────────────────┘
```

### 6.3 Key UX Patterns

| Pattern | Implementation | Rationale |
|---------|---------------|-----------|
| **Voice-first** | Large mic button dominates home screen | Speaking is faster than typing for busy sellers |
| **Privacy auto-hide** | Values hidden; tap "eye" reveals; auto-hides after 30s | Prevents shoulder-surfing and employee curiosity |
| **Smart defaults** | "Today" pre-selected; payment defaults to Cash | Reduces decision fatigue |
| **Progressive disclosure** | Advanced fields (notes, due dates) hidden under "Advanced" | Keeps form short for 80% use case |
| **Language toggle** | Tiny EN/አማ switch in header | Seamless bilingual support |
| **Non-blocking errors** | Voice fails → instant fallback to manual entry | Never traps the user |
| **Ethiopian date aware** | Shows both EC and Gregorian where relevant | Local calendar familiarity |

### 6.4 Responsive & Accessibility
- **Breakpoints**: Mobile-first (320px min), optimized for 360–414px typical Android
- **Touch targets**: Minimum 44×44px (Apple HIG compliant)
- **Contrast ratios**: WCAG AA minimum on all text
- **No hover states required**: Pure touch and tap interactions
- **Screen reader labels**: Every icon button has amharic/english aria-label
- **Offline indicator**: Persistent strip shows connection status and pending sync count

---

## 7. TECHNICAL ARCHITECTURE

### 7.1 High-Level Stack
```
┌─────────────────────────────────────────────┐
│                   GEBYA                     │
├─────────────────────────────────────────────┤
│  FRONTEND                                   │
│  ├── React 18 + Vite                        │
│  ├── Tailwind CSS v4                         │
│  ├── Zustand (state management)              │
│  ├── Dexie.js v4 (IndexedDB)                │
│  ├── Web Speech API (voice)                  │
│  ├── PWA (vite-plugin-pwa)                   │
│  └── Ethiopian Date Library                  │
├─────────────────────────────────────────────┤
│  BACKEND (Optional for MVP)                  │
│  ├── Node.js + Express or Vercel Functions  │
│  ├── PostgreSQL via Supabase/Neon           │
│  ├── Whisper API (OpenAI/Azure)             │
│  ├── Telegram Bot API                       │
│  └── RBAC + Auth (JWT)                      │
├─────────────────────────────────────────────┤
│  DEPLOYMENT                                 │
│  ├── Vercel (frontend + serverless)         │
│  ├── GitHub (source control)                │
│  └── PWA (offline-capable)                  │
└─────────────────────────────────────────────┘
```

### 7.2 Data Layer

#### Primary Storage: IndexedDB via Dexie.js
```javascript
// Database schema (simplified)
db.version(1).stores({
  transactions: 'id, type, created_at, actor_staff_member_id',
  customer_transactions: 'id, customer_id, type, created_at',
  customers: 'id, display_name, phone, telegram_username',
  suppliers: 'id, name, phone',
  catalog_entries: 'id, name, active',
  staff_members: 'id, name, role, active',
  settings: 'key',  // key-value for app config
});
```

#### Cloud Schema (Phase 2)
```sql
-- PostgreSQL tables mirror local structure
users (id, phone, role, permissions, shop_id)
shops (id, name, owner_id)
transactions (id, shop_id, type, amount, raw_transcript, detected_total, ...)
customers (id, shop_id, display_name, phone, telegram_chat_id)
customer_transactions (id, customer_id, type, amount, ...)
```

### 7.3 Voice & AI Pipeline
```
User speaks → MediaRecorder (Web) → Blob
    ↓
Upload to backend (or local Whisper in future)
    ↓
Whisper API → { transcript: string, confidence: number }
    ↓
extractLikelyTotal(transcript) → number | null
    ↓
UI displays: transcript + detected total
    ↓
User actions: [Save] [Fix] [Re-record]
    ↓
Save to IndexedDB + optional cloud sync
```

### 7.4 Offline-First Strategy
```
┌────────────────────────────────────┐
│           APP STATE                │
├────────────────────────────────────┤
│  All reads → IndexedDB first       │
│  All writes → IndexedDB immediate  │
│                                    │
│  Background:                       │
│  - Queue failed API calls          │
│  - Retry on 'online' event         │
│  - Telegram queue drains first     │
│                                    │
│  Never block user on network       │
│  Never show "connection required"  │
└────────────────────────────────────┘
```

### 7.5 Privacy Architecture
```javascript
// All monetary values encrypted or masked in memory
const PrivacyContext = {
  isRevealed: false,  // default hidden
  revealTimer: null,  // auto-hide after 30s
  toggleReveal: () => { ... },
  autoHide: () => { ... },  // on minimize/blur
};

// UI layer:
{isRevealed ? <Amount value={5000} /> : <MaskedAmount />}
```

---

## 8. TECHNOLOGY STACK — DETAILED

### 8.1 Frontend Core
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 18.x | Component framework with hooks |
| **Vite** | 5.x | Build tool; HMR for fast iteration |
| **Tailwind CSS** | 4.x | Utility-first styling; custom design tokens |
| **TypeScript** | 5.x | Type safety across hooks, stores, utils |

### 8.2 Key Libraries
| Library | Purpose | Why Chosen |
|---------|---------|------------|
| **dexie** v4 | IndexedDB wrapper | Promise API, migrations, query API |
| **zustand** v5 | Global state | Minimal boilerplate, devtools friendly |
| **lucide-react** | Icon set | Tree-shakeable, consistent stroke width |
| **qrcode.react** | QR generation | Telegram bot link sharing |
| **ethiopian-date** | EC conversion | Local calendar support |
| **vite-plugin-pwa** | PWA support | Workbox-powered offline caching |
| **@sentry/react** | Error tracking | Production monitoring |

### 8.3 Backend (When Synced)
| Component | Choice | Rationale |
|-----------|--------|------------|
| **Runtime** | Vercel Serverless Functions or Express | Same repo, low ops |
| **Database** | PostgreSQL (Supabase / Neon) | Familiar SQL, good DX |
| **Auth** | JWT + custom roles | Simple, stateless |
| **Speech-to-Text** | OpenAI Whisper API | Best Amharic+English accuracy |
| **Telegram Bot** | Telegraf or raw API | Reliable message delivery |
| **File Storage** | Vercel Blob or S3 | Audio blobs for training data |

### 8.4 Development & Quality
| Tool | Use |
|------|-----|
| **Playwright** | E2E tests for critical flows |
| **ESLint** | Linting (via Replit standard config) |
| **Prettier** | Code formatting |
| **pnpm workspaces** | Monorepo management (gebya + api-server + db lib) |
| **TypeScript** | Strict mode enabled |

---

## 9. DATA MODEL — COMPLETE SCHEMA

### 9.1 Transactions (General Ledger)
```typescript
interface Transaction {
  id: string;
  type: 'sale' | 'expense' | 'credit_add' | 'payment';
  item_name?: string;
  quantity?: number;
  amount: number;  // total amount in birr
  cost_price?: number;  // optional, for profit calculation
  profit?: number;  // derived: (amount - cost_price) * quantity
  is_credit: boolean;
  customer_id?: string;
  supplier_id?: string;
  payment_method?: 'cash' | 'telebirr' | 'cbe_birr' | 'bank';
  actor_staff_member_id?: string;
  actor_name_snapshot?: string;
  raw_transcript?: string;  // if voice-originated
  detected_total?: number | null;
  was_edited: boolean;
  source_type: 'voice' | 'manual';
  created_at: number;  // epoch ms
  ethiopian_date?: string;
  notes?: string;
}
```

### 9.2 Customers (Credit Counterparties)
```typescript
interface Customer {
  id: string;
  display_name: string;
  note?: string;
  phone_number?: string;
  telegram_username?: string;
  telegram_chat_id?: string;
  created_at: number;
  updated_at: number;
}
```

### 9.3 Customer Transactions (Dual-Ledger for Credit)
```typescript
interface CustomerTransaction {
  id: string;
  customer_id: string;
  type: 'credit_add' | 'payment';
  amount: number;
  item_note?: string;
  due_date?: string;
  telegram_sent: boolean;
  telegram_delivery_state?: 'pending' | 'bot_sent' | 'failed';
  created_at: number;
  actor_staff_member_id?: string;
}
```

### 9.4 Suppliers (Extended Ledger)
```typescript
interface Supplier {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  created_at: number;
}
```

### 9.5 Staff Members (Team)
```typescript
interface StaffMember {
  id: string;
  name: string;
  role: 'owner' | 'cashier' | 'viewer';
  pin?: string;
  active: boolean;
  join_code?: string;
  created_at: number;
}
```

### 9.6 Settings (Key-Value Store)
```typescript
interface AppSettings {
  shop_name: string;
  shop_phone: string;
  shop_business_type: string;
  shop_telegram: string;
  enabled_payment_methods: string[];
  custom_quick_amounts: number[];
  owner_alert_threshold_amount: number;
  last_saved_snapshot?: number;
  last_backup_at?: number;
}
```

---

## 10. BUSINESS LOGIC & ALGORITHMS

### 10.1 True Profit Calculation
```
Profit = Σ(Sale Amounts) - Σ(Expense Amounts)

Optional enhanced:
  Profit = Σ((Selling Price - Cost Price) × Quantity)

Store cost_price optionally:
  - Collapsed under "Advanced" to reduce form friction
  - Encouraged but not required
  - Used only for per-item margin visibility
```

### 10.2 Credit Balance Calculation
```javascript
// Always computed, never manually entered
const balance = customerTransactions
  .filter(t => t.customer_id === targetId)
  .reduce((sum, t) => {
    return t.type === 'credit_add' ? sum + t.amount : sum - t.amount;
  }, 0);
```

### 10.3 Voice Total Extraction
```javascript
function extractLikelyTotal(transcript) {
  // 1. Find all numbers (digits and written forms)
  const numbers = extractNumbers(transcript);
  
  // 2. Filter plausible currency amounts (not tiny, not absurdly large)
  const plausible = numbers.filter(n => n >= 1 && n <= 1_000_000);
  
  // 3. Return largest plausible number (likely the total)
  //    or null if no confidence
  return plausible.length > 0 ? Math.max(...plausible) : null;
}
```

### 10.4 Ethiopian Date Conversion
- Converts Gregorian to Ethiopian (EC) using `ethiopian-date` library
- Displays both where space permits
- Uses EC for daily grouping and reporting

---

## 11. UI COMPONENT ARCHITECTURE

### 11.1 Component Tree (Simplified)
```
App
├── LangProvider
├── ThemeProvider
├── PrivacyProvider
├── AuthGate
├── OfflineStatusStrip
├── TodayTab
│   ├── KPICards
│   ├── VoiceButton
│   ├── QuickActions
│   └── TransactionList
├── CreditTab
│   ├── CustomerList
│   ├── AddCustomerForm
│   ├── CustomerDetail
│   │   ├── BalanceHeader
│   │   ├── TransactionHistory
│   │   ├── AddCreditModal
│   │   └── RecordPaymentModal
│   └── SupplierList (separate ledger)
├── HistoryTab (Report)
│   ├── DailySummaryList
│   ├── ReportView
│   └── ShareActions
├── OwnerActivityDashboard
│   ├── StaffList
│   └── DailyBreakdown
└── SettingsPage
    ├── ShopProfile
    ├── PaymentChannels
    ├── StaffManagement
    ├── CatalogManagement
    └── TelegramIntegration
```

### 11.2 State Management (Zustand)
```javascript
// Stores
useAppStore          // UI state (activeTab, modals, loading)
useAuthStore         // User identity, role, permissions
usePermissionsStore  // RBAC checks
useShopStore         // Shop profile, payment channels, alert thresholds
useTransactions      // General ledger entries
useCustomers         // Customer registry + enriched summaries
useSuppliers         // Supplier registry + ledger
useStaff             // Team members, active actor
useCatalog           // Product catalog
```

### 11.3 Hooks Layer
| Hook | Responsibility |
|------|---------------|
| `useTransactions` | CRUD for general ledger |
| `useCustomers` | CRUD for customers + transaction linking |
| `useSuppliers` | Dual-ledger supplier operations |
| `useCatalog` | Product catalog management |
| `useStaff` | Team member operations |
| `usePwaInstall` | Install prompt handling |
| `useOnlineStatus` | Online/offline detection |

---

## 12. PRIVACY & SECURITY

### 12.1 Privacy Model
- **Default hidden**: All monetary fields masked on load
- **Manual reveal**: User taps eye icon to show values
- **Auto-hide triggers**:
  - 30-second timeout after reveal
  - App minimized or backgrounded
  - Tab switched (optional)
- **No forced login**: Skip authentication option for single-device use

### 12.2 Data Security
- All storage client-side by default (IndexedDB)
- Optional cloud sync uses HTTPS + JWT
- No plaintext passwords; PIN for staff access only
- Telegram chat IDs stored locally (not shared without consent)
- Export data available anytime (CSV backup)

### 12.3 Trust Signals
- "Your data stays on your phone" messaging
- No account creation required for core features
- No analytics tracking without opt-in
- Transparent permission requests (camera only for voice, if needed)

---

## 13. CULTURAL & LOCALIZATION FEATURES

### 13.1 Language Support
- Full English + Amharic translation
- Mixed input handling (Amharic grammar with English product names)
- Right-to-left considerations not needed (Amharic is left-to-right)

### 13.2 Calendar System
- Primary display: Ethiopian Calendar (EC)
- Secondary: Gregorian for international context
- Date grouping by EC day for reports

### 13.3 Currency & Number Formatting
- Ethiopian Birr (ETB) with "ብር" symbol
- Number formatting: 3-digit grouping (1,000 not 10,000 separator style)
- Voice parsing supports both numeric and word-form numbers:
  - "ስድስት ሺህ" → 6000
  - "ten thousand" → 10000

### 13.4 Mobile Money Integration
- TeleBirr (Ethiopia's dominant mobile money)
- CBE Birr (bank wallet)
- Manual bank transfer tracking
- All treated as payment methods in the transaction record

---

## 14. DEPLOYMENT & INFRASTRUCTURE

### 14.1 Current Implementation State
- ✅ Frontend fully functional as PWA
- ✅ Local storage (IndexedDB) complete
- ✅ Voice entry flow implemented
- ✅ Credit (Merro) module complete
- ✅ Supplier dual-ledger complete
- ✅ Staff RBAC complete
- ✅ Telegram queue system active
- ✅ Offline-first operation verified
- 🔄 Cloud sync backend in progress (Phase 2)

### 14.2 Hosting
| Environment | Platform | URL Pattern |
|------------|----------|-------------|
| Production | Vercel | `https://gebya.app` |
| Preview | Vercel | PR-based preview URLs |
| Development | Replit / Local | `localhost:5173` |

### 14.3 PWA Configuration
- Manifest: Installable on Android home screen
- Service Worker: Caches app shell for offline launch
- Icons: 192px, 512px with maskable variants
- Theme color: `#1B4332` (deep green)

---

## 15. ROADMAP & FUTURE ENHANCEMENTS

### Phase 1 (Current — Complete)
| Feature | Status |
|---------|--------|
| Voice-first transaction entry | ✅ Done |
| Manual transaction entry | ✅ Done |
| Customer credit management | ✅ Done |
| Supplier ledger | ✅ Done |
| Team RBAC | ✅ Done |
| Offline-first local storage | ✅ Done |
| Ethiopian calendar + Birr | ✅ Done |
| Telegram notifications (basic) | ✅ Done |
| PWA installation | ✅ Done |
| CSV export | ✅ Done |

### Phase 2 (Next 3 Months)
| Feature | Priority |
|---------|----------|
| Cloud sync engine | High |
| Multi-device support | High |
| Receipt/invoice generation (WhatsApp share) | High |
| Advanced analytics (monthly trends, best-sellers) | Medium |
| Inventory management | Medium |
| Item parsing from voice (structured data) | Medium |
| Automated reminders (due dates, repeat customers) | Medium |

### Phase 3 (6+ Months)
| Feature | Priority |
|---------|----------|
| AI insights and coaching | Low |
| Group buying / supplier network features | Low |
| Tax report generation | Low |
| Marketplace integration | Low |
| Group savings ("Equb") module | Low |

---

## 16. METRICS & SUCCESS INDICATORS

### 16.1 Product Success
| Metric | Target |
|--------|--------|
| First transaction time | <2 minutes |
| Daily active rate (week 1) | 3/5 users |
| Voice vs manual ratio | >70% voice |
| Cost price entry rate | >2/5 users |
| Retention (day 7) | >40% |

### 16.2 Technical Success
| Metric | Target |
|--------|--------|
| App load time (3G) | <3s |
| Voice recording latency | <500ms |
| Offline functionality | 100% of features |
| Crash-free sessions | >99% |
| Build time | <20s |

---

## 17. COMPETITIVE LANDSCAPE

| Competitor | Weakness vs Gebya |
|------------|-------------------|
| QuickBooks / Xero | Too complex; English-only; online-only |
| Wave Accounting | No offline; no voice; no Amharic |
| Local notebook apps | No credit management; no voice |
| Zoho Books | Enterprise-focused; heavy onboarding |
| iREW | Not Ethiopia-specific; lacks privacy model |

### Gebya Unique Advantages
1. **Voice-first** — no typing required for basic entries
2. **Offline-absolute** — works without data
3. **Privacy-native** — money hidden by default
4. **Amharic-first** — not an afterthought
5. **Merro module** — purpose-built for Ethiopian credit culture
6. **30-second actions** — designed for thumbrange, not mouse

---

## 18. OPEN QUESTIONS & ASSUMPTIONS

### 18.1 Assumptions Validated So Far
- ✅ Shop owners will use voice if it's faster than paper
- ✅ Privacy toggle is a must-have, not nice-to-have
- ✅ Credit tracking is valued as much as sales tracking
- ✅ Offline is non-negotiable

### 18.2 Open Questions
1. **Speech accuracy**: Will Whisper handle noisy merkato + Amharic-English mixed reliably?
2. **Voice-only viability**: Do sellers have enough quiet moments to record?
3. **Data safety**: Will users trust local-only storage, or demand cloud backup immediately?
4. **PWA adoption**: Will Android users install PWAs, or demand Play Store apps?
5. **Telegram integration**: Is Telegram universally available, or are some users on SMS-only phones?

### 18.3 Risk Mitigations
| Risk | Mitigation |
|------|-----------|
| Poor voice accuracy in noise | Manual entry always available; voice is fast path not requirement |
| Users fear data loss | Export CSV feature prominently placed; optional cloud backup in Phase 2 |
| Amharic OCR/speech gaps | Allow English phonetic input; manual correction always possible |
| Data costs block sync | Sync only on WiFi; user-controlled sync triggers |

---

## 19. CONCLUSION

Gebya is not a generic small-business tool localized for Ethiopia. It is an **ethnographically-designed retail companion** built from the ground up for how Ethiopian shop owners actually work, think, and communicate.

**What makes it different:**
1. It starts from **voice**, not forms
2. It prioritizes **privacy** over transparency
3. It treats **offline** as the default, not the exception
4. It speaks **Amharic** as a first-class language
5. It understands **credit culture** as central, not peripheral
6. It respects **low-literacy users** with minimal text and maximal icons

**The goal is simple**: Make recording a sale or credit easier than reaching for the paper notebook — and keep it that way for the next million Ethiopian retailers.

---

*Document prepared for Google AI Studio platform evaluation.*  
*Last updated: June 2026*  
*Maintained by: Gebya Engineering Team*