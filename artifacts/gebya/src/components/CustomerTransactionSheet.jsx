// CustomerTransactionSheet.jsx — v4 simplified credit/payment entry.
//
// Same one-handed treatment as TransactionForm:
// - Compact header with customer name
// - Hero amount with quick additive chips
// - Catalog as chips (no dropdown)
// - Optional one-line note
// - Compact due-date pills
// - Solid colored save button
import { useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Plus, CalendarDays } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { formatEthiopian, getDueDateOptions } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  setter(raw);
}

const DEFAULT_QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

function CustomerTransactionSheet({
  customer,
  mode = CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
  initialAmount,
  editingTransaction,   // NEW · pre-fills form for edit mode; save → update record
  onSave,
  onDone,
  actorLabel,
  catalogEntries = [],
}) {
  const { t, lang } = useLang();
  const isEditing = !!editingTransaction;

  // Initial values: editing mode loads from the existing record;
  // otherwise mark-fully-paid passes initialAmount.
  const initInitialAmount = isEditing
    ? String(editingTransaction.amount || '')
    : (initialAmount != null && initialAmount > 0 ? String(initialAmount) : '');
  const initInitialNote = isEditing ? (editingTransaction.item_note || '') : '';
  const initInitialDue = isEditing && editingTransaction.due_date
    ? new Date(editingTransaction.due_date).toISOString().slice(0, 10)
    : '';

  const [amount, setAmount] = useState(initInitialAmount);
  const [itemNote, setItemNote] = useState(initInitialNote);
  const [catalogEntryId, setCatalogEntryId] = useState('');
  const [dueDate, setDueDate] = useState(initInitialDue);
  const [saving, setSaving] = useState(false);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('');

  // In edit mode, derive type from the record; otherwise from the mode prop.
  const transactionType = useMemo(() => {
    if (isEditing) return editingTransaction.type;
    if (mode === CUSTOMER_TRANSACTION_TYPES.PAYMENT) return CUSTOMER_TRANSACTION_TYPES.PAYMENT;
    return CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
  }, [mode, isEditing, editingTransaction]);

  const isPayment = transactionType === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const selectedCatalogEntry = catalogEntries.find(entry => String(entry.id) === String(catalogEntryId)) || null;
  const parsedAmount = parseFloat(parseInput(amount)) || 0;
  const currentBalance = Math.max(Number(customer?.balance) || 0, 0);
  // In edit mode, the existing row is already in `balance`; relax validation so
  // the shopkeeper can correct typos without spurious overpayment errors.
  const hasCollectableBalance = isEditing || !isPayment || currentBalance > 0;
  const updatedBalance = isPayment
    ? Math.max(currentBalance - parsedAmount, 0)
    : currentBalance + parsedAmount;
  const dueDateOptions = useMemo(() => getDueDateOptions(), []);
  const overPayment = isPayment && !isEditing && parsedAmount > currentBalance;
  const canSave = parsedAmount > 0 && !overPayment && hasCollectableBalance && !saving;

  // Color accent: credit-add (amber for liability) vs payment (green for settled)
  const accentColor = isPayment ? '#16a34a' : '#C4883A';
  const headerLabel = isEditing
    ? (lang === 'am'
        ? (isPayment ? '✏️ ክፍያ ማስተካከያ' : '✏️ ዱቤ ማስተካከያ')
        : (isPayment ? '✏️ Edit payment' : '✏️ Edit credit'))
    : isPayment
      ? (lang === 'am' ? '− ክፍያ' : '− Payment')
      : (lang === 'am' ? '+ ዱቤ' : '+ Credit');
  const saveButtonText = isEditing
    ? (lang === 'am' ? 'አስተካክል' : 'Update')
    : isPayment
      ? (lang === 'am' ? 'ክፍያ አስቀምጥ' : 'Save Payment')
      : (lang === 'am' ? 'ዱቤ አስቀምጥ' : 'Save Credit');

  const topCatalogItems = catalogEntries
    .filter(e => e && e.active !== false && e.name)
    .slice(0, 8);

  const handleSave = async () => {
    if (!canSave) return;
    if (!isValidCustomerTransactionType(transactionType)) return;

    setSaving(true);
    try {
      const didSave = await onSave?.({
        customer_id: customer?.id,
        type: transactionType,
        amount: parsedAmount,
        catalog_entry_id: catalogEntryId ? Number(catalogEntryId) : null,
        item_kind: selectedCatalogEntry?.kind || null,
        item_note: itemNote.trim() || selectedCatalogEntry?.name || null,
        due_date: !isPayment && dueDate ? new Date(dueDate).getTime() : null,
        // Edit mode: tell App.jsx to UPDATE this row instead of inserting.
        editing_id: editingTransaction?.id || null,
      });
      if (didSave) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const applyCustomAmount = () => {
    const val = parseFloat(parseInput(customAmountValue));
    if (!val || val <= 0) return;
    const current = parseFloat(parseInput(amount)) || 0;
    setAmount(String(current + val));
    setCustomAmountValue('');
    setShowCustomAmount(false);
  };

  const handleQuickItem = (entry) => {
    setCatalogEntryId(String(entry.id));
    if (!itemNote.trim()) setItemNote(entry.name || '');
    if (!amount && entry.default_price != null) setAmount(String(entry.default_price));
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-30 max-w-md mx-auto flex flex-col"
      style={{ background: '#ffffff' }}
    >
      {/* Header: back arrow + type label + customer name */}
      <div
        className="flex-shrink-0 px-3 sm:px-4 py-3 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid #e8e2d8' }}
      >
        <button
          onClick={onDone}
          aria-label={lang === 'am' ? 'ተመለስ' : 'Back'}
          className="press-scale flex items-center justify-center"
          style={{ minWidth: '36px', minHeight: '36px', padding: '4px' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#6b7280' }} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h2 className="text-base font-bold truncate" style={{ color: accentColor }}>{headerLabel}</h2>
          {customer?.display_name && (
            <p className="text-[11px] truncate" style={{ color: '#6b7280' }}>{customer.display_name}</p>
          )}
        </div>
        {actorLabel ? (
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: '#6b4f1d', maxWidth: '80px', textAlign: 'right' }}
            title={actorLabel}
          >
            {actorLabel}
          </span>
        ) : (
          <div style={{ width: '36px' }} />
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">

        {/* Balance line — compact horizontal */}
        <div
          className="p-3 border flex items-center justify-between gap-2"
          style={{
            background: isPayment ? '#f0fdf4' : '#fffbeb',
            borderColor: isPayment ? '#bbf7d0' : '#fde68a',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
              {t.previousBalance}
            </p>
            <p className="text-base font-bold truncate" style={{ color: '#1a1a1a' }}>
              {fmt(currentBalance)} {t.birr}
            </p>
          </div>
          <span className="flex-shrink-0" style={{ color: '#9ca3af' }}>→</span>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
              {t.updatedBalance}
            </p>
            <p className="text-base font-bold truncate" style={{ color: isPayment ? '#166534' : '#92400e' }}>
              {fmt(updatedBalance)} {t.birr}
            </p>
          </div>
        </div>

        {/* AMOUNT — the hero */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
            {t.amount} <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={fmtInput(amount)}
              onChange={e => handleNumericInput(e, setAmount)}
              placeholder="0"
              className="w-full py-3 pr-20 text-3xl sm:text-4xl font-bold text-center focus:outline-none"
              style={{
                borderBottom: `2px solid ${amount ? accentColor : '#e8e2d8'}`,
                background: 'transparent',
                color: amount ? accentColor : '#9ca3af',
              }}
            />
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base sm:text-lg font-semibold"
              style={{ color: '#9ca3af' }}
            >
              {t.birr}
            </span>
          </div>

          {/* Quick-pick amount chips — additive */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 items-center">
            {DEFAULT_QUICK_AMOUNTS.map(amt => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  const current = parseFloat(parseInput(amount)) || 0;
                  setAmount(String(current + amt));
                }}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-bold border press-scale"
                style={{
                  borderColor: '#e8e2d8',
                  borderRadius: 'var(--radius-sm)',
                  background: '#fff',
                  color: '#374151',
                  minWidth: '52px',
                }}
              >
                +{amt}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustomAmount(v => !v)}
              className="flex-shrink-0 px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center justify-center"
              style={{
                borderColor: showCustomAmount ? accentColor : '#c9bfa8',
                borderStyle: 'dashed',
                borderRadius: 'var(--radius-sm)',
                background: showCustomAmount ? `${accentColor}10` : '#faf9f7',
                color: showCustomAmount ? accentColor : '#6b7280',
                minWidth: '40px',
                minHeight: '32px',
              }}
              aria-label={lang === 'am' ? 'ሌላ መጠን' : 'Custom amount'}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {amount && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className="flex-shrink-0 ml-auto px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center justify-center"
                style={{
                  borderColor: '#fecaca',
                  borderRadius: 'var(--radius-sm)',
                  background: '#fef2f2',
                  color: '#dc2626',
                  minWidth: '40px',
                  minHeight: '32px',
                }}
                aria-label={lang === 'am' ? 'መጠን አጥፋ' : 'Clear amount'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {showCustomAmount && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={fmtInput(customAmountValue)}
                onChange={e => handleNumericInput(e, setCustomAmountValue)}
                onKeyDown={e => { if (e.key === 'Enter') applyCustomAmount(); }}
                placeholder={lang === 'am' ? 'ሌላ መጠን' : 'Other amount'}
                className="flex-1 p-2.5 border-2 focus:outline-none text-sm"
                style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8' }}
              />
              <button
                type="button"
                onClick={applyCustomAmount}
                disabled={!parseFloat(parseInput(customAmountValue))}
                className="px-3 py-2 text-xs font-bold press-scale flex items-center gap-1"
                style={{
                  background: parseFloat(parseInput(customAmountValue)) ? accentColor : '#e5e7eb',
                  color: parseFloat(parseInput(customAmountValue)) ? '#fff' : '#9ca3af',
                  borderRadius: 'var(--radius-sm)',
                  cursor: parseFloat(parseInput(customAmountValue)) ? 'pointer' : 'not-allowed',
                  minHeight: '40px',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === 'am' ? 'ጨምር' : 'Add'}
              </button>
            </div>
          )}

          {isPayment && !hasCollectableBalance && (
            <p className="text-xs font-medium mt-2" style={{ color: '#b45309' }}>
              {t.noBalanceToRecordPayment}
            </p>
          )}
          {overPayment && (
            <p className="text-xs font-medium mt-2 text-red-600">
              {t.paymentExceedsOwed}
            </p>
          )}
        </div>

        {/* Note (optional, single-line) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
            {isPayment ? t.paymentNoteOptional : t.itemNoteOptional}
          </label>
          <input
            type="text"
            value={itemNote}
            onChange={e => setItemNote(e.target.value)}
            placeholder={isPayment ? t.paymentNotePlaceholder : t.creditItemPlaceholder}
            className="w-full p-3 border-2 focus:outline-none text-base"
            style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
          />

          {/* Quick item chips from catalog (credit only — saves can tap to auto-fill note + amount) */}
          {!isPayment && topCatalogItems.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-medium mb-1" style={{ color: '#6b7280' }}>
                {lang === 'am' ? 'ፈጣን ዕቃዎች:' : 'Quick items:'}
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 items-center">
                {topCatalogItems.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleQuickItem(entry)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-bold border press-scale"
                    style={{
                      borderColor: '#e8e2d8',
                      borderRadius: 'var(--radius-sm)',
                      background: '#fff',
                      color: '#374151',
                    }}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Due date (credit only) */}
        {!isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {t.dueDateOptional}
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
              {dueDateOptions.map((option) => {
                const optionDate = new Date(option.value).toISOString().slice(0, 10);
                const active = dueDate === optionDate;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDueDate(optionDate)}
                    className="flex-shrink-0 px-3 py-2 text-left border min-h-[44px] whitespace-nowrap press-scale"
                    style={{
                      background: active ? accentColor : '#fff',
                      color: active ? '#fff' : '#374151',
                      borderColor: active ? accentColor : '#e8e2d8',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span className="block text-xs font-bold">{option.label}</span>
                    <span className="block text-[10px] opacity-80">{option.display}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <CalendarDays className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full p-2.5 pl-10 border-2 focus:outline-none text-sm"
                style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8' }}
              />
            </div>
            {dueDate && (
              <p className="text-[10px] mt-1.5 font-medium" style={{ color: '#6b7280' }}>
                {t.ethiopianDisplay}: {formatEthiopian(new Date(dueDate))}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sticky save button */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3" style={{ borderTop: '1px solid #e8e2d8' }}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full p-3 font-bold text-white text-base flex items-center justify-center gap-2 transition-all press-scale"
          style={{
            background: canSave ? accentColor : '#e5e7eb',
            color: canSave ? '#fff' : '#9ca3af',
            cursor: canSave ? 'pointer' : 'not-allowed',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Save className="w-5 h-5" />
          {saving ? t.saving : saveButtonText}
        </button>
      </div>
    </div>
  );
}

export default CustomerTransactionSheet;
