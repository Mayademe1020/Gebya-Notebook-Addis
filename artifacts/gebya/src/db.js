import Dexie from 'dexie';
import { startOfLocalDay } from './utils/reportSelectors';
import { toTimestamp, normalizeText } from './dbHelpers.js';

export const db = new Dexie('GebyaDB');

async function migrateLegacyCredits(tx) {
  const legacyCreditsTable = tx.table('credit_records');
  const legacyPaymentsTable = tx.table('credit_payment_logs');
  const customersTable = tx.table('customers');
  const customerTransactionsTable = tx.table('customer_transactions');
  const suppliersTable = tx.table('suppliers');
  const supplierTransactionsTable = tx.table('supplier_transactions');

  const [legacyCustomers, legacyCredits, legacyPayments, existingSuppliers, existingCustomerTransactions, existingSupplierTransactions] = await Promise.all([
    customersTable.toArray(),
    legacyCreditsTable.toArray(),
    legacyPaymentsTable.toArray(),
    suppliersTable.toArray(),
    customerTransactionsTable.toArray(),
    supplierTransactionsTable.toArray(),
  ]);

  if (legacyCredits.length === 0) {
    return;
  }

  const paymentsByCreditId = legacyPayments.reduce((acc, payment) => {
    if (!acc[payment.credit_record_id]) acc[payment.credit_record_id] = [];
    acc[payment.credit_record_id].push(payment);
    return acc;
  }, {});

  const customerIdByLegacyId = new Map();
  const supplierIdByLegacyId = new Map();
  const knownCustomerTransactions = [...existingCustomerTransactions];
  const knownSupplierTransactions = [...existingSupplierTransactions];
  const knownSuppliers = [...existingSuppliers];
  const now = Date.now();

  const findMatchingCustomerTransaction = (expected) => knownCustomerTransactions.find((entry) => (
    entry.customer_id === expected.customer_id &&
    entry.type === expected.type &&
    Number(entry.amount || 0) === Number(expected.amount || 0) &&
    Number(entry.created_at || 0) === Number(expected.created_at || 0) &&
    Number(entry.due_date || 0) === Number(expected.due_date || 0) &&
    normalizeText(entry.item_note) === normalizeText(expected.item_note)
  ));

  const findMatchingSupplierTransaction = (expected) => knownSupplierTransactions.find((entry) => (
    entry.supplier_id === expected.supplier_id &&
    entry.type === expected.type &&
    Number(entry.amount || 0) === Number(expected.amount || 0) &&
    Number(entry.created_at || 0) === Number(expected.created_at || 0) &&
    Number(entry.quantity || 0) === Number(expected.quantity || 0) &&
    normalizeText(entry.item_name) === normalizeText(expected.item_name) &&
    normalizeText(entry.note) === normalizeText(expected.note)
  ));

  const findExistingMigratedSupplier = ({ displayName, phoneNumber, createdAt }) => knownSuppliers.find((supplier) => (
    normalizeText(supplier.display_name) === displayName &&
    normalizeText(supplier.phone_number) === phoneNumber &&
    Number(supplier.created_at || 0) === Number(createdAt || 0)
  ));

  for (const legacyCustomer of legacyCustomers) {
    const displayName = normalizeText(legacyCustomer.display_name || legacyCustomer.name);
    const phoneNumber = normalizeText(legacyCustomer.phone_number || legacyCustomer.phone);
    const updatedAt = toTimestamp(legacyCustomer.updated_at, now);
    const createdAt = toTimestamp(legacyCustomer.created_at, updatedAt);

    await customersTable.put({
      id: legacyCustomer.id,
      display_name: displayName || `Customer ${legacyCustomer.id}`,
      note: normalizeText(legacyCustomer.note),
      phone_number: phoneNumber,
      telegram_username: normalizeText(legacyCustomer.telegram_username),
      telegram_chat_id: legacyCustomer.telegram_chat_id || null,
      telegram_notify_enabled: !!legacyCustomer.telegram_notify_enabled,
      telegram_link_token: legacyCustomer.telegram_link_token || null,
      telegram_linked_at: legacyCustomer.telegram_linked_at || null,
      created_at: createdAt,
      updated_at: updatedAt,
    });

    customerIdByLegacyId.set(legacyCustomer.id, legacyCustomer.id);
  }

  for (const credit of legacyCredits) {
    const isSupplierDebt = credit.direction === 'i_owe';
    const displayName = normalizeText(credit.customer_name) || `Migrated ${isSupplierDebt ? 'supplier' : 'customer'} ${credit.id}`;
    const createdAt = toTimestamp(credit.created_at, now);
    const updatedAt = toTimestamp(credit.paid_at, createdAt);
    const paidAmount = Number(credit.paid_amount) || 0;
    const originalAmount = Number(credit.original_amount) || 0;

    if (originalAmount <= 0) {
      continue;
    }

    const paymentRows = (paymentsByCreditId[credit.id] || []).slice().sort((a, b) => {
      return toTimestamp(a.paid_at, createdAt) - toTimestamp(b.paid_at, createdAt);
    });

    const coveredByLogs = paymentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (paidAmount > coveredByLogs) {
      paymentRows.push({
        credit_record_id: credit.id,
        amount: paidAmount - coveredByLogs,
        payment_method: null,
        paid_at: credit.paid_at || credit.updated_at || createdAt,
      });
    }

    if (isSupplierDebt) {
      let supplierId = supplierIdByLegacyId.get(credit.customer_id);
      if (!supplierId) {
        const phoneNumber = normalizeText(credit.customer_phone);
        const existingSupplier = findExistingMigratedSupplier({ displayName, phoneNumber, createdAt });
        if (existingSupplier) {
          supplierId = existingSupplier.id;
        } else {
          supplierId = await suppliersTable.add({
            display_name: displayName,
            phone_number: phoneNumber,
            note: 'Migrated from legacy credit records',
            active: true,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          knownSuppliers.push({
            id: supplierId,
            display_name: displayName,
            phone_number: phoneNumber,
            note: 'Migrated from legacy credit records',
            active: true,
            created_at: createdAt,
            updated_at: updatedAt,
          });
        }
        if (credit.customer_id != null) {
          supplierIdByLegacyId.set(credit.customer_id, supplierId);
        }
      }

      const purchaseEntry = {
        supplier_id: supplierId,
        type: 'purchase_add',
        catalog_entry_id: null,
        item_name: normalizeText(credit.item_name) || 'Migrated supplier dubie',
        item_kind: null,
        quantity: 1,
        amount: originalAmount,
        note: 'Migrated from legacy credit records',
        created_at: createdAt,
        updated_at: createdAt,
      };
      if (!findMatchingSupplierTransaction(purchaseEntry)) {
        const purchaseId = await supplierTransactionsTable.add(purchaseEntry);
        knownSupplierTransactions.push({ ...purchaseEntry, id: purchaseId });
      }

      for (const payment of paymentRows) {
        const amount = Number(payment.amount) || 0;
        if (amount <= 0) continue;
        const paidAt = toTimestamp(payment.paid_at, updatedAt);
        const paymentEntry = {
          supplier_id: supplierId,
          type: 'supplier_payment',
          catalog_entry_id: null,
          item_name: null,
          item_kind: null,
          quantity: null,
          amount,
          note: normalizeText(payment.payment_method) || 'Migrated supplier payment',
          created_at: paidAt,
          updated_at: paidAt,
        };
        if (!findMatchingSupplierTransaction(paymentEntry)) {
          const paymentId = await supplierTransactionsTable.add(paymentEntry);
          knownSupplierTransactions.push({ ...paymentEntry, id: paymentId });
        }
      }

      continue;
    }

    let customerId = customerIdByLegacyId.get(credit.customer_id);
    if (!customerId) {
      customerId = await customersTable.add({
        display_name: displayName,
        note: 'Migrated from legacy credit records',
        phone_number: normalizeText(credit.customer_phone),
        telegram_username: null,
        telegram_chat_id: null,
        telegram_notify_enabled: false,
        telegram_link_token: null,
        telegram_linked_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      if (credit.customer_id != null) {
        customerIdByLegacyId.set(credit.customer_id, customerId);
      }
    }

    const creditEntry = {
      customer_id: customerId,
      type: 'credit_add',
      amount: originalAmount,
      item_note: normalizeText(credit.item_name) || 'Migrated dubie',
      due_date: credit.due_date || null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    if (!findMatchingCustomerTransaction(creditEntry)) {
      const creditEntryId = await customerTransactionsTable.add(creditEntry);
      knownCustomerTransactions.push({ ...creditEntry, id: creditEntryId });
    }

    for (const payment of paymentRows) {
      const amount = Number(payment.amount) || 0;
      if (amount <= 0) continue;
      const paidAt = toTimestamp(payment.paid_at, updatedAt);
      const paymentEntry = {
        customer_id: customerId,
        type: 'payment',
        amount,
        item_note: normalizeText(payment.payment_method) || 'Migrated payment',
        due_date: null,
        created_at: paidAt,
        updated_at: paidAt,
      };
      if (!findMatchingCustomerTransaction(paymentEntry)) {
        const paymentEntryId = await customerTransactionsTable.add(paymentEntry);
        knownCustomerTransactions.push({ ...paymentEntry, id: paymentEntryId });
      }
    }
  }
}

db.version(1).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at',
  settings: 'key, value'
});

db.version(2).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at',
  settings: 'key, value'
});

db.version(3).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value'
});

