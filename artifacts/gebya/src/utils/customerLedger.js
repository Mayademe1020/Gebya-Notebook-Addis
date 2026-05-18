function compareNumericDesc(left, right) {
  return (Number(right) || 0) - (Number(left) || 0);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function compareCustomerTransactions(a = {}, b = {}) {
  return compareNumericDesc(a.created_at, b.created_at)
    || compareNumericDesc(a.updated_at, b.updated_at)
    || compareNumericDesc(a.id, b.id);
}

export function sortCustomerTransactions(items = []) {
  return [...items].sort(compareCustomerTransactions);
}

export function insertCustomerTransaction(items = [], nextItem) {
  return sortCustomerTransactions(nextItem ? [nextItem, ...items] : items);
}

export function getCustomerBalance(items = []) {
  return items.reduce((sum, item) => {
    if (item.type === 'credit_add') return sum + (item.amount || 0);
    if (item.type === 'payment') return sum - (item.amount || 0);
    return sum;
  }, 0);
}

export function getCustomerLatestDueDate(items = []) {
  return items
    .filter(item => item.type === 'credit_add' && item.due_date)
    .map(item => item.due_date)
    .sort((a, b) => b - a)[0] || null;
}

export function getCustomerCollectionDueDate(items = []) {
  return items
    .filter(item => item.type === 'credit_add' && item.due_date)
    .map(item => Number(item.due_date))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0] || null;
}

export function getCustomerCollectionStatus(customer = {}, now = Date.now()) {
  const balance = Number(customer.balance ?? customer.currentBalance ?? 0);
  const hasBalance = balance > 0;
  const dueDate = hasBalance
    ? (customer.collection_due_date || getCustomerCollectionDueDate(customer.transactions || []))
    : null;

  if (!hasBalance) {
    return {
      key: 'paid',
      hasBalance: false,
      isDueNow: false,
      dueDate: null,
      days: 0,
    };
  }

  if (!dueDate) {
    return {
      key: 'no_due_date',
      hasBalance: true,
      isDueNow: false,
      dueDate: null,
      days: null,
    };
  }

  const todayStart = startOfLocalDay(now);
  const dueStart = startOfLocalDay(dueDate);
  if (todayStart == null || dueStart == null) {
    return {
      key: 'no_due_date',
      hasBalance: true,
      isDueNow: false,
      dueDate: null,
      days: null,
    };
  }

  const dayDiff = Math.round((dueStart - todayStart) / MS_PER_DAY);

  if (dayDiff === 0) {
    return {
      key: 'due_today',
      hasBalance: true,
      isDueNow: true,
      dueDate,
      days: 0,
    };
  }

  if (dayDiff < 0) {
    return {
      key: 'overdue',
      hasBalance: true,
      isDueNow: true,
      dueDate,
      days: Math.abs(dayDiff),
    };
  }

  return {
    key: 'due_in',
    hasBalance: true,
    isDueNow: false,
    dueDate,
    days: dayDiff,
  };
}

export function getDaysSinceLastActivity(customer = {}, now = Date.now()) {
  const lastAt = customer.last_activity_at || 0;
  if (!Number.isFinite(lastAt) || lastAt <= 0) return null;
  return Math.round((now - lastAt) / MS_PER_DAY);
}

export function isFollowUpNeeded(customer = {}, now = Date.now(), thresholdDays = 7) {
  const status = customer.collection_status || getCustomerCollectionStatus(customer, now);
  if (status.key !== 'no_due_date') return false;
  if (!status.hasBalance) return false;
  const days = getDaysSinceLastActivity(customer, now);
  if (days == null) return false;
  return days >= thresholdDays;
}

export function buildCustomerSummaries(customers = [], customerTransactions = [], now = Date.now()) {
  const txByCustomer = customerTransactions.reduce((acc, item) => {
    if (!acc[item.customer_id]) acc[item.customer_id] = [];
    acc[item.customer_id].push(item);
    return acc;
  }, {});

  return customers
    .map(customer => {
      const items = sortCustomerTransactions(txByCustomer[customer.id] || []);
      const balance = getCustomerBalance(items);
      const lastActivityAt = items[0]?.created_at || customer.updated_at || customer.created_at || 0;
      const collectionDueDate = getCustomerCollectionDueDate(items);
      const summary = {
        ...customer,
        transactions: items,
        balance,
        transaction_count: items.length,
        last_activity_at: lastActivityAt,
        latest_due_date: getCustomerLatestDueDate(items),
        collection_due_date: collectionDueDate,
      };

      const collectionStatus = getCustomerCollectionStatus(summary, now);
      const daysSinceActivity = getDaysSinceLastActivity(summary, now);
      const needsFollowUp = isFollowUpNeeded({ ...summary, collection_status: collectionStatus }, now);

      return {
        ...summary,
        collection_status: collectionStatus,
        days_since_activity: daysSinceActivity,
        needs_follow_up: needsFollowUp,
      };
    })
    .sort((a, b) => {
      if ((b.balance || 0) !== (a.balance || 0)) return (b.balance || 0) - (a.balance || 0);
      if ((b.last_activity_at || 0) !== (a.last_activity_at || 0)) return (b.last_activity_at || 0) - (a.last_activity_at || 0);
      return String(a.display_name || '').localeCompare(String(b.display_name || ''))
        || compareNumericDesc(a.id, b.id);
    });
}
