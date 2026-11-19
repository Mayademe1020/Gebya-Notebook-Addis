import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import MoneyFlowBar from './MoneyFlowBar';
import { label } from '../labels/index.js';

export default function TodayBusiness({
  metrics,
  closingState,
  lang,
  onClose,
  showClosing = true,
  selfCheck = false,
  personName = null,
  cashYouShouldHave: cashYouShouldHaveProp,
}) {
  const { hidden } = usePrivacy();
  const [expanded, setExpanded] = useState(false);
  const [cashInput, setCashInput] = useState('');

  const m = metrics;
  const total = m.totalSold || 0;
  const cashExpected = m.cashExpected || 0;
  const digital = m.transferRecorded || 0;
  const expenses = m.spentToday || 0;
  const collections = m.creditCollected || 0;
  const staffCount = m.saleRows?.filter(r => r.actor_staff_member_id).length || 0;
  // Use pre-computed value from parent when available, otherwise compute locally.
  const cashYouShouldHave = cashYouShouldHaveProp ?? (cashExpected + collections - expenses);
  const diff = closingState.done ? (cashYouShouldHave - (closingState.cashInHand || 0)) : null;

  const H = v => hidden ? '••••' : fmt(v);

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
      marginTop: 10,
    }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 20, fontWeight: 950, color: 'var(--color-text)', lineHeight: 1.1 }}>
            ETB {H(total)}
          </p>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {personName
              ? `${personName}${label('today.today-s-sales', lang)}`
              : (label('today.total-sales', lang, () => staffCount > 0 ? ` (you + ${staffCount} staff)` : '', () => staffCount > 0 ? ` (${staffCount + 1} ሰው)` : ''))}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />}
      </button>

      {/* Money map — visible without expanding, so "where is my money"
          answers itself at a glance. Hidden in privacy mode. */}
      {!hidden && (
        <div style={{ padding: '0 16px 12px' }}>
          <MoneyFlowBar
            cash={cashExpected}
            digital={digital}
            owed={(m.newDubie || 0) + (m.partialRemaining || 0)}
            lang={lang}
          />
        </div>
      )}

      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--color-bg-hover)', paddingTop: 10 }}>
          <Row label={label('today.cash-2', lang)} value={cashExpected} hidden={hidden} />
          <Row label={label('today.digital-2', lang)} value={digital} hidden={hidden} />
          <Row label={label('today.expenses', lang)} value={expenses} hidden={hidden} color='var(--color-danger)' />
          <Row label={label('today.collections', lang)} value={collections} hidden={hidden} />
          {m.partialCount > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--color-bg-disabled)', margin: '6px 0' }} />
              <p style={{
                fontSize: 10, fontWeight: 900, color: 'var(--color-text-soft)',
                textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0 2px',
              }}>
                ½ {label('today.partial-payments', lang)} ({m.partialCount})
              </p>
              <Row label={label('today.received-cash', lang)} value={m.partialReceivedCash || 0} hidden={hidden} color='var(--color-success)' />
              <Row label={label('today.received-bank-wallet', lang)} value={m.partialReceivedTransfer || 0} hidden={hidden} color='var(--color-accent-amber)' />
              <Row label={label('today.still-owed-dubie', lang)} value={m.partialRemaining || 0} hidden={hidden} color='var(--color-accent-amber)' />
            </>
          )}
          <div style={{ height: 1, background: 'var(--color-bg-disabled)', margin: '6px 0' }} />
          <Row label={label('today.cash-you-should-have', lang)} value={cashYouShouldHave} hidden={hidden} bold />
          {showClosing && closingState.done && (
            <>
              <Row label={label('today.cash-in-hand', lang)} value={closingState.cashInHand || 0} hidden={hidden} />
              <Row
                label={label('today.difference', lang)}
                value={diff}
                hidden={hidden}
                color={diff === 0 ? 'var(--color-success)' : diff > 0 ? 'var(--color-accent-amber)' : 'var(--color-danger)'}
                bold
              />
            </>
          )}
          {showClosing && !closingState.done && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                {selfCheck
                  ? (label('today.cash-i-counted', lang))
                  : (label('today.cash-in-hand-2', lang))}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="number"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1, minHeight: 36, padding: '4px 10px',
                    border: '1px solid var(--color-bg-disabled)', borderRadius: 8,
                    fontSize: 13, fontWeight: 700, outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = Number(cashInput) || 0;
                    onClose?.({ cashInHand: val, cashVariance: cashYouShouldHave - val });
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: 'var(--color-primary)', color: 'var(--color-bg-white)',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  {selfCheck
                    ? (label('today.check', lang))
                    : (label('today.close', lang))}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, hidden, color, bold }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '3px 0',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{
        fontSize: 13,
        fontWeight: bold ? 800 : 700,
        color: color || 'var(--color-text)',
      }}>
        {hidden ? '••••' : `ETB ${fmt(value || 0)}`}
      </span>
    </div>
  );
}
