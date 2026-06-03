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
import { ArrowLeft, Save, X, Plus, Minus, Camera, CheckCircle2, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import EthiopianDatePicker from './EthiopianDatePicker';
import CameraCapture from './CameraCapture';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { formatEthiopian, getDueDateOptions } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';
import { photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, MAX_PROOF_PHOTOS, normalizePhotos } from '../utils/photoProof';

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
  // Commit C.7: Ethiopian calendar picker modal
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Commit C.6: quantity for credit. Captures "I gave 5 sacks of sugar for
  // 1500 birr total" — descriptive, not multiplicative (amount is the
  // already-computed total). Defaults to empty so users who don't care
  // about qty don't see "1" everywhere.
  const initInitialQuantity = isEditing && editingTransaction?.quantity
    ? String(editingTransaction.quantity)
    : '';
  const [quantity, setQuantity] = useState(initInitialQuantity);
  const [saving, setSaving] = useState(false);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('');
  const showQuantityField = false;
  // Multi-item breakdown — credit_add only. Pre-populates from editingTransaction.items.
  const [lineItems, setLineItems] = useState(
    isEditing && Array.isArray(editingTransaction.items)
      ? editingTransaction.items.map((it, i) => ({
          id: `init-${i}`,
          name: it?.name || '',
          amount: it?.amount != null ? String(it.amount) : '',
        }))
      : []
  );
  const [showBreakdown, setShowBreakdown] = useState(
    isEditing
    && Array.isArray(editingTransaction.items)
    && editingTransaction.items.length > 0
  );
  // Product photo · the goods/items being credited. Pre-fills from edit target.
  const [photos, setPhotos] = useState(() => (isEditing ? normalizePhotos(editingTransaction) : []));
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false); // B2: rear-camera capture modal
  const [replacePhotoId, setReplacePhotoId] = useState(null);

  const handleCameraPhoto = (dataUrl) => {
    const proof = createPhotoProof(dataUrl);
    if (!proof) return;
    if (replacePhotoId) {
      setPhotos(prev => prev.map(entry => (entry.id === replacePhotoId ? proof : entry)));
    } else {
      setPhotos(prev => [...prev, proof].slice(0, MAX_PROOF_PHOTOS));
    }
    setReplacePhotoId(null);
    setShowCamera(false);
    setPhotoError(null);
  };

  const openPhotoCapture = (photoId = null) => {
    if (!photoId && photos.length >= MAX_PROOF_PHOTOS) return;
    setReplacePhotoId(photoId);
    setShowCamera(true);
  };

  const handleRemovePhoto = (photoId) => {
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
    setPhotoError(null);
  };

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

  // ─── Multi-item breakdown · derived + handlers (credit_add only) ──────
  const lineItemsTotal = lineItems.reduce((sum, l) => {
    const v = parseFloat(parseInput(l.amount));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const validLineItems = lineItems.filter(
    l => l.name.trim() && parseFloat(parseInput(l.amount)) > 0
  );
  const breakdownDelta = parsedAmount - lineItemsTotal;

  const addLineItem = (preset = {}) => {
    setLineItems(prev => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random()}`,
        name: preset.name || '',
        amount: preset.amount != null ? String(preset.amount) : '',
      },
    ]);
    setShowBreakdown(true);
  };
  const removeLineItem = (id) => setLineItems(prev => prev.filter(l => l.id !== id));
  const updateLineItem = (id, field, value) =>
    setLineItems(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  const handleLineItemAmount = (id, e) => {
    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    updateLineItem(id, 'amount', raw);
  };
  const syncAmountToBreakdownSum = () => {
    if (lineItemsTotal > 0) setAmount(String(lineItemsTotal));
  };
  const addFromCatalogToBreakdown = (entry) => {
    addLineItem({ name: entry.name, amount: entry.default_price });
  };

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
      // Build clean items array for credit_add only
      const cleanedItems = (!isPayment) ? validLineItems.map(l => ({
        name: l.name.trim(),
        amount: parseFloat(parseInput(l.amount)),
      })) : [];

      // If breakdown present, derive item_note from item names (comma-joined).
      const itemNoteForSave = cleanedItems.length > 0
        ? cleanedItems.map(it => it.name).join(', ').substring(0, 200)
        : (itemNote.trim() || selectedCatalogEntry?.name || null);

      const parsedQty = parseInt(quantity, 10);
      const validQty = !isPayment && Number.isFinite(parsedQty) && parsedQty > 0
        ? parsedQty
        : null;

      const photoFields = !isPayment ? buildPhotoFields(photos) : { photos: [], photo: null, photo_taken_at: null };
      const didSave = await onSave?.({
        customer_id: customer?.id,
        type: transactionType,
        amount: parsedAmount,
        // Commit C.6: quantity is descriptive (5 sacks of sugar). Stored only
        // for credit_add, null on payment. amount remains the authoritative total.
        quantity: validQty,
        catalog_entry_id: catalogEntryId ? Number(catalogEntryId) : null,
        item_kind: selectedCatalogEntry?.kind || null,
        item_note: itemNoteForSave,
        due_date: !isPayment && dueDate ? new Date(dueDate).getTime() : null,
        items: cleanedItems.length > 0 ? cleanedItems : null,  // multi-item breakdown
        ...photoFields,                                      // product proof photos
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

        {/* Quantity (credit only) — Commit C.6.
            Descriptive: "I gave 5 sacks of sugar for 1500 birr total".
            Amount stays the authoritative total — qty does not multiply. */}
        {showQuantityField && !isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ብዛት (አማራጭ)' : 'Quantity (optional)'}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const cur = parseInt(quantity, 10) || 0;
                  setQuantity(cur > 1 ? String(cur - 1) : '');
                }}
                aria-label={lang === 'am' ? 'ቀንስ' : 'Decrease'}
                className="press-scale flex items-center justify-center"
                style={{
                  width: 44, height: 44,
                  border: '2px solid #e8e2d8',
                  borderRadius: 'var(--radius-md)',
                  background: '#fff',
                }}
              >
                <Minus className="w-4 h-4" style={{ color: '#374151' }} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setQuantity(raw.slice(0, 4));
                }}
                placeholder={lang === 'am' ? 'ለምሳሌ 5' : 'e.g. 5'}
                className="flex-1 p-2.5 border-2 focus:outline-none text-base text-center font-bold"
                style={{
                  borderRadius: 'var(--radius-md)',
                  borderColor: quantity ? accentColor : '#e8e2d8',
                  minHeight: 44,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const cur = parseInt(quantity, 10) || 0;
                  setQuantity(String(cur + 1));
                }}
                aria-label={lang === 'am' ? 'ጨምር' : 'Increase'}
                className="press-scale flex items-center justify-center"
                style={{
                  width: 44, height: 44,
                  border: '2px solid #e8e2d8',
                  borderRadius: 'var(--radius-md)',
                  background: '#fff',
                }}
              >
                <Plus className="w-4 h-4" style={{ color: '#374151' }} />
              </button>
              <span className="text-xs font-semibold" style={{ color: '#9ca3af', minWidth: 70 }}>
                {lang === 'am' ? 'ብዛት' : 'pieces'}
              </span>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: '#9ca3af' }}>
              {lang === 'am'
                ? 'ለመመዝገብ ብቻ — መጠን ላይ ተጽዕኖ የለውም።'
                : 'For your records only — does not multiply the amount.'}
            </p>
          </div>
        )}

        {/* Note (optional) + Photo button inline (credit only — proof of goods) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
            {isPayment ? t.paymentNoteOptional : t.itemNoteOptional}
          </label>
          <div className="flex gap-2 items-stretch">
            <input
              type="text"
              value={itemNote}
              onChange={e => setItemNote(e.target.value)}
              placeholder={isPayment ? t.paymentNotePlaceholder : t.creditItemPlaceholder}
              className="flex-1 min-w-0 p-3 border-2 focus:outline-none text-base"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
            {/* Product proof photos - credits only (payments stay photo-free). */}
            {!isPayment && (
              <button
                type="button"
                onClick={() => openPhotoCapture(null)}
                disabled={photos.length >= MAX_PROOF_PHOTOS || photoLoading}
                className="cursor-pointer press-scale flex items-center justify-center flex-shrink-0"
                style={{
                  width: 56,
                  border: '2px solid #e8e2d8',
                  borderRadius: 'var(--radius-md)',
                  background: photos.length > 0 ? '#f0fdf4' : '#fafaf6',
                  opacity: photos.length >= MAX_PROOF_PHOTOS ? 0.55 : 1,
                }}
                aria-label={lang === 'am' ? '\u134E\u1276 \u12EB\u1295\u1231 \u12C8\u12ED\u121D \u12ED\u121D\u1228\u1321' : 'Take or choose photo'}
              >
                {photoLoading
                  ? <span className="text-sm">...</span>
                  : photos.length > 0
                    ? <CheckCircle2 className="w-6 h-6" style={{ color: '#16a34a' }} />
                    : <Camera className="w-6 h-6" style={{ color: '#6b7280' }} />
                }
              </button>
            )}
          </div>

          {!isPayment && (
            <div className="mt-2 p-2"
              style={{ background: '#fafaf6', border: '1px solid #e8e2d8', borderRadius: 'var(--radius-sm)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>
                  {lang === 'am' ? '\u134E\u1276' : 'Proof photos'}
                </p>
                <p className="text-[10px] font-bold" style={{ color: '#6b7280' }}>
                  {photos.length}/{MAX_PROOF_PHOTOS}
                </p>
              </div>
              {photos.length > 0 ? (
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {photos.map((entry, index) => (
                    <div key={entry.id} className="relative flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openPhotoCapture(entry.id)}
                        className="press-scale block"
                        style={{ padding: 0, border: 'none', background: 'transparent' }}
                        aria-label={lang === 'am' ? '\u134E\u1276 \u1240\u12ED\u122D' : `Replace photo ${index + 1}`}
                      >
                        <img src={entry.dataUrl} alt="" className="w-14 h-14 object-cover" style={{ borderRadius: 6 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(entry.id)}
                        className="press-scale flex items-center justify-center"
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          minWidth: 28,
                          minHeight: 28,
                          borderRadius: 999,
                          border: '1px solid #e8e2d8',
                          background: '#fff',
                        }}
                        aria-label={lang === 'am' ? '\u134E\u1276 \u12A0\u1235\u12C8\u130D\u12F5' : `Remove photo ${index + 1}`}
                      >
                        <X className="w-3.5 h-3.5" style={{ color: '#6b7280' }} />
                      </button>
                      <p className="text-[10px] text-center mt-1" style={{ color: '#9ca3af' }}>
                        {Math.round(photoSizeBytes(entry.dataUrl) / 1024)} KB
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] mt-1" style={{ color: '#9ca3af' }}>
                  {lang === 'am' ? '\u134E\u1276 \u12EB\u1295\u1231 \u12C8\u12ED\u121D \u12ED\u121D\u1228\u1321' : 'Take / choose photo'}
                </p>
              )}
            </div>
          )}
          {!isPayment && photoError && (
            <p className="text-xs mt-1 font-medium" style={{ color: '#dc2626' }}>
              {photoError}
            </p>
          )}

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

        {/* Multi-item breakdown (credit_add only) — mirrors TransactionForm's 🧺 UX */}
        {!isPayment && (
          <div>
            <button
              type="button"
              onClick={() => setShowBreakdown(v => !v)}
              className="flex items-center gap-1 text-sm font-semibold py-1 min-h-[36px]"
              style={{ color: '#C4883A' }}
            >
              {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {validLineItems.length > 0
                ? (lang === 'am' ? `🧺 ${validLineItems.length} ዕቃዎች` : `🧺 ${validLineItems.length} items`)
                : (lang === 'am' ? '🧺 ብዙ ዕቃዎች ይከፋፍሉ' : '🧺 Break down into items')}
            </button>

            {showBreakdown && (
              <div
                className="mt-2 p-3 border space-y-3"
                style={{ background: 'var(--color-bg)', borderColor: '#e8e2d8', borderRadius: 'var(--radius-md)' }}
              >
                {/* Tap saved item chips to add a line */}
                {topCatalogItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
                      {lang === 'am' ? 'ለማከል ይጫኑ' : 'Tap saved item to add'}
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {topCatalogItems.map(entry => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => addFromCatalogToBreakdown(entry)}
                          className="flex-shrink-0 px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center gap-1"
                          style={{
                            borderColor: '#e8e2d8',
                            borderRadius: 'var(--radius-sm)',
                            background: '#fff',
                            color: '#374151',
                          }}
                        >
                          <Plus className="w-3 h-3" />
                          {entry.name}
                          {entry.default_price != null && (
                            <span className="ml-1 font-normal" style={{ color: '#9ca3af' }}>
                              {fmt(entry.default_price)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line items editor */}
                {lineItems.length > 0 && (
                  <div className="space-y-1.5">
                    {lineItems.map((line, idx) => (
                      <div key={line.id} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={line.name}
                          onChange={e => updateLineItem(line.id, 'name', e.target.value)}
                          placeholder={lang === 'am' ? `ዕቃ ${idx + 1}` : `item ${idx + 1}`}
                          className="flex-1 min-w-0 px-2 py-2 border focus:outline-none text-sm"
                          style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={fmtInput(line.amount)}
                          onChange={e => handleLineItemAmount(line.id, e)}
                          placeholder="0"
                          className="w-20 px-2 py-2 border focus:outline-none text-sm text-right font-bold"
                          style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeLineItem(line.id)}
                          className="press-scale flex items-center justify-center flex-shrink-0"
                          style={{ minWidth: '32px', minHeight: '32px' }}
                          aria-label={lang === 'am' ? 'አስወግድ' : 'Remove'}
                        >
                          <X className="w-4 h-4" style={{ color: '#9ca3af' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add another */}
                <button
                  type="button"
                  onClick={() => addLineItem()}
                  className="w-full py-2 text-xs font-bold border border-dashed press-scale flex items-center justify-center gap-1"
                  style={{
                    borderColor: '#c9bfa8',
                    borderRadius: 'var(--radius-sm)',
                    background: '#faf9f7',
                    color: '#6b7280',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  {lineItems.length === 0
                    ? (lang === 'am' ? 'የመጀመሪያ ዕቃ ጨምር' : 'Add first item')
                    : (lang === 'am' ? 'ሌላ ዕቃ ጨምር' : 'Add another item')}
                </button>

                {/* Totals · sync-to-sum button */}
                {validLineItems.length > 0 && (
                  <div className="text-xs pt-2 space-y-1" style={{ borderTop: '1px solid #e8e2d8' }}>
                    <div className="flex justify-between" style={{ color: '#374151' }}>
                      <span>{lang === 'am' ? 'የዕቃዎች ድምር' : 'Items total'}:</span>
                      <span className="font-bold">{fmt(lineItemsTotal)} {lang === 'am' ? 'ብር' : 'birr'}</span>
                    </div>
                    {parsedAmount > 0 && Math.abs(breakdownDelta) > 0.01 && (
                      <button
                        type="button"
                        onClick={syncAmountToBreakdownSum}
                        className="w-full flex justify-between items-center px-1.5 py-1 press-scale"
                        style={{
                          color: breakdownDelta > 0 ? '#C4883A' : '#dc2626',
                          background: breakdownDelta > 0 ? 'rgba(196,136,58,0.08)' : 'rgba(220,38,38,0.06)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <span>{breakdownDelta > 0 ? (lang === 'am' ? 'ቀሪ' : 'Unaccounted') : (lang === 'am' ? 'በላይ' : 'Items exceed')}:</span>
                        <span className="font-bold">{fmt(Math.abs(breakdownDelta))} ⤴</span>
                      </button>
                    )}
                    {(parsedAmount === 0 || parsedAmount === lineItemsTotal) && lineItemsTotal > 0 && (
                      <button
                        type="button"
                        onClick={syncAmountToBreakdownSum}
                        className="w-full flex justify-between items-center px-1.5 py-1 press-scale"
                        style={{
                          color: '#16a34a',
                          background: 'rgba(22,163,74,0.06)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <span>{lang === 'am' ? 'መጠን ከድምር ጋር ይሞላ' : 'Use items sum as total'}</span>
                        <span className="font-bold">⤴</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Due date (credit only) */}
        {!isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {t.dueDateOptional}
            </label>
            {/* Commit C.6: All 4 controls in ONE responsive row.
                Today / Tomorrow / Next week as quick chips + a calendar icon
                button that opens the native date picker. Hidden date input
                catches the picker output. Chips shrink to fit small screens. */}
            <div className="flex gap-1.5 mb-1.5" style={{ alignItems: 'stretch' }}>
              {dueDateOptions.map((option) => {
                const optionDate = new Date(option.value).toISOString().slice(0, 10);
                const active = dueDate === optionDate;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDueDate(optionDate)}
                    className="flex-1 min-w-0 px-1.5 py-1.5 text-center border press-scale"
                    style={{
                      background: active ? accentColor : '#fff',
                      color: active ? '#fff' : '#374151',
                      borderColor: active ? accentColor : '#e8e2d8',
                      borderRadius: 'var(--radius-sm)',
                      minHeight: 48,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1.1,
                    }}
                  >
                    <span className="block text-[11px] font-bold truncate w-full">{option.label}</span>
                    <span className="block text-[9px] opacity-80 truncate w-full">{option.display}</span>
                  </button>
                );
              })}
              {/* Calendar icon button — Commit C.7: opens our custom Ethiopian
                  calendar picker modal instead of the browser's Gregorian
                  native picker. When dueDate is custom (doesn't match any
                  quick chip), this button is active-styled. */}
              <button
                type="button"
                onClick={() => setShowDatePicker(true)}
                aria-label={lang === 'am' ? 'ቀን ይምረጡ' : 'Pick date'}
                className="flex-shrink-0 press-scale"
                style={{
                  width: 48, minHeight: 48,
                  background: dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate)
                    ? accentColor : '#fff',
                  color: dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate)
                    ? '#fff' : '#374151',
                  border: `1px solid ${dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate)
                    ? accentColor : '#e8e2d8'}`,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <CalendarDays className="w-5 h-5" />
              </button>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  aria-label={lang === 'am' ? 'አጥፋ' : 'Clear'}
                  className="flex-shrink-0 press-scale flex items-center justify-center"
                  style={{
                    width: 36, minHeight: 48,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 'var(--radius-sm)',
                    color: '#dc2626',
                    cursor: 'pointer',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Ethiopian display — promoted to a clearer affirmation under the row */}
            {dueDate && (
              <p
                className="text-xs mt-2 font-bold flex items-center gap-1"
                style={{ color: accentColor }}
              >
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em' }}>
                  {lang === 'am' ? 'ኢትዮጵያ ዘመን' : 'ETHIOPIAN'}
                </span>
                · {formatEthiopian(new Date(dueDate))}
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

      {/* Commit C.7: Ethiopian calendar picker modal */}
      <EthiopianDatePicker
        open={showDatePicker}
        value={dueDate}
        onChange={(iso) => setDueDate(iso)}
        onClose={() => setShowDatePicker(false)}
        lang={lang}
      />

      {/* B2: rear-camera capture modal (product photo) */}
      <CameraCapture
        open={showCamera}
        onCapture={handleCameraPhoto}
        onClose={() => { setShowCamera(false); setReplacePhotoId(null); }}
        lang={lang}
      />
    </div>
  );
}

export default CustomerTransactionSheet;