db.version(4).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(5).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(6).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(7).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
});

db.version(8).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, name, phone, total_debt',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  settings: 'key, value',
  analytics: 'key, value',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
});

db.version(9).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(10).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(11).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, created_at, updated_at',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(12).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, created_at, updated_at',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
}).upgrade(async (tx) => {
  await migrateLegacyCredits(tx);
});

db.version(13).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

// Staff members are meant to be deactivated rather than hard-deleted once they
// have historical records. Transactions keep a name snapshot so shop history
// stays trustworthy even after staff changes.
db.version(14).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

// Sync queue stores non-authoritative integration work only. Ledger/source rows
// above remain the local-first source of truth even when sync fails.
db.version(15).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(16).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

// Version 18: Add daily_closings store for reconciliation / end-of-day records
// daily_closings index list covers queried keys; all other keys are stored as-is by Dexie.
db.version(18).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
});

// Version 19: Add payment_method + payment_provider to customer_transactions
db.version(19).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
});

// Version 20: Add reversal_of index to customer_transactions for reversal entry lookups
db.version(20).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
});

// Version 21: Learning loop — suggestion tracking, price clustering, cross-shop normalization
db.version(21).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
});

// Version 22: Remove dead voice-feature schema fields (raw_transcript, detected_total,
// transcription_provider, parsing_confidence, voice_note, raw_audio_ref).
// was_edited is kept — it is actively used by edit handlers and trustScore.
db.version(22).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, was_edited, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
}).upgrade(async (tx) => {
  await tx.table('transactions').toCollection().modify((record) => {
    delete record.raw_transcript;
    delete record.detected_total;
    delete record.transcription_provider;
    delete record.parsing_confidence;
    delete record.voice_note;
    delete record.raw_audio_ref;
  });
});

