// shopStory.js — The brain that tells the owner what's happening.
//
// Every function answers ONE question:
//   computeShopStory    → "Is my shop okay?"
//   computeMoneySummary → "Where is my money?"
//   computeSalesSummary → "What did we sell?"
//   computeCreditSummary → "Who owes me?"
//   computeStaffSummary → "How is everyone doing?"
//   computeAttentionItems → "What needs me?"
//   computeTimeline     → "What happened today?"
//   computeShopDiary    → "What should I remember?"
//
// All functions are pure — no side effects, no database calls.
// Input: pre-computed rows and metrics from reportSelectors.js.
// Output: structured objects ready for rendering.

import { amountOf, isTransferPayment, actorName } from './reportSelectors';

const DAY_MS = 86400000;

// ─── SHOP STORY ──────────────────────────────────────────────
// "Is my shop okay?"

export function computeShopStory({
  metrics,
  priorMetrics = null,
  overdueCount = 0,
  overdueRatio = 0,
  closingDone = false,
  cashVariance = 0,
  lang = 'en',
}) {
  const net = metrics.totalSold - metrics.spentToday;
  const hasProfit = net > 0;
  const hasLoss = net < 0;
  const hasOverdue = overdueCount > 0;
  const cashMismatch = closingDone && Math.abs(cashVariance) > (metrics.cashExpected || 1) * 0.05;
  const salesCrash = priorMetrics && priorMetrics.totalSold > 0 && metrics.totalSold < priorMetrics.totalSold * 0.5;

  // Count problems
  let problems = 0;
  if (hasLoss) problems++;
  if (cashMismatch) problems++;
  if (overdueRatio > 0.3) problems++;
  if (salesCrash) problems++;

  // Determine status
  let status, emoji, headline;

  if (problems === 0) {
    status = 'healthy';
    emoji = '😊';
    headline = lang === 'am' ? 'ሱቅዎ በቃና በእርግጥ ነው' : 'Your shop is running smoothly';
  } else if (problems <= 1) {
    status = 'warning';
    emoji = '😐';
    headline = lang === 'am' ? 'ዛሬ ትኩረት ይፈልጋል' : 'Today needs some attention';
  } else {
    status = 'urgent';
    emoji = '🔴';
    headline = lang === 'am' ? 'አስፈላጊ ችግሮች ተገኙ' : 'Urgent issues found';
  }

  // Build observations
  const observations = [];

  // Sales count
  const salesCount = metrics.saleRows?.length || 0;
  if (salesCount > 0) {
    observations.push(
      lang === 'am'
        ? `${salesCount} ሽያጭ ተመዝግሧል`
        : `${salesCount} sale${salesCount !== 1 ? 's' : ''} recorded`
    );
  } else {
    observations.push(
      lang === 'am' ? 'ዛሬ ምንም ሽያጭ የለም' : 'No sales recorded today'
    );
  }

  // Credit
  if (hasOverdue) {
    observations.push(
      lang === 'am'
        ? `${overdueCount} ደንበኛ ይሄዳቸዋል`
        : `${overdueCount} customer${overdueCount !== 1 ? 's' : ''} still owe you`
    );
  }

  // Cash
  if (closingDone) {
    if (cashMismatch) {
      observations.push(
        lang === 'am' ? 'ገንዘብ አይዛመድም' : 'Cash does not match records'
      );
    } else {
      observations.push(
        lang === 'am' ? 'ገንዘብ ተመሳ菟ል ነው' : 'Cash matches your records'
      );
    }
  }

  return { status, emoji, headline, observations, net, problems };
}

// ─── MONEY SUMMARY ───────────────────────────────────────────
// "Where is my money?"

