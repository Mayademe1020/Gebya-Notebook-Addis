// TransactionDetailSheet.jsx — Bottom-sheet modal showing full transaction detail.
//
// Opens when a user taps a transaction row in CustomerDetail or SupplierDetail.
// Provides Edit and Delete actions with a delete confirmation step.
//
// Props:
//   transaction   — the transaction object (tx)
//   type          — 'customer' | 'supplier'
//   lang          — current language
//   onClose       — close the sheet
//   onEdit        — (tx) => void — open edit form
//   onDelete      — (tx) => void — delete the transaction

import { useEffect, useState } from 'react';
import { X, Pencil, Trash2, Calendar, User, Wallet, ChevronDown, ChevronUp, Image } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { formatEthiopian, formatEthiopianTime } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';
import { label } from '../labels/index.js';

function TransactionDetailSheet({ transaction, type = 'customer', lang: langProp, onClose, onEdit, onDelete, customerBalance }) {
  const { lang } = useLang();
  const currentLang = langProp || lang;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedItems, setExpandedItems] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!transaction) return null;

  const tx = transaction;
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const items = Array.isArray(tx.items) && tx.items.length > 0 ? tx.items : null;
  const settlementMode = tx.settlement_mode || null;
  const hasPhoto = tx.photo || (Array.isArray(tx.photos) && tx.photos.length > 0);
  const photoList = hasPhoto
    ? (Array.isArray(tx.photos) ? tx.photos.map(p => p.dataUrl || p) : [tx.photo])
    : [];
  const hasQuantity = !isPayment && tx.quantity > 0;

  const typeLabel = isPayment
    ? (label('sales.payment', currentLang))
    : (label('sales.credit', currentLang));
  const typeColor = isPayment ? 'var(--color-success-text)' : 'var(--color-accent-amber)';
  const amountColor = isPayment ? 'var(--color-success-text)' : 'var(--color-accent-amber)';
  const sign = isPayment ? '−' : '+';

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
        {/* Drag handle */}
        <div style={{ width: 38, height: 4, background: 'var(--color-bg-disabled)', borderRadius: 999, margin: '10px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          padding: '8px 16px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
            {label('sales.transaction-detail', currentLang)}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>

          {/* Hero: type badge + amount + date */}
          <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid var(--color-bg-hover)' }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em',
              background: isPayment ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
              color: isPayment ? 'var(--color-success-text)' : 'var(--color-warning)',
              marginBottom: 8,
            }}>
              {typeLabel}
            </span>
            <p style={{
              fontFamily: 'Manrope, system-ui, sans-serif',
              fontSize: '1.75rem', fontWeight: 800,
              color: amountColor,
              lineHeight: 1, margin: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {sign}{fmt(tx.amount || 0)}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginTop: 4 }}>
              {label('sales.birr', currentLang)}
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 8,
              padding: '4px 10px', borderRadius: 8,
              background: 'var(--color-bg-active)', border: '1px solid var(--color-bg-hover)',
            }}>
              <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--color-text-soft)' }} />
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text)', fontWeight: 600 }}>
                {formatEthiopian(tx.created_at)} · {formatEthiopianTime(tx.created_at)}
              </span>
            </div>
          </div>

          {/* Detail rows */}
          <div style={{ padding: '12px 0' }}>

            {/* Description / Note */}
            {tx.item_note && (
              <div style={{
                padding: '10px 12px', marginBottom: 10,
                background: 'var(--color-surface-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 10,
              }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--color-text-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                  {label('sales.description-note', currentLang)}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', lineHeight: 1.4, margin: 0 }}>
                  {tx.item_note}
                </p>
              </div>
            )}

            {/* Due date */}
            {!isPayment && tx.due_date && (
              <DetailRow
                icon={<Calendar className="w-4 h-4" style={{ color: 'var(--color-accent-amber)' }} />}
                label={label('sales.due-date', currentLang)}
                value={formatEthiopian(tx.due_date)}
                lang={currentLang}
              />
            )}

            {/* Settlement mode */}
            {settlementMode && (
              <DetailRow
                icon={<span style={{ fontSize: '0.9rem' }}>🏷️</span>}
                label={label('sales.settlement-mode', currentLang)}
                value={
                  settlementMode === 'partial'
                    ? (label('sales.from-sale', currentLang))
                    : settlementMode === 'later'
                      ? (label('sales.pay-later', currentLang))
                      : settlementMode
                }
                lang={currentLang}
              />
            )}

            {/* Quantity */}
            {hasQuantity && (
              <DetailRow
                icon={<span style={{ fontSize: '0.9rem' }}>📦</span>}
                label={label('sales.quantity', currentLang)}
                value={`${tx.quantity} ${label('sales.pcs', currentLang)}`}
                lang={currentLang}
              />
            )}

            {/* Recorded by */}
            {tx.actor_name_snapshot && (
              <DetailRow
                icon={<User className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />}
                label={label('sales.recorded-by', currentLang)}
                value={tx.actor_name_snapshot}
                lang={currentLang}
              />
            )}

            {/* Balance after */}
            {tx.balance_after != null && (
              <div style={{
                borderTop: '1px dashed var(--color-bg-disabled)',
                marginTop: 8, paddingTop: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wallet className="w-4 h-4" style={{ color: 'var(--color-text)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>
                    {label('sales.balance-after', currentLang)}
                  </span>
                </div>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmt(tx.balance_after || 0)}
                </span>
              </div>
            )}
          </div>

          {/* Line items breakdown */}
          {items && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setExpandedItems(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8,
                  background: 'var(--color-bg-hover)', border: 'none',
                  cursor: 'pointer', width: '100%',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>🧺</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {items.length} {label('sales.items', currentLang)}
                </span>
                {expandedItems
                  ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--color-text-soft)', marginLeft: 'auto' }} />
                  : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-text-soft)', marginLeft: 'auto' }} />
                }
              </button>
              {expandedItems && (
                <div style={{
                  marginTop: 6, padding: '8px 10px',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderLeft: '3px solid var(--color-accent-amber)', borderRadius: 8,
                }}>
                  {items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '4px 0',
                      borderBottom: i < items.length - 1 ? '1px solid var(--color-bg-hover)' : 'none',
                    }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>• {item.name}</span>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-accent-amber)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {fmt(item.amount || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Photo proof thumbnails */}
          {hasPhoto && (
            <div style={{
              padding: '10px 12px', marginBottom: 12,
              background: 'var(--color-surface-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Image className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                  {label('sales.photo-proof', currentLang)}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-soft)', marginLeft: 'auto' }}>
                  {photoList.length} {label('sales.photo-s', currentLang)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                {photoList.map((src, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setFullscreenPhoto(src)}
                    className="press-scale"
                    style={{
                      width: 64, height: 64, borderRadius: 8,
                      overflow: 'hidden', border: '1px solid var(--color-border)',
                      padding: 0, cursor: 'pointer', flexShrink: 0,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <img
                      src={src}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full-screen photo viewer */}
          {fullscreenPhoto && (
            <div
              onClick={() => setFullscreenPhoto(null)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.92)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFullscreenPhoto(null); }}
                style={{
                  position: 'absolute', top: 16, right: 16,
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 101,
                }}
              >
                <X className="w-5 h-5" style={{ color: 'var(--color-bg-white)' }} />
              </button>
              <img
                src={fullscreenPhoto}
                alt=""
                style={{
                  maxWidth: '95%', maxHeight: '90%',
                  borderRadius: 8, objectFit: 'contain',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          {/* Edit button — full width */}
          <button
            type="button"
            onClick={() => onEdit?.(tx)}
            style={{
              width: '100%', padding: '12px',
              background: 'var(--color-warning-bg)', border: '1.5px solid var(--color-warning-border)',
              borderRadius: 10,
              fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-warning)',
              cursor: 'pointer', minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: 8,
            }}
          >
            <Pencil className="w-4 h-4" />
            {label('sales.edit-transaction', currentLang)}
          </button>

          {/* Delete button — full width */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              width: '100%', padding: '12px',
              background: 'var(--color-surface)', border: '1.5px solid var(--color-danger-border)',
              borderRadius: 10,
              fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-danger)',
              cursor: 'pointer', minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Trash2 className="w-4 h-4" />
            {label('sales.delete', currentLang)}
          </button>
        </div>

        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'var(--color-surface)',
              borderRadius: '20px 20px 0 0',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 32, textAlign: 'center',
              animation: 'gebya-fade-in 0.2s ease',
              zIndex: 10,
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--color-danger-bg)', border: '2px solid var(--color-danger-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Trash2 className="w-7 h-7" style={{ color: 'var(--color-danger)' }} />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', margin: '0 0 6px' }}>
              {label('sales.delete-this-transaction', currentLang)}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: '0 0 24px', maxWidth: 260, lineHeight: 1.4 }}>
              {currentLang === 'am'
                ? (customerBalance > 0
                  ? `ይህ ደንበኛ ${fmt(customerBalance)} ብር ዕዳ አለበት። ይህን ማስወገድ ቀሪ ሂሳባቸውን ይቀንሳል።`
                  : 'ይህ ተግባር ሊቀለብት አይችልም። የደንበኛው ቀሪ ተጽዕኖ ያደርጋል።')
                : (customerBalance > 0
                  ? `This customer has ${fmt(customerBalance)} birr outstanding. Reversing this entry will reduce their balance.`
                  : 'This cannot be undone. It will affect the customer\'s balance.')}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete?.(tx);
              }}
              style={{
                width: '100%', padding: '14px',
                background: 'var(--color-danger)', color: 'var(--color-bg-white)',
                border: 'none', borderRadius: 12,
                fontSize: '0.95rem', fontWeight: 800,
                cursor: 'pointer', marginBottom: 10,
                minHeight: 48,
              }}
            >
              {label('sales.delete-forever', currentLang)}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                width: '100%', padding: '14px',
                background: 'var(--color-bg-hover)', color: 'var(--color-text)',
                border: 'none', borderRadius: 12,
                fontSize: '0.9rem', fontWeight: 700,
                cursor: 'pointer',
                minHeight: 48,
              }}
            >
              {label('sales.no-keep-it', currentLang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail row ─────────────────────────────────────────────────
function DetailRow({ icon, label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--color-bg-active)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>{value}</span>
    </div>
  );
}

export default TransactionDetailSheet;
