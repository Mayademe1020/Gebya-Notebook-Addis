import { useState } from 'react';
import { X, Save, ChevronDown, ChevronUp, AlertTriangle, Pencil, Plus, Camera } from 'lucide-react';
import { useLang } from '../context/LangContext';
import PaymentTypeChips, { ALL_BANKS, ALL_WALLETS } from './PaymentTypeChips';
import AddProviderButton from './AddProviderButton';
import { getDueDateOptions, formatEthiopianTime } from '../utils/ethiopianCalendar';
import InlineDatePicker from './InlineDatePicker';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { normalizeEthiopianPhone } from '../utils/phoneNumber';
import { photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, normalizePhotos, MAX_PROOF_PHOTOS } from '../utils/photoProof';
import CameraCapture from './CameraCapture';
import { label } from '../labels/index.js';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
  setter(raw);
}

const ACCENT = {
  sale:    { btn: 'var(--color-primary-light)', shadow: 'var(--color-primary)' },
  expense: { btn: 'var(--color-danger)', shadow: 'var(--color-danger-text)' },
  credit:  { btn: 'var(--color-accent-amber)', shadow: '#96662b' },
};

function EditTransactionSheet({ transaction, enabledProviders, onAddProvider, onUpdate, onClose }) {
  const { lang, t } = useLang();
  const type = transaction.type;
  const isCredit = type === 'credit';
  const accent = ACCENT[type] || ACCENT.sale;

  const typeLabels = { sale: t.editSale, expense: t.editExpense, credit: t.editCredit };

  const [item, setItem] = useState(transaction.item_name || '');
  const [quantity, setQuantity] = useState(String(transaction.quantity || 1));
  const [amount, setAmount] = useState(String(transaction.amount || ''));
  const [costPrice, setCostPrice] = useState(String(transaction.cost_price || ''));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const initPType = transaction.payment_type || 'cash';
  const initPProvider = transaction.payment_provider || '';
  const isPartial = !isCredit && (
    String(transaction.sale_settlement_mode || transaction.settlement_mode) === 'partial'
    || String(transaction.payment_type || '').toLowerCase() === 'partial'
  );
  const [paymentType, setPaymentType] = useState(initPType);
  const [paymentProvider, setPaymentProvider] = useState(initPProvider);

  // Received portion of a partial sale — its own payment method (cash vs bank/wallet).
  const partialReceivedInit = transaction.paid_amount != null ? transaction.paid_amount : (transaction.cash_received != null ? transaction.cash_received : '');
  const receivedProviderInit = transaction.payment_provider || '';
  const receivedTypeInit = (() => {
    if (!isPartial) return 'cash';
    const banks = enabledProviders?.banks ?? ALL_BANKS;
    const wallets = enabledProviders?.wallets ?? ALL_WALLETS;
    if (receivedProviderInit && (banks.includes(receivedProviderInit) || ALL_BANKS.includes(receivedProviderInit))) return 'bank';
    if (receivedProviderInit && (wallets.includes(receivedProviderInit) || ALL_WALLETS.includes(receivedProviderInit))) return 'wallet';
    if (Number(transaction.cash_received || 0) > 0) return 'cash';
    const type = String(transaction.payment_type || '').toLowerCase();
    if (type === 'bank') return 'bank';
    if (type === 'wallet') return 'wallet';
    return 'cash';
  })();
  const [partialReceived, setPartialReceived] = useState(() => String(partialReceivedInit ?? ''));
  const [receivedType, setReceivedType] = useState(receivedTypeInit);
  const [receivedProvider, setReceivedProvider] = useState(receivedProviderInit);
  const [photos, setPhotos] = useState(() => normalizePhotos(transaction));
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [replacePhotoId, setReplacePhotoId] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const lastProviderByType = {
    bank:   initPType === 'bank'   ? initPProvider : '',
    wallet: initPType === 'wallet' ? initPProvider : '',
  };
  const [phoneDigits, setPhoneDigits] = useState(() => {
    const raw = transaction.customer_phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [direction, setDirection] = useState(transaction.direction || 'owes_me');
  const [selectedDue, setSelectedDue] = useState(transaction.due_date || null);
  const [customDue, setCustomDue] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Editable multi-item breakdown
  const [editableItems, setEditableItems] = useState(() => (
    Array.isArray(transaction.items)
      ? transaction.items.map((it, i) => ({
          id: `init-${i}`,
          name: it?.name || '',
          amount: it?.amount != null ? String(it.amount) : '',
        }))
      : []
  ));

  const dueDateOptions = getDueDateOptions();
  const phoneValid = !phoneDigits || /^[79]\d{8}$/.test(phoneDigits);
  const phoneEntered = phoneDigits.length > 0;

  const sellingPrice = parseFloat(amount) || 0;
  const cost = parseFloat(costPrice) || 0;
  const qty = Math.max(1, parseInt(quantity) || 1);
  const belowCost = !isCredit && cost > 0 && sellingPrice < cost * qty;
  const partialReceivedAmount = parseFloat(parseInput(partialReceived)) || 0;
  const partialRemaining = isPartial ? Math.max(0, sellingPrice - partialReceivedAmount) : 0;
  const partialReceivedValid = isPartial && partialReceivedAmount > 0 && partialReceivedAmount < sellingPrice;
  const canSave = item.trim() && sellingPrice > 0 && (!isPartial || (partialReceivedValid && (receivedType === 'cash' || !!receivedProvider)));

  const getEffectiveDueDate = () => {
    if (selectedDue === 'custom' && customDue) return new Date(customDue).getTime();
    return selectedDue;
  };

  // Breakdown edit helpers
  const updateBreakdownLine = (id, field, value) =>
    setEditableItems(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  const removeBreakdownLine = (id) =>
    setEditableItems(prev => prev.filter(l => l.id !== id));
  const addBreakdownLine = () =>
    setEditableItems(prev => [
      ...prev,
      { id: `new-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, name: '', amount: '' },
    ]);

  const handleCameraPhoto = async (dataUrl) => {
    if (!dataUrl) return;
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const proof = createPhotoProof(dataUrl);
      if (proof) {
        if (replacePhotoId) {
          setPhotos(prev => prev.map(entry => (entry.id === replacePhotoId ? proof : entry)));
        } else {
          if (photos.length >= MAX_PROOF_PHOTOS) return;
          setPhotos(prev => [...prev, proof].slice(0, MAX_PROOF_PHOTOS));
        }
        setPhotoChanged(true);
      }
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
      setReplacePhotoId(null);
    }
  };

  const handleRemovePhoto = (photoId) => {
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
    setPhotoError(null);
    setPhotoChanged(true);
  };

  const validBreakdown = editableItems
    .filter(l => l.name.trim() && parseFloat(l.amount) > 0)
    .map(l => ({ name: l.name.trim(), amount: parseFloat(l.amount) }));
  const breakdownSum = validBreakdown.reduce((s, it) => s + it.amount, 0);
  const breakdownDelta = sellingPrice - breakdownSum;
  const hadBreakdown = Array.isArray(transaction.items) && transaction.items.length > 0;
  const origDiscount = Number(transaction.discount) || 0;
  const origSubtotal = Number(transaction.items_subtotal) || 0;
  // For a simple discounted sale: amount = net, items_subtotal = gross, so:
  //   gross = max(amount + discount, items_subtotal) as the displayable original price
  const origGross = origDiscount > 0
    ? (origSubtotal > 0 ? origSubtotal : (Number(transaction.amount) || 0) + origDiscount)
    : (Number(transaction.amount) || 0);
  const [discount, setDiscount] = useState(() => origDiscount > 0 ? String(origDiscount) : '');

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // If transaction had a breakdown OR user added new line items, persist the edited items.
      // item_name auto-derives from line names when breakdown is present.
      const useBreakdown = (hadBreakdown || editableItems.length > 0) && !isCredit;
      const finalItemName = useBreakdown && validBreakdown.length > 0
        ? validBreakdown.map(it => it.name).join(', ').substring(0, 200)
        : item.trim();
      const updates = {
        item_name: finalItemName,
        quantity: isCredit ? 1 : qty,
        amount: sellingPrice,
        cost_price: isCredit ? 0 : cost,
        profit: (!isCredit && cost > 0) ? sellingPrice - cost * qty : null,
        payment_type: isCredit ? null : (isPartial ? 'partial' : paymentType),
        payment_provider: isPartial
          ? (receivedType === 'cash' ? null : receivedProvider || null)
          : ((!isCredit && paymentType !== 'cash') ? paymentProvider || null : null),
        cash_received: isPartial
          ? (receivedType === 'cash' ? partialReceivedAmount : 0)
          : (!isCredit && paymentType === 'cash' ? sellingPrice : 0),
        paid_amount: isPartial ? partialReceivedAmount : (!isCredit ? sellingPrice : 0),
        remaining_amount: isPartial ? partialRemaining : 0,
        credit_amount: isPartial ? partialRemaining : 0,
        sale_settlement_mode: isCredit ? null : (isPartial ? 'partial' : 'paid'),
        settlement_mode: isCredit ? null : (isPartial ? 'partial' : 'paid'),
        customer_phone: isCredit ? (phoneEntered && phoneValid ? normalizeEthiopianPhone(phoneDigits) : null) : null,
        direction: isCredit ? direction : null,
        due_date: isCredit ? getEffectiveDueDate() : null,
        ...buildPhotoFields(photos),
        ...(useBreakdown ? { items: validBreakdown.length > 0 ? validBreakdown : null } : {}),
        ...(origDiscount > 0 ? {
          discount: Number(discount) || 0,
          items_subtotal: origGross,
          amount_basis: transaction.amount_basis || 'simple',
        } : {}),
      };
      await onUpdate(transaction.id, updates);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Edit failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const lastEdited = transaction.updated_at
    ? formatEthiopianTime(transaction.updated_at)
    : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>

        <div className="sticky top-0 bg-white z-10 px-6 pt-5 pb-4 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4" style={{ color: 'var(--color-accent-amber)' }} />
                <h2 className="text-xl font-black text-gray-900 font-sans">{typeLabels[type] || t.editEntryLabel}</h2>
              </div>
              {lastEdited && (
                <p className="text-xs mt-0.5 font-sans" style={{ color: 'var(--color-text-soft)' }}>{t.editedAt} {lastEdited}</p>
              )}
            </div>
            <button onClick={onClose} aria-label={t.close}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Multi-item breakdown — editable when transaction has items OR when user wants to add one */}
          {!isCredit && (hadBreakdown || editableItems.length > 0) && (() => {
            const accentBdColor = type === 'expense' ? 'var(--color-danger)' : 'var(--color-success)';
            return (
              <div className="p-3 space-y-2"
                style={{ background: 'rgba(27,67,50,0.04)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                  🧺 {editableItems.length === 1 ? '1 item' : `${editableItems.length} items`}
                </p>

                {/* Editable line rows */}
                <div className="space-y-1.5">
                  {editableItems.map((line) => (
                    <div key={line.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={line.name}
                        onChange={(e) => updateBreakdownLine(line.id, 'name', e.target.value)}
                        placeholder="item"
                        className="flex-1 min-w-0 px-2 py-2 border focus:outline-none text-sm"
                        style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fmtInput(line.amount)}
                        onChange={(e) => {
                          let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
                          const parts = raw.split('.');
                          if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
                          updateBreakdownLine(line.id, 'amount', raw);
                        }}
                        placeholder="0"
                        className="w-20 px-2 py-2 border focus:outline-none text-sm text-right font-bold"
                        style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeBreakdownLine(line.id)}
                        className="press-scale flex items-center justify-center flex-shrink-0"
                        style={{ minWidth: '32px', minHeight: '32px' }}
                        aria-label="Remove line"
                      >
                        <X className="w-4 h-4" style={{ color: 'var(--color-text-soft)' }} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addBreakdownLine}
                  className="w-full py-2 text-xs font-bold border border-dashed press-scale flex items-center justify-center gap-1"
                  style={{
                    borderColor: 'var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-subtle)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  {editableItems.length === 0 ? 'Add first item' : 'Add another item'}
                </button>

                {/* Totals + delta hint */}
                {validBreakdown.length > 0 && (
                  <div className="text-xs pt-2 space-y-0.5" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="flex justify-between" style={{ color: 'var(--color-text)' }}>
                      <span>Items total</span>
                      <span className="font-bold">{fmt(breakdownSum)} {t.birr || 'birr'}</span>
                    </div>
                    {sellingPrice > 0 && Math.abs(breakdownDelta) > 0.01 && (
                      <button
                        type="button"
                        onClick={() => setAmount(String(breakdownSum))}
                        className="w-full flex justify-between items-center px-1.5 py-1 mt-1 press-scale"
                        style={{
                          color: breakdownDelta > 0 ? 'var(--color-accent-amber)' : 'var(--color-danger)',
                          background: breakdownDelta > 0 ? 'rgba(196,136,58,0.08)' : 'rgba(220,38,38,0.06)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        title="Tap to set total to items sum"
                      >
                        <span>{breakdownDelta > 0 ? 'Unaccounted' : 'Items exceed total'}:</span>
                        <span className="font-bold">{fmt(Math.abs(breakdownDelta))} ⤴</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {isCredit && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 text-sm font-sans">{t.direction}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'owes_me', label: t.owesMe, sub: t.theyOweMe },
                  { id: 'i_owe',   label: t.iOweLabel, sub: t.iOweThem },
                ].map(d => (
                  <button key={d.id} type="button" onClick={() => setDirection(d.id)}
                    className="p-3 border-2 text-center transition-all min-h-[56px] press-scale"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      borderColor: direction === d.id ? 'var(--color-primary)' : 'var(--color-border)',
                      background: direction === d.id ? 'rgba(27,67,50,0.07)' : 'var(--color-bg-white)',
                      color: direction === d.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    }}>
                    <div className="font-bold text-sm font-sans">{d.label}</div>
                    <div className="text-xs opacity-70 mt-0.5 font-sans">{d.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-gray-700 font-semibold mb-2 font-sans">
              {isCredit ? t.creditNameLabel : t.item}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={e => setItem(e.target.value)}
                className="flex-1 p-4 border-2 focus:outline-none text-base min-h-[52px] font-sans"
                style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
              />
              {!isCredit && (
                <button
                  type="button"
                  onClick={() => { setReplacePhotoId(null); setShowCamera(true); }}
                  className="cursor-pointer press-scale flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 56,
                    minHeight: 52,
                    border: '2px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: photos.length > 0 ? 'var(--color-success-bg)' : 'var(--color-surface-subtle)',
                     opacity: photos.length > 0 ? 0.55 : 1,
                    position: 'relative',
                  }}
                  aria-label={label('sales.take-or-choose-photo', lang)}
                >
                  {photoLoading
                    ? <span className="text-sm">...</span>
                    : <Camera className="w-6 h-6" style={{ color: photos.length > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
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
                       background: accent.btn,
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
              )}
            </div>
            {!isCredit && photoError && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>
                {photoError}
              </p>
            )}
            {!isCredit && photos.length > 0 && (
              <div
                className="mt-2 p-2"
                style={{ background: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                    {label('sales.proof-photos', lang)}
                  </p>
                  <p className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    {photos.length} {label('sales.photos', lang)}
                  </p>
                </div>
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {photos.map((entry, index) => (
                    <div key={entry.id} className="relative flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => { setReplacePhotoId(entry.id); setShowCamera(true); }}
                        className="cursor-pointer press-scale block"
                        style={{ padding: 0, border: 'none', background: 'transparent' }}
                        aria-label={label('sales.replace-photo', lang, () => index + 1)}
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
                        aria-label={label('sales.remove-photo', lang, () => index + 1)}
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
          </div>

          {!isCredit && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 font-sans">{t.quantity}</label>
              <input
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (isNaN(v) || v < 1) setQuantity('1');
                  else setQuantity(String(v));
                }}
                onBlur={e => {
                  const v = parseInt(e.target.value);
                  if (isNaN(v) || v < 1) setQuantity('1');
                }}
                min="1"
                className="w-full p-4 border-2 focus:outline-none text-base min-h-[52px] font-sans"
                style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
              />
            </div>
          )}

          <div>
            <label className="block text-gray-700 font-semibold mb-2 font-sans">{t.amount}</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={fmtInput(amount)}
                onChange={e => handleNumericInput(e, setAmount)}
                placeholder="0"
                className="w-full p-4 pr-16 border-2 focus:outline-none text-base min-h-[52px] font-sans"
                style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
            </div>
          </div>

          {!isCredit && origDiscount > 0 && (
            <div className="flex items-center justify-between px-3 py-2.5" style={{ background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-border)' }}>
              <span className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-warning-text)' }}>
                {label('sales.discount-applied', lang)}
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className="font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  {fmt(origGross)} {t.birr} {label('sales.copy', lang)}
                </span>
                <span className="font-black" style={{ color: 'var(--color-warning-text)' }}>
                  −{fmt(Number(discount) || origDiscount)} {t.birr}
                </span>
                <span className="text-gray-400">=</span>
                <span className="font-black" style={{ color: 'var(--color-text)' }}>
                  {fmt(Number(amount) || 0)} {t.birr}
                </span>
              </span>
            </div>
          )}

          {isCredit && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 font-sans">
                {t.phoneOptional} <span className="text-gray-400 font-normal text-sm font-sans">{t.phoneOptionalHint}</span>
              </label>
              <div className="flex gap-0">
                <div
                  className="flex items-center justify-center px-3 py-3 border-2 border-r-0 text-sm font-bold flex-shrink-0 font-sans"
                  style={{ background: 'rgba(27,67,50,0.06)', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? 'var(--color-danger)' : 'var(--color-border)', color: 'var(--color-primary)', minWidth: '64px', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}
                >
                  +251
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phoneDigits}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '');
                    if (raw.length <= 9) setPhoneDigits(raw);
                  }}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="9XXXXXXXX"
                  maxLength={9}
                  className="flex-1 p-4 border-2 text-base focus:outline-none min-h-[52px] font-sans"
                  style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? 'var(--color-danger)' : (phoneEntered && phoneValid ? 'var(--color-primary)' : 'var(--color-border)') }}
                />
              </div>
              {phoneTouched && phoneEntered && !phoneValid && (
                <p className="text-xs text-red-500 mt-1 font-medium font-sans">{t.creditPhoneHint}</p>
              )}
              {!phoneTouched && (
                <p className="text-xs text-gray-400 mt-1 font-sans">{t.creditPhoneHint}</p>
              )}
            </div>
          )}

          {isCredit && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 font-sans">{t.dueDate}</label>
              <div className="flex gap-2 mb-2">
                {dueDateOptions.map(opt => {
                  const active = selectedDue === opt.value;
                  return (
                    <button key={opt.value} type="button" onClick={() => setSelectedDue(opt.value)} className="press-scale font-sans"
                      style={{
                        padding: '8px 12px', minWidth: 70, minHeight: 40,
                        border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 8,
                        background: active ? 'var(--color-primary)' : 'var(--color-bg-white)',
                        color: active ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                        fontSize: '0.8rem', fontWeight: 700,
                        cursor: 'pointer', flexShrink: 0,
                      }}>
                      {opt.label}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setShowDatePicker(true)} className="press-scale font-sans"
                  style={{
                    padding: '8px 12px', minWidth: 70, minHeight: 40,
                    border: `2px solid ${selectedDue === 'custom' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 8,
                    background: selectedDue === 'custom' ? 'var(--color-primary)' : 'var(--color-bg-white)',
                    color: selectedDue === 'custom' ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                    fontSize: '0.8rem', fontWeight: 700,
                    cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  📅 <span>{t.pickDate}</span>
                </button>
              </div>
              <InlineDatePicker
                open={showDatePicker}
                value={selectedDue === 'custom' ? customDue : ''}
                onChange={(iso) => { setCustomDue(iso); setSelectedDue('custom'); }}
                onClose={() => setShowDatePicker(false)}
                lang={lang}
              />
            </div>
          )}

          {isPartial && (
            <div className="p-3 space-y-2" style={{ background: 'rgba(196,136,58,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-border)' }}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-accent-amber)' }}>
                  ½ {label('sales.partial-payment', lang)}
                </p>
                {partialRemaining > 0 && (
                  <p className="text-[10px] font-bold" style={{ color: 'var(--color-accent-amber)' }}>
                    {label('sales.remaining-dubie', lang)}: {fmt(partialRemaining)} {t.birr || 'birr'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-gray-600 text-xs font-bold mb-1 font-sans">
                  {label('sales.amount-received', lang)} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fmtInput(partialReceived)}
                    onChange={e => handleNumericInput(e, setPartialReceived)}
                    placeholder="0"
                    className="w-full p-4 pr-16 border-2 focus:outline-none text-base min-h-[52px] font-sans"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      borderColor: partialReceivedAmount > 0 && partialReceivedAmount < sellingPrice ? 'var(--color-accent-amber)' : 'var(--color-border)',
                    }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                </div>
                {partialReceivedAmount >= sellingPrice && sellingPrice > 0 && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--color-danger)' }}>
                    {label('sales.received-is-the-full-amount-this-is-not-a', lang)}
                  </p>
                )}
                {partialReceivedAmount > 0 && partialReceivedAmount < sellingPrice && (
                  <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--color-success-text)' }}>
                    → {fmt(partialReceivedAmount)} {label('sales.etb', lang)} {label('sales.via', lang)} {receivedType === 'cash' ? (label('sales.cash', lang)) : (receivedProvider || receivedType)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-gray-600 text-xs font-bold mb-1 font-sans">
                  {label('sales.received-via', lang)}
                </label>
                <PaymentTypeChips
                  paymentType={receivedType}
                  provider={receivedProvider}
                  onTypeChange={(type) => { setReceivedType(type); if (type === 'cash') setReceivedProvider(''); }}
                  onProviderChange={setReceivedProvider}
                  enabledProviders={enabledProviders}
                  receivedOnly
                />
              </div>
            </div>
          )}

          {!isCredit && !isPartial && (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <PaymentTypeChips
                  paymentType={paymentType}
                  provider={paymentProvider}
                  onTypeChange={setPaymentType}
                  onProviderChange={setPaymentProvider}
                  enabledProviders={enabledProviders}
                  lastProviderByType={lastProviderByType}
                />
              </div>
              <AddProviderButton onAddProvider={onAddProvider} />
            </div>
          )}

          {!isCredit && (
            <div>
              <button type="button" onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1 text-sm font-semibold py-1 min-h-[44px] font-sans"
                style={{ color: 'var(--color-accent-amber)' }}>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {t.advancedOptional}
              </button>

              {showAdvanced && (
                <div className="mt-2 p-4 border animate-slide-up" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <label className="block text-gray-600 text-sm font-semibold mb-2 font-sans">
                    {t.costPriceLabel} <span style={{ color: 'var(--color-text-soft)' }}>{t.perUnit}</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fmtInput(costPrice)}
                      onChange={e => handleNumericInput(e, setCostPrice)}
                      placeholder="0"
                      className="w-full p-4 pr-16 border-2 focus:outline-none text-base min-h-[52px] font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                  </div>
                  {belowCost && (
                    <div className="mt-3 flex items-start gap-2 p-3" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-sm)' }}>
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-accent-amber)' }} />
                      <p className="text-xs font-sans" style={{ color: 'var(--color-warning)' }}>{t.sellingBelowCostShort}</p>
                    </div>
                  )}
                  {cost > 0 && !belowCost && sellingPrice > 0 && (
                    <div className="mt-3 p-3 border" style={{ background: 'var(--color-success-bg)', borderColor: 'var(--color-success-border)', borderRadius: 'var(--radius-sm)' }}>
                      <p className="text-xs text-green-700 font-semibold font-sans">
                        {t.profitLabel} {fmt(sellingPrice - cost * qty)} {t.birr}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-8 pt-2">
          <button onClick={handleSave} disabled={!canSave || saving}
            className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 transition-all min-h-[56px] active:scale-95 press-scale font-sans"
            style={{
              background: canSave ? accent.btn : 'var(--color-bg-disabled)',
              color: canSave ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
              borderRadius: 'var(--radius-md)',
              boxShadow: canSave ? `0 4px 0 ${accent.shadow}, var(--shadow-sm)` : 'none',
            }}>
            <Save className="w-5 h-5" />
            {saving ? t.saving : t.saveChanges}
          </button>
        </div>
      </div>

      {/* Camera capture modal */}
      <CameraCapture
        open={showCamera}
        onCapture={(dataUrl) => { handleCameraPhoto(dataUrl); setShowCamera(false); }}
        onClose={() => { setShowCamera(false); setReplacePhotoId(null); }}
        lang={lang}
      />
    </div>
  );
}

export default EditTransactionSheet;
