/**
 * Migration test: v21 → v22 → v23.
 *
 * v22: voice-field removal.
 * v23: drop 17 unused indexes on transactions (data preserved, only indexes change).
 *
 * Catches the critical bug where v22's .stores() only declared the
 * `transactions` table, which would cause Dexie to DROP all other
 * tables on upgrade — destroying customers, suppliers, credit records,
 * settings, sync queue, and everything else.
 *
 * This test defines v21, v22, and v23 schemas inline (matching db.js
 * exactly) so it's runnable in pure Node without browser imports.
 *
 * Run: node tests/db-migration-v22.test.mjs
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

const DB_NAME = 'GebyaDB_MigrationTest';

// ── v21 schema: exact copy from db.js lines 480-496 ────────────────────

const V21_STORES = {
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
};

// ── v22 schema: exact copy from db.js after the fix ────────────────────
// Only change: transactions line drops 6 voice fields

const V22_STORES = {
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, was_edited, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
};

// ── v23 schema: drop 17 unused indexes on transactions ─────────────────
// Only type, created_at, updated_at, transaction_id remain indexed.

const V23_STORES = {
  transactions: '++id, type, created_at, updated_at, transaction_id',
  customers: V22_STORES.customers,
  customer_transactions: V22_STORES.customer_transactions,
  catalog_entries: V22_STORES.catalog_entries,
  suggestion_log: V22_STORES.suggestion_log,
  cross_shop_unmatched: V22_STORES.cross_shop_unmatched,
  suppliers: V22_STORES.suppliers,
  supplier_transactions: V22_STORES.supplier_transactions,
  staff_members: V22_STORES.staff_members,
  sync_queue: V22_STORES.sync_queue,
  credit_records: V22_STORES.credit_records,
  credit_payment_logs: V22_STORES.credit_payment_logs,
  daily_closings: V22_STORES.daily_closings,
  settings: V22_STORES.settings,
  analytics: V22_STORES.analytics,
};

// ── Seed data: one record per table ────────────────────────────────────

const SEED = {
  transactions: {
    type: 'sale', amount: 500, item_name: 'Test Item', cost_price: 300, quantity: 1,
    profit: 200, is_credit: false, customer_id: null, customer_name: null,
    created_at: new Date().toISOString(), ethiopian_date: '2017-01-01',
    payment_type: 'cash', payment_provider: null, updated_at: new Date().toISOString(),
    source: 'manual', raw_transcript: 'SHOULD_BE_REMOVED', detected_total: 500,
    was_edited: false, transcription_provider: 'whisper', parsing_confidence: 0.95,
    voice_note: 'SHOULD_BE_REMOVED', raw_audio_ref: 'SHOULD_BE_REMOVED',
    actor_role: 'owner', actor_staff_member_id: null, actor_name_snapshot: 'Shop Owner',
    transaction_id: 'txn_test_001', device_id: 'device_test',
  },
  customers: {
    display_name: 'Test Customer', note: 'VIP', phone_number: '+251911000000',
    telegram_username: 'testuser', telegram_chat_id: '12345',
    telegram_notify_enabled: true, telegram_link_token: 'tok_abc',
    telegram_linked_at: new Date().toISOString(), telegram_link_requested_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  customer_transactions: {
    customer_id: 1, type: 'credit_add', amount: 1000, due_date: '2026-02-01',
    payment_method: 'cash', payment_provider: null, reference_code: null,
    telegram_delivery_state: 'sent', telegram_delivery_error: null,
    telegram_delivery_attempted_at: new Date().toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    actor_role: 'owner', actor_staff_member_id: null, actor_name_snapshot: 'Owner',
    transaction_id: 'ctx_001', device_id: 'device_test', reversal_of: null,
  },
  catalog_entries: {
    name: 'Test Product', kind: 'item', active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    suggestion_shown_count: 0, suggestion_accepted_count: 0,
    suggestion_rejected_count: 0, suggested_match_id: null, canonical_name_en: null,
  },
  suggestion_log: {
    catalog_entry_id: 1, shown_at: new Date().toISOString(),
    accepted: true, context_tod: 'morning', context_day: 'Monday',
  },
  cross_shop_unmatched: {
    shop_id: 'shop_001', item_name: 'Mystery Item', occurrence_count: 3,
    last_seen_at: new Date().toISOString(), canonical_name_en: null,
    canonical_name_am: null, curated: false, created_at: new Date().toISOString(),
  },
  suppliers: {
    display_name: 'Test Supplier', phone_number: '+251922000000',
    note: 'Wholesale', active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  supplier_transactions: {
    supplier_id: 1, type: 'purchase', catalog_entry_id: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    actor_role: 'owner', actor_staff_member_id: null, actor_name_snapshot: 'Owner',
    transaction_id: 'stx_001', device_id: 'device_test',
  },
  staff_members: {
    display_name: 'Staff One', role: 'staff', active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    deactivated_at: null,
  },
  sync_queue: {
    kind: 'transaction', status: 'pending',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    next_attempt_at: new Date().toISOString(), record_table: 'transactions',
    record_id: 1, transaction_id: 'txn_001', idempotency_key: 'idem_001',
    record_type: 'sale', device_id: 'device_test',
  },
  credit_records: {
    customer_id: 1, customer_name: 'Test Customer',
    original_amount: 5000, paid_amount: 2000, remaining_amount: 3000,
    due_date: '2026-03-01', status: 'active',
    created_at: new Date().toISOString(), direction: 'gave',
  },
  credit_payment_logs: {
    credit_record_id: 1, amount: 500, payment_method: 'cash',
    paid_at: new Date().toISOString(),
  },
  daily_closings: {
    closed_at: new Date().toISOString(), date_start: '2026-01-01',
    date_end: '2026-01-01', actor_role: 'owner',
    actor_staff_member_id: null, actor_name_snapshot: 'Owner', finalized: true,
  },
  settings: { key: 'privacy_mode', value: 'visible' },
  analytics: { key: 'daily_summary', value: '{"total":1000}' },
};

// ── Step 1: Create v21 database and seed all 15 tables ─────────────────

const v21 = new Dexie(DB_NAME);
v21.version(21).stores(V21_STORES);
await v21.open();

for (const [table, data] of Object.entries(SEED)) {
  await v21.table(table).add(data);
}

await v21.close();

// ── Step 2: Reopen with v22 schema (triggers migration) ────────────────

const v22 = new Dexie(DB_NAME);
v22.version(21).stores(V21_STORES);
v22.version(22).stores(V22_STORES).upgrade(async (tx) => {
  await tx.table('transactions').toCollection().modify((record) => {
    delete record.raw_transcript;
    delete record.detected_total;
    delete record.transcription_provider;
    delete record.parsing_confidence;
    delete record.voice_note;
    delete record.raw_audio_ref;
  });
});
await v22.open();

// ── Step 3: Verify ALL data survived ───────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

console.log('\n=== v21 → v22 Migration Test ===\n');

// Check every table has exactly 1 record
for (const [table] of Object.entries(SEED)) {
  const count = await v22.table(table).count();
  assert(count === 1, `${table}: survived upgrade (count=${count})`);
}

// Transaction: verify data preserved AND voice fields removed
const tx = await v22.transactions.toCollection().first();
assert(tx !== undefined, 'transactions: record exists');
assert(tx.amount === 500, `transactions: amount preserved (${tx.amount})`);
assert(tx.item_name === 'Test Item', `transactions: item_name preserved`);
assert(tx.was_edited === false, `transactions: was_edited preserved`);
assert(!('raw_transcript' in tx), 'transactions: raw_transcript removed');
assert(!('detected_total' in tx), 'transactions: detected_total removed');
assert(!('transcription_provider' in tx), 'transactions: transcription_provider removed');
assert(!('parsing_confidence' in tx), 'transactions: parsing_confidence removed');
assert(!('voice_note' in tx), 'transactions: voice_note removed');
assert(!('raw_audio_ref' in tx), 'transactions: raw_audio_ref removed');

// Spot checks on non-transaction tables
const customer = await v22.customers.toCollection().first();
assert(customer.display_name === 'Test Customer', 'customers: display_name preserved');

const supplier = await v22.suppliers.toCollection().first();
assert(supplier.display_name === 'Test Supplier', 'suppliers: display_name preserved');

const credit = await v22.credit_records.toCollection().first();
assert(credit.remaining_amount === 3000, 'credit_records: remaining_amount preserved');

const setting = await v22.settings.toCollection().first();
assert(setting.key === 'privacy_mode', 'settings: key preserved');

const syncItem = await v22.sync_queue.toCollection().first();
assert(syncItem.idempotency_key === 'idem_001', 'sync_queue: idempotency_key preserved');

const staff = await v22.staff_members.toCollection().first();
assert(staff.display_name === 'Staff One', 'staff_members: display_name preserved');

const dailyClosing = await v22.daily_closings.toCollection().first();
assert(dailyClosing.finalized === true, 'daily_closings: finalized preserved');

const analyticsRecord = await v22.analytics.toCollection().first();
assert(analyticsRecord.key === 'daily_summary', 'analytics: key preserved');

const catalogEntry = await v22.catalog_entries.toCollection().first();
assert(catalogEntry.name === 'Test Product', 'catalog_entries: name preserved');

const custTx = await v22.customer_transactions.toCollection().first();
assert(custTx.amount === 1000, 'customer_transactions: amount preserved');

const supplierTx = await v22.supplier_transactions.toCollection().first();
assert(supplierTx.type === 'purchase', 'supplier_transactions: type preserved');

const creditLog = await v22.credit_payment_logs.toCollection().first();
assert(creditLog.amount === 500, 'credit_payment_logs: amount preserved');

const suggestion = await v22.suggestion_log.toCollection().first();
assert(suggestion.accepted === true, 'suggestion_log: accepted preserved');

const unmatched = await v22.cross_shop_unmatched.toCollection().first();
assert(unmatched.item_name === 'Mystery Item', 'cross_shop_unmatched: item_name preserved');

await v22.close();

// ── Step 4: Reopen with v23 schema (index removal — no data change) ────

console.log('\n=== v22 → v23 Migration Test (index removal) ===\n');

const v23 = new Dexie(DB_NAME);
v23.version(21).stores(V21_STORES);
v23.version(22).stores(V22_STORES).upgrade(async (tx) => {
  await tx.table('transactions').toCollection().modify((record) => {
    delete record.raw_transcript;
    delete record.detected_total;
    delete record.transcription_provider;
    delete record.parsing_confidence;
    delete record.voice_note;
    delete record.raw_audio_ref;
  });
});
v23.version(23).stores(V23_STORES);
await v23.open();

// Verify data survived the index-only migration
for (const [table] of Object.entries(SEED)) {
  const count = await v23.table(table).count();
  assert(count === 1, `[v23] ${table}: survived upgrade (count=${count})`);
}

const v23tx = await v23.transactions.toCollection().first();
assert(v23tx.amount === 500, `[v23] transactions: amount preserved (${v23tx.amount})`);
assert(v23tx.item_name === 'Test Item', '[v23] transactions: item_name preserved');
assert(v23tx.transaction_id === 'txn_test_001', '[v23] transactions: transaction_id preserved');
assert(!('raw_transcript' in v23tx), '[v23] transactions: raw_transcript still removed');

// ── Summary ────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) process.exit(1);
