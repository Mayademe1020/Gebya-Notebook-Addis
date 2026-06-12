// customerMetrics.js — credit lifecycle analytics + monthly stats + streak.
//
// Built so the Credit page hero card has TRUSTWORTHY, factual numbers.
// Locked definitions (per design spec):
//
//   - Collected this month  = sum of customer_transactions of type 'payment'
//                              where created_at is in current calendar month
//   - +X% vs last month     = (thisMonth - lastMonth) / lastMonth * 100;
//                              null if last month was zero (no division by zero)
//   - On-time %              = of credit_add transactions WITH a due_date that
//                              have been fully settled (FIFO allocation),
//                              percent paid on or before the due date.
//                              Credits without due_date are EXCLUDED.
//   - Streak                = consecutive days (counting today) with at least
//                              one transaction recorded. Resets on skip day.
//   - Top customer           = customer with most on-time settlements this
//                              month. Ties broken by total amount paid.
//   - Overdue amount         = sum of unpaid balance from credits where
//                              due_date < today. (FIFO-aware.)
//
// All numbers are derived from the shop's own data — no AI, no predictions,
// no comparisons to other shops.

import { CUSTOMER_TRANSACTION_TYPES } from './customerTransactionTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FIFO allocate payments against credits chronologically.
 * Returns enriched credit records with settlement info.
 */
function analyzeCreditLifecycle(transactions = []) {
  // Defensive: copy + sort chronologically
  const sorted = [...transactions].sort(
    (a, b) => (a.created_at || 0) - (b.created_at || 0)
  );

  const credits = []; // { id, amount, due_date, created_at, outstanding, settled_at, on_time }
  let prepay = 0; // payments that arrive before the credit they'd cover

  for (const tx of sorted) {
    const type = tx?.type;
    const amount = Number(tx?.amount) || 0;
    if (amount <= 0) continue;

    if (type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) {
      let outstanding = amount;
      if (prepay > 0) {
        const used = Math.min(outstanding, prepay);
        outstanding -= used;
        prepay -= used;
      }
      credits.push({
        id: tx.id,
        amount,
        due_date: tx.due_date || null,
        created_at: tx.created_at,
        outstanding,
        settled_at: outstanding === 0 ? tx.created_at : null,
        on_time: null,
      });
    } else if (type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) {
      let remaining = amount;
      // FIFO: oldest unsettled credit first
      for (const c of credits) {
        if (remaining <= 0) break;
        if (c.outstanding <= 0) continue;
        const used = Math.min(c.outstanding, remaining);
        c.outstanding -= used;
        remaining -= used;
        if (c.outstanding === 0) c.settled_at = tx.created_at;
      }
      if (remaining > 0) prepay += remaining; // overpayment becomes credit on file
    }
  }

  // Compute on-time flag for credits that have a due_date AND have settled
  for (const c of credits) {
    if (c.due_date && c.settled_at !== null) {
      c.on_time = c.settled_at <= c.due_date;
    }
  }
  return credits;
}

/**
 * Enrich a single customer summary with credit-lifecycle metrics.
 * Adds: on_time_count, on_time_eligible, on_time_rate (per-customer),
 *       avg_pay_days, has_overdue, overdue_days, overdue_amount,
 *       oldest_overdue_due_date.
 */
export function enrichCustomerWithMetrics(customer) {
  const credits = analyzeCreditLifecycle(customer.transactions || []);
  const now = Date.now();

  let onTimeCount = 0;
  let onTimeEligible = 0;
  let payDaysSum = 0;
  let payDaysCount = 0;
  let overdueAmount = 0;
  let oldestOverdueDue = null;

  for (const c of credits) {
    if (c.due_date) {
      // Settled credits with due_date are eligible for on-time stat
      if (c.settled_at !== null) {
        onTimeEligible++;
        if (c.on_time) onTimeCount++;
      }
      // Overdue if still has outstanding AND due_date is past
      if (c.outstanding > 0 && c.due_date < now) {
        overdueAmount += c.outstanding;
        if (oldestOverdueDue === null || c.due_date < oldestOverdueDue) {
          oldestOverdueDue = c.due_date;
        }
      }
    }
    // Average days from credit-creation to settlement
    if (c.settled_at !== null && c.created_at) {
      payDaysSum += (c.settled_at - c.created_at) / DAY_MS;
      payDaysCount++;
    }
  }

  const hasOverdue = overdueAmount > 0;
  const overdueDays = hasOverdue && oldestOverdueDue
    ? Math.floor((now - oldestOverdueDue) / DAY_MS)
    : 0;
  const onTimeRate = onTimeEligible > 0
    ? Math.round((onTimeCount / onTimeEligible) * 100)
    : null;
  const avgPayDays = payDaysCount > 0
    ? Math.round(payDaysSum / payDaysCount)
    : null;

  return {
    ...customer,
    on_time_count: onTimeCount,
    on_time_eligible: onTimeEligible,
    on_time_rate: onTimeRate,            // null if no eligible credits
    avg_pay_days: avgPayDays,            // null if nothing settled
    has_overdue: hasOverdue,
    overdue_amount: overdueAmount,
    overdue_days: overdueDays,
    oldest_overdue_due_date: oldestOverdueDue,
  };
}

