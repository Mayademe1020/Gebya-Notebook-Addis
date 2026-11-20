import { useState, useMemo } from 'react';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import { formatEthiopianTime } from '../utils/ethiopianCalendar';
import { label } from '../labels/index.js';

const FILTERS = ['all', 'sale', 'expense', 'collection', 'credit'];

export default function TimelineView({
  reportRows,
  lang,
  handleExport,
  onEdit,
}) {
  const { hidden } = usePrivacy();
  const [activeFilter, setActiveFilter] = useState('all');

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return reportRows;
    return reportRows.filter(r => r.report_kind === activeFilter);
  }, [reportRows, activeFilter]);

  const filterLabels = {
    all: label('history.all', lang),
    sale: label('history.sales', lang),
    expense: label('history.expenses', lang),
    collection: label('history.collections', lang),
    credit: label('history.credit', lang),
  };

  const kindEmoji = {
    sale: '🛒',
    expense: '📤',
    collection: '👤',
    credit: '📝',
  };

  const paymentLabel = (row) => {
    const method = row.payment_type || (row.report_kind === 'collection' ? 'cash' : 'cash');
    if (method === 'partial') return `${label('history.partial', lang)}${row.payment_provider ? ` · ${row.payment_provider}` : ''}`;
    if (method === 'telebirr') return 'Telebirr';
    if (method === 'cbe' || method === 'cbebirr') return 'CBE';
    if (method === 'bank') return 'Bank';
    return label('history.cash', lang);
  };

  return (
    <div style={{ marginTop: 4 }}>
      {/* Export — text search lives in the notebook's main search
          (one search for everything: entries, customers, items). */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          onClick={handleExport}
          style={{
            minHeight: 36, padding: '4px 12px',
            border: '1px solid var(--color-bg-disabled)', borderRadius: 10,
            background: 'var(--color-surface)', fontSize: 11, fontWeight: 800,
            color: 'var(--color-text-muted)', cursor: 'pointer',
          }}
        >
          {label('history.export', lang)}
        </button>
      </div>

      {/* Filter chips — counts help semi-literate users scan at a glance */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const count = f === 'all'
            ? reportRows.length
            : reportRows.filter(r => r.report_kind === f).length;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={activeFilter === f}
              onClick={() => setActiveFilter(f)}
              style={{
                padding: '5px 11px',
                borderRadius: 999,
                border: 'none',
                background: activeFilter === f ? 'var(--color-primary)' : 'var(--color-bg-hover)',
                color: activeFilter === f ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                minHeight: 30,
              }}
            >
              {filterLabels[f]} {count > 0 ? `· ${count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-soft)', textAlign: 'center', padding: '20px 0' }}>
          {label('history.no-entries-yet', lang)}
        </p>
      ) : (
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          {filtered.map((row, i) => (
            <div key={row.report_id || row.id || i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 14px',
              minHeight: 44,
              boxSizing: 'border-box',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--color-bg-hover)' : 'none',
              cursor: onEdit ? 'pointer' : 'default',
            }}
              onClick={() => onEdit?.(row)}
            >
              <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>
                {kindEmoji[row.report_kind] || '📄'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {row.title || row.item_name || row.customer_name || (label('history.record', lang))}
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-soft)', marginTop: 1 }}>
                  {row.created_at ? formatEthiopianTime(row.created_at) : ''}
                  {row.actor_name ? ` · ${row.actor_name}` : ''}
                  {` · ${paymentLabel(row)}`}
                </p>
              </div>
              <span style={{
                fontSize: 14,
                fontWeight: 800,
                color: row.report_kind === 'expense' ? 'var(--color-danger)' : 'var(--color-success)',
                flexShrink: 0,
              }}>
                {hidden ? '••••' : `${fmt(row.amount || 0)} ETB`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
