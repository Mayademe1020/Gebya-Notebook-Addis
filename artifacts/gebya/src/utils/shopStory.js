// shopStory.js — The brain that tells the owner what's happening.
//
// Every function answers ONE question:
//   computeSalesSummary   → "What did we sell?"
//   computeCreditSummary  → "Who owes me?"
//   computeStaffSummary   → "How is everyone doing?"
//   computeAttentionItems → "What needs me?"
//   computeHeroStatus     → "Am I okay?" (single sentence + CTA)
//   computeTodayStory     → "What should I remember today?"
//   computeRecommendations→ "What should I know?"
//   computePeriodVerdict  → "How was this period vs the last one?"
//
// All functions are pure — no side effects, no database calls.
// Input: pre-computed rows and metrics from reportSelectors.js.
// Output: structured objects ready for rendering.

import { amountOf, isTransferPayment } from './reportSelectors.js';
import { label } from '../labels/index.js';

const DAY_MS = 86400000;

// ─── SALES SUMMARY ───────────────────────────────────────────
// "What did we sell?"

export function computeSalesSummary(metrics, lang = 'en') {
  const saleRows = metrics.saleRows || [];
  const totalSales = saleRows.length;
  const totalAmount = metrics.totalSold || 0;
  const averageSale = totalSales > 0 ? Math.round(totalAmount / totalSales) : 0;

  // Top items by revenue
  const byItem = new Map();
  for (const row of saleRows) {
    const name = row.item_name || row.item_note || (label('common.other', lang));
    const existing = byItem.get(name) || { name, revenue: 0, quantity: 0, count: 0 };
    existing.revenue += amountOf(row);
    existing.quantity += Number(row.quantity) || 0;
    existing.count += 1;
    byItem.set(name, existing);
  }
  const topItems = Array.from(byItem.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Payment breakdown
  let cashCount = 0;
  let transferCount = 0;
  let creditCount = 0;
  let partialCount = 0;
  for (const row of saleRows) {
    if (row.report_kind === 'credit' || String(row.payment_type || '').toLowerCase() === 'credit') {
      creditCount++;
    } else if (isTransferPayment(row)) {
      transferCount++;
    } else if (String(row.payment_type || '').toLowerCase() === 'partial') {
      partialCount++;
    } else {
      cashCount++;
    }
  }

  return {
    totalSales,
    totalAmount,
    averageSale,
    topItems,
    paymentBreakdown: { cash: cashCount, transfer: transferCount, credit: creditCount, partial: partialCount },
  };
}

// ─── CREDIT SUMMARY ──────────────────────────────────────────
// "Who owes me?"

export function computeCreditSummary(enrichedCustomerSummaries = [], lang = 'en') {
  const customersWithDebt = enrichedCustomerSummaries
    .filter(c => Number(c.balance || 0) > 0)
    .sort((a, b) => {
      // Overdue first, then by amount
      if (a.has_overdue && !b.has_overdue) return -1;
      if (!a.has_overdue && b.has_overdue) return 1;
      return Number(b.balance || 0) - Number(a.balance || 0);
    });

  const overdue = customersWithDebt.filter(c => c.has_overdue);
  const dueToday = customersWithDebt.filter(c => !c.has_overdue);
  const totalOwed = customersWithDebt.reduce((sum, c) => sum + Number(c.balance || 0), 0);
  const overdueAmount = overdue.reduce((sum, c) => sum + Number(c.overdue_amount || c.balance || 0), 0);
  const largestDebt = customersWithDebt.length > 0 ? customersWithDebt[0] : null;

  return {
    customers: customersWithDebt,
    overdue,
    dueToday,
    totalOwed,
    overdueAmount,
    overdueCount: overdue.length,
    largestDebt,
    totalCount: customersWithDebt.length,
  };
}

// ─── STAFF SUMMARY ───────────────────────────────────────────
// "How is everyone doing?"

export function computeStaffSummary(staffRows = [], lang = 'en') {
  if (staffRows.length === 0) return null;

  const total = staffRows.reduce((sum, s) => sum + s.sold, 0);
  const topSeller = staffRows.length > 0 ? staffRows[0] : null;

  return {
    staff: staffRows,
    count: staffRows.length,
    total,
    topSeller,
  };
}

// ─── ATTENTION ITEMS ─────────────────────────────────────────
// "What needs me?"

export function computeAttentionItems({
  closingDone = false,
  cashExpected = 0,
  cashVariance = 0,
  overdueCount = 0,
  overdueAmount = 0,
  largestOverdueDays = 0,
  salesCount = 0,
  avgSalesCount = 0,
  expenses = 0,
  avgExpenses = 0,
  lang = 'en',
}) {
  const items = [];

  // Cash not counted
  if (!closingDone) {
    items.push({
      type: 'cash_pending',
      severity: 'urgent',
      message: label('common.cash-not-counted-yet', lang),
      detail: label('common.expected-etb', lang, fmt(cashExpected)),
      action: label('common.count-cash', lang),
      actionType: 'count_cash',
    });
  }

  // Cash mismatch
  if (closingDone && Math.abs(cashVariance) > cashExpected * 0.05) {
    const direction = cashVariance > 0 ? (label('common.more-than-expected', lang)) : (label('common.less-than-expected', lang));
    items.push({
      type: 'cash_mismatch',
      severity: 'urgent',
      message: label('common.cash-does-not-match', lang),
      detail: `${fmt(Math.abs(cashVariance))} ETB ${direction}`,
      action: label('common.review', lang),
      actionType: 'review',
    });
  }

  // Overdue customers
  if (overdueCount > 0) {
    items.push({
      type: 'overdue_customers',
      severity: 'warning',
      message: label('common.customer-owe-you', lang, () => overdueCount, () => overdueCount !== 1 ? 's' : ''),
      detail: label('common.total-etb-oldest-days', lang, () => fmt(overdueAmount), () => largestOverdueDays),
      action: label('common.remind', lang),
      actionType: 'overdue',
    });
  }

  // Low sales (compared to average)
  if (avgSalesCount > 0 && salesCount < avgSalesCount * 0.5 && salesCount > 0) {
    items.push({
      type: 'low_sales',
      severity: 'warning',
      message: label('common.sales-are-lower-than-usual', lang),
      detail: label('common.usually-sales-by-now-only-today', lang, avgSalesCount, salesCount),
      action: null,
      actionType: null,
    });
  }

  // High expenses
  if (avgExpenses > 0 && expenses > avgExpenses * 1.5) {
    items.push({
      type: 'high_expenses',
      severity: 'warning',
      message: label('common.expenses-are-higher-than-usual', lang),
      detail: label('common.usually-etb-today-etb', lang, fmt(avgExpenses), fmt(expenses)),
      action: null,
      actionType: null,
    });
  }

  return items;
}

// Helper: format number (inline to avoid circular dependency)
function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── PERIOD VERDICT ──────────────────────────────────────────
// "How was this period vs the last one?" — one plain sentence.
// Returns { text, tone } like computeRecommendations.

export function computePeriodVerdict({ current = null, previous = null, lang = 'en' }) {
  const cur = Number(current?.totalSold || 0);
  const prev = Number(previous?.totalSold || 0);

  if (prev <= 0 && cur <= 0) {
    return {
      tone: 'neutral',
      text: label('common.no-sales-in-this-period', lang),
    };
  }
  if (prev <= 0) {
    return {
      tone: 'positive',
      text: label('common.etb-in-sales-nothing-to-compare-with-yet', lang, fmt(cur)),
    };
  }

  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 10) {
    return {
      tone: 'positive',
      text: label('common.etb-more-than-last-period', lang, fmt(cur), pct),
    };
  }
  if (pct < -10) {
    return {
      tone: 'warning',
      text: label('common.etb-less-than-last-period', lang, fmt(cur), Math.abs(pct)),
    };
  }
  return {
    tone: 'neutral',
    text: label('common.etb-about-the-same-as-last-period', lang, fmt(cur)),
  };
}

