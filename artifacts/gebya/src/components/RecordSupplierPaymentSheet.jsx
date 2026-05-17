import { useMemo, useState } from 'react';
import { Save, Search, Wallet, X } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { useLang } from '../context/LangContext';

function getSupplierName(s) {
  return s.display_name || s.displayName || '';
}

function getSupplierBalance(s) {
  return Number(s.balance ?? 0);
}

function matchesSupplier(s, q) {
  if (!q) return true;
  return getSupplierName(s).toLowerCase().includes(q) || (s.phone_number || '').toLowerCase().includes(q);
}

function sortSuppliersWithBalance(suppliers) {
  return [...suppliers]
    .filter(s => getSupplierBalance(s) > 0)
    .sort((a, b) => getSupplierBalance(b) - getSupplierBalance(a));
}

function RecordSupplierPaymentSheet({ suppliers = [], onSave, onDone }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmedQuery = query.trim().toLowerCase();
  const openBalanceSuppliers = useMemo(() => {
    const withBalance = sortSuppliersWithBalance(suppliers);
    if (!trimmedQuery) return withBalance;
    return withBalance.filter(s => matchesSupplier(s, trimmedQuery));
  }, [suppliers, trimmedQuery]);

  const parsedAmount = parseFloat(parseInput(amount)) || 0;
  const currentBalance = selectedSupplier ? Math.max(getSupplierBalance(selectedSupplier), 0) : 0;
  const overPayment = parsedAmount > currentBalance;
  const canSave = selectedSupplier && parsedAmount > 0 && !overPayment;

  const handleNumericInput = (e) => {
    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    setAmount(raw);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const ok = await onSave?.({
        supplier_id: selectedSupplier.id,
        amount: parsedAmount,
        note: note.trim() || null,
      });
      if (ok) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="sticky top-0 bg-white z-10 px-4 pt-3 pb-2 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t.recordSupplierPayment || 'Record Supplier Payment'}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{t.recordPaymentToSupplier || 'Record payment to a supplier'}</p>
            </div>
            <button onClick={onDone} aria-label={t.close || 'Close'} className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center press-scale">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 space-y-3">
          {!selectedSupplier && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchSupplierPlaceholder || 'Search supplier...'} autoCapitalize="words" autoFocus className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border outline-none" style={{ borderColor: trimmedQuery ? '#1B4332' : 'var(--color-border)', borderRadius: 'var(--radius-md)' }} />
              </div>

              {openBalanceSuppliers.length === 0 && (
                <p className="text-center text-xs py-4" style={{ color: '#9ca3af' }}>{t.noSupplierWithBalance || 'No suppliers with open balance'}</p>
              )}

              <div className="divide-y" style={{ borderColor: 'var(--color-border)', maxHeight: '240px', overflowY: 'auto' }}>
                {openBalanceSuppliers.map(s => (
                  <button key={s.id} type="button" onClick={() => setSelectedSupplier(s)} className="w-full text-left py-2.5 px-1 press-scale">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{getSupplierName(s)}</p>
                      <p className="text-sm font-bold flex-shrink-0" style={{ color: '#92400e' }}>{fmt(getSupplierBalance(s))}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedSupplier && (
            <>
              <div className="flex items-center justify-between p-2.5" style={{ background: '#f0fdf4', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0' }}>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{getSupplierName(selectedSupplier)}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>{t.balance || 'Balance'}: {fmt(currentBalance)} {t.birr || 'birr'}</p>
                </div>
                <button type="button" onClick={() => { setSelectedSupplier(null); setAmount(''); setNote(''); }} className="text-xs press-scale" style={{ color: '#6b7280' }}>{t.change || 'Change'}</button>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1.5 text-sm">
                  {t.amount} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input type="text" inputMode="decimal" value={fmtInput(amount)} onChange={handleNumericInput} placeholder="0" autoFocus className="w-full p-3 pr-14 border-2 focus:outline-none text-base min-h-[48px]" style={{ borderRadius: 'var(--radius-md)', borderColor: parsedAmount > 0 && !overPayment ? '#2d6a4f' : '#e8e2d8' }} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">{t.birr || 'birr'}</span>
                </div>
                {overPayment && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: '#dc2626' }}>{t.paymentMoreThanBalance || 'More than remaining balance'}</p>
                )}
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1.5 text-sm">{t.paymentNoteOptional || 'Note (optional)'}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.paymentNotePlaceholder || 'Payment note'} rows={2} className="w-full p-2.5 border focus:outline-none text-sm resize-none" style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)' }} />
              </div>

              <button onClick={handleSave} disabled={!canSave || saving} className="w-full p-3.5 font-bold text-white text-sm flex items-center justify-center gap-2 min-h-[52px] press-scale" style={{ background: '#2d6a4f', opacity: canSave ? 1 : 0.45, borderRadius: 'var(--radius-md)', boxShadow: canSave ? '0 4px 0 #1B4332, var(--shadow-sm)' : 'none' }}>
                <Wallet className="w-4 h-4" />
                {saving ? (t.saving || 'Saving...') : (t.savePayment || 'Save Payment')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecordSupplierPaymentSheet;
