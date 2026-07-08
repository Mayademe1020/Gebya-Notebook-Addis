import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from './customerTransactionTypes.js';

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeCustomerDraft(payload = {}) {
  const displayName = String(payload.display_name || '').trim();
  if (!displayName) return null;

  const telegramUsername = normalizeOptionalText(payload.telegram_username);

  return {
    display_name: displayName,
    note: normalizeOptionalText(payload.note),
    phone_number: normalizeOptionalText(payload.phone_number),
    telegram_username: telegramUsername,
    telegram_notify_enabled: Boolean(payload.telegram_notify_enabled && telegramUsername),
  };
}

export function normalizeCustomerTransactionDraft(payload = {}) {
  if (!isValidCustomerTransactionType(payload.type)) return null;

  const customerId = Number(payload.customer_id);
  const amount = Number(payload.amount);
  if (!Number.isFinite(customerId) || customerId <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    customer_id: customerId,
    type: payload.type,
    amount,
    item_note: normalizeOptionalText(payload.item_note),
    due_date: payload.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD
      ? normalizeTimestamp(payload.due_date)
      : null,
    payment_method: normalizeOptionalText(payload.payment_method) || 'cash',
    payment_provider: normalizeOptionalText(payload.payment_provider),
  };
}

/**
 * FIFO allocate a payment amount across open credit_add records (oldest first).
 * Returns { allocation, creditsToUpdate } where:
 *   allocation       — [{ credit_id, amount }] describing how the payment was distributed
 *   creditsToUpdate  — [{ id, paid_amount, status }] for each touched credit
 *
 * Open credits are those whose cumulative paid_amount is less than their amount.
 * Status values: 'paid' | 'partial' | 'open'.
 * Excess payment (payment > total open credit) is kept as overpayment and does NOT
 * appear in the allocation list.
 */
export function fifoAllocatePayment(paymentAmount, openCredits = []) {
  let remaining = paymentAmount;
  const allocation = [];
  const creditsToUpdate = [];

  for (const credit of openCredits) {
    const creditId = credit.id;
    const creditAmount = Number(credit.amount) || 0;
    const alreadyPaid = Number(credit.paid_amount) || 0;
    const creditRemaining = creditAmount - alreadyPaid;

    if (creditRemaining <= 0) continue;

    const used = Math.min(remaining, creditRemaining);
    const newPaidAmount = alreadyPaid + used;
    const status = creditRemaining <= used ? 'paid' : 'partial';

    creditsToUpdate.push({ id: creditId, paid_amount: newPaidAmount, status });
    allocation.push({ credit_id: creditId, amount: used });
    remaining -= used;
  }

  return { allocation, creditsToUpdate };
}

/**
 * Derive a settlement status string for a single credit_add based on its own
 * paid_amount + amount fields (no need to examine payment records).
 *
 * Returns:
 *   'paid'    — paid_amount >= amount (fully settled)
 *   'partial' — 0 < paid_amount < amount
 *   'open'    — otherwise (no allocation touch)
 */
export function getCreditAllocationStatus(credit) {
  const creditAmount = Number(credit.amount) || 0;
  const paid = Number(credit.paid_amount) || 0;
  if (paid >= creditAmount) return 'paid';
  if (paid > 0) return 'partial';
  return 'open';
}

/**
 * Count how many credits were settled by a given payment transaction,
 * using its `allocation` array.
 * Returns { settledCount, totalAllocatedAmount }.
 */
export function getPaymentSettlementCount(payment) {
  const allocation = Array.isArray(payment.allocation) ? payment.allocation : [];
  const totalAllocated = allocation.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return { settledCount: allocation.length, totalAllocated };
}