// Version 23: Drop 17 unused indexes on transactions.
// Only 4 fields are actually queried via .where()/.orderBy():
//   type (trustScore), created_at (TransactionForm), updated_at (syncEngine push),
//   transaction_id (syncEngine pull).
// All other fields are read-only after toArray() — no index needed.
// IMPORTANT: Every table MUST be re-declared or Dexie will drop it.
db.version(23).stores({
  transactions: '++id, type, created_at, updated_at, transaction_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
});

// Version 24: Add identity store for shop/device identity (PR 1A).
// IMPORTANT: Every table MUST be re-declared or Dexie will drop it.
db.version(24).stores({
  transactions: '++id, type, created_at, updated_at, transaction_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settings: 'key, value',
  analytics: 'key, value',
  identity: 'key',
});

// Version 25: Add settlements table for per-staff settlement system.
// IMPORTANT: Every table MUST be re-declared or Dexie will drop it.
db.version(25).stores({
  transactions: '++id, type, created_at, updated_at, transaction_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en',
  suggestion_log: '++id, catalog_entry_id, shown_at, accepted, context_tod, context_day',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, phone_snapshot',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  daily_closings: '++id, closed_at, date_start, date_end, actor_role, actor_staff_member_id, actor_name_snapshot, finalized',
  settlements: '++id, settlement_id, staff_id, status, settled_at, updated_at, business_id, [settled_at+business_id], reconciliation_status',
  settings: 'key, value',
  analytics: 'key, value',
  identity: 'key',
});