// ─── HERO STATUS ──────────────────────────────────────────────
// "Am I okay?" — single sentence + one CTA button

export function computeHeroStatus({
  metrics,
  closingDone = false,
  cashVariance = 0,
  overdueCount = 0,
  staffRows = [],
  period = 'day',
  lang = 'en',
}) {
  const salesCount = metrics.saleRows?.length || 0;
  const cashExpected = metrics.cashExpected || 0;
  const hasOverdue = overdueCount > 0;
  const unconfirmedStaff = staffRows.filter(s => !s.confirmed);
  const cashMismatch = closingDone && Math.abs(cashVariance) > (cashExpected || 1) * 0.05;

  if (!closingDone && (period === 'evening' || period === 'night')) {
    return {
      sentence: label('common.one-thing-left-count-your-cash', lang),
      cta: label('common.count-cash-2', lang),
      actionType: 'count_cash',
    };
  }
  if (!closingDone) {
    return {
      sentence: label('common.your-day-isn-t-closed-yet', lang),
      cta: label('common.count-cash-2', lang),
      actionType: 'count_cash',
    };
  }
  if (cashMismatch) {
    return {
      sentence: label('common.cash-doesn-t-match-off-by-etb', lang, fmt(Math.abs(cashVariance))),
      cta: label('common.review-2', lang),
      actionType: 'review',
    };
  }
  if (unconfirmedStaff.length > 0) {
    return {
      sentence: label('common.staff-haven-t-reported-cash', lang, unconfirmedStaff.length),
      cta: label('common.collect', lang),
      actionType: 'collect_staff',
    };
  }
  if (hasOverdue) {
    return {
      sentence: label('common.customer-still-owe-you', lang, () => overdueCount, () => overdueCount !== 1 ? 's' : ''),
      cta: label('common.remind-2', lang),
      actionType: 'overdue',
    };
  }
  if (salesCount === 0) {
    return {
      sentence: label('common.no-sales-yet-today', lang),
      cta: label('common.record-sale', lang),
      actionType: 'sale',
    };
  }
  return {
    sentence: label('common.all-good-sale-etb-cash', lang, () => salesCount, () => salesCount !== 1 ? 's' : '', () => fmt(cashExpected)),
    cta: label('common.view-details', lang),
    actionType: 'view_details',
  };
}

