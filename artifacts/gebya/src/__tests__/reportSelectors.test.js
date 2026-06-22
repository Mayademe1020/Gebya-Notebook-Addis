import assert from 'node:assert/strict';
import {
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
} from '../utils/reportSelectors.js';

const T = new Date('2026-06-13T08:00:00').getTime();
const DAY = 86400000;

function rows({ transactions = [], ledgerTransactions = [], customers = [{ id: 1, display_name: 'Abebe' }], scope = '', viewerStaffId = null, filters = {} } = {}) {
  return buildReportRows({ transactions, ledgerTransactions, customers, from: T, to: T + DAY, scope, viewerStaffId, filters });
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('cash-only sale increases sold and cash expected', () => {
  const metrics = computeReportMetrics(rows({ transactions: [{ id: 1, type: 'sale', amount: 100, payment_type: 'cash', created_at: T + 1 }] }));
  assert.equal(metrics.totalSold, 100);
  assert.equal(metrics.cashExpected, 100);
  assert.equal(metrics.transferRecorded, 0);
});

test('transfer-only sale increases sold and transfer recorded, not cash', () => {
  const metrics = computeReportMetrics(rows({ transactions: [{ id: 1, type: 'sale', amount: 200, payment_type: 'bank', payment_provider: 'CBE', created_at: T + 1 }] }));
  assert.equal(metrics.totalSold, 200);
  assert.equal(metrics.cashExpected, 0);
  assert.equal(metrics.transferRecorded, 200);
});

test('generated credit row is not double-counted as sold', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [{ id: 1, type: 'sale', amount: 300, payment_type: 'credit', created_at: T + 1 }],
    ledgerTransactions: [{ id: 2, type: 'credit_add', amount: 300, customer_id: 1, source_transaction_id: 1, created_at: T + 1 }],
  }));
  assert.equal(metrics.totalSold, 300);
  assert.equal(metrics.newDubie, 300);
  assert.equal(metrics.cashExpected, 0);
});

test('manual new Dubie counts in sold value', () => {
  const metrics = computeReportMetrics(rows({ ledgerTransactions: [{ id: 1, type: 'credit_add', amount: 125, customer_id: 1, created_at: T + 1 }] }));
  assert.equal(metrics.totalSold, 125);
  assert.equal(metrics.newDubie, 125);
});

test('old Dubie collection is not a new sale', () => {
  const metrics = computeReportMetrics(rows({ ledgerTransactions: [{ id: 1, type: 'payment', amount: 80, customer_id: 1, created_at: T + 1 }] }));
  assert.equal(metrics.totalSold, 0);
  assert.equal(metrics.creditCollected, 80);
  assert.equal(metrics.cashExpected, 80);
});

test('cash expense lowers cash while digital expense does not', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [
      { id: 1, type: 'expense', amount: 40, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'expense', amount: 60, payment_type: 'bank', created_at: T + 1 },
    ],
  }));
  assert.equal(metrics.spentToday, 100);
  assert.equal(metrics.cashExpected, -40);
});

test('mixed dataset uses the documented formulas', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [
      { id: 1, type: 'sale', amount: 1000, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 500, payment_type: 'bank', created_at: T + 2 },
      { id: 3, type: 'expense', amount: 200, payment_type: 'cash', created_at: T + 3 },
    ],
    ledgerTransactions: [
      { id: 4, type: 'credit_add', amount: 300, customer_id: 1, created_at: T + 4 },
      { id: 5, type: 'payment', amount: 150, customer_id: 1, created_at: T + 5 },
    ],
  }));
  assert.equal(metrics.totalSold, 1800);
  assert.equal(metrics.cashExpected, 950);
  assert.equal(metrics.transferRecorded, 500);
  assert.equal(metrics.newDubie, 300);
  assert.equal(metrics.creditCollected, 150);
});

test('period filtering excludes rows outside report day', () => {
  const metrics = computeReportMetrics(rows({
    transactions: [
      { id: 1, type: 'sale', amount: 100, created_at: T - 1 },
      { id: 2, type: 'sale', amount: 200, created_at: T + 1 },
    ],
  }));
  assert.equal(metrics.totalSold, 200);
});

test('owner and staff scopes filter rows consistently', () => {
  const staffMetrics = computeReportMetrics(rows({
    scope: '7',
    transactions: [
      { id: 1, type: 'sale', amount: 100, actor_staff_member_id: 7, actor_name_snapshot: 'Abel', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 200, created_at: T + 2 },
    ],
  }));
  const ownerMetrics = computeReportMetrics(rows({
    scope: '__owner__',
    transactions: [
      { id: 1, type: 'sale', amount: 100, actor_staff_member_id: 7, actor_name_snapshot: 'Abel', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 200, created_at: T + 2 },
    ],
  }));
  assert.equal(staffMetrics.totalSold, 100);
  assert.equal(ownerMetrics.totalSold, 200);
});

test('viewer staff id overrides owner scope in staff view', () => {
  const metrics = computeReportMetrics(rows({
    viewerStaffId: 7,
    scope: '__owner__',
    transactions: [
      { id: 1, type: 'sale', amount: 100, actor_staff_member_id: 7, actor_name_snapshot: 'Abel', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 200, created_at: T + 2 },
    ],
  }));
  assert.equal(metrics.totalSold, 100);
});

test('staff totals include transfer sale plus manual New Dubie', () => {
  const staffRows = buildStaffReportRows(rows({
    transactions: [{ id: 1, type: 'sale', amount: 19380, payment_type: 'bank', actor_staff_member_id: 7, actor_name_snapshot: 'Abel', created_at: T + 1 }],
    ledgerTransactions: [{ id: 2, type: 'credit_add', amount: 6500, customer_id: 1, actor_staff_member_id: 7, actor_name_snapshot: 'Abel', created_at: T + 2 }],
  }));
  assert.equal(staffRows[0].sold, 25880);
  assert.equal(staffRows[0].transfer, 19380);
  assert.equal(staffRows[0].newDubie, 6500);
});

test('card totals equal the sum of their drilldown rows', () => {
  const reportRows = rows({
    transactions: [
      { id: 1, type: 'sale', amount: 2450, payment_type: 'cash', created_at: T + 1 },
      { id: 2, type: 'sale', amount: 19380, payment_type: 'bank', created_at: T + 2 },
      { id: 3, type: 'expense', amount: 1700, payment_type: 'cash', created_at: T + 3 },
    ],
    ledgerTransactions: [
      { id: 4, type: 'credit_add', amount: 6500, customer_id: 1, created_at: T + 4 },
      { id: 5, type: 'payment', amount: 3000, customer_id: 1, created_at: T + 5 },
    ],
  });
  const metrics = computeReportMetrics(reportRows);
  const sum = list => list.reduce((total, row) => total + Number(row.amount || 0), 0);
  assert.equal(metrics.transferRecorded, sum(metrics.transferRows));
  assert.equal(metrics.newDubie, sum(metrics.creditRows));
  assert.equal(metrics.creditCollected, sum(metrics.collectionRows));
  assert.equal(metrics.spentToday, sum(metrics.expenseRows));
});

console.log('Report selector verification passed.');
