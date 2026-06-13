import assert from 'node:assert/strict';

import {
  OWNER_SCOPE,
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
} from '../utils/reportSelectors.js';

const T = 1_800_000_000_000;
const from = T;
const to = T + 86_400_000;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function rows({ transactions = [], ledgerTransactions = [], scope = '', viewerStaffId = null } = {}) {
  return buildReportRows({
    transactions,
    ledgerTransactions,
    customers: [{ id: 1, display_name: 'Abebe' }],
    from,
    to,
    scope,
    viewerStaffId,
  });
}

runTest('cash-only sale increases total sold and cash expected', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [{ id: 1, type: 'sale', amount: 100, payment_type: 'cash', created_at: T + 1 }],
  }));

  assert.equal(metrics.totalSold, 100);
  assert.equal(metrics.cashExpected, 100);
  assert.equal(metrics.transferRecorded, 0);
});

runTest('transfer-only sale is sold and transfer recorded but not expected cash', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [{ id: 1, type: 'sale', amount: 200, payment_type: 'bank', payment_provider: 'CBE', created_at: T + 1 }],
  }));

  assert.equal(metrics.totalSold, 200);
  assert.equal(metrics.transferRecorded, 200);
  assert.equal(metrics.cashExpected, 0);
});

runTest('new credit sale from generated ledger is not double-counted with source sale', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [{ id: 1, type: 'sale', amount: 300, payment_type: 'credit', created_at: T + 1 }],
    ledgerTransactions: [{ id: 2, type: 'credit_add', amount: 300, source_transaction_id: 1, customer_id: 1, created_at: T + 2 }],
  }));

  assert.equal(metrics.totalSold, 300);
  assert.equal(metrics.newDubie, 300);
  assert.equal(metrics.cashExpected, 0);
});

runTest('manual new credit sale counts as sold when no source sale exists', () => {
  const metrics = computeReportMetrics(rows({
    ledgerTransactions: [{ id: 1, type: 'credit_add', amount: 125, customer_id: 1, created_at: T + 1 }],
  }));

  assert.equal(metrics.totalSold, 125);
  assert.equal(metrics.newDubie, 125);
});

runTest('old credit collection is cash expected but not a new sale', () => {
  const metrics = computeReportMetrics(rows({
    ledgerTransactions: [{ id: 1, type: 'payment', amount: 80, customer_id: 1, created_at: T + 1 }],
  }));

  assert.equal(metrics.creditCollected, 80);
  assert.equal(metrics.cashExpected, 80);
  assert.equal(metrics.totalSold, 0);
});

runTest('cash expense reduces cash expected but digital expense does not', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [
      { id: 1, type: 'sale', amount: 500, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'expense', amount: 100, payment_type: 'cash', created_at: T + 2 },
      { id: 3, type: 'expense', amount: 75, payment_type: 'bank', payment_provider: 'CBE', created_at: T + 3 },
    ],
  }));

  assert.equal(metrics.spentToday, 175);
  assert.equal(metrics.cashExpected, 400);
});

runTest('mixed payment dataset reconciles card totals', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [
      { id: 1, type: 'sale', amount: 100, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 200, payment_type: 'wallet', payment_provider: 'telebirr', created_at: T + 2 },
      { id: 3, type: 'expense', amount: 25, payment_type: 'cash', created_at: T + 3 },
    ],
    ledgerTransactions: [
      { id: 4, type: 'credit_add', amount: 90, customer_id: 1, created_at: T + 4 },
      { id: 5, type: 'payment', amount: 40, customer_id: 1, created_at: T + 5 },
    ],
  }));

  assert.equal(metrics.totalSold, 390);
  assert.equal(metrics.transferRecorded, 200);
  assert.equal(metrics.newDubie, 90);
  assert.equal(metrics.creditCollected, 40);
  assert.equal(metrics.cashExpected, 115);
});

runTest('period filtering excludes out-of-range rows', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [
      { id: 1, type: 'sale', amount: 100, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 999, payment_type: 'cash', created_at: T - 1 },
    ],
  }));

  assert.equal(metrics.totalSold, 100);
});

runTest('staff scope filters records before totals', () => {
  const metrics = computeReportMetrics(rows({
    viewerStaffId: 7,
    transactions: [
      { id: 1, type: 'sale', amount: 100, payment_type: 'cash', actor_staff_member_id: 7, actor_name_snapshot: 'Abel', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 300, payment_type: 'cash', actor_staff_member_id: 8, actor_name_snapshot: 'Mimi', created_at: T + 2 },
    ],
  }));

  assert.equal(metrics.totalSold, 100);
});

runTest('owner scope includes only owner rows', () => {
  const metrics = computeReportMetrics(rows({
    scope: OWNER_SCOPE,
    transactions: [
      { id: 1, type: 'sale', amount: 100, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 300, payment_type: 'cash', actor_staff_member_id: 8, actor_name_snapshot: 'Mimi', created_at: T + 2 },
    ],
  }));

  assert.equal(metrics.totalSold, 100);
});

runTest('staff totals include transfer and new Dubie rows', () => {
  const reportRows = rows({
    transactions: [
      { id: 1, type: 'sale', amount: 19380, payment_type: 'bank', payment_provider: 'CBE', actor_staff_member_id: 1, actor_name_snapshot: 'Abel', created_at: T + 1 },
    ],
    ledgerTransactions: [
      { id: 2, type: 'credit_add', amount: 6500, customer_id: 1, actor_staff_member_id: 1, actor_name_snapshot: 'Abel', created_at: T + 2 },
    ],
  });
  const [abel] = buildStaffReportRows(reportRows);

  assert.equal(abel.transfer, 19380);
  assert.equal(abel.newDubie, 6500);
  assert.equal(abel.sold, 25880);
  assert.equal(abel.transactionCount, 2);
});

console.log('Report selector verification passed.');
