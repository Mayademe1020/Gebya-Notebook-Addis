import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';

export default function TodayBusiness({
  metrics,
  closingState,
  lang,
  onClose,
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
  const cashYouShouldHave = cashExpected + collections - expenses;
  const diff = closingState.done ? (cashYouShouldHave - (closingState.cashInHand || 0)) : null;

  const H = v => hidden ? '••••' : fmt(v);

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #ece6d6',
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
          <p style={{ fontSize: 20, fontWeight: 950, color: '#1a1a1a', lineHeight: 1.1 }}>
            ETB {H(total)}
          </p>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginTop: 2 }}>
            {lang === 'am'
              ? `ዛሬ ጠቅላላ ሽያጭ${staffCount > 0 ? ` (${staffCount + 1} ሰው)` : ''}`
              : `Total sales${staffCount > 0 ? ` (you + ${staffCount} staff)` : ''}`}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: '#9ca3af' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#9ca3af' }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
          <Row label={lang === 'am' ? '💵 ጥሬ ገንዘብ' : '💵 Cash'} value={cashExpected} hidden={hidden} />
          <Row label={lang === 'am' ? '📱 ዲጂታል' : '📱 Digital'} value={digital} hidden={hidden} />
          <Row label={lang === 'am' ? '📤 ወጪ' : '📤 Expenses'} value={expenses} hidden={hidden} color="#dc2626" />
          <Row label={lang === 'am' ? '💰 የዕዳ መሰብሰብ' : '💰 Collections'} value={collections} hidden={hidden} />
          <div style={{ height: 1, background: '#e5e7eb', margin: '6px 0' }} />
          <Row label={lang === 'am' ? '💵 ሊኖርህ የሚገባ ገንዘብ' : '💵 Cash you should have'} value={cashYouShouldHave} hidden={hidden} bold />
          {closingState.done && (
            <>
              <Row label={lang === 'am' ? '↓ በእጅህ ያለ ገንዘብ' : '↓ Cash in hand'} value={closingState.cashInHand || 0} hidden={hidden} />
              <Row
                label={lang === 'am' ? '📊 ልዩነት' : '📊 Difference'}
                value={diff}
                hidden={hidden}
                color={diff === 0 ? '#059669' : diff > 0 ? '#d97706' : '#dc2626'}
                bold
              />
            </>
          )}
          {!closingState.done && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', display: 'block', marginBottom: 4 }}>
                {lang === 'am' ? 'በእጅህ ያለ ገንዘብ' : 'Cash in hand'}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="number"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1, minHeight: 36, padding: '4px 10px',
                    border: '1px solid #e5e7eb', borderRadius: 8,
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
                    background: '#1B4332', color: '#fff',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  {lang === 'am' ? 'ዝጋ' : 'Close'}
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
      <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>{label}</span>
      <span style={{
        fontSize: 13,
        fontWeight: bold ? 800 : 700,
        color: color || '#1f2937',
      }}>
        {hidden ? '••••' : `ETB ${fmt(value || 0)}`}
      </span>
    </div>
  );
}
