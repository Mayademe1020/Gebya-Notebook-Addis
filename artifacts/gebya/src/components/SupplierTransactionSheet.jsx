// SupplierTransactionSheet.jsx — record a purchase-on-credit or a payment-to-supplier
//
// Commit D: adds product photo (purchase only) + edit mode (editingTransaction prop).
// Mirror of CustomerTransactionSheet patterns: compact header, hero amount,
// additive chips, photo capture for the item bought. No Telegram (suppliers
// don't get reminders) and no multi-item breakdown (supplier purchases are
// typically batched: "5 bags coffee = 5000 birr").
import { useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Camera } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { SUPPLIER_TRANSACTION_TYPES, isValidSupplierTransactionType } from '../utils/supplierLedger';
import { useLang } from '../context/LangContext';
import { photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, normalizePhotos, MAX_PROOF_PHOTOS } from '../utils/photoProof';
import CameraCapture from './CameraCapture';
import InlineDatePicker from './InlineDatePicker';

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
  editingTransaction = null,  // Commit D: when set, sheet enters edit mode
  onSave,
  onDone,
  actorLabel,
  enabledProviders,
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
    return new Date().toISOString().slice(0, 10);
  });
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

  const accentColor = isPayment ? '#16a34a' : '#dc2626'; // Commit D: red for purchase (supplier side)
  const headerLabel = editing
    ? (isPayment
        ? (lang === 'am' ? '✏️ ክፍያ አስተካክል' : '✏️ Edit payment')
        : (lang === 'am' ? '✏️ ግዢ አስተካክል' : '✏️ Edit purchase'))
    : (isPayment
        ? (lang === 'am' ? '− ክፍያ' : '− Payment')
        : (lang === 'am' ? '+ ግዢ' : '+ Buy'));
  const saveButtonText = editing
    ? (lang === 'am' ? 'አስተካክል' : 'Update')
    : isPayment
      ? (lang === 'am' ? 'ክፍያ አስቀምጥ' : 'Save payment')
      : (lang === 'am' ? 'ግዢ አስቀምጥ' : 'Save purchase');

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
      className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-30 max-w-md mx-auto flex flex-col"
      style={{ background: '#ffffff' }}
    >
      {/* Header */}
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
          {supplier?.display_name && (
            <p className="text-[11px] truncate" style={{ color: '#6b7280' }}>{supplier.display_name}</p>
          )}
        </div>
        {actorLabel ? (
          <span className="text-[11px] font-semibold truncate" style={{ color: '#6b4f1d', maxWidth: '80px', textAlign: 'right' }} title={actorLabel}>
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
            background: isPayment ? '#f0fdf4' : '#fef2f2',
            borderColor: isPayment ? '#bbf7d0' : '#fecaca',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'አሁን ለመክፈል' : 'Currently owed'}
            </p>
            <p className="text-base font-bold truncate" style={{ color: '#1a1a1a' }}>
              {fmt(currentBalance)} {lang === 'am' ? 'ብር' : 'birr'}
            </p>
          </div>
          <span className="flex-shrink-0" style={{ color: '#9ca3af' }}>→</span>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ከዚህ በኋላ' : 'After'}
            </p>
            <p className="text-base font-bold truncate" style={{ color: isPayment ? '#166534' : '#991b1b' }}>
              {fmt(updatedBalance)} {lang === 'am' ? 'ብር' : 'birr'}
            </p>
          </div>
        </div>

        {/* Amount hero */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
            {lang === 'am' ? 'መጠን' : 'Amount'} <span style={{ color: '#dc2626' }}>*</span>
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
                borderBottom: `2px solid ${amount ? accentColor : '#e8e2d8'}`,
                background: 'transparent',
                color: amount ? accentColor : '#9ca3af',
              }}
            />
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base sm:text-lg font-semibold"
              style={{ color: '#9ca3af' }}
            >
              {lang === 'am' ? 'ብር' : 'birr'}
            </span>
          </div>

        {/* Payment method chips — payment mode only. Cash is always shown;
            banks/wallets appear only if the user enabled them in Settings. */}
        {isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'የክፍያ ዘዴ' : 'Payment Method'}
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
                      borderColor: selected ? '#1B4332' : '#e8e2d8',
                      background: selected ? 'rgba(27,67,50,0.08)' : '#fff',
                      color: selected ? '#1B4332' : '#6b7280',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="text-sm">{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

          {!hasOutstanding && isPayment && (
            <p className="text-xs font-medium mt-2" style={{ color: '#b45309' }}>
              {lang === 'am' ? 'ለመክፈል ምንም የለም' : 'Nothing outstanding to pay'}
            </p>
          )}
          {overPayment && (
            <p className="text-xs font-medium mt-2 text-red-600">
              {lang === 'am' ? 'ከዱቤ በላይ ነው' : 'Payment exceeds what is owed'}
            </p>
          )}

          {/* Note (optional) — available for both payment and purchase */}
          <div className="mt-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'መልእክት (አማራጭ)' : 'Note (optional)'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lang === 'am' ? 'ለምሳሌ የትንዳገብ ወቅታዊ ሁኔታ' : 'e.g. current stock status'}
              rows={2}
              className="w-full p-3 border-2 focus:outline-none text-base resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
          </div>
        </div>

        {/* Item / note + product photo (only for purchases — Commit D) */}
        {!isPayment && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ምን ገዙ (አማራጭ)' : 'What did you buy (optional)'}
            </label>
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={lang === 'am' ? 'ለምሳሌ 5 ቦርሳ ቡና' : 'e.g. 5 bags coffee'}
                className="flex-1 p-3 border-2 focus:outline-none text-base"
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
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
                  border: '2px solid #e8e2d8',
                  background: photos.length > 0 ? '#f0fdf4' : '#fef2f2',
                  opacity: photos.length > 0 ? 0.55 : 1,
                  flexShrink: 0,
                  position: 'relative',
                  padding: 0,
                }}
                aria-label={lang === 'am' ? '\u134E\u1276 \u12EB\u1295\u1231 \u12C8\u12ED\u121D \u12ED\u121D\u1228\u1321' : 'Take or choose photo'}
              >
                {photoLoading
                  ? <span className="text-sm">...</span>
                  : <Camera className="w-5 h-5" style={{ color: photos.length > 0 ? '#16a34a' : '#dc2626' }} />
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
                    color: '#fff',
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
              <div className="mt-2 p-2" style={{ background: '#fafaf6', border: '1px solid #e8e2d8', borderRadius: 'var(--radius-sm)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>
                    {lang === 'am' ? '\u134E\u1276' : 'Proof photos'}
                  </p>
                  <p className="text-[10px] font-bold" style={{ color: '#6b7280' }}>
                     {photos.length} {lang === 'am' ? 'ፎቶዎች' : 'photos'}
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
              </div>
            )}
            {photoError && (
              <p style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 4 }}>{photoError}</p>
            )}

            {/* Due date — inline Gregorian picker (purchase only) */}
            <div className="mt-3">
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
                {lang === 'am' ? 'ቀን / የሚያሳስብ ቀን' : 'Due date (optional)'}
              </label>
              <InlineDatePicker
                value={dueDate}
                onChange={(iso) => setDueDate(iso)}
                lang={lang}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sticky save */}
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
          {saving ? (lang === 'am' ? 'እያስቀመጥኩ…' : 'Saving…') : saveButtonText}
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
