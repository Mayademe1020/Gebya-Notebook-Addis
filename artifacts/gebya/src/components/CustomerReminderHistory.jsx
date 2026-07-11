// CustomerReminderHistory.jsx — collapsible per-customer reminder history
//
// Embedded in CustomerDetail.jsx. Shows reminder send history for one customer.
// Default collapsed (summary line only). Tap to expand and load details.
// Uses remindersApi instead of raw fetch.

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { remindersApi } from '../api/reminders';

const STATUS_CONFIG = {
  sent:    { en: 'Sent',    am: 'ተልኳል',    bg: '#ecfdf5', border: '#86efac', color: '#166534' },
  queued:  { en: 'Queued',  am: 'በመጠባበቅ',  bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  failed:  { en: 'Failed',  am: 'አልተሳካም',  bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
  skipped: { en: 'Skipped', am: 'ተሻረ',     bg: '#f9fafb', border: '#e5e7eb', color: '#6b7280' },
};

function formatDate(ts, lang) {
  if (!ts) return '—';
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString(lang === 'am' ? 'am-ET' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString(lang === 'am' ? 'am-ET' : 'en-US', {
    hour: '2-digit', minute: '2-digit',
  });
  return `${dateStr} ${timeStr}`;
}

function daysAgo(ts, lang) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - Number(ts)) / (1000 * 60 * 60 * 24));
  if (days <= 0) return lang === 'am' ? 'ዛሬ' : 'today';
  if (days === 1) return lang === 'am' ? 'ከ1 ቀን በፊት' : '1d ago';
  return lang === 'am' ? `ከ${days} ቀን በፊት` : `${days}d ago`;
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
      setError(err.message || (lang === 'am' ? 'ማስታወሻ ታሪክ መጫን አልተቻለም' : 'Failed to load reminder history'));
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
    ? (lang === 'am' ? 'ምንም ማስታወሻ አልተላከም' : 'No reminders sent')
    : lang === 'am'
      ? `${total} ማስታወሻ ተልኳል${lastSentLabel ? ` · መጨረሻ: ${lastSentLabel}` : ''}`
      : `${total} reminder${total !== 1 ? 's' : ''} sent${lastSentLabel ? ` · last: ${lastSentLabel}` : ''}`;

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #ece6d6',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Collapsible header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={lang === 'am' ? 'የማስታወሻ ታሪክ' : 'Reminder history'}
        className="w-full text-left flex items-center justify-between gap-2 press-scale"
        style={{
          padding: '10px 14px',
          background: expanded ? '#faf8f3' : 'transparent',
          borderBottom: expanded ? '1px solid #f5f1ea' : 'none',
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
              color: '#6b7280',
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
              background: '#f0fdf4', color: '#166534',
              padding: '2px 6px', borderRadius: 999,
            }}>
              {sentCount}/{total}
            </span>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4" style={{ color: '#9ca3af' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: '#9ca3af' }} />
          }
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '8px 0' }}>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1B4332', borderTopColor: 'transparent' }} />
            </div>
          )}

          {error && (
            <div style={{ margin: '0 14px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
              {lang === 'am' ? 'ስህተት፦ ' : 'Error: '}{error}
              <button
                onClick={fetchHistory}
                style={{ marginLeft: 8, color: '#1B4332', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
              >
                {lang === 'am' ? 'እንደገና ሞክር' : 'Retry'}
              </button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-4">
              <p style={{ fontSize: 12, color: '#9ca3af' }}>
                {lang === 'am' ? 'ምንም ማስታወሻ ታሪክ የለም' : 'No reminder history'}
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
                      borderBottom: '1px solid #f5f1ea',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                        {formatDate(entry.sentAt, lang)}
                      </p>
                      {entry.failureReason && (
                        <p style={{ fontSize: 10, color: '#dc2626', marginTop: 1, wordBreak: 'break-word' }}>
                          {lang === 'am' ? 'ስህተት፦ ' : 'Error: '}{entry.failureReason}
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
                  background: '#1B4332',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                🔔 {lang === 'am' ? 'ማስታወሻ ላክ' : 'Send reminder'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
