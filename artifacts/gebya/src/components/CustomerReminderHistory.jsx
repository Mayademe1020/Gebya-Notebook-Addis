// CustomerReminderHistory.jsx — collapsible per-customer reminder history
//
// Embedded in CustomerDetail.jsx. Shows reminder send history for one customer.
// Default collapsed (summary line only). Tap to expand and load details.
// Uses remindersApi instead of raw fetch.

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { remindersApi } from '../api/reminders';
import { formatEthiopianTime } from '../utils/ethiopianCalendar';
import { formatDaysAgo } from '../utils/durationFormat';
import { label } from '../labels/index';

const STATUS_CONFIG = {
  sent:    { en: 'Sent',    am: 'ተልኳል',    bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', color: 'var(--color-success-text)' },
  queued:  { en: 'Queued',  am: 'በመጠባበቅ',  bg: 'var(--color-info-bg)', border: 'var(--color-info-border)', color: 'var(--color-info)' },
  failed:  { en: 'Failed',  am: 'አልተሳካም',  bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)', color: 'var(--color-danger-text)' },
  skipped: { en: 'Skipped', am: 'ተሻረ',     bg: 'var(--color-bg-active)', border: 'var(--color-bg-disabled)', color: 'var(--color-text-muted)' },
};

function formatDate(ts, lang) {
  if (!ts) return '—';
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString(label('credit.en-us', lang), {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const timeStr = formatEthiopianTime(ts);
  return `${dateStr} ${timeStr}`;
}

function daysAgo(ts, lang) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - Number(ts)) / (1000 * 60 * 60 * 24));
  if (days <= 0) return label('credit.today', lang);
  return formatDaysAgo(days, lang);
}

export default function CustomerReminderHistory({ customerId, shopId, lang, onResend }) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!customerId || !shopId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await remindersApi.getHistory({
        shopId,
        customerId,
        limit: 10,
        offset: 0,
      });
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || (label('credit.failed-to-load-reminder-history', lang)));
    } finally {
      setLoading(false);
    }
  }, [customerId, shopId, lang]);

  // Load on expand
  useEffect(() => {
    if (expanded && entries.length === 0 && !loading) {
      fetchHistory();
    }
  }, [expanded, entries.length, loading, fetchHistory]);

  const sentCount = entries.filter(e => e.status === 'sent').length;
  const failedCount = entries.filter(e => e.status === 'failed').length;
  const lastEntry = entries.length > 0 ? entries[0] : null;
  const lastSentAt = lastEntry?.sentAt;
  const lastSentLabel = lastSentAt ? daysAgo(lastSentAt, lang) : null;

  // Summary line (always visible)
  const summaryText = total === 0
    ? (label('credit.no-reminders-sent', lang))
    : label('credit.reminder-sent', lang, () => total, () => total !== 1 ? 's' : '', () => lastSentLabel ? ` · last: ${lastSentLabel}` : '', () => lastSentLabel ? ` · መጨረሻ: ${lastSentLabel}` : '');

  // When empty and collapsed, render as a subtle muted line (not a card) so it
  // doesn't compete with the customer's financial activity.
  const isEmptyCollapsed = total === 0 && !expanded;

  // When there's no reminder history and the widget isn't expanded, render
  // nothing — a bare "No reminders sent" line just clutters the detail view.
  // (Sending a reminder is still reachable from the action row / More sheet.)
  if (total === 0 && !expanded) return null;

  return (
    <div
      style={{
        background: isEmptyCollapsed ? 'transparent' : 'var(--color-surface)',
        border: isEmptyCollapsed ? 'none' : '1px solid var(--color-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Collapsible header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={label('credit.reminder-history', lang)}
        className="w-full text-left flex items-center justify-between gap-2 press-scale"
        style={{
          padding: '10px 14px',
          background: expanded ? 'var(--color-surface-soft)' : 'transparent',
          borderBottom: expanded ? '1px solid var(--color-surface-muted)' : 'none',
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: '0.75rem' }}>🔔</span>
          <span
            role="status"
            style={{
              fontSize: '0.72rem', fontWeight: 700,
              color: isEmptyCollapsed ? 'var(--color-text-soft)' : 'var(--color-text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {summaryText}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {total > 0 && (
            <span style={{
              fontSize: '0.6rem', fontWeight: 700,
              background: 'var(--color-success-bg)', color: 'var(--color-success-text)',
              padding: '2px 6px', borderRadius: 999,
            }}>
              {sentCount}/{total}
            </span>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />
          }
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '8px 0' }}>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
            </div>
          )}

          {error && (
            <div style={{ margin: '0 14px', padding: '8px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-danger-text)', fontWeight: 600 }}>
              {label('credit.error', lang)}{error}
              <button
                onClick={fetchHistory}
                style={{ marginLeft: 8, color: 'var(--color-primary)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
              >
                {label('credit.retry', lang)}
              </button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-4">
              <p style={{ fontSize: 12, color: 'var(--color-text-soft)' }}>
                {label('credit.no-reminder-history', lang)}
              </p>
            </div>
          )}

          {!loading && entries.length > 0 && (
            <div>
              {entries.map((entry) => {
                const st = STATUS_CONFIG[entry.status] || STATUS_CONFIG.queued;
                return (
                  <div
                    key={entry.id}
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--color-surface-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {formatDate(entry.sentAt, lang)}
                      </p>
                      {entry.failureReason && (
                        <p style={{ fontSize: 10, color: 'var(--color-danger)', marginTop: 1, wordBreak: 'break-word' }}>
                          {label('credit.error', lang)}{entry.failureReason}
                        </p>
                      )}
                    </div>
                    <span
                      role="alert"
                      style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 999,
                        background: st.bg, color: st.color,
                        border: `1px solid ${st.border}`,
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      {lang === 'am' ? st.am : st.en}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resend button */}
          {!loading && (
            <div style={{ padding: '8px 14px' }}>
              <button
                type="button"
                onClick={() => onResend?.()}
                className="w-full press-scale"
                style={{
                  padding: '8px 12px',
                  background: 'var(--color-primary)',
                  color: 'var(--color-bg-white)',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                🔔 {label('credit.send-reminder', lang)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
