// Reusable transaction row used across customer detail and history views.

import { useLang } from '../context/LangContext';
import { fmt } from '../utils/numformat';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { getCreditAllocationStatus, getPaymentSettlementCount } from '../utils/customerLedgerMutations';
import { label as tr } from '../labels/index';

export function transactionAmountColor(tx) {
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const isCredit = tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
  if (isPayment) return '#2e6a47';
  if (isCredit) return '#a0402a';
  return '#171a17';
}

export function transactionAmountText(tx) {
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const isCredit = tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
  const sign = isPayment ? '−' : '+';
  return `${sign}${fmt(tx.amount || 0)}`;
}

export function transactionLabel(tx, lang, t) {
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const isCredit = tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
  if (tx.item_note) return tx.item_note;
  if (isPayment) return t.paymentRecordedLabel || (tr('history.payment', lang));
  if (isCredit) return t.creditAddedLabel || (tr('history.credit', lang));
  return t.txReversal || (tr('history.reversal', lang));
}

export function transactionStatusBadge(tx, lang, t) {
  const isCredit = tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;

  const allocationStatus = isCredit ? getCreditAllocationStatus(tx) : null;
  const settlement = isPayment ? getPaymentSettlementCount(tx) : null;

  if (allocationStatus === 'paid') {
    return (
      <span style={{
        fontSize: '0.58rem', fontWeight: 700,
        background: '#e7f0e9', color: '#2e6a47',
        padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
      }}>
        ✓ {tr('history.paid', lang)}
      </span>
    );
  }
  if (allocationStatus === 'partial') {
    const creditAmount = Number(tx.amount) || 0;
    const paid = Number(tx.paid_amount) || 0;
    return (
      <span style={{
        fontSize: '0.58rem', fontWeight: 700,
        background: '#f9eed4', color: '#7a5416',
        padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
      }}>
        {fmt(paid)}/{fmt(creditAmount)}
      </span>
    );
  }
  if (settlement && settlement.settledCount > 0) {
    return (
      <span style={{
        fontSize: '0.58rem', fontWeight: 700,
        background: '#e6f0f7', color: '#2a6690',
        padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
      }}>
        ✓ {tr('history.settled', lang, settlement.settledCount)}
      </span>
    );
  }
  return null;
}

export function TransactionRow({
  tx,
  lang,
  onSelectTransaction,
  isLast,
  style,
}) {
  const { t } = useLang();
  const amountColor = transactionAmountColor(tx);
  const amountText = transactionAmountText(tx);
  const label = transactionLabel(tx, lang, t);
  const statusBadge = transactionStatusBadge(tx, lang, t);
  // Timeline direction stripe — "You Gave (Dubie)" vs "You Got (Paid)"
  const stripeColor = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
    ? '#2e6a47'
    : tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD
      ? '#a0402a'
      : '#e4e6df';

  return (
    <div
      onClick={() => onSelectTransaction?.(tx)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelectTransaction?.(tx); }}
      className="history-row-active"
      style={{
        padding: '14px',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        border: '1px solid #e4e6df',
        borderLeft: `3px solid ${stripeColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        minHeight: 48,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        ...(isLast === false ? {} : {}),
        ...(style || {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{
            fontSize: '0.85rem', color: '#171a17', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
          {statusBadge && (
            <span>{statusBadge}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.9rem', fontWeight: 700,
          color: amountColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {amountText}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </div>
  );
}
