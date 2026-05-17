import { useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { SUPPLIER_TRANSACTION_TYPES, isValidSupplierTransactionType } from '../utils/supplierLedger';

const MODE_OPTIONS = [
  { id: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, label: 'Add amount owed' },
  { id: SUPPLIER_TRANSACTION_TYPES.PAYMENT, label: 'Record payment' },
];

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  setter(raw);
}

function SupplierTransactionSheet({
  supplier,
  mode = SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
  existingTransaction = null,
  onSave,
  onUpdate,
  onDone,
  catalogEntries = [],
}) {
  const { t } = useLang();
  const isEditing = !!existingTransaction;
  const [activeMode, setActiveMode] = useState(
    existingTransaction?.type && isValidSupplierTransactionType(existingTransaction.type)
      ? existingTransaction.type
      : mode
  );
  const [amount, setAmount] = useState(existingTransaction?.amount ? String(existingTransaction.amount) : '');
  const [itemNote, setItemNote] = useState(existingTransaction?.item_name || existingTransaction?.note || '');
  const [catalogEntryId, setCatalogEntryId] = useState(existingTransaction?.catalog_entry_id ? String(existingTransaction.catalog_entry_id) : '');
  const [saving, setSaving] = useState(false);

  const isPayment = activeMode === SUPPLIER_TRANSACTION_TYPES.PAYMENT;
  const selectedCatalogEntry = catalogEntries.find(entry => String(entry.id) === String(catalogEntryId)) || null;
  const parsedAmount = parseFloat(parseInput(amount)) || 0;
  const currentBalance = Math.max(Number(supplier?.balance) || 0, 0);
  const updatedBalance = isPayment
    ? Math.max(currentBalance - parsedAmount, 0)
    : currentBalance + parsedAmount;
  const overPayment = isPayment && parsedAmount > currentBalance;
  const canSave = parsedAmount > 0 && !overPayment;

  const handleSave = async () => {
    if (!canSave || saving) return;

    setSaving(true);
    try {
      const payload = {
        supplier_id: supplier?.id,
        type: activeMode,
        amount: parsedAmount,
        catalog_entry_id: catalogEntryId ? Number(catalogEntryId) : null,
        item_kind: selectedCatalogEntry?.kind || null,
        item_name: itemNote.trim() || selectedCatalogEntry?.name || null,
        note: isPayment ? (itemNote.trim() || null) : null,
      };
      const didSave = isEditing
        ? await onUpdate?.(existingTransaction.id, payload)
        : await onSave?.(payload);
      if (didSave) onDone?.();
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
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing
                  ? (isPayment ? 'Edit payment' : 'Edit amount owed')
                  : (isPayment ? 'Record payment' : 'Add amount owed')}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{supplier?.display_name || ''}</p>
            </div>
            <button onClick={onDone} aria-label={t.close || 'Close'} className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center press-scale">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Mode toggle */}
          {!isEditing && (
            <div className="flex gap-1 p-1" style={{ background: '#f3f4f6', borderRadius: 'var(--radius-sm)' }}>
              {MODE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveMode(opt.id)}
                  className="flex-1 py-2 text-xs font-bold min-h-[40px] press-scale"
                  style={{
                    background: activeMode === opt.id ? '#fff' : 'transparent',
                    color: activeMode === opt.id ? '#1B4332' : '#6b7280',
                    borderRadius: 'var(--radius-xs)',
                    boxShadow: activeMode === opt.id ? 'var(--shadow-xs)' : 'none',
                  }}
                >
                  {opt.id === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD
                    ? (t.addAmountOwed || 'Add owed')
                    : (t.recordPayment || 'Record payment')}
                </button>
              ))}
            </div>
          )}

          {/* Balance preview */}
          <div
            className="p-3 border"
            style={{ background: isPayment ? '#f0fdf4' : '#fffbeb', borderColor: isPayment ? '#bbf7d0' : '#fde68a', borderRadius: 'var(--radius-md)' }}
          >
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>{t.currentBalance || 'Current'}</p>
                <p className="text-lg font-bold text-gray-900">{fmt(currentBalance)} {t.birr || 'birr'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>{t.newBalance || 'New'}</p>
                <p className="text-lg font-bold" style={{ color: isPayment ? '#166534' : '#92400e' }}>{fmt(updatedBalance)} {t.birr || 'birr'}</p>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              {t.amount} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={fmtInput(amount)}
                onChange={(e) => handleNumericInput(e, setAmount)}
                placeholder="0"
                autoFocus
                className="w-full p-4 pr-16 border-2 focus:outline-none text-base min-h-[52px]"
                style={{ borderRadius: 'var(--radius-md)', borderColor: parsedAmount > 0 && !overPayment ? '#1B4332' : '#e8e2d8' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{t.birr || 'birr'}</span>
            </div>
            {overPayment && (
              <div className="p-3 border mt-2" style={{ background: '#fef2f2', borderColor: '#fecaca', borderRadius: 'var(--radius-sm)' }}>
                <p className="text-xs font-bold text-red-600">
                  More than the remaining balance.
                </p>
              </div>
            )}
          </div>

          {/* Item note / catalog */}
          {!isPayment && catalogEntries.length > 0 && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 text-sm">
                {t.savedCatalogLabel || 'Item'}
              </label>
              <select
                value={catalogEntryId}
                onChange={(e) => {
                  const value = e.target.value;
                  setCatalogEntryId(value);
                  const entry = catalogEntries.find(item => String(item.id) === String(value));
                  if (entry && !itemNote.trim()) setItemNote(entry.name || '');
                }}
                className="w-full p-3 border-2 focus:outline-none text-sm bg-white"
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
              >
                <option value="">{t.typeNoteManually || 'Type manually'}</option>
                {catalogEntries.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-gray-700 font-semibold mb-2 text-sm">
              {isPayment ? (t.paymentNoteOptional || 'Note (optional)') : (t.itemNoteOptional || 'Item / note')}
            </label>
            <textarea
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder={isPayment ? (t.paymentNotePlaceholder || 'Payment note') : (t.itemNotePlaceholder || 'What was purchased')}
              rows={2}
              className="w-full p-3 border-2 focus:outline-none text-sm resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
          </div>
        </div>

        <div className="px-6 pb-8 pt-2">
          <button onClick={handleSave} disabled={!canSave || saving} className="w-full p-4 font-bold text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale" style={{ background: isPayment ? '#2d6a4f' : '#C4883A', opacity: canSave ? 1 : 0.45, borderRadius: 'var(--radius-md)', boxShadow: canSave ? (isPayment ? '0 4px 0 #1B4332, var(--shadow-sm)' : '0 4px 0 #96662b, var(--shadow-sm)') : 'none' }}>
            <Save className="w-5 h-5" />
            {saving ? (t.saving || 'Saving...') : (isEditing ? (t.saveChanges || 'Save changes') : (isPayment ? (t.savePayment || 'Save payment') : (t.saveAmountOwed || 'Save')))}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SupplierTransactionSheet;
