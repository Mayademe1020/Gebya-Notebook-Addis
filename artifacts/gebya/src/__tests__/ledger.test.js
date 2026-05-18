import assert from 'node:assert/strict';

import {
  buildCustomerSummaries,
  getCustomerBalance,
  getCustomerCollectionStatus,
  sortCustomerTransactions,
} from '../utils/customerLedger.js';
import { buildCustomerReminderMessage } from '../utils/customerReminder.js';
import { normalizeCustomerDraft, normalizeCustomerTransactionDraft } from '../utils/customerLedgerMutations.js';
import { buildSupplierSummaries, getSupplierBalance, SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger.js';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest('customer credit increases balance correctly', () => {
  const balance = getCustomerBalance([
    { type: 'credit_add', amount: 250 },
  ]);

  assert.equal(balance, 250);
});

runTest('customer payment reduces balance correctly', () => {
  const balance = getCustomerBalance([
    { type: 'credit_add', amount: 250 },
    { type: 'payment', amount: 80 },
  ]);

  assert.equal(balance, 170);
});

runTest('customer summary balance is credits minus payments regardless of order', () => {
  const customers = [
    { id: 1, display_name: 'Almaz', created_at: 1000, updated_at: 1000 },
  ];

  const transactions = [
    { customer_id: 1, type: 'payment', amount: 40, created_at: 3000, due_date: null },
    { customer_id: 1, type: 'credit_add', amount: 150, created_at: 1000, due_date: 9000 },
    { customer_id: 1, type: 'credit_add', amount: 90, created_at: 2000, due_date: null },
  ];

  const [summary] = buildCustomerSummaries(customers, transactions);

  assert.equal(summary.balance, 200);
  assert.equal(summary.transaction_count, 3);
  assert.equal(summary.last_activity_at, 3000);
  assert.equal(summary.latest_due_date, 9000);
});

runTest('unknown customer transaction types do not change balance', () => {
  const balance = getCustomerBalance([
    { type: 'credit_add', amount: 120 },
    { type: 'note_only', amount: 9999 },
    { type: 'payment', amount: 20 },
  ]);

  assert.equal(balance, 100);
});

runTest('customer transactions sort deterministically when timestamps match', () => {
  const sorted = sortCustomerTransactions([
    { id: 1, created_at: 1000, updated_at: 1000 },
    { id: 3, created_at: 1000, updated_at: 1000 },
    { id: 2, created_at: 1000, updated_at: 1200 },
  ]);

  assert.deepEqual(sorted.map((entry) => entry.id), [2, 3, 1]);
});

runTest('paid-off customer is not collectable', () => {
  const status = getCustomerCollectionStatus({
    balance: 0,
    transactions: [
      { type: 'credit_add', amount: 100, due_date: Date.UTC(2026, 4, 1) },
      { type: 'payment', amount: 100 },
    ],
  }, Date.UTC(2026, 4, 8));

  assert.equal(status.hasBalance, false);
  assert.equal(status.isDueNow, false);
  assert.equal(status.key, 'paid');
});

runTest('missing due date is collectable but not due now', () => {
  const status = getCustomerCollectionStatus({
    balance: 100,
    transactions: [
      { type: 'credit_add', amount: 100, due_date: null },
    ],
  }, Date.UTC(2026, 4, 8));

  assert.equal(status.hasBalance, true);
  assert.equal(status.isDueNow, false);
  assert.equal(status.key, 'no_due_date');
});

runTest('due today is due now', () => {
  const status = getCustomerCollectionStatus({
    balance: 100,
    transactions: [
      { type: 'credit_add', amount: 100, due_date: Date.UTC(2026, 4, 8, 16) },
    ],
  }, Date.UTC(2026, 4, 8, 9));

  assert.equal(status.isDueNow, true);
  assert.equal(status.key, 'due_today');
  assert.equal(status.days, 0);
});

runTest('overdue status counts days late', () => {
  const status = getCustomerCollectionStatus({
    balance: 100,
    transactions: [
      { type: 'credit_add', amount: 100, due_date: Date.UTC(2026, 4, 5) },
    ],
  }, Date.UTC(2026, 4, 8));

  assert.equal(status.isDueNow, true);
  assert.equal(status.key, 'overdue');
  assert.equal(status.days, 3);
});

runTest('future due date is not due now', () => {
  const status = getCustomerCollectionStatus({
    balance: 100,
    transactions: [
      { type: 'credit_add', amount: 100, due_date: Date.UTC(2026, 4, 10) },
    ],
  }, Date.UTC(2026, 4, 8));

  assert.equal(status.isDueNow, false);
  assert.equal(status.key, 'due_in');
  assert.equal(status.days, 2);
});

runTest('customer summary includes collection status from earliest due debt', () => {
  const [summary] = buildCustomerSummaries(
    [{ id: 1, display_name: 'Almaz', created_at: 1000, updated_at: 1000 }],
    [
      { customer_id: 1, type: 'credit_add', amount: 100, due_date: Date.UTC(2026, 4, 12), created_at: 1000 },
      { customer_id: 1, type: 'credit_add', amount: 50, due_date: Date.UTC(2026, 4, 6), created_at: 2000 },
      { customer_id: 1, type: 'payment', amount: 25, due_date: null, created_at: 3000 },
    ]
  );

  const status = getCustomerCollectionStatus(summary, Date.UTC(2026, 4, 8));

  assert.equal(summary.balance, 125);
  assert.equal(summary.collection_due_date, Date.UTC(2026, 4, 6));
  assert.equal(status.key, 'overdue');
  assert.equal(status.days, 2);
});

