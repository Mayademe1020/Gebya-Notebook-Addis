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
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';

function TransactionDetailSheet({ transaction, type = 'customer', lang: langProp, onClose, onEdit, onDelete }) {
  const { lang } = useLang();
  const currentLang = langProp || lang;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedItems, setExpandedItems] = useState(false);

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
  const hasQuantity = !isPayment && tx.quantity > 0;

  const typeLabel = isPayment
    ? (currentLang === 'am' ? 'ክፍያ' : 'PAYMENT')
    : (currentLang === 'am' ? 'ዱቤ' : 'CREDIT');
  const typeColor = isPayment ? '#047857' : '#C4883A';
  const amountColor = isPayment ? '#047857' : '#C4883A';
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
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.25)',
          animation: 'gebya-slide-up 0.25s ease',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 38, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '10px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          padding: '8px 16px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #f3f4f6',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1a1a1a', margin: 0 }}>
            {currentLang === 'am' ? 'የግብይት ዝርዝር' : 'Transaction Detail'}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#f3f4f6', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X className="w-4 h-4" style={{ color: '#6b7280' }} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>

          {/* Hero: type badge + amount + date */}
          <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em',
              background: isPayment ? '#d1fae5' : '#fef3c7',
              color: isPayment ? '#047857' : '#92400e',
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
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
              {currentLang === 'am' ? 'ብር' : 'birr'}
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 8,
              padding: '4px 10px', borderRadius: 8,
              background: '#f9fafb', border: '1px solid #f3f4f6',
            }}>
              <Calendar className="w-3.5 h-3.5" style={{ color: '#9ca3af' }} />
              <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>
                {formatEthiopian(tx.created_at)}
              </span>
            </div>
          </div>

          {/* Detail rows */}
          <div style={{ padding: '12px 0' }}>

            {/* Description / Note */}
            {tx.item_note && (
              <div style={{
                padding: '10px 12px', marginBottom: 10,
                background: '#fafaf5', border: '1px solid #f3f4f6', borderRadius: 10,
              }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 800, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                  {currentLang === 'am' ? 'ማስታወሻ / ዝርዝር' : 'Description / Note'}
                </p>
                <p style={{ fontSize: '0.85rem', color: '#1f2937', lineHeight: 1.4, margin: 0 }}>
                  {tx.item_note}
                </p>
              </div>
            )}

            {/* Due date */}
            {!isPayment && tx.due_date && (
              <DetailRow
                icon={<Calendar className="w-4 h-4" style={{ color: '#C4883A' }} />}
                label={currentLang === 'am' ? 'የመጨረሻ ቀን' : 'Due Date'}
                value={formatEthiopian(tx.due_date)}
                lang={currentLang}
              />
            )}

            {/* Settlement mode */}
            {settlementMode && (
              <DetailRow
                icon={<span style={{ fontSize: '0.9rem' }}>🏷️</span>}
                label={currentLang === 'am' ? 'የመፈetrize ዘይቤ' : 'Settlement Mode'}
                value={
                  settlementMode === 'partial'
                    ? (currentLang === 'am' ? 'ከሽያጭ' : 'from sale')
                    : settlementMode === 'later'
                      ? (currentLang === 'am' ? 'ኋላ ይከፍላል' : 'pay-later')
                      : settlementMode
                }
                lang={currentLang}
              />
            )}

            {/* Quantity */}
            {hasQuantity && (
              <DetailRow
                icon={<span style={{ fontSize: '0.9rem' }}>📦</span>}
                label={currentLang === 'am' ? 'ብዛት' : 'Quantity'}
                value={`${tx.quantity} ${currentLang === 'am' ? 'ዕቃ' : 'pcs'}`}
                lang={currentLang}
              />
            )}

            {/* Recorded by */}
            {tx.actor_name_snapshot && (
              <DetailRow
                icon={<User className="w-4 h-4" style={{ color: '#6b7280' }} />}
                label={currentLang === 'am' ? 'የተመዘገበው' : 'Recorded by'}
                value={tx.actor_name_snapshot}
                lang={currentLang}
              />
            )}

            {/* Balance after */}
            {tx.balance_after != null && (
              <div style={{
                borderTop: '1px dashed #e5e7eb',
                marginTop: 8, paddingTop: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wallet className="w-4 h-4" style={{ color: '#374151' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>
                    {currentLang === 'am' ? 'ቀሪ ቀሪ' : 'Balance After'}
                  </span>
                </div>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.9rem', fontWeight: 700, color: '#1a1a1a',
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
                  background: '#f3f4f6', border: 'none',
                  cursor: 'pointer', width: '100%',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>🧺</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
                  {items.length} {currentLang === 'am' ? 'ዕቃዎች' : 'items'}
                </span>
                {expandedItems
                  ? <ChevronUp className="w-3.5 h-3.5" style={{ color: '#9ca3af', marginLeft: 'auto' }} />
                  : <ChevronDown className="w-3.5 h-3.5" style={{ color: '#9ca3af', marginLeft: 'auto' }} />
                }
              </button>
              {expandedItems && (
                <div style={{
                  marginTop: 6, padding: '8px 10px',
                  background: '#fff', border: '1px solid #e8e2d8',
                  borderLeft: '3px solid #C4883A', borderRadius: 8,
                }}>
                  {items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '4px 0',
                      borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <span style={{ fontSize: '0.82rem', color: '#4b5563' }}>• {item.name}</span>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.82rem', fontWeight: 700, color: '#C4883A',
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

          {/* Photo proof */}
          {hasPhoto && (
            <div style={{
              padding: '10px 12px', marginBottom: 12,
              background: '#fafaf5', border: '1px solid #f3f4f6', borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Image className="w-4 h-4" style={{ color: '#6b7280' }} />
              <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                {currentLang === 'am' ? 'የዕቃ ፎቶ' : 'Photo proof'}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>
                {Array.isArray(tx.photos) ? tx.photos.length : 1} {currentLang === 'am' ? 'ፎቶ' : 'photo(s)'}
              </span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #f3f4f6',
          flexShrink: 0,
        }}>
          {/* Edit button — full width */}
          <button
            type="button"
            onClick={() => onEdit?.(tx)}
            style={{
              width: '100%', padding: '12px',
              background: '#fef3c7', border: '1.5px solid #fde68a',
              borderRadius: 10,
              fontSize: '0.85rem', fontWeight: 800, color: '#92400e',
              cursor: 'pointer', minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: 8,
            }}
          >
            <Pencil className="w-4 h-4" />
            {currentLang === 'am' ? 'አስተካክል' : 'Edit Transaction'}
          </button>

          {/* Delete + Cancel — 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '12px',
                background: '#fff', border: '1.5px solid #fecaca',
                borderRadius: 10,
                fontSize: '0.85rem', fontWeight: 700, color: '#dc2626',
                cursor: 'pointer', minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Trash2 className="w-4 h-4" />
              {currentLang === 'am' ? 'ሰርዝ' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px',
                background: '#f9fafb', border: '1px solid #e5e7eb',
                borderRadius: 10,
                fontSize: '0.85rem', fontWeight: 700, color: '#6b7280',
                cursor: 'pointer', minHeight: 44,
              }}
            >
              {currentLang === 'am' ? 'ሰርዝ' : 'Cancel'}
            </button>
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div
            style={{
              position: 'absolute', inset: 0,
              background: '#fff',
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
              background: '#fef2f2', border: '2px solid #fecaca',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Trash2 className="w-7 h-7" style={{ color: '#dc2626' }} />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 6px' }}>
              {currentLang === 'am' ? 'ይህን ግብይት ሰርዝ?' : 'Delete this transaction?'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 24px', maxWidth: 260, lineHeight: 1.4 }}>
              {currentLang === 'am'
                ? 'ይህ ተግባር ሊቀለብት አይችልም። የደንበኛውን ቀሪ ቀሪ ተጽዕኖ ያደርጋል።'
                : 'This cannot be undone. It will affect the customer\'s balance.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete?.(tx);
              }}
              style={{
                width: '100%', padding: '14px',
                background: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 12,
                fontSize: '0.95rem', fontWeight: 800,
                cursor: 'pointer', marginBottom: 10,
                minHeight: 48,
              }}
            >
              {currentLang === 'am' ? 'አጥፋ' : 'Delete Forever'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                width: '100%', padding: '14px',
                background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: 12,
                fontSize: '0.9rem', fontWeight: 700,
                cursor: 'pointer',
                minHeight: 48,
              }}
            >
              {currentLang === 'am' ? 'አይስረዝም' : 'No, Keep It'}
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
      borderBottom: '1px solid #f9fafb',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1f2937' }}>{value}</span>
    </div>
  );
}

export default TransactionDetailSheet;
