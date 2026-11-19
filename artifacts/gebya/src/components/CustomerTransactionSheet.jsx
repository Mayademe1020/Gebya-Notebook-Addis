// CustomerTransactionSheet.jsx — v4 simplified credit/payment entry.
//
// Same one-handed treatment as TransactionForm:
// - Compact header with customer name
// - Hero amount with quick additive chips
// - Catalog as chips (no dropdown)
// - Optional one-line note
// - Compact due-date pills
// - Solid colored save button
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Plus, Camera, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import InlineDatePicker from './InlineDatePicker';
import CameraCapture from './CameraCapture';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { getDueDateOptions } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';
import { photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, normalizePhotos, MAX_PROOF_PHOTOS } from '../utils/photoProof';
import AddProviderButton from './AddProviderButton';
import { label } from '../labels/index';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  setter(raw);
}

function CustomerTransactionSheet({
  customer,
  mode = CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
  initialAmount,
  editingTransaction,
  onSave,
  onDone,
  actorLabel,
  catalogEntries = [],
  enabledProviders,
  onAddProvider,
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

  // Payment method state — only meaningful for PAYMENT mode
  const initPaymentMethod = isEditing && editingTransaction?.payment_method
    ? editingTransaction.payment_method
    : 'cash';
  const initPaymentProvider = isEditing && editingTransaction?.payment_provider
    ? editingTransaction.payment_provider
    : '';
  const [paymentMethod, setPaymentMethod] = useState(initPaymentMethod);
  const [paymentProvider, setPaymentProvider] = useState(initPaymentProvider);

  // Overpayment confirmation state
  const [showOverpaymentConfirm, setShowOverpaymentConfirm] = useState(false);
  const [pendingPaymentAmount, setPendingPaymentAmount] = useState(null);

  const handleCameraPhoto = (dataUrl) => {
    if (replacePhotoId) {
      const proof = createPhotoProof(dataUrl);
      if (proof) setPhotos(prev => prev.map(entry => (entry.id === replacePhotoId ? proof : entry)));
    } else {
      if (photos.length >= MAX_PROOF_PHOTOS) return;
      const proof = createPhotoProof(dataUrl);
      if (proof) setPhotos(prev => [...prev, proof].slice(0, MAX_PROOF_PHOTOS));
    }
    setReplacePhotoId(null);
    setShowCamera(false);
    setPhotoError(null);
  };

  const openPhotoCapture = (photoId = null) => {
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
  const currentBalance = Math.max(Number(initialAmount ?? customer?.balance) || 0, 0);
  // In edit mode, the existing row is already in `balance`; relax validation so
  // the shopkeeper can correct typos without spurious overpayment errors.
  const hasCollectableBalance = isEditing || !isPayment || currentBalance > 0;
  const updatedBalance = isPayment
    ? Math.max(currentBalance - parsedAmount, 0)
    : currentBalance + parsedAmount;
  const dueDateOptions = useMemo(() => getDueDateOptions(), []);
  const overPayment = isPayment && !isEditing && parsedAmount > currentBalance;

  const canSave = parsedAmount > 0 && hasCollectableBalance && !saving;

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
        id: `new-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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
  const accentColor = isPayment ? 'var(--color-success)' : 'var(--color-accent-amber)';
  const headerLabel = isEditing
    ? (lang === 'am'
        ? (isPayment ? '✏️ ክፍያ ማስተካከያ' : '✏️ ዱቤ ማስተካከያ')
        : (isPayment ? '✏️ Edit payment' : '✏️ Edit credit'))
    : isPayment
      ? (label('customers.payment-2', lang))
      : (label('customers.credit-2', lang));
  const saveButtonText = isEditing
    ? (label('customers.update', lang))
    : isPayment
      ? (label('customers.save-payment', lang))
      : (label('customers.save-credit', lang));

  const topCatalogItems = catalogEntries
    .filter(e => e && e.active !== false && e.name)
    .slice(0, 8);

  // Payment method options — Cash always first, then only what's enabled in Settings
  const paymentOptions = useMemo(() => {
    const banks = enabledProviders?.banks || [];
    const wallets = enabledProviders?.wallets || [];
    return [
      { id: 'cash', label: 'Cash', emoji: '💵', type: 'cash', provider: '' },
      ...banks.map(b => ({ id: `bank:${b}`, label: b, emoji: '🏦', type: 'bank', provider: b })),
      ...wallets.map(w => ({ id: `wallet:${w}`, label: w, emoji: '📱', type: 'wallet', provider: w })),
    ];
  }, [enabledProviders]);

  // Reset to cash if the selected provider was disabled in Settings
  const enabledBanks = enabledProviders?.banks || [];
  const enabledWallets = enabledProviders?.wallets || [];
  useEffect(() => {
    if (paymentMethod === 'bank' && !enabledBanks.includes(paymentProvider)) {
      setPaymentMethod('cash');
      setPaymentProvider('');
    } else if (paymentMethod === 'wallet' && !enabledWallets.includes(paymentProvider)) {
      setPaymentMethod('cash');
      setPaymentProvider('');
    }
  }, [enabledBanks, enabledWallets, paymentMethod, paymentProvider]);

  const handleSave = async () => {
    if (!canSave) return;
    if (!isValidCustomerTransactionType(transactionType)) return;

    // Check for overpayment - but allow if user confirmed
    const isConfirmedOverpayment = pendingPaymentAmount !== null && pendingPaymentAmount > 0;
    if (isPayment && !isEditing && parsedAmount > currentBalance && !isConfirmedOverpayment) {
      setPendingPaymentAmount(parsedAmount);
      setShowOverpaymentConfirm(true);
      return;
    }

    // Clear pending amount after using it
    if (isConfirmedOverpayment) {
      setPendingPaymentAmount(null);
    }

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
        // Payment method — only for payment mode
        payment_method: isPayment ? paymentMethod : null,
        payment_provider: isPayment && paymentMethod !== 'cash' ? paymentProvider : null,
        sale_settlement_mode: isPayment ? 'paid' : null,
        editing_id: editingTransaction?.id || null,
      });
      if (didSave) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const handleQuickItem = (entry) => {
    setCatalogEntryId(String(entry.id));
    if (!itemNote.trim()) setItemNote(entry.name || '');
    if (!amount && entry.default_price != null) setAmount(String(entry.default_price));
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-50 max-w-md mx-auto flex flex-col"
      style={{ background: 'var(--color-surface)' }}
    >
      {/* Header: back arrow + type label + customer name */}
      <div
        className="flex-shrink-0 px-3 sm:px-4 py-3 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={onDone}
          aria-label={label('customers.back', lang)}
          className="press-scale flex items-center justify-center"
          style={{ minWidth: '36px', minHeight: '36px', padding: '4px' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h2 className="text-base font-bold truncate" style={{ color: accentColor }}>{headerLabel}</h2>
          {customer?.display_name && (
            <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{customer.display_name}</p>
          )}
        </div>
        {actorLabel ? (
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: 'var(--color-warning)', maxWidth: '80px', textAlign: 'right' }}
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
            background: isPayment ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
            borderColor: isPayment ? 'var(--color-success-border)' : 'var(--color-warning-border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              {t.previousBalance}
            </p>
            <p className="text-base font-bold truncate" style={{ color: 'var(--color-text)' }}>
              {fmt(currentBalance)} {t.birr}
            </p>
          </div>
          <span className="flex-shrink-0" style={{ color: 'var(--color-text-soft)' }}>→</span>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              {t.updatedBalance}
            </p>
            <p className="text-base font-bold truncate" style={{ color: isPayment ? 'var(--color-success-text)' : 'var(--color-warning)' }}>
              {fmt(updatedBalance)} {t.birr}
            </p>
          </div>
        </div>

        {/* AMOUNT — the hero */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {t.amount} <span style={{ color: 'var(--color-danger)' }}>*</span>
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
                borderBottom: `2px solid ${amount ? accentColor : 'var(--color-border)'}`,
                background: 'transparent',
                color: amount ? accentColor : 'var(--color-text-soft)',
              }}
            />
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base sm:text-lg font-semibold"
              style={{ color: 'var(--color-text-soft)' }}
            >
              {t.birr}
            </span>
          </div>

          {isPayment && !hasCollectableBalance && (
            <p className="text-xs font-medium mt-2" style={{ color: 'var(--color-warning)' }}>
              {t.noBalanceToRecordPayment}
            </p>
          )}
          {overPayment && (
            <p className="text-xs font-medium mt-2 text-red-600">
              {t.paymentExceedsOwed}
            </p>
          )}
        </div>

        {/* Payment method chips — payment mode only. Cash is always shown;
            banks/wallets appear only if the user enabled them in Settings. */}
        {isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('customers.payment-method', lang)}
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {paymentOptions.map(opt => {
                const selected = opt.type === 'cash'
                  ? paymentMethod === 'cash'
                  : paymentMethod === opt.type && paymentProvider === opt.provider;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setPaymentMethod(opt.type); setPaymentProvider(opt.provider); }}
                    className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 border-2 text-xs font-bold transition-all min-h-[40px] press-scale"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                      background: selected ? 'rgba(27,67,50,0.08)' : 'var(--color-bg-white)',
                      color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="text-sm">{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <AddProviderButton onAddProvider={onAddProvider} />
            </div>
          </div>
        )}

        {/* Note (optional) + Photo button inline (credit only — proof of goods) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {isPayment ? t.paymentNoteOptional : t.itemNoteOptional}
          </label>
          <div className="flex gap-2 items-stretch">
            <input
              type="text"
              value={itemNote}
              onChange={e => setItemNote(e.target.value)}
              placeholder={isPayment ? t.paymentNotePlaceholder : t.creditItemPlaceholder}
              className="flex-1 min-w-0 p-3 border-2 focus:outline-none text-base"
              style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
            />
            {/* Product proof photos - credits only (payments stay photo-free). */}
            {!isPayment && (
              <button
                type="button"
                onClick={() => openPhotoCapture(null)}
                disabled={photoLoading}
                className="cursor-pointer press-scale flex items-center justify-center flex-shrink-0"
                style={{
                  width: 56,
                  border: '2px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: photos.length > 0 ? 'var(--color-success-bg)' : 'var(--color-surface-subtle)',
                  opacity: photos.length > 0 ? 0.55 : 1,
                  position: 'relative',
                }}
                aria-label={label('customers.take-or-choose-photo', lang)}
              >
                {photoLoading
                  ? <span className="text-sm">...</span>
                  : <Camera className="w-6 h-6" style={{ color: photos.length > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
                }
                {photos.length < MAX_PROOF_PHOTOS && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: -7,
                      right: -7,
                      minWidth: 24,
                      height: 20,
                      padding: '0 5px',
                      borderRadius: 999,
                       background: accentColor,
                      color: 'var(--color-bg-white)',
                      border: '2px solid #fff',
                      fontSize: 10,
                      fontWeight: 900,
                      lineHeight: '16px',
                      textAlign: 'center',
                    }}
                  >
                    +{MAX_PROOF_PHOTOS - photos.length}
                  </span>
                )}
              </button>
            )}
          </div>

          {!isPayment && photos.length > 0 && (
            <div className="mt-2 p-2"
              style={{ background: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                  {label('customers.proof-photos', lang)}
                </p>
                <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                  {photos.length} {label('customers.photos', lang)}
                </p>
              </div>
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                {photos.map((entry, index) => (
                  <div key={entry.id} className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openPhotoCapture(entry.id)}
                      className="press-scale block"
                      style={{ padding: 0, border: 'none', background: 'transparent' }}
                      aria-label={label('customers.replace-photo', lang, () => index + 1)}
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
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                      }}
                      aria-label={label('customers.remove-photo', lang, () => index + 1)}
                    >
                      <X className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                    <p className="text-[10px] text-center mt-1" style={{ color: 'var(--color-text-soft)' }}>
                      {Math.round(photoSizeBytes(entry.dataUrl) / 1024)} KB
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isPayment && photoError && (
            <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-danger)' }}>
              {photoError}
            </p>
          )}

          {/* Quick item chips from catalog (credit only — saves can tap to auto-fill note + amount) */}
          {!isPayment && topCatalogItems.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                {label('customers.quick-items', lang)}
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 items-center">
                {topCatalogItems.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleQuickItem(entry)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-bold border press-scale"
                    style={{
                      borderColor: 'var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
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
              style={{ color: 'var(--color-accent-amber)' }}
            >
              {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {validLineItems.length > 0
                ? (label('customers.items', lang, validLineItems.length))
                : (label('customers.break-down-into-items', lang))}
            </button>

            {showBreakdown && (
              <div
                className="mt-2 p-3 border space-y-3"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
              >
                {/* Tap saved item chips to add a line */}
                {topCatalogItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      {label('customers.tap-saved-item-to-add', lang)}
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {topCatalogItems.map(entry => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => addFromCatalogToBreakdown(entry)}
                          className="flex-shrink-0 px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center gap-1"
                          style={{
                            borderColor: 'var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                          }}
                        >
                          <Plus className="w-3 h-3" />
                          {entry.name}
                          {entry.default_price != null && (
                            <span className="ml-1 font-normal" style={{ color: 'var(--color-text-soft)' }}>
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
                          placeholder={label('customers.item', lang, idx + 1)}
                          className="flex-1 min-w-0 px-2 py-2 border focus:outline-none text-sm"
                          style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={fmtInput(line.amount)}
                          onChange={e => handleLineItemAmount(line.id, e)}
                          placeholder="0"
                          className="w-20 px-2 py-2 border focus:outline-none text-sm text-right font-bold"
                          style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeLineItem(line.id)}
                          className="press-scale flex items-center justify-center flex-shrink-0"
                          style={{ minWidth: '32px', minHeight: '32px' }}
                          aria-label={label('customers.remove', lang)}
                        >
                          <X className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />
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
                    borderColor: 'var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-subtle)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  {lineItems.length === 0
                    ? (label('customers.add-first-item', lang))
                    : (label('customers.add-another-item', lang))}
                </button>

                {/* Totals · sync-to-sum button */}
                {validLineItems.length > 0 && (
                  <div className="text-xs pt-2 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="flex justify-between" style={{ color: 'var(--color-text)' }}>
                      <span>{label('customers.items-total', lang)}:</span>
                      <span className="font-bold">{fmt(lineItemsTotal)} {label('customers.birr', lang)}</span>
                    </div>
                    {parsedAmount > 0 && Math.abs(breakdownDelta) > 0.01 && (
                      <button
                        type="button"
                        onClick={syncAmountToBreakdownSum}
                        className="w-full flex justify-between items-center px-1.5 py-1 press-scale"
                        style={{
                          color: breakdownDelta > 0 ? 'var(--color-accent-amber)' : 'var(--color-danger)',
                          background: breakdownDelta > 0 ? 'rgba(196,136,58,0.08)' : 'rgba(220,38,38,0.06)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <span>{breakdownDelta > 0 ? (label('customers.unaccounted', lang)) : (label('customers.items-exceed', lang))}:</span>
                        <span className="font-bold">{fmt(Math.abs(breakdownDelta))} ⤴</span>
                      </button>
                    )}
                    {(parsedAmount === 0 || parsedAmount === lineItemsTotal) && lineItemsTotal > 0 && (
                      <button
                        type="button"
                        onClick={syncAmountToBreakdownSum}
                        className="w-full flex justify-between items-center px-1.5 py-1 press-scale"
                        style={{
                          color: 'var(--color-success)',
                          background: 'rgba(22,163,74,0.06)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <span>{label('customers.use-items-sum-as-total', lang)}</span>
                        <span className="font-bold">⤴</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Due date — compact chip row */}
        {!isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {t.dueDateOptional}
            </label>
            <div className="flex gap-2 mb-2">
              {dueDateOptions.map((option) => {
                const optionDate = new Date(option.value).toISOString().slice(0, 10);
                const active = dueDate === optionDate;
                return (
                  <button key={option.value} type="button" onClick={() => setDueDate(optionDate)} className="press-scale"
                    style={{
                      padding: '8px 12px', minWidth: 70, minHeight: 40,
                      border: `2px solid ${active ? accentColor : 'var(--color-border)'}`,
                      borderRadius: 8,
                      background: active ? accentColor : 'var(--color-bg-white)',
                      color: active ? 'var(--color-bg-white)' : 'var(--color-text)',
                      fontSize: '0.8rem', fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}>
                    {option.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setShowDatePicker(true)} className="press-scale"
                style={{
                  padding: '8px 12px', minWidth: 70, minHeight: 40,
                  border: `2px solid ${dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate) ? accentColor : 'var(--color-border)'}`,
                  borderRadius: 8,
                  background: dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate) ? accentColor : 'var(--color-bg-white)',
                  color: dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate) ? 'var(--color-bg-white)' : 'var(--color-text)',
                  fontSize: '0.8rem', fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                📅 <span>{label('customers.pick', lang)}</span>
              </button>
            </div>
            <InlineDatePicker
              open={showDatePicker}
              value={dueDate}
              onChange={(iso) => setDueDate(iso)}
              onClose={() => setShowDatePicker(false)}
              lang={lang}
            />
          </div>
        )}
      </div>

      {/* Sticky save button */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full p-3 font-bold text-white text-base flex items-center justify-center gap-2 transition-all press-scale"
          style={{
            background: canSave ? accentColor : 'var(--color-bg-disabled)',
            color: canSave ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
            cursor: canSave ? 'pointer' : 'not-allowed',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Save className="w-5 h-5" />
          {saving ? t.saving : saveButtonText}
        </button>
      </div>

      {/* Overpayment confirmation dialog */}
      {showOverpaymentConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="bg-white w-full max-w-sm mx-4 p-5"
            style={{ borderRadius: 'var(--radius-xl)' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-warning-bg)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-accent-amber)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
                  {label('customers.overpayment', lang)}
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {label('customers.your-payment-exceeds-the-current-balance-of', lang, fmt(currentBalance))}
                </p>
              </div>
            </div>

            <div
              className="p-3 mb-4"
              style={{
                background: 'var(--color-warning-bg)',
                border: '1px solid var(--color-warning-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {label('customers.payment-amount', lang)}
                </span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {fmt(parsedAmount)} {t.birr}
                </span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {label('customers.current-balance', lang)}
                </span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {fmt(currentBalance)} {t.birr}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold" style={{ color: 'var(--color-accent-amber)' }}>
                  {label('customers.excess', lang)}
                </span>
                <span className="text-sm font-black" style={{ color: 'var(--color-accent-amber)' }}>
                  {fmt(Math.max(0, parsedAmount - currentBalance))} {t.birr}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowOverpaymentConfirm(false); setPendingPaymentAmount(null); }}
                className="flex-1 py-2.5 border-2 text-sm font-bold press-scale"
                style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                {label('customers.cancel', lang)}
              </button>
              <button
                type="button"
                onClick={() => { setShowOverpaymentConfirm(false); }}
                className="flex-1 py-2.5 border-2 text-sm font-black press-scale"
                style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-primary)', background: 'var(--color-primary)', color: 'var(--color-bg-white)' }}
              >
                {label('customers.continue', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

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