/** Enrich an array of customer summaries. */
export function enrichCustomerSummaries(summaries = []) {
  return summaries.map(enrichCustomerWithMetrics);
}

/**
 * Compute total collected (sum of payment-type customer_transactions)
 * for the calendar month containing `referenceMs`.
 */
export function computeMonthlyCollected(customerTransactions = [], referenceMs = Date.now()) {
  const ref = new Date(referenceMs);
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
  const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 1).getTime();
  return customerTransactions
    .filter((tx) =>
      tx?.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
      && Number(tx.amount) > 0
      && tx.created_at >= monthStart
      && tx.created_at < monthEnd
    )
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
}

/**
 * % delta this month vs last month. Returns null if last month was zero.
 */
export function computeMonthlyDelta(customerTransactions = [], referenceMs = Date.now()) {
  const ref = new Date(referenceMs);
  const lastMonthRef = new Date(ref.getFullYear(), ref.getMonth() - 1, 15).getTime();
  const thisMonth = computeMonthlyCollected(customerTransactions, referenceMs);
  const lastMonth = computeMonthlyCollected(customerTransactions, lastMonthRef);
  if (lastMonth === 0) return { thisMonth, lastMonth: 0, percent: null };
  return {
    thisMonth,
    lastMonth,
    percent: Math.round(((thisMonth - lastMonth) / lastMonth) * 100),
  };
}

/**
 * Streak = consecutive days (counting today) where at least one timestamp
 * in `allTimestamps` falls on that local day. Resets on skipped day.
 * Pass all transactions of any type — sales, expenses, customer/supplier txns.
 */
export function computeStreak(allTimestamps = [], referenceMs = Date.now()) {
  if (!allTimestamps.length) return 0;
  const days = new Set();
  for (const ts of allTimestamps) {
    if (!ts) continue;
    days.add(new Date(ts).toDateString());
  }
  let streak = 0;
  const today = new Date(referenceMs);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(d.toDateString())) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Sort enriched customers for the "Top customers" filter:
 * highest on-time count first, ties broken by total paid.
 * Excludes customers with no eligible (due-dated, settled) credits.
 */
export function topCustomers(enrichedSummaries = []) {
  return enrichedSummaries
    .filter((c) => c.on_time_eligible > 0)
    .sort((a, b) => {
      if (b.on_time_count !== a.on_time_count) return b.on_time_count - a.on_time_count;
      // Tie: prefer higher on-time rate
      const ar = a.on_time_rate || 0;
      const br = b.on_time_rate || 0;
      return br - ar;
    });
}

/**
 * Single shop-wide on-time rate across all customers.
 * Sum of on_time_count / sum of on_time_eligible.
 */
export function shopOnTimeRate(enrichedSummaries = []) {
  let count = 0;
  let eligible = 0;
  for (const c of enrichedSummaries) {
    count += c.on_time_count || 0;
    eligible += c.on_time_eligible || 0;
  }
  if (eligible === 0) return null;
  return Math.round((count / eligible) * 100);
}

/**
 * Total overdue amount across all customers.
 */
export function shopOverdueAmount(enrichedSummaries = []) {
  return enrichedSummaries.reduce((sum, c) => sum + (c.overdue_amount || 0), 0);
}

/**
 * Number of customers with at least one overdue credit.
 */
export function countOverdueCustomers(enrichedSummaries = []) {
  return enrichedSummaries.filter((c) => c.has_overdue).length;
}

/**
 * Top customer (single best). For the "👑 Abebe always on time" callout
 * in the hero card. Returns null if no eligible customers.
 */
export function topCustomer(enrichedSummaries = []) {
  const top = topCustomers(enrichedSummaries);
  return top[0] || null;
}

/**
 * Build a single composite credit-page metrics object.
 * Pass all customer_transactions + a global list of timestamps for streak.
 */
export function buildCreditMetrics({
  enrichedSummaries = [],
  customerTransactions = [],
  globalTimestamps = [],
  referenceMs = Date.now(),
}) {
  const monthly = computeMonthlyDelta(customerTransactions, referenceMs);
  return {
    totalOwed: enrichedSummaries.reduce((s, c) => s + (Number(c.balance) || 0), 0),
    overdueAmount: shopOverdueAmount(enrichedSummaries),
    overdueCount: countOverdueCustomers(enrichedSummaries),
    onTimeRate: shopOnTimeRate(enrichedSummaries),
    monthlyCollected: monthly.thisMonth,
    monthlyDelta: monthly.percent,           // null if last month was zero
    streak: computeStreak(globalTimestamps, referenceMs),
    topCustomer: topCustomer(enrichedSummaries),
  };
}