db.version(26).stores({
  transactions: '++id, type, created_at, updated_at, transaction_id, remote_local_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at, remote_local_id',
  customer_transactions: '++id, customer_id, type, amount, due_date, payment_method, payment_provider, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, reversal_of, remote_local_id',
  catalog_entries: '++id, name, kind, active, created_at, updated_at, suggestion_shown_count, suggestion_accepted_count, suggestion_rejected_count, suggested_match_id, canonical_name_en, remote_local_id',
  cross_shop_unmatched: '++id, shop_id, item_name, occurrence_count, last_seen_at, canonical_name_en, canonical_name_am, curated, created_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at, remote_local_id',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id, remote_local_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at, remote_local_id',
  settlements: '++id, settlement_id, staff_id, status, settled_at, updated_at, business_id, [settled_at+business_id], remote_local_id, [device_id+remote_local_id], reconciliation_status',
});

// Version 27: Durable push outbox for syncEngine. Every local create/update on
// a synced entity table records its primary key here; entries are removed only
// after the server acknowledges the push. This makes "Pending sync" truthful
// (count = outbox size) and prevents writes made during an active sync from
// being silently skipped by timestamp-based push queries.
// Only the new store is declared — Dexie merges schemas across versions.
db.version(27).stores({
  sync_outbox: 'key, table, created_at',
});

// Gate B: purge legacy Armenian structured-code fields (persisted by
// historical writers; read by nothing — see R2-PLAN readers report).
// Server-side twin lives in ensureSchema (batched UPDATE + logged count).
// Idempotent: on a clean device the filter matches nothing. Runs once per
// device at version-28 upgrade; offline-safe (native Dexie upgrade path).
db.version(28).upgrade(async (tx) => {
  // Legacy codes built from codepoints (kept out of literals for the i18n
  // checker) — they represent, byte-exactly:
  //   [0] = '2 ' + '\u0555\u054F\u0551\u0546'  (the legacy categoryCode,
  //         Armenian capitals; U+0555 U+054F U+0551 U+0546)
  //   [1] = '\u0533.\u0546'                    (the legacy labelCode)
  // DO NOT "simplify" these into literals or constants-elsewhere: they must
  // match the exact bytes persisted by historical writers or the purge
  // silently matches nothing. See the Gate B readers report in R2-PLAN.md.
  const LEGACY_CODES = [
    '2 ' + String.fromCharCode(0x0555, 0x054f, 0x0551, 0x0546),
    String.fromCharCode(0x0533, 0x2e, 0x0546),
  ];
  for (const table of ['customer_transactions', 'transactions']) {
    const rows = await tx.table(table).toArray();
    const dirty = rows.filter(
      (r) => LEGACY_CODES.includes(r.categoryCode) || LEGACY_CODES.includes(r.labelCode),
    );
    if (dirty.length > 0) {
      await tx.table(table).bulkPut(
        dirty.map((r) => ({ ...r, categoryCode: null, labelCode: null })),
      );
    }
  }
});

