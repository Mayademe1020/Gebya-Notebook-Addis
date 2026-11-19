// SupplierTransactionSheet.jsx — record a purchase-on-credit or a payment-to-supplier
//
// Commit D: adds product photo (purchase only) + edit mode (editingTransaction prop).
// Mirror of CustomerTransactionSheet patterns: compact header, hero amount,
// additive chips, photo capture for the item bought. No Telegram (suppliers
// don't get reminders) and no multi-item breakdown (supplier purchases are
// typically batched: "5 bags coffee = 5000 birr").
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Camera } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { SUPPLIER_TRANSACTION_TYPES, isValidSupplierTransactionType } from '../utils/supplierLedger';
import { useLang } from '../context/LangContext';
import { photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, normalizePhotos, MAX_PROOF_PHOTOS } from '../utils/photoProof';
import CameraCapture from './CameraCapture';
import InlineDatePicker from './InlineDatePicker';
import { getDueDateOptions } from '../utils/ethiopianCalendar';
import AddProviderButton from './AddProviderButton';
import { label } from '../labels/index';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  setter(raw);
}

function SupplierTransactionSheet({
  supplier,
  mode = SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
  initialAmount,
  editingTransaction = null,
  onSave,
  onDone,
  actorLabel,
  enabledProviders,
  onAddProvider,
}) {
  const { t, lang } = useLang();
  const editing = !!editingTransaction?.id;
  const [amount, setAmount] = useState(() => {
    if (editing) return String(editingTransaction.amount || '');
    return initialAmount != null && initialAmount > 0 ? String(initialAmount) : '';
  });
  const [itemName, setItemName] = useState(editing ? (editingTransaction.item_name || '') : '');
  const [note, setNote] = useState(() => (editing ? (editingTransaction.note || '') : ''));
  const [saving, setSaving] = useState(false);
  const [dueDate, setDueDate] = useState(() => {
    if (editing && editingTransaction.due_date) {
      return new Date(editingTransaction.due_date).toISOString().slice(0, 10);
    }
    return '';
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dueDateOptions = useMemo(() => getDueDateOptions(), []);
  // Product proof photos for purchases (base64 JPEG data URLs, max 3)
  const [photos, setPhotos] = useState(() => (editing ? normalizePhotos(editingTransaction) : []));
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false); // B2: rear-camera capture modal
  const [replacePhotoId, setReplacePhotoId] = useState(null);

  // Payment method state — only meaningful for PAYMENT mode
  const initPaymentMethod = editing && editingTransaction?.payment_method
    ? editingTransaction.payment_method
    : 'cash';
  const initPaymentProvider = editing && editingTransaction?.payment_provider
    ? editingTransaction.payment_provider
    : '';
  const [paymentMethod, setPaymentMethod] = useState(initPaymentMethod);
  const [paymentProvider, setPaymentProvider] = useState(initPaymentProvider);

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

  const transactionType = useMemo(() => {
    if (editing) return editingTransaction.type;
    if (mode === SUPPLIER_TRANSACTION_TYPES.PAYMENT) return SUPPLIER_TRANSACTION_TYPES.PAYMENT;
    return SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD;
  }, [mode, editing, editingTransaction]);

  const isPayment = transactionType === SUPPLIER_TRANSACTION_TYPES.PAYMENT;
  const parsedAmount = parseFloat(parseInput(amount)) || 0;
  const currentBalance = Math.max(Number(supplier?.balance) || 0, 0);
  // In edit mode, the row's existing amount is already part of currentBalance —
  // for over-payment check, compare against (balance + originalAmount) to allow
  // adjusting an existing payment without false "exceeds owed" errors.
  const originalAmount = editing ? Number(editingTransaction.amount || 0) : 0;
  const balanceForCompare = editing && isPayment ? currentBalance + originalAmount : currentBalance;
  const hasOutstanding = !isPayment || balanceForCompare > 0;
  const updatedBalance = isPayment
    ? Math.max(balanceForCompare - parsedAmount, 0)
    : currentBalance + (editing ? (parsedAmount - originalAmount) : parsedAmount);
  const overPayment = isPayment && parsedAmount > balanceForCompare;
  const canSave = parsedAmount > 0 && !overPayment && hasOutstanding && !saving;

  const accentColor = isPayment ? 'var(--color-success)' : 'var(--color-danger)'; // Commit D: red for purchase (supplier side)
  const headerLabel = editing
    ? (isPayment
        ? (label('suppliers.edit-payment', lang))
        : (label('suppliers.edit-purchase', lang)))
    : (isPayment
        ? (label('suppliers.payment-2', lang))
        : (label('suppliers.buy', lang)));
  const saveButtonText = editing
    ? (label('suppliers.update', lang))
    : isPayment
      ? (label('suppliers.save-payment', lang))
      : (label('suppliers.save-purchase', lang));

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

  const handleSave = async () => {
    if (!canSave) return;
    if (!isValidSupplierTransactionType(transactionType)) return;
    setSaving(true);
    try {
      const payload = {
        supplier_id: supplier?.id,
        type: transactionType,
        amount: parsedAmount,
        item_name: itemName.trim() || null,
        note: note.trim() || null,
        due_date: !isPayment && dueDate ? new Date(dueDate).getTime() : null,
        // Product proof photos (purchase only - payments stay photo-free)
        ...(!isPayment ? buildPhotoFields(photos) : { photos: [], photo: null, photo_taken_at: null }),
        // Payment method — only for payment mode
        payment_method: isPayment ? paymentMethod : null,
        payment_provider: isPayment && paymentMethod !== 'cash' ? paymentProvider : null,
        sale_settlement_mode: isPayment ? 'paid' : 'credit',
      };
      if (editing) payload.editing_id = editingTransaction.id;
      const didSave = await onSave?.(payload);
      if (didSave) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-50 max-w-md mx-auto flex flex-col"
      style={{ background: 'var(--color-surface)' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-3 sm:px-4 py-3 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={onDone}
          aria-label={label('suppliers.back', lang)}
          className="press-scale flex items-center justify-center"
          style={{ minWidth: '36px', minHeight: '36px', padding: '4px' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h2 className="text-base font-bold truncate" style={{ color: accentColor }}>{headerLabel}</h2>
          {supplier?.display_name && (
            <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{supplier.display_name}</p>
          )}
        </div>
        {actorLabel ? (
          <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-warning)', maxWidth: '80px', textAlign: 'right' }} title={actorLabel}>
            {actorLabel}
          </span>
        ) : (
          <div style={{ width: '36px' }} />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">

        {/* Balance line */}
        <div
          className="p-3 border flex items-center justify-between gap-2"
          style={{
            background: isPayment ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            borderColor: isPayment ? 'var(--color-success-border)' : 'var(--color-danger-border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              {label('suppliers.currently-owed', lang)}
            </p>
            <p className="text-base font-bold truncate" style={{ color: 'var(--color-text)' }}>
              {fmt(currentBalance)} {label('suppliers.birr', lang)}
            </p>
          </div>
          <span className="flex-shrink-0" style={{ color: 'var(--color-text-soft)' }}>→</span>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              {label('suppliers.after', lang)}
            </p>
            <p className="text-base font-bold truncate" style={{ color: isPayment ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
              {fmt(updatedBalance)} {label('suppliers.birr', lang)}
            </p>
          </div>
        </div>

        {/* Amount hero */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {label('suppliers.amount', lang)} <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={fmtInput(amount)}
              onChange={(e) => handleNumericInput(e, setAmount)}
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
              {label('suppliers.birr', lang)}
            </span>
          </div>

        {/* Payment method chips — payment mode only. Cash is always shown;
            banks/wallets appear only if the user enabled them in Settings. */}
        {isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('suppliers.payment-method', lang)}
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

        {!hasOutstanding && isPayment && (
            <p className="text-xs font-medium mt-2" style={{ color: 'var(--color-warning)' }}>
              {label('suppliers.nothing-outstanding-to-pay', lang)}
            </p>
          )}
          {overPayment && (
            <p className="text-xs font-medium mt-2 text-red-600">
              {label('suppliers.payment-exceeds-what-is-owed', lang)}
            </p>
          )}

          {/* Note (optional) — available for both payment and purchase */}
          <div className="mt-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('suppliers.note-optional-2', lang)}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={label('suppliers.e-g-current-stock-status', lang)}
              rows={2}
              className="w-full p-3 border-2 focus:outline-none text-base resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
            />
          </div>
        </div>

        {/* Item / note + product photo (only for purchases — Commit D) */}
        {!isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('suppliers.what-did-you-buy-optional', lang)}
            </label>
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={label('suppliers.e-g-5-bags-coffee', lang)}
                className="flex-1 p-3 border-2 focus:outline-none text-base"
                style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
              />
              {/* 56px inline photo button — B2: opens rear-camera capture modal */}
              <button
                type="button"
                onClick={() => openPhotoCapture(null)}
                disabled={photoLoading}
                className="flex items-center justify-center press-scale cursor-pointer"
                style={{
                  width: 56, height: 56,
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid var(--color-border)',
                  background: photos.length > 0 ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                  opacity: photos.length > 0 ? 0.55 : 1,
                  flexShrink: 0,
                  position: 'relative',
                  padding: 0,
                }}
                aria-label={label('suppliers.take-or-choose-photo', lang)}
              >
                {photoLoading
                  ? <span className="text-sm">...</span>
                  : <Camera className="w-5 h-5" style={{ color: photos.length > 0 ? 'var(--color-success)' : 'var(--color-danger)' }} />
                }
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
                  +1
                </span>
              </button>
            </div>
            {photos.length > 0 && (
              <div className="mt-2 p-2" style={{ background: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                    {label('suppliers.proof-photos', lang)}
                  </p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                     {photos.length} {label('suppliers.photos', lang)}
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
                        aria-label={label('suppliers.replace-photo', lang, () => index + 1)}
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
                        aria-label={label('suppliers.remove-photo', lang, () => index + 1)}
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
            {photoError && (
              <p style={{ fontSize: '0.7rem', color: 'var(--color-danger)', marginTop: 4 }}>{photoError}</p>
            )}

            {/* Due date — compact chip row */}
            <div className="mt-3">
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {label('suppliers.due-date-optional', lang)}
              </label>
              <div className="flex gap-2 mb-2">
                {dueDateOptions.map(opt => {
                  const optionDate = new Date(opt.value).toISOString().slice(0, 10);
                  const active = dueDate === optionDate;
                  return (
                    <button key={opt.value} type="button" onClick={() => setDueDate(optionDate)} className="press-scale"
                      style={{
                        padding: '8px 12px', minWidth: 70, minHeight: 40,
                        border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 8,
                        background: active ? 'var(--color-primary)' : 'var(--color-bg-white)',
                        color: active ? 'var(--color-bg-white)' : 'var(--color-text)',
                        fontSize: '0.8rem', fontWeight: 700,
                        cursor: 'pointer', flexShrink: 0,
                      }}>
                      {opt.label}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setShowDatePicker(true)} className="press-scale"
                  style={{
                    padding: '8px 12px', minWidth: 70, minHeight: 40,
                    border: `2px solid ${dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate) ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 8,
                    background: dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate) ? 'var(--color-primary)' : 'var(--color-bg-white)',
                    color: dueDate && !dueDateOptions.some(o => new Date(o.value).toISOString().slice(0, 10) === dueDate) ? 'var(--color-bg-white)' : 'var(--color-text)',
                    fontSize: '0.8rem', fontWeight: 700,
                    cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  📅 <span>{label('suppliers.pick', lang)}</span>
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
          </div>
        )}
      </div>

      {/* Sticky save */}
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
          {saving ? (label('suppliers.saving', lang)) : saveButtonText}
        </button>
      </div>

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

export default SupplierTransactionSheet;
