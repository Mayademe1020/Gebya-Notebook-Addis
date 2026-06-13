import { CUSTOMER_TRANSACTION_TYPES } from './customerTransactionTypes.js';

export const OWNER_SCOPE = '__owner__';
export const ALL_SCOPE = '';

export function startOfLocalDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function inReportRange(ts, from, to) {
  return Number(ts || 0) >= from && Number(ts || 0) < to;
}

export function amountOf(row) {
  return Number(row?.amount || 0);
}

export function actorKey(row) {
  return row?.actor_staff_member_id ? String(row.actor_staff_member_id) : OWNER_SCOPE;
}

export function actorName(row) {
  return row?.actor_name_snapshot || (actorKey(row) === OWNER_SCOPE ? 'Owner' : 'Staff');
}

export function isTransferPayment(row) {
  const type = String(row?.payment_type || '').toLowerCase();
  return !!type && type !== 'cash' && type !== 'credit';
}

export function paymentLabel(row) {
  if (row?.payment_type === 'credit') return 'Dubie';
  if (!row?.payment_type || row.payment_type === 'cash') return 'Cash';
  return row.payment_provider || row.payment_type || 'Digital';
}

function cashReceivedForSale(row) {
  if (row?.cash_received != null) return Number(row.cash_received || 0);
  if (row?.payment_type === 'credit' || isTransferPayment(row)) return 0;
  return amountOf(row);
}

function matchesScope(row, scope) {
  if (!scope) return true;
  if (scope === OWNER_SCOPE) return !row?.actor_staff_member_id;
  return String(row?.actor_staff_member_id || '') === String(scope);
}

function customerName(customers, id) {
  return customers.find(customer => String(customer.id) === String(id))?.display_name || '';
}

export function buildReportRows({
  transactions = [],
  ledgerTransactions = [],
  customers = [],
  from,
  to,
  scope = ALL_SCOPE,
  viewerStaffId = null,
}) {
  const effectiveScope = viewerStaffId ? String(viewerStaffId) : scope;

  const transactionRows = transactions
    .filter(row => inReportRange(row.created_at, from, to))
    .filter(row => matchesScope(row, effectiveScope))
    .map(row => ({
      ...row,
      source: 'transactions',
      report_kind: row.type === 'expense' ? 'expense' : 'sale',
      title: row.item_name || row.item_note || row.note || (row.type === 'expense' ? 'Expense' : 'Sale'),
      status: row.payment_type === 'credit' ? 'unpaid' : 'recorded',
      raw: row,
    }));

  const ledgerRows = ledgerTransactions
    .filter(row => inReportRange(row.created_at, from, to))
    .filter(row => matchesScope(row, effectiveScope))
    .map(row => {
      const isPayment = row.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
      const name = customerName(customers, row.customer_id) || 'customer';
      return {
        ...row,
        source: 'customer_transactions',
        report_kind: isPayment ? 'collection' : 'credit',
        title: isPayment ? `Collection from ${name}` : `Credit sale to ${name}`,
        customer_name: name,
        payment_type: row.payment_type || (isPayment ? 'cash' : 'credit'),
        payment_provider: row.payment_provider || null,
        status: isPayment ? 'collected' : 'unpaid',
        raw: row,
      };
    });

  return [...transactionRows, ...ledgerRows].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
}

export function computeReportMetrics(rows = []) {
  const saleRows = rows.filter(row => row.report_kind === 'sale');
  const expenseRows = rows.filter(row => row.report_kind === 'expense');
  const creditRows = rows.filter(row => row.report_kind === 'credit');
  const collectionRows = rows.filter(row => row.report_kind === 'collection');
  const manualCreditRows = creditRows.filter(row => !row.source_transaction_id);
  const transferRows = rows.filter(row => (
    (row.report_kind === 'sale' || row.report_kind === 'collection') &&
    isTransferPayment(row)
  ));
  const cashExpenseRows = expenseRows.filter(row => !isTransferPayment(row));
  const cashCollectionRows = collectionRows.filter(row => !isTransferPayment(row));

  const cashSales = saleRows.reduce((sum, row) => sum + cashReceivedForSale(row), 0);
  const cashCollections = cashCollectionRows.reduce((sum, row) => sum + amountOf(row), 0);
  const cashExpenses = cashExpenseRows.reduce((sum, row) => sum + amountOf(row), 0);

  return {
    rows,
    saleRows,
    expenseRows,
    creditRows,
    collectionRows,
    manualCreditRows,
    transferRows,
    cashExpenseRows,
    cashCollectionRows,
    cashSales,
    cashCollections,
    cashExpenses,
    totalSold: saleRows.reduce((sum, row) => sum + amountOf(row), 0) +
      manualCreditRows.reduce((sum, row) => sum + amountOf(row), 0),
    cashExpected: cashSales + cashCollections - cashExpenses,
    transferRecorded: transferRows.reduce((sum, row) => sum + amountOf(row), 0),
    newDubie: creditRows.reduce((sum, row) => sum + amountOf(row), 0),
    creditCollected: collectionRows.reduce((sum, row) => sum + amountOf(row), 0),
    spentToday: expenseRows.reduce((sum, row) => sum + amountOf(row), 0),
  };
}

export function buildStaffReportRows(rows = []) {
  const byActor = new Map();
  const ensure = (row) => {
    const id = actorKey(row);
    if (!byActor.has(id)) {
      byActor.set(id, {
        id,
        name: actorName(row),
        sold: 0,
        cash: 0,
        transfer: 0,
        newDubie: 0,
        collections: 0,
        transactionCount: 0,
        latestActivityAt: 0,
      });
    }
    return byActor.get(id);
  };

  for (const row of rows) {
    const staff = ensure(row);
    staff.transactionCount += 1;
    staff.latestActivityAt = Math.max(staff.latestActivityAt, Number(row.created_at || 0));

    if (row.report_kind === 'sale') {
      staff.sold += amountOf(row);
      if (isTransferPayment(row)) staff.transfer += amountOf(row);
      else if (row.payment_type !== 'credit') staff.cash += cashReceivedForSale(row);
    }
    if (row.report_kind === 'credit') {
      staff.newDubie += amountOf(row);
      if (!row.source_transaction_id) staff.sold += amountOf(row);
    }
    if (row.report_kind === 'collection') {
      staff.collections += amountOf(row);
      if (isTransferPayment(row)) staff.transfer += amountOf(row);
      else staff.cash += amountOf(row);
    }
  }

  return Array.from(byActor.values())
    .filter(row => row.id !== OWNER_SCOPE)
    .sort((a, b) => {
      if (b.sold !== a.sold) return b.sold - a.sold;
      return b.latestActivityAt - a.latestActivityAt;
    });
}

export function reportRowSearchText(row) {
  return [
    row.title,
    row.item_name,
    row.item_note,
    row.item_code,
    row.customer_name,
    row.note,
    row.payment_type,
    row.payment_provider,
    row.status,
    row.type,
    row.report_kind,
    row.actor_name_snapshot,
    amountOf(row),
    row.created_at ? new Date(row.created_at).toLocaleDateString('en-US') : '',
  ].filter(Boolean).join(' ').toLowerCase();
}
