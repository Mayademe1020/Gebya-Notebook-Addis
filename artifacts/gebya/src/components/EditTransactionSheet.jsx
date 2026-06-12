import { useState } from 'react';
import { X, Save, ChevronDown, ChevronUp, AlertTriangle, Pencil, Plus, Camera } from 'lucide-react';
import { useLang } from '../context/LangContext';
import VoiceButton from './VoiceButton';
import PaymentTypeChips from './PaymentTypeChips';
import { getDueDateOptions } from '../utils/ethiopianCalendar';
import { fmt, fmtInput } from '../utils/numformat';
import { compressPhoto, photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, MAX_PROOF_PHOTOS, normalizePhotos } from '../utils/photoProof';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
  setter(raw);
}

const ACCENT = {
  sale:    { btn: '#2d6a4f', shadow: '#1B4332' },
  expense: { btn: '#D4654A', shadow: '#a84c37' },
  credit:  { btn: '#C4883A', shadow: '#96662b' },
};

const EDIT_VOICE_ENABLED = false;

function EditTransactionSheet({ transaction, enabledProviders, onUpdate, onClose }) {
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
  const [paymentType, setPaymentType] = useState(initPType);
  const [paymentProvider, setPaymentProvider] = useState(initPProvider);
  const [photos, setPhotos] = useState(() => normalizePhotos(transaction));
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [replacePhotoId, setReplacePhotoId] = useState(null);
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
  const canSave = item.trim() && sellingPrice > 0;

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
      { id: `new-${Date.now()}-${Math.random()}`, name: '', amount: '' },
    ]);

  const handlePhotoCapture = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const nextPhotos = await Promise.all(files.map(async (file) => (
        createPhotoProof(await compressPhoto(file))
      )));
      const cleanPhotos = nextPhotos.filter(Boolean);
      if (replacePhotoId) {
        const replacement = cleanPhotos[0];
        if (replacement) {
          setPhotos(prev => prev.map(entry => (entry.id === replacePhotoId ? replacement : entry)));
        }
      } else {
        setPhotos(prev => [...prev, ...cleanPhotos].slice(0, MAX_PROOF_PHOTOS));
      }
      setPhotoChanged(true);
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
      setReplacePhotoId(null);
      e.target.value = '';
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
        payment_type: isCredit ? null : paymentType,
        payment_provider: (!isCredit && paymentType !== 'cash') ? paymentProvider || null : null,
        customer_phone: isCredit ? (phoneEntered && phoneValid ? '+251' + phoneDigits : null) : null,
        direction: isCredit ? direction : null,
        due_date: isCredit ? getEffectiveDueDate() : null,
        ...(isCredit ? { photos: [], photo: null, photo_taken_at: null } : buildPhotoFields(photos)),
        ...(useBreakdown ? { items: validBreakdown.length > 0 ? validBreakdown : null } : {}),
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
    ? new Date(transaction.updated_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>

        <div className="sticky top-0 bg-white z-10 px-6 pt-5 pb-4 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4" style={{ color: '#C4883A' }} />
                <h2 className="text-xl font-black text-gray-900 font-sans">{typeLabels[type] || t.editEntryLabel}</h2>
              </div>
              {lastEdited && (
                <p className="text-xs mt-0.5 font-sans" style={{ color: '#9ca3af' }}>{t.editedAt} {lastEdited}</p>
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
            const accentBdColor = type === 'expense' ? '#dc2626' : '#16a34a';
            return (
              <div className="p-3 space-y-2"
                style={{ background: 'rgba(27,67,50,0.04)', borderRadius: 'var(--radius-md)', border: '1px solid #e8e2d8' }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
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
                        style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
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
                        style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeBreakdownLine(line.id)}
                        className="press-scale flex items-center justify-center flex-shrink-0"
                        style={{ minWidth: '32px', minHeight: '32px' }}
                        aria-label="Remove line"
                      >
                        <X className="w-4 h-4" style={{ color: '#9ca3af' }} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addBreakdownLine}
                  className="w-full py-2 text-xs font-bold border border-dashed press-scale flex items-center justify-center gap-1"
                  style={{
                    borderColor: '#c9bfa8',
                    borderRadius: 'var(--radius-sm)',
                    background: '#faf9f7',
                    color: '#6b7280',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  {editableItems.length === 0 ? 'Add first item' : 'Add another item'}
                </button>

                {/* Totals + delta hint */}
                {validBreakdown.length > 0 && (
                  <div className="text-xs pt-2 space-y-0.5" style={{ borderTop: '1px solid #e8e2d8' }}>
                    <div className="flex justify-between" style={{ color: '#374151' }}>
                      <span>Items total</span>
                      <span className="font-bold">{fmt(breakdownSum)} {t.birr || 'birr'}</span>
                    </div>
                    {sellingPrice > 0 && Math.abs(breakdownDelta) > 0.01 && (
                      <button
                        type="button"
                        onClick={() => setAmount(String(breakdownSum))}
                        className="w-full flex justify-between items-center px-1.5 py-1 mt-1 press-scale"
                        style={{
                          color: breakdownDelta > 0 ? '#C4883A' : '#dc2626',
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
                      borderColor: direction === d.id ? '#1B4332' : '#e8e2d8',
                      background: direction === d.id ? 'rgba(27,67,50,0.07)' : '#fff',
                      color: direction === d.id ? '#1B4332' : '#4b5563',
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
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
              />
              {!isCredit && (
                <label
                  className="cursor-pointer press-scale flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 56,
                    minHeight: 52,
                    border: '2px solid #e8e2d8',
                    borderRadius: 'var(--radius-md)',
                    background: photos.length > 0 ? '#f0fdf4' : '#fafaf6',
                    opacity: photos.length >= MAX_PROOF_PHOTOS ? 0.55 : 1,
                    position: 'relative',
                  }}
                  aria-label={lang === 'am' ? '\u134E\u1276 \u12EB\u1295\u1231 \u12C8\u12ED\u121D \u12ED\u121D\u1228\u1321' : 'Take or choose photo'}
                  onClick={() => setReplacePhotoId(null)}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoCapture}
                    className="hidden"
                    disabled={photoLoading || photos.length >= MAX_PROOF_PHOTOS}
                  />
                  {photoLoading
                    ? <span className="text-sm">...</span>
                    : <Camera className="w-6 h-6" style={{ color: photos.length > 0 ? '#16a34a' : '#6b7280' }} />
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
                      background: photos.length >= MAX_PROOF_PHOTOS ? '#6b7280' : accent.btn,
                      color: '#fff',
                      border: '2px solid #fff',
                      fontSize: 10,
                      fontWeight: 900,
                      lineHeight: '16px',
                      textAlign: 'center',
                    }}
                  >
                    {photos.length >= MAX_PROOF_PHOTOS ? '0' : `+${MAX_PROOF_PHOTOS - photos.length}`}
                  </span>
                </label>
              )}
              {EDIT_VOICE_ENABLED && <VoiceButton onResult={setItem} />}
            </div>
            {!isCredit && photoError && (
              <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
                {photoError}
              </p>
            )}
            {!isCredit && photos.length > 0 && (
              <div
                className="mt-2 p-2"
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
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {photos.map((entry, index) => (
                    <div key={entry.id} className="relative flex-shrink-0">
                      <label
                        className="cursor-pointer press-scale block"
                        aria-label={lang === 'am' ? '\u134E\u1276 \u1240\u12ED\u122D' : `Replace photo ${index + 1}`}
                        onClick={() => setReplacePhotoId(entry.id)}
                      >
                        <img src={entry.dataUrl} alt="" className="w-14 h-14 object-cover" style={{ borderRadius: 6 }} />
                        <input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" disabled={photoLoading} />
                      </label>
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
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
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
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
            </div>
          </div>

          {isCredit && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 font-sans">
                {t.phoneOptional} <span className="text-gray-400 font-normal text-sm font-sans">{t.phoneOptionalHint}</span>
              </label>
              <div className="flex gap-0">
                <div
                  className="flex items-center justify-center px-3 py-3 border-2 border-r-0 text-sm font-bold flex-shrink-0 font-sans"
                  style={{ background: 'rgba(27,67,50,0.06)', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : '#e8e2d8', color: '#1B4332', minWidth: '64px', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}
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
                  style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : (phoneEntered && phoneValid ? '#1B4332' : '#e8e2d8') }}
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
              <div className="grid grid-cols-3 gap-2 mb-2">
                {dueDateOptions.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setSelectedDue(opt.value)}
                    className="p-3 border-2 text-sm font-medium transition-colors min-h-[52px] press-scale font-sans"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      borderColor: selectedDue === opt.value ? '#1B4332' : '#e8e2d8',
                      background: selectedDue === opt.value ? 'rgba(27,67,50,0.07)' : '#fff',
                      color: selectedDue === opt.value ? '#1B4332' : '#4b5563',
                    }}>
                    <div className="font-bold">{opt.label.split(' ')[0]}</div>
                    <div className="text-xs opacity-70">{opt.display}</div>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setSelectedDue('custom')}
                className="w-full p-3 border-2 text-sm font-semibold min-h-[52px] press-scale font-sans"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  borderColor: selectedDue === 'custom' ? '#1B4332' : '#e8e2d8',
                  background: selectedDue === 'custom' ? 'rgba(27,67,50,0.07)' : '#fff',
                  color: selectedDue === 'custom' ? '#1B4332' : '#4b5563',
                }}>
                {t.pickDate}
              </button>
              {selectedDue === 'custom' && (
                <input type="date" value={customDue} onChange={e => setCustomDue(e.target.value)}
                  className="w-full mt-2 p-4 border-2 focus:outline-none text-base font-sans"
                  style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
              )}
            </div>
          )}

          {!isCredit && (
            <PaymentTypeChips
              paymentType={paymentType}
              provider={paymentProvider}
              onTypeChange={setPaymentType}
              onProviderChange={setPaymentProvider}
              enabledProviders={enabledProviders}
              lastProviderByType={lastProviderByType}
            />
          )}

          {!isCredit && (
            <div>
              <button type="button" onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1 text-sm font-semibold py-1 min-h-[44px] font-sans"
                style={{ color: '#C4883A' }}>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {t.advancedOptional}
              </button>

              {showAdvanced && (
                <div className="mt-2 p-4 border animate-slide-up" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <label className="block text-gray-600 text-sm font-semibold mb-2 font-sans">
                    {t.costPriceLabel} <span style={{ color: '#9ca3af' }}>{t.perUnit}</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fmtInput(costPrice)}
                      onChange={e => handleNumericInput(e, setCostPrice)}
                      placeholder="0"
                      className="w-full p-4 pr-16 border-2 focus:outline-none text-base min-h-[52px] font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                  </div>
                  {belowCost && (
                    <div className="mt-3 flex items-start gap-2 p-3" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)' }}>
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                      <p className="text-xs font-sans" style={{ color: '#92400e' }}>{t.sellingBelowCostShort}</p>
                    </div>
                  )}
                  {cost > 0 && !belowCost && sellingPrice > 0 && (
                    <div className="mt-3 p-3 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 'var(--radius-sm)' }}>
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
              background: canSave ? accent.btn : '#e5e7eb',
              color: canSave ? '#fff' : '#9ca3af',
              borderRadius: 'var(--radius-md)',
              boxShadow: canSave ? `0 4px 0 ${accent.shadow}, var(--shadow-sm)` : 'none',
            }}>
            <Save className="w-5 h-5" />
            {saving ? t.saving : t.saveChanges}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditTransactionSheet;