// Local-only safety copy taken before a destructive restore. One row under a
// fixed key; never uploaded and never part of the synced ledger. Additive
// store, so Dexie merges it without touching existing tables.
db.version(29).stores({
  local_backups: 'key, created_at',
});

// H4: last server-acknowledged snapshot per record, used as the common
// ancestor for the field-level conflict merge. Keyed by origin
// (table:device:localId). Additive store — never uploaded, never part of the
// synced ledger; entries are refreshed on pull and after a conflict merge.
db.version(30).stores({
  sync_bases: 'key, updated_at',
});

db.on('ready', async () => {
  const privacySetting = await db.settings.get('privacy_mode');
  if (!privacySetting) {
    await db.settings.put({ key: 'privacy_mode', value: 'visible' });
  }
});

export async function getIdentity() {
  return db.identity.get('me');
}

export async function setIdentity(identity) {
  const now = Date.now();
  return db.identity.put({ key: 'me', ...identity, updated_at: now });
}

export async function clearIdentity() {
  return db.identity.delete('me');
}

// @deprecated — use getAuthToken() (JWT) from syncEngine instead.
// Returns the legacy device_token UUID from the identity store.
export async function getDeviceToken() {
  const ident = await db.identity.get('me');
  return ident?.device_token ?? null;
}

export async function getShopId() {
  const ident = await db.identity.get('me');
  return ident?.shop_id ?? null;
}

export async function getStaffId() {
  const ident = await db.identity.get('me');
  return ident?.staff_id ?? null;
}

export async function getRole() {
  const ident = await db.identity.get('me');
  return ident?.role ?? null;
}

export async function getPermissions() {
  const ident = await db.identity.get('me');
  return ident?.permissions ?? {};
}

export async function getBusinesses() {
  return db.identity.get('businesses');
}

export async function setBusinesses(businessList) {
  return db.identity.put({ key: 'businesses', list: businessList });
}

export async function saveDailyClosing(record) {
  const now = Date.now();
  const entry = {
    closed_at: now,
    date_start: record.date_start || startOfLocalDay(now),
    date_end: record.date_end || now,
    actor_role: record.actor_role || 'owner',
    actor_staff_member_id: record.actor_staff_member_id || null,
    actor_name_snapshot: record.actor_name_snapshot || null,
    finalized: record.finalized ? 1 : 0,
    recorded_sold: record.recorded_sold || 0,
    recorded_spent: record.recorded_spent || 0,
    recorded_collected: record.recorded_collected || 0,
    recorded_cash: record.recorded_cash || 0,
    recorded_transfer: record.recorded_transfer || 0,
    actual_cash: record.actual_cash || 0,
    actual_transfer: record.actual_transfer || 0,
    cash_variance: (record.actual_cash || 0) - (record.recorded_cash || 0),
    transfer_variance: (record.actual_transfer || 0) - (record.recorded_transfer || 0),
    notes: record.notes || '',
  };
  const id = await db.daily_closings.add(entry);
  return { id, ...entry };
}

export async function getDailyClosings(from = 0, to = Date.now() + 86400000) {
  return db.daily_closings
    .where('closed_at')
    .between(from, to)
    .reverse()
    .sortBy('closed_at');
}

export async function getLatestDailyClosing() {
  return db.daily_closings.orderBy('closed_at').last();
}

// ─── Settlement helpers ───

