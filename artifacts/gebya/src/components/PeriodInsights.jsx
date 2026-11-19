import { useMemo } from 'react';
import { fmt } from '../utils/numformat';
import { label } from '../labels/index';

// PeriodInsights — "How was this period?" for Week / Month / Custom views.
//
// Three glanceable, chart-free pieces (built for low-literacy users):
//   1. Verdict  — one plain sentence vs the previous period
//   2. Day strip — per-day totals for the week; best day gets 🏆;
//      tapping a day jumps to that day
//   3. Top items — ranked list of what sold most (icon + name + amount)

const TONE_STYLES = {
  positive: { bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', icon: '📈' },
  warning: { bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)', icon: '📉' },
  neutral: { bg: 'var(--color-surface)', border: 'var(--color-border)', icon: '📊' },
};

export default function PeriodInsights({
  verdict = null,
  days = [],
  topItems = [],
  lang = 'en',
  onPickDay,
}) {
  const bestDay = useMemo(() => {
    if (!days.length) return null;
    return days.reduce((best, d) => (d.total > (best?.total ?? -1) ? d : best), null);
  }, [days]);

  const hasAnything = Boolean(verdict?.text) || days.length > 0 || topItems.length > 0;
  if (!hasAnything) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {/* 1. Verdict sentence */}
      {verdict?.text && (() => {
        const tone = TONE_STYLES[verdict.tone] || TONE_STYLES.neutral;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 12,
            background: tone.bg, border: `1px solid ${tone.border}`,
          }}>
            <span aria-hidden="true" style={{ fontSize: 16 }}>{tone.icon}</span>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.4 }}>
              {verdict.text}
            </p>
          </div>
        );
      })()}

      {/* 2. Day-by-day strip (week view) */}
      {days.length > 0 && (
        <div style={{
          marginTop: 8, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden',
        }} role={onPickDay ? 'list' : undefined}>
          {days.map((d, i) => (
            <div
              key={d.start}
              role={onPickDay ? 'listitem' : undefined}
              onClick={onPickDay ? () => onPickDay(d.start) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', minHeight: 40, boxSizing: 'border-box',
                borderBottom: i < days.length - 1 ? '1px solid var(--color-bg-hover)' : 'none',
                cursor: onPickDay ? 'pointer' : 'default',
                background: bestDay && d.start === bestDay.start ? 'var(--color-success-bg)' : 'transparent',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', width: 92, flexShrink: 0 }}>
                {d.isToday ? `📍 ${d.label}` : d.label}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-soft)', flex: 1 }}>
                {d.sub || ''}
              </span>
              {bestDay && d.start === bestDay.start && bestDay.total > 0 && (
                <span aria-hidden="true" style={{ fontSize: 13 }}>🏆</span>
              )}
              <span style={{
                fontSize: 13, fontWeight: 800,
                color: d.total < 0 ? 'var(--color-danger)' : d.total === 0 ? 'var(--color-text-soft)' : 'var(--color-success)',
                flexShrink: 0,
              }}>
                {fmt(d.total)} ETB
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 3. Top items */}
      {topItems.length > 0 && (
        <div style={{
          marginTop: 8, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: 12,
          padding: '10px 14px',
        }}>
          <p style={{
            fontSize: 10, fontWeight: 900, color: 'var(--color-text-soft)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
          }}>
            🏅 {label('today.top-sellers', lang)}
          </p>
          {topItems.map((item, i) => (
            <div key={`${item.name}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
            }}>
              <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>
                {['🥇', '🥈', '🥉'][i] || '🏅'}
              </span>
              <p style={{
                fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.name}
              </p>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                {fmt(item.revenue)} ETB
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