// ─── TODAY'S STORY ────────────────────────────────────────────
// "What should I remember?" — narrative paragraph (3-5 sentences)

export function computeTodayStory({
  metrics,
  staffSummary = null,
  overdueCount = 0,
  overdueAmount = 0,
  closingDone = false,
  cashVariance = 0,
  creditCollected = 0,
  expenseCount = 0,
  lang = 'en',
}) {
  const salesCount = metrics.saleRows?.length || 0;
  const totalSold = metrics.totalSold || 0;
  const cashExpected = metrics.cashExpected || 0;
  const cashMismatch = closingDone && Math.abs(cashVariance) > (cashExpected || 1) * 0.05;

  const parts = [];

  if (lang === 'am') {
    if (salesCount === 0) {
      parts.push('ዛሬ ምንም ሽያጭ አልተከናወነም');
    } else if (salesCount <= 5) {
      parts.push(`ዛሬ ${salesCount} ሽያጮች ተመዝግበዋል፣ ${fmt(totalSold)} ETB`);
    } else {
      parts.push(`ዛሬ ${salesCount} ሽያጮች፣ ${fmt(totalSold)} ETB`);
    }

    if (staffSummary?.staff?.length > 0) {
      const names = staffSummary.staff.map(s => s.name).join('፣ ');
      parts.push(`${names} ሸጠዋል`);
    }

    if (creditCollected > 0) {
      parts.push(`${fmt(creditCollected)} ETB ዕዳ ተሰብስቧል`);
    }

    if (closingDone && !cashMismatch) {
      parts.push('ገንዘብ በትክክል ተጣጥሟል');
    } else if (closingDone && cashMismatch) {
      parts.push(`ገንዘብ አልተጣጣመም፦ ልዩነቱ ${fmt(Math.abs(cashVariance))} ETB`);
    }

    if (expenseCount > 0) {
      parts.push(`${fmt(metrics.spentToday || 0)} ETB ወጪ ተደርጓል`);
    }

    return parts.join('። ') + '።';
  }

  if (salesCount === 0) {
    parts.push('You opened but no sales were recorded today.');
  } else if (salesCount <= 5) {
    parts.push(`You recorded ${salesCount} sale${salesCount !== 1 ? 's' : ''} worth ${fmt(totalSold)} ETB today.`);
  } else {
    parts.push(`${salesCount} sale${salesCount !== 1 ? 's' : ''} today totalling ${fmt(totalSold)} ETB.`);
  }

  if (staffSummary?.staff?.length > 0) {
    const names = staffSummary.staff.map(s => s.name).join(', ');
    parts.push(`${names} handled sales.`);
  }

  if (creditCollected > 0) {
    parts.push(`${fmt(creditCollected)} ETB in old debts was collected.`);
  }

  if (closingDone && !cashMismatch) {
    parts.push('Cash balanced perfectly at closing.');
  } else if (closingDone && cashMismatch) {
    parts.push(`Cash was off by ${fmt(Math.abs(cashVariance))} ETB at closing.`);
  }

  if (overdueCount > 0) {
    parts.push(`${overdueCount} customer${overdueCount !== 1 ? 's' : ''} still owe ${fmt(overdueAmount)} ETB.`);
  }

  if (expenseCount > 0) {
    parts.push(`${fmt(metrics.spentToday || 0)} ETB in expenses.`);
  }

  return parts.join(' ') + (parts.length > 0 ? '' : 'A quiet day with nothing recorded.');
}

