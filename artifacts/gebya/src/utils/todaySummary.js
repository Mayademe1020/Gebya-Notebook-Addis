// utils/todaySummary.js
// Math helpers for the Today screen summary section.

import { CUSTOMER_TRANSACTION_TYPES } from './customerTransactionTypes';

/**
 * Compute trend percent (today vs yesterday).
 * Returns null when yesterday has no signal (zero or missing).
 */
export function getTrendPercent(todayNet, yesterdayNet) {
  if (yesterdayNet === 0 || yesterdayNet === null || yesterdayNet === undefined) return null;
  return ((todayNet - yesterdayNet) / Math.abs(yesterdayNet)) * 100;
}

/**
 * Format a trend percent into display parts.
 * Returns { arrow, color, sign, percent } or null.
 */
export function formatTrend(percent) {
  if (percent === null || percent === undefined) return null;
  const isUp = percent >= 0;
  return {
    arrow: isUp ? '▲' : '▼',
    color: isUp ? '#16a34a' : '#dc2626',
    sign: isUp ? '+' : '−',
    percent: Math.abs(Math.round(percent)),
  };
}

/**
 * Auto-scale font size for the hero net number so 1-9 digits all fit on one line.
 * Returns { size, lineHeight } as CSS values.
 */
export function heroFontSize(amount) {
  const digits = Math.abs(Math.round(amount || 0)).toString().length;
  if (digits <= 4) return { size: '3rem',    lineHeight: '1' };   // up to    9,999
  if (digits <= 6) return { size: '2.5rem',  lineHeight: '1' };   // up to  999,999
  if (digits <= 8) return { size: '2rem',    lineHeight: '1' };   // up to 99,999,999
  return                  { size: '1.625rem', lineHeight: '1' };  // up to 999,999,999
}

function startOfLocalDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfLocalDay(ms) {
  return startOfLocalDay(ms) + (24 * 60 * 60 * 1000);
}

function outstandingCreditsForCustomer(customer) {
  const rows = [...(customer?.transactions || [])].sort((a, b) => {
    return (Number(a.created_at || 0) - Number(b.created_at || 0))
      || (Number(a.id || 0) - Number(b.id || 0));
  });
  const credits = [];

  for (const row of rows) {
    const amount = Number(row?.amount || 0);
    if (amount <= 0) continue;

    if (row.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) {
      credits.push({
        customer_id: customer.id,
        customer_name: customer.display_name,
        transaction_id: row.id,
        amount,
        outstanding: amount,
        due_date: Number(row.due_date || 0) || null,
        note: row.item_note || null,
        created_at: row.created_at || null,
      });
      continue;
    }

    if (row.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) {
      let remaining = amount;
      for (const credit of credits) {
        if (remaining <= 0) break;
        if (credit.outstanding <= 0) continue;
        const paid = Math.min(credit.outstanding, remaining);
        credit.outstanding -= paid;
        remaining -= paid;
      }
    }
  }

  return credits.filter((credit) => credit.outstanding > 0 && credit.due_date);
}

export function buildCustomerDueActions(customerSummaries = [], referenceMs = Date.now()) {
  const todayStart = startOfLocalDay(referenceMs);
  const tomorrowStart = endOfLocalDay(referenceMs);
  const allCredits = customerSummaries.flatMap(outstandingCreditsForCustomer);

  const mapCredit = (credit) => ({
    customer_id: credit.customer_id,
    customer_name: credit.customer_name,
    transaction_id: credit.transaction_id,
    amount: Math.round(Number(credit.outstanding || 0)),
    due_date: credit.due_date,
    note: credit.note,
    days_late: Math.max(0, Math.floor((todayStart - credit.due_date) / (24 * 60 * 60 * 1000))),
  });

  return {
    dueToday: allCredits
      .filter((credit) => credit.due_date >= todayStart && credit.due_date < tomorrowStart)
      .map(mapCredit)
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)),
    overdue: allCredits
      .filter((credit) => credit.due_date < todayStart)
      .map(mapCredit)
      .sort((a, b) => Number(a.due_date || 0) - Number(b.due_date || 0)),
  };
}
