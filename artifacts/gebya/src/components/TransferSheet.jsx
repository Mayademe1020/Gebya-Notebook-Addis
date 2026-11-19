import { useState, useMemo } from 'react';
import { X, Search, ArrowRightLeft } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { label } from '../labels/index';

export default function TransferSheet({
  sourceCustomer,
  customers = [],
  onSave,
  onClose,
}) {
  const { lang } = useLang();
  const [targetQuery, setTargetQuery] = useState('');
  const [targetCustomer, setTargetCustomer] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const sourceBalance = Math.max(Number(sourceCustomer?.balance || 0), 0);

  const filteredTargets = useMemo(() => {
    if (!targetQuery.trim()) return [];
    const q = targetQuery.toLowerCase();
    return customers.filter(c =>
      c.id !== sourceCustomer?.id
      && (c.display_name || c.name || '').toLowerCase().includes(q)
    ).slice(0, 6);
  }, [customers, targetQuery, sourceCustomer]);

  const rawAmount = parseInput(amount);
  const isValidAmount = rawAmount > 0 && rawAmount <= sourceBalance;
  const canSave = targetCustomer && isValidAmount && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        sourceCustomerId: sourceCustomer.id,
        targetCustomerId: targetCustomer.id,
        amount: rawAmount,
        sourceName: sourceCustomer.display_name || sourceCustomer.name || '',
        targetName: targetCustomer.display_name || targetCustomer.name || '',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'gebya-fade-in 0.15s ease',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--color-surface)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.25)',
          animation: 'gebya-slide-up 0.25s ease',
        }}
      >
        <div style={{ width: 38, height: 4, background: 'var(--color-bg-disabled)', borderRadius: 999, margin: '10px auto 0', flexShrink: 0 }} />

        <div style={{
          padding: '8px 16px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
            <ArrowRightLeft className="w-4 h-4" style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: 'var(--color-accent-amber)' }} />
            {label('sales.transfer-credit', lang)}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--color-bg-hover)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Source customer */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--color-text-soft)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              {label('sales.from', lang)}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: 'var(--color-surface-subtle)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--color-primary)', color: 'var(--color-bg-white)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
              }}>
                {(sourceCustomer?.display_name || sourceCustomer?.name || '?')[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {sourceCustomer?.display_name || sourceCustomer?.name}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  {label('sales.current-balance', lang)}: {fmt(sourceBalance)} {label('sales.birr', lang)}
                </p>
              </div>
            </div>
          </div>

          {/* Target customer search */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--color-text-soft)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              {label('sales.to', lang)}
            </p>
            {targetCustomer ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--color-success)', background: 'var(--color-success-bg)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--color-success)', color: 'var(--color-bg-white)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
                }}>
                  {(targetCustomer.display_name || targetCustomer.name || '?')[0]}
                </div>
                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {targetCustomer.display_name || targetCustomer.name}
                </span>
                <button
                  type="button"
                  onClick={() => { setTargetCustomer(null); setTargetQuery(''); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                >
                  <X className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />
                </button>
              </div>
            ) : (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: '1px solid var(--color-bg-disabled)', borderRadius: 10,
                  padding: '6px 10px', minHeight: 38,
                }}>
                  <Search className="w-4 h-4" style={{ color: 'var(--color-text-soft)', flexShrink: 0 }} />
                  <input
                    type="text"
                    value={targetQuery}
                    onChange={e => setTargetQuery(e.target.value)}
                    placeholder={label('sales.type-customer-name-2', lang)}
                    style={{
                      flex: 1, border: 'none', outline: 'none', fontSize: '0.8rem',
                      fontWeight: 600, color: 'var(--color-text)',
                      background: 'transparent', minHeight: 28,
                    }}
                  />
                </div>
                {filteredTargets.length > 0 && (
                  <div style={{
                    marginTop: 4, border: '1px solid var(--color-border)', borderRadius: 10,
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    {filteredTargets.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setTargetCustomer(c); setTargetQuery(''); }}
                        style={{
                          width: '100%', padding: '10px 12px', textAlign: 'left',
                          border: 'none', borderBottom: '1px solid var(--color-bg-hover)',
                          background: 'var(--color-surface)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)',
                          minHeight: 44,
                        }}
                      >
                        <span>{c.display_name || c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--color-text-soft)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              {label('sales.amount', lang)}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${isValidAmount ? 'var(--color-success)' : 'var(--color-bg-disabled)'}`,
              borderRadius: 10, padding: '6px 12px', minHeight: 44,
            }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                {label('sales.birr', lang)}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(fmtInput(e.target.value))}
                placeholder="0"
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: '1.1rem',
                  fontWeight: 800, color: 'var(--color-text)', textAlign: 'right',
                  background: 'transparent', minHeight: 36,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
            {sourceBalance > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[Math.round(sourceBalance), Math.round(sourceBalance / 2)].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(fmtInput(String(v)))}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-bg-disabled)',
                      background: 'var(--color-bg-active)', fontSize: '0.72rem', fontWeight: 600,
                      color: 'var(--color-text)', cursor: 'pointer', minHeight: 30,
                    }}
                  >
                    {fmt(v)}
                  </button>
                ))}
              </div>
            )}
            {rawAmount > sourceBalance && (
              <p style={{ fontSize: '0.7rem', color: 'var(--color-danger)', marginTop: 4 }}>
                {label('sales.amount-exceeds-available-balance', lang)}
              </p>
            )}
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              border: 'none', fontSize: '0.85rem', fontWeight: 800,
              background: canSave ? 'var(--color-primary)' : 'var(--color-bg-disabled)',
              color: canSave ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
              cursor: canSave ? 'pointer' : 'not-allowed',
              minHeight: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving ? (label('sales.transferring', lang)) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                {label('sales.transfer-credit-2', lang)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}