runTest('reminder includes customer name shop name and balance', () => {
  const message = buildCustomerReminderMessage({
    customer: {
      display_name: 'Almaz',
      balance: 250,
      collection_status: { key: 'no_due_date', hasBalance: true },
    },
    shopName: 'Tigist Shop',
  });

  assert.equal(message, [
    'Selam Almaz, from Tigist Shop.',
    'Your remaining balance is 250 birr.',
    'No due date was set.',
  ].join('\n'));
});

runTest('reminder falls back to your shop when shop name is missing', () => {
  const message = buildCustomerReminderMessage({
    customer: {
      display_name: 'Almaz',
      balance: 250,
      collection_status: { key: 'no_due_date', hasBalance: true },
    },
  });

  assert.ok(message.includes('from your shop.'));
});

runTest('reminder includes due today sentence', () => {
  const message = buildCustomerReminderMessage({
    customer: {
      display_name: 'Almaz',
      balance: 250,
      collection_status: { key: 'due_today', hasBalance: true, isDueNow: true, days: 0 },
    },
    shopName: 'Tigist Shop',
  });

  assert.ok(message.includes('This amount is due today.'));
});

runTest('reminder includes overdue sentence', () => {
  const message = buildCustomerReminderMessage({
    customer: {
      display_name: 'Almaz',
      balance: 250,
      collection_status: { key: 'overdue', hasBalance: true, isDueNow: true, days: 3 },
    },
    shopName: 'Tigist Shop',
  });

  assert.ok(message.includes('This amount is overdue by 3 days.'));
});

runTest('reminder includes future due sentence', () => {
  const message = buildCustomerReminderMessage({
    customer: {
      display_name: 'Almaz',
      balance: 250,
      collection_status: { key: 'due_in', hasBalance: true, isDueNow: false, days: 2 },
    },
    shopName: 'Tigist Shop',
  });

  assert.ok(message.includes('This amount is due in 2 days.'));
});

runTest('reminder works without phone or Telegram contact', () => {
  const message = buildCustomerReminderMessage({
    customer: {
      display_name: 'Almaz',
      phone_number: null,
      telegram_username: null,
      balance: 250,
      collection_status: { key: 'no_due_date', hasBalance: true },
    },
    shopName: 'Tigist Shop',
  });

  assert.ok(message.includes('Selam Almaz'));
  assert.ok(message.includes('250 birr'));
});

runTest('customer draft keeps only required identifier and trims optional fields', () => {
  const customer = normalizeCustomerDraft({
    display_name: '  Almaz  ',
    note: '  regular  ',
    phone_number: ' 0911 ',
    telegram_username: '',
    telegram_notify_enabled: true,
  });

  assert.deepEqual(customer, {
    display_name: 'Almaz',
    note: 'regular',
    phone_number: '0911',
    telegram_username: null,
    telegram_notify_enabled: false,
  });
});

runTest('customer transaction draft accepts valid credit payload and trims note', () => {
  const transaction = normalizeCustomerTransactionDraft({
    customer_id: 5,
    type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
    amount: '250',
    item_note: '  Sugar  ',
    due_date: 1700000000000,
  });

  assert.deepEqual(transaction, {
    customer_id: 5,
    type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
    amount: 250,
    item_note: 'Sugar',
    due_date: 1700000000000,
  });
});

runTest('customer transaction draft rejects invalid payloads safely', () => {
  assert.equal(normalizeCustomerTransactionDraft({
    customer_id: 0,
    type: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
    amount: 100,
  }), null);

  assert.equal(normalizeCustomerTransactionDraft({
    customer_id: 1,
    type: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
    amount: 0,
  }), null);
});

runTest('supplier purchase increases balance owed', () => {
  const balance = getSupplierBalance([
    { type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, amount: 500 },
  ]);

  assert.equal(balance, 500);
});

runTest('supplier payment reduces balance owed', () => {
  const balance = getSupplierBalance([
    { type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, amount: 500 },
    { type: SUPPLIER_TRANSACTION_TYPES.PAYMENT, amount: 125 },
  ]);

  assert.equal(balance, 375);
});

runTest('supplier summary balance is stable regardless of transaction order', () => {
  const suppliers = [
    { id: 7, display_name: 'Abebe Wholesale', created_at: 1000, updated_at: 1000 },
  ];

  const transactions = [
    { supplier_id: 7, type: SUPPLIER_TRANSACTION_TYPES.PAYMENT, amount: 70, created_at: 3000 },
    { supplier_id: 7, type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, amount: 120, created_at: 1000 },
    { supplier_id: 7, type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, amount: 80, created_at: 2000 },
  ];

  const [summary] = buildSupplierSummaries(suppliers, transactions);

  assert.equal(summary.balance, 130);
  assert.equal(summary.transaction_count, 3);
  assert.equal(summary.last_activity_at, 3000);
});

runTest('unknown supplier transaction types do not change balance', () => {
  const balance = getSupplierBalance([
    { type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, amount: 300 },
    { type: 'ignored_adjustment', amount: 1000 },
    { type: SUPPLIER_TRANSACTION_TYPES.PAYMENT, amount: 50 },
  ]);

  assert.equal(balance, 250);
});

console.log('Ledger verification passed.');
