import Dexie from 'dexie';

export const db = new Dexie('GebyaDB');

function toTimestamp(value, fallback = Date.now()) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

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
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at',
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
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at',
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
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
});

db.version(17).stores({
  transactions: '++id, type, amount, item_name, cost_price, quantity, profit, is_credit, customer_id, customer_name, created_at, ethiopian_date, payment_type, payment_provider, updated_at, source, raw_transcript, detected_total, was_edited, transcription_provider, parsing_confidence, voice_note, raw_audio_ref, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  customers: '++id, display_name, note, phone_number, telegram_username, telegram_chat_id, telegram_notify_enabled, telegram_link_token, telegram_linked_at, telegram_link_requested_at, created_at, updated_at',
  customer_transactions: '++id, customer_id, type, amount, due_date, reference_code, telegram_delivery_state, telegram_delivery_error, telegram_delivery_attempted_at, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  catalog_entries: '++id, name, kind, active, created_at, updated_at',
  suppliers: '++id, display_name, phone_number, note, active, created_at, updated_at',
  supplier_transactions: '++id, supplier_id, type, catalog_entry_id, created_at, updated_at, actor_role, actor_staff_member_id, actor_name_snapshot, transaction_id, device_id',
  staff_members: '++id, display_name, role, active, created_at, updated_at, deactivated_at',
  sync_queue: '++id, kind, status, created_at, updated_at, next_attempt_at, record_table, record_id, transaction_id, &idempotency_key, record_type, device_id',
  credit_records: '++id, customer_id, customer_name, original_amount, paid_amount, remaining_amount, due_date, status, created_at, direction',
  credit_payment_logs: '++id, credit_record_id, amount, payment_method, paid_at',
  settings: 'key, value',
  analytics: 'key, value',
  identity: 'key, shop_id, shop_name, device_id, device_token, staff_id, display_name, phone_number, role, permissions, device_status, phone_required, approval_required, updated_at',
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

export async function canCreateEvent(eventType) {
  const perms = await getPermissions();
  const map = {
    sale: 'can_create_sale',
    customer_payment: 'can_create_customer_payment',
    customer_credit: 'can_create_customer_credit',
    note: 'can_create_note',
    expense: 'can_create_expense',
    supplier_transaction: 'can_create_supplier_transaction',
  };
  const key = map[eventType];
  return key ? !!perms[key] : false;
}

export default db;
