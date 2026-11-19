import { fmt } from '../utils/numformat';
import { label } from '../labels/index.js';

// MoneyFlowBar — "Where is my money?" at a glance.
//
// Designed for low-literacy users using triple coding:
// every segment carries an icon + colour + word + amount, so the
// message survives even if one channel is missed.
// Pure CSS — no chart library needed.

const SEGMENTS = [
  { key: 'cash', icon: '💵', colorKey: 'cash' },
  { key: 'digital', icon: '📱', colorKey: 'digital' },
  { key: 'owed', icon: '📝', colorKey: 'owed' },
];

const COLORS = {
  cash: { bar: 'var(--color-success)', soft: 'var(--color-success-bg)' },
  digital: { bar: 'var(--color-accent-amber)', soft: 'var(--color-warning-bg)' },
  owed: { bar: 'var(--color-danger)', soft: 'var(--color-danger-bg)' },
};

export default function MoneyFlowBar({ cash = 0, digital = 0, owed = 0, lang = 'en' }) {
  const values = { cash, digital, owed };
  const total = cash + digital + owed;

  const labels = {
    cash: label('today.cash', lang),
    digital: label('today.digital', lang),
    owed: label('today.owed', lang),
  };

  if (total <= 0) return null;

  return (
    <div style={{ marginTop: 2 }} role="img" aria-label={
      label('today.cash-digital-owed-etb', lang, fmt(cash), fmt(digital), fmt(owed))
    }>
      {/* The proportion strip */}
      <div style={{
        display: 'flex',
        height: 12,
        borderRadius: 999,
        overflow: 'hidden',
        border: '1px solid var(--color-border-light)',
      }}>
        {SEGMENTS.filter(s => values[s.key] > 0).map(s => (
          <div
            key={s.key}
            style={{
              width: `${(values[s.key] / total) * 100}%`,
              background: COLORS[s.colorKey].bar,
              minWidth: 8,
            }}
          />
        ))}
      </div>

      {/* Legend: icon + word + amount for each bucket */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {SEGMENTS.map(s => {
          const c = COLORS[s.colorKey];
          return (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: c.soft, borderRadius: 8, padding: '3px 8px',
            }}>
              <span aria-hidden="true" style={{ fontSize: 13 }}>{s.icon}</span>
              <span style={{
                width: 8, height: 8, borderRadius: 999, background: c.bar, flexShrink: 0,
              }} />
              <div style={{ lineHeight: 1.15 }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: 'var(--color-text-soft)', letterSpacing: '0.04em' }}>
                  {labels[s.key].toUpperCase()}
                </p>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text)' }}>
                  {fmt(values[s.key])} ETB
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