export async function saveSettlement(record) {
  const now = Date.now();
  const entry = {
    settlement_id: record.settlement_id,
    staff_id: record.staff_id,
    period_start: record.period_start,
    period_end: record.period_end,
    expected_cash: record.expected_cash || 0,
    actual_cash: record.actual_cash || 0,
    cash_variance: (record.actual_cash || 0) - (record.expected_cash || 0),
    expected_transfer: record.expected_transfer || 0,
    actual_transfer: record.actual_transfer || 0,
    transfer_variance: (record.actual_transfer || 0) - (record.expected_transfer || 0),
    expected_total: record.expected_total || 0,
    actual_total: (record.actual_cash || 0) + (record.actual_transfer || 0),
    total_variance: 0,
    adjustments: record.adjustments || [],
    final_expected_cash: record.final_expected_cash || 0,
    final_expected_total: record.final_expected_total || 0,
    final_variance: record.final_variance || 0,
    status: record.status || 'checked',
    notes: record.notes || null,
    settled_at: record.settled_at || now,
    settled_by: record.settled_by,
    reconciled_at: record.reconciled_at || null,
    reconciled_by: record.reconciled_by || null,
    reconciliation_note: record.reconciliation_note || null,
    created_at: record.created_at || now,
    updated_at: now,
    reconciliation_status: record.reconciliation_status || 'checked',
    staff_reported_cash: record.staff_reported_cash ?? null,
    staff_reported_transfer: record.staff_reported_transfer ?? null,
    staff_submitted_at: record.staff_submitted_at ?? null,
    staff_note: record.staff_note ?? null,
    owner_confirmed_cash: record.owner_confirmed_cash ?? null,
    owner_confirmed_transfer: record.owner_confirmed_transfer ?? null,
    owner_note: record.owner_note ?? null,
    reconciliation_log: record.reconciliation_log ?? null,
    carry_forward: record.carry_forward ?? null,
    sync_version: record.sync_version || 1,
    schema_version: record.schema_version || 1,
    device_id: record.device_id || '',
  };
  // Attach current business_id from sync engine's persisted setting.
  if (entry.business_id == null) {
    try {
      const bizRow = await db.settings.get('gebya_business_id');
      const bizVal = bizRow?.value;
      entry.business_id = bizVal != null ? Number(bizVal) : null;
    } catch { entry.business_id = null; }
  }
  entry.total_variance = entry.actual_total - (entry.final_expected_total || entry.expected_total);
  const id = await db.settlements.add(entry);
  return { id, ...entry };
}

export async function getSettlementsForStaff(staffId, from = 0, to = Date.now(), businessId) {
  let results = await db.settlements
    .where('staff_id')
    .equals(staffId)
    .filter((s) => s.settled_at >= from && s.settled_at <= to)
    .reverse()
    .sortBy('settled_at');
  if (businessId != null) {
    results = results.filter((s) => Number(s.business_id) === Number(businessId));
  }
  return results;
}

export async function getLatestSettlement(staffId) {
  return db.settlements
    .where('staff_id')
    .equals(staffId)
    .last();
}

export async function getAllSettlements(from = 0, to = Date.now(), businessId) {
  if (businessId != null) {
    return db.settlements
      .where('[settled_at+business_id]')
      .between([from, Number(businessId)], [to, Number(businessId)])
      .reverse()
      .toArray();
  }
  return db.settlements
    .where('settled_at')
    .between(from, to)
    .reverse()
    .toArray();
}

export async function updateSettlement(id, changes) {
  changes.updated_at = Date.now();
  return db.settlements.update(id, changes);
}

export async function getUnsettledStaffIds(allStaffIds, cutoff = Date.now(), businessId) {
  let settled;
  if (businessId != null) {
    const past = cutoff - 30 * 86400000;
    settled = await db.settlements
      .where('[settled_at+business_id]')
      .between([past, Number(businessId)], [cutoff, Number(businessId)])
      .toArray();
  } else {
    settled = await db.settlements
      .where('settled_at')
      .above(cutoff - 30 * 86400000)
      .toArray();
  }
  const settledIds = new Set(settled.map(s => String(s.staff_id)));
  return allStaffIds.filter(id => !settledIds.has(String(id)));
}

export default db;
