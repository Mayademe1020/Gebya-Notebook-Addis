import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Clock } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { fmt } from '../utils/numformat';
import { label } from '../labels/index';

const EXAMPLE_PROMPTS = [
  { en: "Where is Abebe's credit?", am: 'የአበበ ዱቤ የት አለ?' },
  { en: 'Did I sell sugar yesterday?', am: 'ትናንት ስኳር ሸጥኩ?' },
  { en: 'Show all Telebirr payments', am: 'ሁሉንም የቴሌብር ክፍያ አሳይ' },
  { en: 'How much did I spend this week?', am: 'በዚህ ሳምንት ምን ያህል አወጣሁ?' },
  { en: "Who still hasn't paid?", am: 'ማን ገና አልከፈለም?' },
  { en: 'Find last oil purchase', am: 'የመጨረሻውን የዘይት ግዢ ፈልግ' },
];

export default function SearchSheet({
  transactions = [],
  ledgerTransactions = [],
  customers = [],
  catalogEntries = [],
  onClose,
  lang = 'en',
}) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [timeScope, setTimeScope] = useState('any');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const allResults = [];

    for (const tx of transactions) {
      const itemName = String(tx.item_name || tx.item_note || '').toLowerCase();
      const amount = String(tx.amount || '');
      const customerName = String(tx.customer_name || '').toLowerCase();
      const note = String(tx.note || '').toLowerCase();
      if (itemName.includes(q) || amount.includes(q) || customerName.includes(q) || note.includes(q)) {
        allResults.push({
          id: `tx-${tx.id}`,
          type: tx.type === 'expense' ? 'expense' : 'sale',
          kind: tx.type === 'expense' ? 'expense' : 'sale',
          label: tx.item_name || tx.item_note || (tx.type === 'expense' ? 'Expense' : 'Sale'),
          subtitle: tx.customer_name || '',
          amount: tx.amount || 0,
          time: tx.created_at,
          payment_type: tx.payment_type,
          icon: tx.type === 'expense' ? '📤' : '🛒',
        });
      }
    }

    for (const entry of ledgerTransactions) {
      const itemName = String(entry.item_note || '').toLowerCase();
      const amount = String(entry.amount || '');
      const customerName = String(entry.customer_name || '').toLowerCase();
      if (itemName.includes(q) || amount.includes(q) || customerName.includes(q)) {
        allResults.push({
          id: `ct-${entry.id}`,
          type: entry.type === 'payment' ? 'collection' : 'credit',
          kind: entry.type === 'payment' ? 'collection' : 'credit',
          label: entry.item_note || 'Credit',
          subtitle: entry.customer_name || '',
          amount: entry.amount || 0,
          time: entry.created_at,
          icon: entry.type === 'payment' ? '💰' : '📝',
        });
      }
    }

    for (const c of customers) {
      const name = String(c.display_name || c.name || '').toLowerCase();
      const phone = String(c.phone_number || c.phone || '').toLowerCase();
      const note = String(c.note || '').toLowerCase();
      if (name.includes(q) || phone.includes(q) || note.includes(q)) {
        allResults.push({
          id: `c-${c.id}`,
          type: 'customer',
          label: c.display_name || c.name || 'Customer',
          subtitle: c.phone_number || '',
          balance: c.balance || 0,
          icon: '👤',
        });
      }
    }

    for (const item of catalogEntries) {
      const name = String(item.name || '').toLowerCase();
      const code = String(item.code || item.sku || '').toLowerCase();
      if (name.includes(q) || code.includes(q)) {
        allResults.push({
          id: `cat-${item.id}`,
          type: 'item',
          label: item.name,
          subtitle: item.default_price ? `${fmt(item.default_price)} ETB` : '',
          icon: '📦',
        });
      }
    }

    return allResults.slice(0, 40);
  }, [query, transactions, ledgerTransactions, customers, catalogEntries]);

  const filteredResults = useMemo(() => {
    let out = results;
    if (activeFilter !== 'all') {
      out = out.filter(r => r.type === activeFilter);
    }
    if (timeScope !== 'any') {
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const start = timeScope === 'week'
        ? (() => { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.getTime(); })()
        : (() => { const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); })();
      out = out.filter(r => !r.time || Number(r.time) >= start);
    }
    return out;
  }, [results, activeFilter, timeScope]);

  const filters = [
    { id: 'all', label: label('customers.all', lang) },
    { id: 'sale', label: label('customers.sales', lang) },
    { id: 'expense', label: label('customers.expenses', lang) },
    { id: 'credit', label: label('customers.credit', lang) },
    { id: 'collection', label: label('customers.collections', lang) },
    { id: 'customer', label: label('customers.customers', lang) },
    { id: 'item', label: label('customers.items-2', lang) },
  ];

  const scopes = [
    { id: 'any', label: label('customers.any-time', lang) },
    { id: 'week', label: label('customers.this-week', lang) },
    { id: 'month', label: label('customers.this-month', lang) },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: '0 0 20px 20px',
          padding: '20px 16px 16px',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-bg-hover)',
            borderRadius: 12,
            padding: '8px 12px',
          }}>
            <Search className="w-4 h-4" style={{ color: 'var(--color-text-soft)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={label('customers.ask-your-notebook', lang)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                fontSize: 15,
                fontWeight: 600,
                outline: 'none',
                color: 'var(--color-text)',
                minHeight: 24,
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2 }}>
                <X className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />
              </button>
            )}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>
            {label('customers.cancel-2', lang)}
          </button>
        </div>

        {!query ? (
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              {label('customers.try-asking', lang)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuery(lang === 'am' ? prompt.am : prompt.en)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 10,
                    background: 'var(--color-surface-subtle)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-text)',
                  }}
                >
                  <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-text-soft)', flexShrink: 0 }} />
                  <span>{lang === 'am' ? prompt.am : prompt.en}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Time scope — one search covers all history by default,
                narrowable to this week or month */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 6, overflowX: 'auto' }}>
              {scopes.map(s => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={timeScope === s.id}
                  onClick={() => setTimeScope(s.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: timeScope === s.id ? '1px solid var(--color-primary)' : '1px solid var(--color-bg-disabled)',
                    background: timeScope === s.id ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: timeScope === s.id ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🕐 {s.label}
                </button>
              ))}
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto' }}>
              {filters.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeFilter === f.id ? 'var(--color-primary)' : 'var(--color-bg-hover)',
                    color: activeFilter === f.id ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Results */}
            {query && filteredResults.length > 0 && (
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-text-soft)', margin: '0 0 4px' }}>
                {filteredResults.length} {label('customers.found', lang)}
              </p>
            )}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <p style={{ fontSize: 24, marginBottom: 8 }}>🔍</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    {label('customers.no-results-found', lang)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-soft)', marginTop: 4 }}>
                    {label('customers.try-a-different-search-term', lang)}
                  </p>
                </div>
              ) : (
                filteredResults.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 8px',
                      borderBottom: i < filteredResults.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (r.type === 'customer') {
                        window.dispatchEvent(new CustomEvent('gebya:navigate', { detail: { tab: 'credit', customerId: r.id.replace('c-', '') } }));
                        onClose();
                      }
                    }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--color-text-soft)', marginTop: 1 }}>
                        {r.subtitle || (r.time ? new Date(r.time).toLocaleDateString() : '')}
                        {r.payment_type && ` · ${r.payment_type}`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {r.amount != null && (
                        <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--color-text)' }}>
                          {fmt(r.amount)}
                        </p>
                      )}
                      {r.balance != null && (
                        <p style={{ fontSize: 12, fontWeight: 700, color: r.balance > 0 ? 'var(--color-accent-amber)' : 'var(--color-text-soft)' }}>
                          {fmt(r.balance)} {label('customers.etb', lang)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
