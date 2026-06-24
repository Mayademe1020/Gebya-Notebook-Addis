import { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, MoreVertical, ChevronUp, ChevronDown } from 'lucide-react';
import PhotoAttachment from './PhotoAttachment';
import { usePermissionsStore } from '../stores/permissionsStore';

export default function TxRow({ tx, onTap, onEdit, onDelete, t, lang, fmt }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const menuRef = useRef(null);
  const canDelete = usePermissionsStore(s => s.hasPermission('can_delete_records'));

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const isExpense = tx.type === 'expense';
  const isCredit = tx.type === 'credit';
  const amountColor = isExpense ? '#dc2626' : isCredit ? '#2563eb' : '#16a34a';
  const sign = isExpense ? '−' : '+';
  const method = isCredit
    ? (lang === 'am' ? 'ዱቤ' : 'credit')
    : tx.payment_type === 'cash' ? 'cash' : (tx.payment_provider || tx.payment_type || 'cash');
  const time = new Date(tx.created_at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  const hasBreakdown = Array.isArray(tx.items) && tx.items.length > 0;

  return (
    <div className="py-3">
      <div className="flex items-center gap-2">
        <button onClick={onTap} className="flex-1 min-w-0 text-left flex items-baseline gap-2 press-scale">
          <span className="font-bold text-sm flex-shrink-0" style={{ color: amountColor }}>
            {isCredit && '↻ '}{sign}{fmt(tx.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
          </span>
          <span className="text-sm text-gray-600 truncate min-w-0">
            {tx.item_name || '—'}
            <span className="text-gray-400"> · {method}</span>
          </span>
        </button>
        {(tx.photo || (Array.isArray(tx.photos) && tx.photos.length > 0)) && (
          <PhotoAttachment
            photo={tx.photo}
            photos={tx.photos}
            lang={lang}
            label={lang === 'am' ? 'የግብይት ፎቶ ይመልከቱ' : 'View transaction photo'}
          />
        )}
        {hasBreakdown && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setBreakdownOpen(v => !v); }}
            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold border press-scale flex items-center gap-0.5"
            style={{ borderColor: breakdownOpen ? '#1B4332' : '#e8e2d8', borderRadius: '999px', background: breakdownOpen ? 'rgba(27,67,50,0.08)' : '#fff', color: breakdownOpen ? '#1B4332' : '#6b7280' }}
            aria-label={lang === 'am' ? 'እቃዎችን አሳይ' : 'Show items'}
          >
            🧺{tx.items.length}
            {breakdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        <span className="text-xs text-gray-400 flex-shrink-0">{time}</span>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 press-scale min-w-[36px] min-h-[36px] flex items-center justify-center" aria-label={lang === 'am' ? 'ተጨማሪ' : 'More'}>
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white z-20 min-w-[130px]" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full px-3 py-2 text-left flex items-center gap-2 text-sm hover:bg-gray-50">
                <Pencil className="w-3.5 h-3.5" /> {lang === 'am' ? 'አርትዕ' : 'Edit'}
              </button>
              {canDelete && (
                <button onClick={() => { onDelete(); setMenuOpen(false); }} className="w-full px-3 py-2 text-left flex items-center gap-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> {lang === 'am' ? 'ሰርዝ' : 'Delete'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {hasBreakdown && breakdownOpen && (
        <div className="mt-2 ml-1 pl-3 py-1.5 space-y-1" style={{ borderLeft: '2px solid rgba(27,67,50,0.15)' }}>
          {tx.items.map((it, i) => (
            <div key={i} className="flex justify-between items-baseline text-xs">
              <span className="truncate min-w-0" style={{ color: '#374151' }}>• {it.name}</span>
              <span className="font-semibold flex-shrink-0 ml-2" style={{ color: amountColor }}>
                {fmt(it.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
              </span>
            </div>
          ))}
          {(() => {
            const sum = tx.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
            const delta = (Number(tx.amount) || 0) - sum;
            if (Math.abs(delta) < 0.01) return null;
            return (
              <div className="flex justify-between items-baseline text-[10px] pt-1 mt-1" style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', color: '#C4883A' }}>
                <span>{delta > 0 ? (lang === 'am' ? 'ቀሪ' : 'Unaccounted') : (lang === 'am' ? 'በላይ' : 'Excess')}</span>
                <span className="font-semibold">{fmt(Math.abs(delta))} {lang === 'am' ? 'ብር' : 'birr'}</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