// ─── RECOMMENDATIONS ──────────────────────────────────────────
// "What should I know?" — up to 4 insight sentences.
// Each rec carries a tone so the UI can colour-code it:
//   'positive' → things going well (green)
//   'warning'  → needs attention (amber)
//   'neutral'  → plain observation

export function computeRecommendations({
  metrics,
  priorMetrics = null,
  staffSummary = null,
  overdueCount = 0,
  closingDone = false,
  creditCollected = 0,
  lang = 'en',
}) {
  const recs = [];
  const totalSold = metrics.totalSold || 0;

  // Sales trend
  if (priorMetrics && priorMetrics.totalSold > 0) {
    const diff = totalSold - priorMetrics.totalSold;
    const pct = Math.round((diff / priorMetrics.totalSold) * 100);
    if (pct > 20) {
      recs.push({
        tone: 'positive',
        text: label('common.sales-are-higher-than-yesterday', lang, pct),
      });
    } else if (pct < -20) {
      recs.push({
        tone: 'warning',
        text: label('common.sales-are-lower-than-yesterday', lang, Math.abs(pct)),
      });
    } else {
      recs.push({
        tone: 'neutral',
        text: label('common.sales-are-stable-compared-to-yesterday', lang),
      });
    }
  }

  // Top selling item
  const saleRows = metrics.saleRows || [];
  const byItem = new Map();
  for (const row of saleRows) {
    const name = row.item_name || row.item_note || 'Other';
    byItem.set(name, (byItem.get(name) || 0) + amountOf(row));
  }
  const topItems = Array.from(byItem.entries()).sort((a, b) => b[1] - a[1]);
  if (topItems.length > 0) {
    const [topName, topAmount] = topItems[0];
    recs.push({
      tone: 'positive',
      text: label('common.sold-the-most-etb', lang, topName, fmt(topAmount)),
    });
  }

  // Staff insight
  if (staffSummary?.staff?.length > 1) {
    const top = staffSummary.staff[0];
    recs.push({
      tone: 'neutral',
      text: label('common.sold-etb-top-seller-today', lang, () => top.name, () => fmt(top.sold), () => top.sold),
    });
  }

  // Debt collection insight
  if (creditCollected > 0) {
    recs.push({
      tone: 'positive',
      text: label('common.you-collected-etb-in-old-debts-good-job', lang, fmt(creditCollected)),
    });
  } else if (overdueCount > 0) {
    recs.push({
      tone: 'warning',
      text: label('common.customer-still-owe-send-reminders', lang, () => overdueCount, () => overdueCount !== 1 ? 's' : ''),
    });
  }

  // Pad to at least 1
  if (recs.length === 0) {
    recs.push({
      tone: 'neutral',
      text: label('common.nothing-unusual-to-report-today', lang),
    });
  }

  return recs.slice(0, 4);
}