export function computeMoneySummary(metrics, lang = 'en') {
  const cashExpected = metrics.cashExpected || 0;
  const transferRecorded = metrics.transferRecorded || 0;
  const creditExtended = metrics.newDubie || 0;
  const creditCollected = metrics.creditCollected || 0;
  const expenses = metrics.spentToday || 0;
  const sales = metrics.totalSold || 0;

  // Profit is only meaningful if we have cost data
  const saleRows = metrics.saleRows || [];
  const hasCostData = saleRows.some(row => Number(row.cost_price) > 0 && Number(row.quantity) > 0);
  const totalProfit = hasCostData
    ? saleRows.reduce((sum, row) => sum + (Number(row.profit) || 0), 0)
    : null;

  return {
    sales,
    expenses,
    cashExpected,
    transferRecorded,
    creditExtended,
    creditCollected,
    totalProfit, // null if incomplete cost data
    hasCostData,
  };
}

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
    const name = row.item_name || row.item_note || (lang === 'am' ? 'ልዩ' : 'Other');
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
  for (const row of saleRows) {
    if (row.report_kind === 'credit' || String(row.payment_type || '').toLowerCase() === 'credit') {
      creditCount++;
    } else if (isTransferPayment(row)) {
      transferCount++;
    } else {
      cashCount++;
    }
  }

  return {
    totalSales,
    totalAmount,
    averageSale,
    topItems,
    paymentBreakdown: { cash: cashCount, transfer: transferCount, credit: creditCount },
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
      message: lang === 'am' ? 'ገንዘብ ገና አልተጠቀሰም' : 'Cash not counted yet',
      detail: lang === 'am'
        ? `የሚጠበቅ: ${fmt(cashExpected)} ETB`
        : `Expected: ${fmt(cashExpected)} ETB`,
      action: lang === 'am' ? 'ገንዘብ ቅጠል' : 'Count Cash',
      actionType: 'primary',
    });
  }

  // Cash mismatch
  if (closingDone && Math.abs(cashVariance) > cashExpected * 0.05) {
    const direction = cashVariance > 0 ? (lang === 'am' ? 'በዚህ ብዛት ተጨማሪ ነው' : 'more than expected') : (lang === 'am' ? 'በዚህ ብዛት ያነሰ ነው' : 'less than expected');
    items.push({
      type: 'cash_mismatch',
      severity: 'urgent',
      message: lang === 'am' ? 'ገንዘብ አይዛመድም' : 'Cash does not match',
      detail: `${Math.abs(cashVariance).toLocaleString()} ETB ${direction}`,
      action: lang === 'am' ? '_firestore' : 'Review',
      actionType: 'secondary',
    });
  }

  // Overdue customers
  if (overdueCount > 0) {
    items.push({
      type: 'overdue_customers',
      severity: 'warning',
      message: lang === 'am'
        ? `${overdueCount} ደንበኛ ይሄዳቸዋል`
        : `${overdueCount} customer${overdueCount !== 1 ? 's' : ''} owe you`,
      detail: lang === 'am'
        ? `ጠቅላላ: ${overdueAmount.toLocaleString()} ETB`
        : `Total: ${overdueAmount.toLocaleString()} ETB · Oldest: ${largestOverdueDays} days`,
      action: lang === 'am' ? 'ያስታውሱ' : 'Remind',
      actionType: 'secondary',
    });
  }

  // Low sales (compared to average)
  if (avgSalesCount > 0 && salesCount < avgSalesCount * 0.5 && salesCount > 0) {
    items.push({
      type: 'low_sales',
      severity: 'warning',
      message: lang === 'am' ? 'ሽያጭ ከመደበኛው ዝቅተኛ ነው' : 'Sales are lower than usual',
      detail: lang === 'am'
        ? `በአጠቃላይ ${avgSalesCount} ሽያጭ ይሆናል · ${salesCount} ብቻ`
        : `Usually ${avgSalesCount} sales by now · Only ${salesCount} today`,
      action: null,
      actionType: null,
    });
  }

  // High expenses
  if (avgExpenses > 0 && expenses > avgExpenses * 1.5) {
    items.push({
      type: 'high_expenses',
      severity: 'warning',
      message: lang === 'am' ? 'ወጪ ከመደበኛው ከፍተኛ ነው' : 'Expenses are higher than usual',
      detail: lang === 'am'
        ? `በአጠቃላይ ${fmt(avgExpenses)} ETB · ዛሬ ${fmt(expenses)} ETB`
        : `Usually ${fmt(avgExpenses)} ETB · Today ${fmt(expenses)} ETB`,
      action: null,
      actionType: null,
    });
  }

  return items;
}

// ─── TIMELINE ────────────────────────────────────────────────
// "What happened today?"

export function computeTimeline(rows = [], lang = 'en') {
  return rows.slice(0, 20).map(row => ({
    id: row.report_id || row.id,
    time: row.created_at,
    label: row.title || row.item_name || row.customer_name || (lang === 'am' ? 'መዝገብ' : 'Record'),
    amount: amountOf(row),
    kind: row.report_kind || row.type,
    payment: isTransferPayment(row) ? 'transfer' : 'cash',
    staff: actorName(row),
  }));
}

// ─── SHOP DIARY ──────────────────────────────────────────────
// "What should I remember?"

export function computeShopDiary({
  metrics,
  topItem = null,
  overdueCount = 0,
  closingDone = false,
  cashMismatch = false,
  staffSummary = null,
  lang = 'en',
}) {
  const salesCount = metrics.saleRows?.length || 0;
  const totalSold = metrics.totalSold || 0;
  const totalSpent = metrics.spentToday || 0;
  const net = totalSold - totalSpent;

  if (lang === 'am') {
    // Amharic diary
    const parts = [];

    if (salesCount === 0) {
      parts.push('ዛሬ ምንም ሽያጭ የለም');
    } else if (salesCount <= 5) {
      parts.push('ጸhores ቀን ነበር');
    } else if (salesCount <= 15) {
      parts.push('ተጨማሪ ቀን ነበር');
    } else {
      parts.push('ትልቅ ቀን ነበር');
    }

    if (topItem) {
      parts.push(`${topItem.name} ብዙም ተjualan`);
    }

    if (closingDone && !cashMismatch) {
      parts.push('ገንዘብ ተመሳ菟ል ነው');
    } else if (closingDone && cashMismatch) {
      parts.push('ገንዘብ አይዛመድም');
    }

    if (overdueCount > 0) {
      parts.push(`${overdueCount} ደንበኛ ይሄዳቸዋል`);
    }

    return parts.join('· ') + '።';
  }

  // English diary
  const parts = [];

  if (salesCount === 0) {
    parts.push('Quiet day — no sales recorded');
  } else if (salesCount <= 5) {
    parts.push('Slow day');
  } else if (salesCount <= 15) {
    parts.push('Busy day');
  } else {
    parts.push('Very strong day');
  }

  if (topItem) {
    parts.push(`${topItem.name} sold the most`);
  }

  if (net > 0) {
    parts.push(`Profit was ${fmt(net)} ETB`);
  }

  if (closingDone && !cashMismatch) {
    parts.push('Cash matched perfectly');
  } else if (closingDone && cashMismatch) {
    parts.push('Cash did not match — needs review');
  }

  if (overdueCount > 0) {
    parts.push(`${overdueCount} customer${overdueCount !== 1 ? 's' : ''} still owe you money`);
  }

  if (staffSummary && staffSummary.count > 0) {
    parts.push(`${staffSummary.count} staff members working today`);
  }

  return parts.join('. ') + '.';
}

// Helper: format number (inline to avoid circular dependency)
function fmt(n) {
  return Number(n || 0).toLocaleString();
}
