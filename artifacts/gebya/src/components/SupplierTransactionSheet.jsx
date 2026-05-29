// SupplierTransactionSheet.jsx — record a purchase-on-credit or a payment-to-supplier
//
// Commit D: adds product photo (purchase only) + edit mode (editingTransaction prop).
// Mirror of CustomerTransactionSheet patterns: compact header, hero amount,
// additive chips, photo capture for the item bought. No Telegram (suppliers
// don't get reminders) and no multi-item breakdown (supplier purchases are
// typically batched: "5 bags coffee = 5000 birr").
import { useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Plus, Camera, Trash2 } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { SUPPLIER_TRANSACTION_TYPES, isValidSupplierTransactionType } from '../utils/supplierLedger';
import { useLang } from '../context/LangContext';
import { compressPhoto, photoSizeBytes } from '../utils/photoCapture';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  setter(raw);
}

const DEFAULT_QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

function SupplierTransactionSheet({
  supplier,
  mode = SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
  initialAmount,
  editingTransaction = null,  // Commit D: when set, sheet enters edit mode
  onSave,
  onDone,
  actorLabel,
}) {
  const { t, lang } = useLang();
  const editing = !!editingTransaction?.id;
  const [amount, setAmount] = useState(() => {
    if (editing) return String(editingTransaction.amount || '');
    return initialAmount != null && initialAmount > 0 ? String(initialAmount) : '';
  });
  const [itemName, setItemName] = useState(editing ? (editingTransaction.item_name || '') : '');
  const [saving, setSaving] = useState(false);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('');
  // Commit D: product photo for purchases (base64 data URL, ~80KB JPEG)
  const [photo, setPhoto] = useState(editing ? (editingTransaction.photo || null) : null);
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);

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

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoLoading(true);
    try {
      const dataUrl = await compressPhoto(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
      e.target.value = '';
    }
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
        // Commit D: photo (purchase only — payments don't get product photos)
        photo: !isPayment ? (photo || null) : null,
      };
      if (editing) payload.editing_id = editingTransaction.id;
      const didSave = await onSave?.(payload);
      if (didSave) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const photoBytes = photo ? photoSizeBytes(photo) : 0;
  const photoKb = photoBytes ? Math.round(photoBytes / 1024) : 0;

  const applyCustomAmount = () => {
    const val = parseFloat(parseInput(customAmountValue));
    if (!val || val <= 0) return;
    const current = parseFloat(parseInput(amount)) || 0;
    setAmount(String(current + val));
    setCustomAmountValue('');
    setShowCustomAmount(false);
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

          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 items-center">
            {DEFAULT_QUICK_AMOUNTS.map((amt) => (
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
              onClick={() => setShowCustomAmount((v) => !v)}
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
                onChange={(e) => handleNumericInput(e, setCustomAmountValue)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCustomAmount(); }}
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
                  minHeight: '40px',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === 'am' ? 'ጨምር' : 'Add'}
              </button>
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
              {/* 56px inline photo button — mirror of CustomerTransactionSheet */}
              <label
                className="flex items-center justify-center press-scale cursor-pointer"
                style={{
                  width: 56, height: 56,
                  borderRadius: 'var(--radius-md)',
                  border: photo ? '2px solid #dc2626' : '2px dashed #c9bfa8',
                  background: photo ? '#fff' : '#fef2f2',
                  flexShrink: 0,
                  overflow: 'hidden',
                  position: 'relative',
                }}
                aria-label={lang === 'am' ? 'ፎቶ ይውሰዱ' : 'Take photo'}
              >
                {photo ? (
                  <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Camera className="w-5 h-5" style={{ color: '#dc2626' }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                  disabled={photoLoading}
                />
              </label>
            </div>
            {photo && (
              <div className="flex items-center justify-between gap-2 mt-2 px-1">
                <p style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 600 }}>
                  ✓ {lang === 'am' ? `ፎቶ · ~${photoKb} KB` : `Photo · ~${photoKb} KB`}
                </p>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold press-scale"
                  style={{ color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Trash2 className="w-3 h-3" />
                  {lang === 'am' ? 'አስወግድ' : 'Remove'}
                </button>
              </div>
            )}
            {photoError && (
              <p style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 4 }}>{photoError}</p>
            )}
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
    </div>
  );
}

export default SupplierTransactionSheet;
