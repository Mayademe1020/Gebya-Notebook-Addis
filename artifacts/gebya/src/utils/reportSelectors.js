export const OWNER_SCOPE = '__owner__';
export const ALL_SCOPE = '';

export function startOfLocalDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function inReportRange(ts, from, to) {
  const value = Number(ts || 0);
  return value >= Number(from || 0) && value < Number(to || 0);
}

export function amountOf(row) {
  return Number(row?.amount ?? row?.cash_received ?? 0) || 0;
}

export function actorKey(row) {
  return row?.actor_staff_member_id ? String(row.actor_staff_member_id) : OWNER_SCOPE;
}

export function actorName(row) {
  return row?.actor_name_snapshot || (actorKey(row) === OWNER_SCOPE ? 'Owner' : 'Staff');
}

export function isTransferPayment(row) {
  const payment = String(row?.payment_type || row?.payment_method || '').toLowerCase();
  const provider = String(row?.payment_provider || '').toLowerCase();
  return ['bank', 'transfer', 'mobile', 'telebirr', 'cbe', 'mpesa'].some(key => payment.includes(key) || provider.includes(key));
}

export function paymentLabel(row) {
  if (row?.report_kind === 'credit') return 'Dubie';
  if (row?.report_kind === 'collection') return isTransferPayment(row) ? 'Transfer collection' : 'Cash collection';
  if (isTransferPayment(row)) return row.payment_provider || 'Transfer';
  return row?.payment_type || 'Cash';
}

function matchesScope(row, scope, viewerStaffId) {
  if (viewerStaffId) return String(row.actor_staff_member_id || '') === String(viewerStaffId);
  if (!scope) return true;
  if (scope === OWNER_SCOPE) return !row.actor_staff_member_id;
  return String(row.actor_staff_member_id || '') === String(scope);
}

export function buildReportRows({
  transactions = [],
  ledgerTransactions = [],
  customers = [],
  from = 0,
  to = Date.now() + 1,
  scope = ALL_SCOPE,
  viewerStaffId = null,
  filters = {},
} = {}) {
  const customerName = new Map((customers || []).map(customer => [customer.id, customer.display_name || customer.name || 'Customer']));
  const rows = [];

  for (const tx of transactions || []) {
    if (!inReportRange(tx.created_at, from, to) || !matchesScope(tx, scope, viewerStaffId)) continue;
    if (tx.type !== 'sale' && tx.type !== 'expense') continue;
    rows.push({
      ...tx,
      report_id: `tx-${tx.id}`,
      report_kind: tx.type,
      title: tx.item_name || tx.item_note || tx.note || (tx.type === 'expense' ? 'Expense' : 'Sale'),
      status: isTransferPayment(tx) ? 'recorded/unverified' : 'recorded',
    });
  }

  for (const entry of ledgerTransactions || []) {
    if (!inReportRange(entry.created_at, from, to) || !matchesScope(entry, scope, viewerStaffId)) continue;
    const isPayment = entry.type === 'payment' || entry.type === 'customer_payment';
    const isCredit = entry.type === 'credit_add' || entry.type === 'sale_credit';
    if (!isPayment && !isCredit) continue;
    const name = entry.customer_name || customerName.get(entry.customer_id) || 'Customer';
    rows.push({
      ...entry,
      report_id: `ledger-${entry.id}`,
      report_kind: isPayment ? 'collection' : 'credit',
      customer_name: name,
      title: isPayment ? `Collection from ${name}` : `New Dubie for ${name}`,
      status: 'recorded',
    });
  }

  const filtered = rows.filter(row => {
    if (filters.type && row.report_kind !== filters.type) return false;
    if (filters.payment === 'cash' && isTransferPayment(row)) return false;
    if (filters.payment === 'transfer' && !isTransferPayment(row)) return false;
    if (filters.status && row.status !== filters.status) return false;
    return true;
  });

  return filtered.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
}

export function computeReportMetrics(rows = []) {
  const saleRows = rows.filter(row => row.report_kind === 'sale');
  const expenseRows = rows.filter(row => row.report_kind === 'expense');
  const creditRows = rows.filter(row => row.report_kind === 'credit');
  const collectionRows = rows.filter(row => row.report_kind === 'collection');
  const manualCreditRows = creditRows.filter(row => !row.source_transaction_id && !row.transaction_id);
  const cashSaleRows = saleRows.filter(row => !isTransferPayment(row) && String(row.payment_type || 'cash').toLowerCase() !== 'credit');
  const transferRows = rows.filter(row => (row.report_kind === 'sale' || row.report_kind === 'collection') && isTransferPayment(row));
  const cashCollectionRows = collectionRows.filter(row => !isTransferPayment(row));
  const cashExpenseRows = expenseRows.filter(row => !isTransferPayment(row));
  const sum = list => list.reduce((total, row) => total + amountOf(row), 0);
  const cashSales = cashSaleRows.reduce((total, row) => total + (Number(row.cash_received ?? row.amount ?? 0) || 0), 0);

  return {
    totalSold: sum(saleRows) + sum(manualCreditRows),
    cashExpected: cashSales + sum(cashCollectionRows) - sum(cashExpenseRows),
    transferRecorded: sum(transferRows),
    newDubie: sum(creditRows),
    creditCollected: sum(collectionRows),
    spentToday: sum(expenseRows),
    saleRows,
    expenseRows,
    creditRows,
    collectionRows,
    transferRows,
    cashRows: [...cashSaleRows, ...cashCollectionRows, ...cashExpenseRows],
  };
}

export function buildStaffReportRows(rows = []) {
  const byStaff = new Map();
  for (const row of rows || []) {
    if (!row.actor_staff_member_id) continue;
    const key = String(row.actor_staff_member_id);
    const existing = byStaff.get(key) || {
      id: key,
      name: actorName(row),
      sold: 0,
      cash: 0,
      transfer: 0,
      newDubie: 0,
      records: 0,
    };

    if (row.report_kind === 'sale') {
      existing.sold += amountOf(row);
      existing.records += 1;
      if (isTransferPayment(row)) existing.transfer += amountOf(row);
      else if (String(row.payment_type || 'cash').toLowerCase() !== 'credit') existing.cash += Number(row.cash_received ?? row.amount ?? 0) || 0;
    }
    if (row.report_kind === 'credit' && !row.source_transaction_id && !row.transaction_id) {
      existing.sold += amountOf(row);
      existing.newDubie += amountOf(row);
      existing.records += 1;
    }
    if (row.report_kind === 'collection') existing.cash += amountOf(row);
    byStaff.set(key, existing);
  }
  return Array.from(byStaff.values()).sort((a, b) => b.sold - a.sold);
}

export function reportRowSearchText(row) {
  return [
    row.title,
    row.type,
    row.report_kind,
    row.amount,
    row.item_name,
    row.item_code,
    row.item_note,
    row.customer_name,
    row.note,
    row.payment_type,
    row.payment_provider,
    actorName(row),
    row.created_at ? new Date(row.created_at).toLocaleDateString() : '',
  ].filter(Boolean).join(' ').toLowerCase();
}
