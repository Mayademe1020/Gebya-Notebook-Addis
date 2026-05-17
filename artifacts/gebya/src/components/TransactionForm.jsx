import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, Save, AlertTriangle, CheckCircle2, Plus, Camera } from 'lucide-react';
import { useLang } from '../context/LangContext';
import PaymentTypeChips from './PaymentTypeChips';
import { fireToast } from './Toast';
import { getDueDateOptions } from '../utils/ethiopianCalendar';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import db from '../db';

const SALE_DRAFT_KEY = 'gebya_sale_draft';
const EXPENSE_DRAFT_KEY = 'gebya_expense_draft';
const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000;

function loadDraft(key) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const draft = JSON.parse(stored);
    if (draft.savedAt && Date.now() - draft.savedAt > DRAFT_EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

function clearDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
  setter(raw);
}

const ACCENT = {
  green: { btn: '#2d6a4f', shadow: '#1B4332' },
  red:   { btn: '#D4654A', shadow: '#a84c37' },
  amber: { btn: '#C4883A', shadow: '#96662b' },
};

function TransactionForm({
  type, onSave, onDone, enabledProviders, catalogEntries = [], recurringExpenses,
  onRecurringChange, initialPaymentType, initialPaymentProvider, customerSuggestions = [],
  onVoiceResult, hasUnsavedChanges, onKeepDraft, onDiscardDraft,
}) {
  const { t, lang } = useLang();

  const isCredit  = type === 'credit';
  const isExpense = type === 'expense';
  const isSale    = type === 'sale';
  const accent = ACCENT[type === 'credit' ? 'amber' : type === 'expense' ? 'red' : 'green'];

  const config = {
    sale:    { title: t.iSoldSomething, amountLabel: t.howMuchTotal, itemLabel: t.whatDidYouSell, itemPlaceholder: t.sellPlaceholder, buttonText: t.saveSale },
    expense: { title: t.iSpentSomething, amountLabel: t.howMuchTotal, itemLabel: t.whatDidYouSpendOn, itemPlaceholder: t.spendPlaceholder, buttonText: t.saveExpense },
    credit:  { title: t.recordCredit,    amountLabel: t.amount,        itemLabel: t.creditNameLabel,   itemPlaceholder: t.creditNamePlaceholder, buttonText: t.saveCredit },
  }[type] || {};

  const [item, setItem] = useState('');
  const [catalogEntryId, setCatalogEntryId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [selectedDue, setSelectedDue] = useState(null);
  const [customDue, setCustomDue] = useState('');
  const [paymentType, setPaymentType] = useState(initialPaymentType || 'cash');
  const [paymentProvider, setPaymentProvider] = useState(initialPaymentProvider || '');
  const [saleSettlementMode, setSaleSettlementMode] = useState('paid_now');
  const [saleCustomerName, setSaleCustomerName] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [saleDueDate, setSaleDueDate] = useState('');
  const [creditDirection, setCreditDirection] = useState('owes_me');
  const [saveState, setSaveState] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [addRecurringHint, setAddRecurringHint] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [popupName, setPopupName] = useState('');
  const [popupAmount, setPopupAmount] = useState('');
  const [popupFreq, setPopupFreq] = useState('monthly');
  const selectedCatalogEntry = catalogEntries.find(e => String(e.id) === String(catalogEntryId));
  const dueDateOptions = getDueDateOptions();

  useEffect(() => {
    const draftKey = isSale ? SALE_DRAFT_KEY : isExpense ? EXPENSE_DRAFT_KEY : null;
    if (!draftKey) return;
    const draft = loadDraft(draftKey);
    if (draft) {
      setItem(draft.item || '');
      setAmount(draft.amount || '');
      setPaymentType(draft.paymentType || initialPaymentType || 'cash');
      setPaymentProvider(draft.paymentProvider || initialPaymentProvider || '');
      if (isSale) {
        setSaleSettlementMode(draft.saleSettlementMode || 'paid_now');
        setSaleCustomerName(draft.saleCustomerName || '');
        setPaidAmount(draft.paidAmount || '');
        setSaleDueDate(draft.saleDueDate || '');
        setQuantity(draft.quantity || '1');
        if (draft.photo) setPhoto(draft.photo);
      }
      setCostPrice(draft.costPrice || '');
      setShowMoreDetails(draft.showMoreDetails || false);
      setDraftRestored(true);
      setTimeout(() => setDraftRestored(false), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saveState !== 'success') return;
    const timer = setTimeout(() => {
      onDone();
    }, 1200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState]);

  useEffect(() => {
    if ((!isSale && !isExpense) || saveState === 'success') return;
    const draftKey = isSale ? SALE_DRAFT_KEY : EXPENSE_DRAFT_KEY;
    const timer = setTimeout(() => {
      if (isSale) {
        saveDraft(draftKey, {
          item, amount, paymentType, paymentProvider, saleSettlementMode,
          saleCustomerName, paidAmount, saleDueDate, quantity, costPrice, showMoreDetails,
          photo,
        });
      } else {
        saveDraft(draftKey, {
          item, amount, paymentType, paymentProvider, costPrice, showMoreDetails,
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [item, amount, paymentType, paymentProvider, saleSettlementMode, saleCustomerName,
      paidAmount, saleDueDate, quantity, costPrice, showMoreDetails, photo,
      isSale, isExpense, saveState]);

  const sellingPrice = parseFloat(parseInput(amount)) || 0;
  const cost = parseFloat(parseInput(costPrice)) || 0;
  const qty = Math.max(1, parseInt(quantity) || 1);
  const parsedPaidAmount = parseFloat(parseInput(paidAmount)) || 0;
  const requiresCustomerBalance = isSale && saleSettlementMode !== 'paid_now';
  const remainingAmount = !isSale
    ? 0
    : saleSettlementMode === 'paid_now'
      ? 0
      : saleSettlementMode === 'pay_later'
        ? sellingPrice
        : Math.max(sellingPrice - parsedPaidAmount, 0);
  const settledAmount = !isSale
    ? 0
    : saleSettlementMode === 'paid_now'
      ? sellingPrice
      : saleSettlementMode === 'pay_later'
        ? 0
        : parsedPaidAmount;
  const belowCost = !isCredit && cost > 0 && sellingPrice < cost * qty;
  const normalizedCustomerQuery = saleCustomerName.trim().toLowerCase();
  const matchedCustomers = requiresCustomerBalance && normalizedCustomerQuery
    ? customerSuggestions.filter(c => {
        const name = String(c.display_name || '').toLowerCase();
        const note = String(c.note || '').toLowerCase();
        return name.includes(normalizedCustomerQuery) || note.includes(normalizedCustomerQuery);
      }).slice(0, 5)
    : [];
  const selectedExistingCustomer = requiresCustomerBalance
    ? customerSuggestions.find(c => String(c.display_name || '').trim().toLowerCase() === normalizedCustomerQuery) || null
    : null;
  const nextCustomerBalance = Math.max(Number(selectedExistingCustomer?.balance || 0), 0) + remainingAmount;

  const phoneValid  = !phoneDigits || /^[79]\d{8}$/.test(phoneDigits);
  const phoneEntered = phoneDigits.length > 0;
  const hasDueDate = isCredit
    ? (selectedDue !== null && selectedDue !== undefined && selectedDue !== 'custom') || (selectedDue === 'custom' && customDue)
    : true;
  const saleCustomerValid = !requiresCustomerBalance || saleCustomerName.trim().length > 0;
  const partialAmountValid = !isSale || saleSettlementMode !== 'paid_partly' || (parsedPaidAmount > 0 && parsedPaidAmount < sellingPrice);

  const canSave = item.trim() && sellingPrice > 0 && hasDueDate && (!phoneEntered || phoneValid) && saleCustomerValid && partialAmountValid;

  const getEffectiveDueDate = () => {
    if (selectedDue === 'custom' && customDue) return new Date(customDue).getTime();
    return selectedDue;
  };

  const handleSave = async () => {
    if (!canSave) {
      setShowValidation(true);
      if (!sellingPrice || sellingPrice <= 0) fireToast(lang === 'am' ? 'መጠን ያስገቡ' : 'Enter an amount', 2500);
      else if (!item.trim()) fireToast(lang === 'am' ? 'የዕቃ ስም ያስገቡ' : 'Enter item name', 2500);
      return;
    }
    setSaveState('saving');
    const fullPhone = phoneEntered && phoneValid ? '+251' + phoneDigits : null;
    const data = {
      type,
      item_name: item.trim(),
      catalog_entry_id: catalogEntryId ? Number(catalogEntryId) : null,
      item_kind: selectedCatalogEntry?.kind || null,
      quantity: isCredit ? 1 : qty,
      amount: sellingPrice,
      cost_price: isCredit ? 0 : cost,
      profit: (!isCredit && cost > 0) ? (sellingPrice - cost * qty) : null,
      is_credit: isCredit || remainingAmount > 0,
      customer_phone: isCredit ? fullPhone : null,
      customer_name: isSale ? (saleCustomerName.trim() || null) : null,
      due_date: isCredit ? getEffectiveDueDate() : null,
      payment_type: isCredit || (isSale && saleSettlementMode === 'pay_later') ? null : paymentType,
      payment_provider: (!isCredit && paymentType !== 'cash' && (!isSale || saleSettlementMode !== 'pay_later')) ? paymentProvider || null : null,
      direction: isCredit ? creditDirection : null,
      sale_settlement_mode: isSale ? saleSettlementMode : null,
      paid_amount: isSale ? settledAmount : null,
      remaining_amount: isSale ? remainingAmount : null,
      settlement_due_date: isSale && remainingAmount > 0 && saleDueDate ? new Date(saleDueDate).getTime() : null,
      photo: photo || null,
      created_at: Date.now(),
    };
    try {
      await onSave(data);
      setLastSaved({ item: data.item_name, amount: data.amount, type });
      setSaveState('success');
      const draftKey = isSale ? SALE_DRAFT_KEY : isExpense ? EXPENSE_DRAFT_KEY : null;
      if (draftKey) clearDraft(draftKey);
    } catch (err) {
      setSaveState('idle');
      fireToast(t.saveFailed || 'Could not save. Please try again.', 3000);
    }
  };

  const handleSelectCatalogEntry = (value) => {
    setCatalogEntryId(value);
    const entry = catalogEntries.find(e => String(e.id) === String(value));
    if (!entry) return;
    setItem(entry.name || '');
    if (!amount && entry.default_price != null) setAmount(String(entry.default_price));
    if (!costPrice && entry.default_cost != null) setCostPrice(String(entry.default_cost));
  };

  const openAddRecurring = (demoName = '') => {
    setPopupName(demoName);
    setPopupAmount('');
    setPopupFreq('monthly');
    setShowAddRecurring(true);
  };

  const handleAddAndUse = async () => {
    const amt = parseFloat(parseInput(popupAmount));
    if (!popupName.trim() || !amt) return;
    const newItem = { id: Date.now(), name: popupName.trim(), amount: amt, freq: popupFreq };
    const updated = [...(recurringExpenses || []), newItem];
    await db.settings.put({ key: 'recurring_expenses', value: JSON.stringify(updated) });
    onRecurringChange?.(updated);
    setShowAddRecurring(false);
    setItem(newItem.name);
    setAmount(String(newItem.amount));
    setAddRecurringHint(true);
    setTimeout(() => setAddRecurringHint(false), 4000);
  };

  const handlePhotoCapture = () => {
     const input = document.createElement('input');
     input.type = 'file';
     input.accept = 'image/*';
     input.capture = 'environment';
     input.setAttribute('capture', 'camera');
     input.onchange = (e) => {
       const file = e.target.files?.[0];
       if (!file) return;
       // Limit photo size to 2MB to prevent DoS (F010)
       if (file.size > 2 * 1024 * 1024) {
         fireToast('Photo too large — max 2 MB', 2500);
         return;
       }
       const reader = new FileReader();
       reader.onload = () => {
         // Resize image before storing to limit IndexedDB usage
         const img = new Image();
         img.onload = () => {
           const canvas = document.createElement('canvas');
           const MAX_DIM = 1024;
           let w = img.width, h = img.height;
           if (w > MAX_DIM || h > MAX_DIM) {
             const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
             w = Math.round(w * ratio);
             h = Math.round(h * ratio);
           }
           canvas.width = w;
           canvas.height = h;
           const ctx = canvas.getContext('2d');
           ctx?.drawImage(img, 0, 0, w, h);
           canvas.toBlob((blob) => {
             if (!blob) return;
             const resizedReader = new FileReader();
             resizedReader.onload = () => setPhoto(resizedReader.result);
             resizedReader.readAsDataURL(blob);
           }, 'image/jpeg', 0.7);
         };
         img.src = reader.result;
       };
       reader.readAsDataURL(file);
     };
     input.click();
   };

  const handleClose = () => {
    if ((isSale || isExpense) && (item.trim() || amount || (isSale && photo))) {
      setShowDraftPrompt(true);
    } else {
      onDone();
    }
  };

  if (saveState === 'success') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
        <div className="bg-white w-full max-w-md p-6 pb-10 animate-elastic" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
          <div className="text-center py-6">
            <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-green-500" />
            <p className="font-black text-gray-900 text-xl font-sans">{lastSaved?.item}</p>
            <p className="text-gray-500 mt-1 text-base font-sans">{fmt(lastSaved?.amount)} {t.birrSaved}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>

        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-4 pt-3 pb-2 border-b" style={{ borderColor: 'var(--color-border-light)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-gray-900 font-sans">{config.title}</h2>
            <button onClick={handleClose} aria-label={t.close}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          {draftRestored && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-600 font-sans">
              <CheckCircle2 className="w-3 h-3" />
              {t.draftSaved || 'Draft restored'}
            </div>
          )}
        </div>

        <div className="px-4 py-2 space-y-2">

          {/* Credit direction */}
          {isCredit && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 text-sm font-sans">{t.direction}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'owes_me', label: t.owesMe, sub: t.theyOweMe },
                  { id: 'i_owe',   label: t.iOweLabel, sub: t.iOweThem },
                ].map(d => (
                  <button key={d.id} type="button" onClick={() => setCreditDirection(d.id)}
                    className="p-3 border-2 text-center transition-all min-h-[56px] press-scale font-sans"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      borderColor: creditDirection === d.id ? '#1B4332' : '#e8e2d8',
                      background: creditDirection === d.id ? 'rgba(27,67,50,0.07)' : '#fff',
                      color: creditDirection === d.id ? '#1B4332' : '#4b5563',
                    }}>
                    <div className="font-bold text-sm">{d.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{d.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Expense recurring */}
          {isExpense && recurringExpenses && recurringExpenses.length > 0 && (
            <div>
              <label className="block text-gray-600 text-xs font-bold mb-2 uppercase tracking-wide font-sans">{t.quickFill}</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recurringExpenses.map(re => (
                  <button
                    key={re.id} type="button"
                    onClick={() => { setItem(re.name); setAmount(String(re.amount)); }}
                    className="flex-shrink-0 px-3 py-2 border-2 text-xs font-bold transition-all press-scale font-sans"
                    style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: 'var(--color-bg)', color: '#1B4332' }}>
                    <div>{re.name}</div>
                    <div className="font-normal mt-0.5" style={{ color: '#C4883A' }}>{fmt(re.amount)} {t.birr}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isExpense && (!recurringExpenses || recurringExpenses.length === 0) && (
            <div>
              <label className="block text-gray-600 text-xs font-bold mb-2 uppercase tracking-wide font-sans">{t.demoCardSectionLabel}</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[t.recurringExampleRent, t.recurringExampleEqub].map(demoName => (
                  <button key={demoName} type="button" onClick={() => openAddRecurring(demoName)}
                    className="flex-shrink-0 px-3 py-2 border-2 text-xs font-bold transition-all press-scale font-sans"
                    style={{ borderRadius: 'var(--radius-sm)', borderColor: '#c9bfa8', borderStyle: 'dashed', background: '#faf9f7', color: '#9ca3af' }}>
                    <div>{demoName}</div>
                    <div className="font-normal mt-0.5 text-xs" style={{ color: '#c4b89a' }}>— {t.birr}</div>
                  </button>
                ))}
                <button type="button" onClick={() => openAddRecurring('')}
                  className="flex-shrink-0 px-3 py-2 border-2 text-xs font-bold transition-all press-scale flex flex-col items-center justify-center min-w-[52px] font-sans"
                  style={{ borderRadius: 'var(--radius-sm)', borderColor: '#c9bfa8', borderStyle: 'dashed', background: '#faf9f7', color: '#9ca3af' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {addRecurringHint && <p className="text-xs mt-1.5 font-medium font-sans" style={{ color: '#C4883A' }}>{t.addRecurringHint}</p>}
            </div>
          )}

          {/* ==========================================
              SALE — Single-screen composer
              ========================================== */}
          {isSale && (
            <>
              {/* Amount */}
              <div>
                <label className="block text-gray-700 font-semibold mb-1.5 text-sm font-sans">{config.amountLabel}</label>
                <div className="relative">
                  <input
                    type="text" inputMode="decimal"
                    value={fmtInput(amount)}
                    onChange={e => { handleNumericInput(e, setAmount); setShowValidation(false); }}
                    placeholder="0" autoFocus
                    className="w-full p-3 pr-16 border-2 focus:outline-none text-base min-h-[48px] font-sans"
                    style={{ borderRadius: 'var(--radius-md)', borderColor: showValidation && (!sellingPrice || sellingPrice <= 0) ? '#dc2626' : '#e8e2d8' }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                </div>
                {showValidation && (!sellingPrice || sellingPrice <= 0) && (
                  <p className="text-xs text-red-500 mt-1 font-medium font-sans">{lang === 'am' ? 'መጠን ያስገቡ' : 'Enter an amount'}</p>
                )}
              </div>

              {/* Catalog + Item + Photo */}
              <div>
                {catalogEntries.length > 0 && (
                  <div className="mb-2">
                    <label className="block text-gray-700 font-semibold mb-1.5 text-xs font-sans">{t.savedCatalogLabel}</label>
                    <select
                      value={catalogEntryId}
                      onChange={e => handleSelectCatalogEntry(e.target.value)}
                      className="w-full p-2.5 border-2 focus:outline-none text-sm font-sans bg-white"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}>
                      <option value="">{t.typeManually}</option>
                      {catalogEntries.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} — {entry.kind === 'service' ? t.serviceLabel : t.itemLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-end gap-1.5">
                  <div className="flex-1">
                    <label className="block text-gray-700 font-semibold mb-1.5 text-sm font-sans">
                      {config.itemLabel} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item}
                      onChange={e => { setItem(e.target.value); setShowValidation(false); }}
                      placeholder={config.itemPlaceholder}
                      className="w-full p-3 border-2 focus:outline-none text-base min-h-[44px] font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: showValidation && !item.trim() ? '#dc2626' : '#e8e2d8' }}
                    />
                  </div>
                  {showValidation && !item.trim() && (
                    <p className="text-xs text-red-500 mt-1 font-medium font-sans">{lang === 'am' ? 'የዕቃ ስም ያስገቡ' : 'Enter item name'}</p>
                  )}
                  <button
                    type="button"
                    onClick={handlePhotoCapture}
                    className="p-2.5 rounded-full border-2 press-scale min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: '#e8e2d8', background: '#fff' }}
                    title="Take photo">
                    <Camera className="w-4 h-4" style={{ color: '#6b7280' }} />
                  </button>
                </div>

                {photo && (
                  <div className="flex items-center gap-2 p-2 mt-2 border" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', background: '#f9fafb' }}>
                    <img src={photo} alt="Sale photo" className="w-10 h-10 object-cover rounded" style={{ borderRadius: '6px' }} />
                    <span className="text-xs flex-1 font-sans" style={{ color: '#9ca3af' }}>{t.photoAttached}</span>
                    <button type="button" onClick={() => setPhoto(null)} className="text-xs font-medium px-2 py-1 font-sans" style={{ color: '#dc2626' }}>Remove</button>
                  </div>
                )}
              </div>

              {/* Settlement mode */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide mb-1.5 font-sans" style={{ color: '#6b7280' }}>{t.saleSettlementLabel}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'paid_now',    label: t.saleSettlementPaidNow    },
                    { id: 'paid_partly', label: t.saleSettlementPaidPartly },
                    { id: 'pay_later',   label: t.saleSettlementPayLater   },
                  ].map(option => (
                    <button
                      key={option.id} type="button"
                      onClick={() => setSaleSettlementMode(option.id)}
                      className="py-2 px-1 border-2 text-center text-xs font-bold transition-all press-scale font-sans"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        borderColor: saleSettlementMode === option.id ? '#1B4332' : '#e8e2d8',
                        background: saleSettlementMode === option.id ? 'rgba(27,67,50,0.07)' : '#fff',
                        color: saleSettlementMode === option.id ? '#1B4332' : '#6b7280',
                      }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paid partly — paid amount */}
              {saleSettlementMode === 'paid_partly' && (
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5 text-sm font-sans">{t.salePaidAmountLabel}</label>
                  <div className="relative">
                    <input
                      type="text" inputMode="decimal"
                      value={fmtInput(paidAmount)}
                      onChange={e => handleNumericInput(e, setPaidAmount)}
                      placeholder="0"
                      className="w-full p-3 pr-16 border-2 focus:outline-none text-base min-h-[44px] font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: partialAmountValid || !paidAmount ? '#e8e2d8' : '#dc2626' }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                  </div>
                  {!partialAmountValid && paidAmount && (
                    <p className="text-xs mt-1 font-medium text-red-600 font-sans">{t.salePaidAmountHint}</p>
                  )}
                </div>
              )}

              {/* Customer + due date for partly/later */}
              {saleSettlementMode !== 'paid_now' && (
                <>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1.5 text-sm font-sans">
                      {lang === 'am' ? 'ደንበኛ ስም ወይም ምልክት *' : 'Customer name or clue *'}
                    </label>
                    <input
                      type="text"
                      value={saleCustomerName}
                      onChange={e => setSaleCustomerName(e.target.value)}
                      placeholder={t.customerIdentifierPlaceholder}
                      className="w-full p-3 border-2 focus:outline-none text-base min-h-[44px] font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: saleCustomerValid ? '#e8e2d8' : '#dc2626' }}
                    />
                    {matchedCustomers.length > 0 && (
                      <div className="mt-1.5 space-y-1.5">
                        {matchedCustomers.map(c => (
                          <button
                            key={c.id} type="button"
                            onClick={() => setSaleCustomerName(c.display_name || '')}
                            className="w-full p-2.5 border text-left press-scale font-sans"
                            style={{ background: '#fff', borderColor: '#e8e2d8', borderRadius: 'var(--radius-md)' }}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-xs text-gray-900 truncate">{c.display_name}</p>
                                {c.note && <p className="text-[10px] mt-0.5 truncate" style={{ color: '#6b7280' }}>{c.note}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[10px] font-bold uppercase tracking-wide font-sans" style={{ color: '#9ca3af' }}>{t.currentBalance}</p>
                                <p className="text-xs font-black font-sans" style={{ color: '#92400e' }}>{fmt(c.balance || 0)} {t.birr}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {saleSettlementMode === 'pay_later' && (
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5 text-xs font-sans">{t.dueDateOptional}</label>
                      <input
                        type="date"
                        value={saleDueDate}
                        onChange={e => setSaleDueDate(e.target.value)}
                        className="w-full p-3 border-2 focus:outline-none text-sm min-h-[44px] font-sans"
                        style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                      />
                    </div>
                  )}

                  {/* Remaining balance */}
                  {remainingAmount > 0 && (
                    <div className="p-2.5 border" style={{ background: '#fffbeb', borderColor: '#fde68a', borderRadius: 'var(--radius-md)' }}>
                      <div className="flex items-center justify-between gap-2 text-xs font-sans">
                        <span className="font-semibold text-gray-700">{t.saleRemainingBalanceLabel}</span>
                        <span className="font-black" style={{ color: '#92400e' }}>{fmt(remainingAmount)} {t.birr}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Pay later info */}
              {saleSettlementMode === 'pay_later' && (
                <div className="flex items-start gap-2 p-2" style={{ background: '#fffbeb', borderRadius: 'var(--radius-md)', border: '1px solid #fde68a' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4883A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <p className="text-xs font-medium font-sans" style={{ color: '#92400e' }}>{t.noPaymentCollected}</p>
                </div>
              )}

              {/* Payment provider chips — hidden for pay_later */}
              {saleSettlementMode !== 'pay_later' && (
                <PaymentTypeChips
                  paymentType={paymentType}
                  provider={paymentProvider}
                  onTypeChange={setPaymentType}
                  onProviderChange={setPaymentProvider}
                  enabledProviders={enabledProviders}
                />
              )}

              {/* Optional details */}
              <div>
                <div className="h-px" style={{ background: '#e8e2d8' }}></div>
                <button type="button" onClick={() => setShowMoreDetails(v => !v)}
                  className="flex items-center gap-1 text-xs font-semibold py-1.5 min-h-[40px] font-sans"
                  style={{ color: '#C4883A' }}>
                  {showMoreDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {lang === 'am' ? 'አማራጭ ዝርዝሮች' : 'Optional details'}
                </button>
                {showMoreDetails && (
                  <div className="mt-1 p-3 border space-y-2" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <label className="block text-gray-600 text-xs font-semibold mb-1 font-sans">{t.howMany}</label>
                      <input
                        type="number" inputMode="numeric"
                        value={quantity}
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '') { setQuantity(''); return; }
                          const v = parseInt(raw);
                          if (!isNaN(v) && v >= 1) setQuantity(String(v));
                        }}
                        onBlur={e => {
                          const v = parseInt(e.target.value);
                          setQuantity(isNaN(v) || v < 1 ? '1' : String(v));
                        }}
                        min="1"
                        className="w-full p-2.5 border-2 focus:outline-none text-sm min-h-[40px] font-sans"
                        style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs font-semibold mb-1 font-sans">
                        {lang === 'am' ? 'የግዢ ዋጋ' : 'Buying cost'}
                      </label>
                      <div className="relative">
                        <input
                          type="text" inputMode="decimal"
                          value={fmtInput(costPrice)}
                          onChange={e => handleNumericInput(e, setCostPrice)}
                          placeholder="0"
                          className="w-full p-2.5 pr-14 border-2 focus:outline-none text-sm min-h-[40px] font-sans"
                          style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium font-sans">{t.birr}</span>
                      </div>
                      <p className="text-[10px] mt-1 font-sans" style={{ color: '#9ca3af' }}>
                        {lang === 'am' ? 'ይህ ዕቃ ምን ያስከፈለው?' : 'How much did this item cost you?'}
                      </p>
                      {belowCost && (
                        <div className="mt-2 flex items-start gap-1.5 p-2" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)' }}>
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                          <p className="text-[10px] font-sans" style={{ color: '#92400e' }}>{t.sellingBelowCost}</p>
                        </div>
                      )}
                      {cost > 0 && !belowCost && sellingPrice > 0 && (
                        <div className="mt-2 p-2 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 'var(--radius-sm)' }}>
                          <p className="text-[10px] text-green-700 font-semibold font-sans">{t.profitOnSale} {fmt(sellingPrice - cost * qty)} {t.birr}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Inline save guidance */}
              {!canSave && (
                <div className="flex items-center gap-1.5 text-xs font-medium font-sans px-1" style={{ color: '#9ca3af' }}>
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: '#d1d5db' }} />
                  {(() => {
                    if (!sellingPrice) return lang === 'am' ? 'መጠን ያስገቡ' : 'Enter an amount';
                    if (!item.trim()) return lang === 'am' ? 'የዕቃ ስም ያስገቡ' : 'Enter what you sold';
                    if (saleSettlementMode === 'pay_later' && !saleCustomerName.trim()) return lang === 'am' ? 'ደንበኛ ስም ያስገቡ' : 'Enter a customer name';
                    if (saleSettlementMode === 'paid_partly' && !saleCustomerName.trim()) return lang === 'am' ? 'ደንበኛ ስም ያስገቡ' : 'Enter a customer name';
                    if (saleSettlementMode === 'paid_partly' && !(parsedPaidAmount > 0)) return lang === 'am' ? 'የተከፈለ መጠን ያስገቡ' : 'Enter paid amount';
                    if (saleSettlementMode === 'paid_partly' && parsedPaidAmount >= sellingPrice) return lang === 'am' ? 'ከጠቅላላ ያነሰ ይሁን' : 'Must be less than total';
                    return '';
                  })()}
                </div>
              )}

              {/* Save button for Sale */}
              <div className="sticky bottom-0 bg-white pt-2 pb-4 px-1 -mx-1 border-t" style={{ borderColor: '#e8e2d8' }}>
                <button onClick={handleSave} disabled={!canSave || saveState === 'saving'}
                  className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 transition-all min-h-[56px] active:scale-95 press-scale font-sans"
                  style={{
                    background: canSave ? accent.btn : '#e5e7eb',
                    color: canSave ? '#fff' : '#9ca3af',
                    cursor: canSave ? 'pointer' : 'not-allowed',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: canSave ? `0 4px 0 ${accent.shadow}` : 'none',
                  }}>
                  <Save className="w-5 h-5" />
                  {config.buttonText}
                </button>
              </div>
            </>
          )}

          {/* ==========================================
              NON-SALE: Expense / Credit (unchanged)
              ========================================== */}
          {!isSale && (
            <>
              {isExpense && (
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 font-sans">{config.amountLabel}</label>
                  <div className="relative">
                    <input
                      type="text" inputMode="decimal"
                      value={fmtInput(amount)}
                      onChange={e => { handleNumericInput(e, setAmount); setShowValidation(false); }}
                      placeholder="0" autoFocus
                      className="w-full p-3 border-2 focus:outline-none text-base min-h-[48px] font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: showValidation && (!sellingPrice || sellingPrice <= 0) ? '#dc2626' : '#e8e2d8' }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                  </div>
                  {showValidation && (!sellingPrice || sellingPrice <= 0) && (
                    <p className="text-xs text-red-500 mt-1 font-medium font-sans">{lang === 'am' ? 'መጠን ያስገቡ' : 'Enter an amount'}</p>
                  )}
                </div>
              )}

              <div>
                {catalogEntries.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-gray-700 font-semibold mb-2 text-sm font-sans">{t.savedCatalogLabel}</label>
                    <select
                      value={catalogEntryId}
                      onChange={e => handleSelectCatalogEntry(e.target.value)}
                      className="w-full p-3 border-2 focus:outline-none text-sm font-sans bg-white"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}>
                      <option value="">{t.typeManually}</option>
                      {catalogEntries.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} — {entry.kind === 'service' ? t.serviceLabel : t.itemLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="block text-gray-700 font-semibold mb-2 font-sans">{config.itemLabel}</label>
                <input
                  type="text"
                  value={item}
                  onChange={e => { setItem(e.target.value); setShowValidation(false); }}
                  placeholder={config.itemPlaceholder}
                  className="w-full p-3 border-2 focus:outline-none text-base min-h-[48px] font-sans"
                  style={{ borderRadius: 'var(--radius-md)', borderColor: showValidation && !item.trim() ? '#dc2626' : '#e8e2d8' }}
                />
                {showValidation && !item.trim() && (
                  <p className="text-xs text-red-500 mt-1 font-medium font-sans">{lang === 'am' ? 'የዕቃ ስም ያስገቡ' : 'Enter item name'}</p>
                )}
              </div>

              {isCredit && (
                <>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2 font-sans">{config.amountLabel}</label>
                    <div className="relative">
                      <input
                        type="text" inputMode="decimal"
                        value={fmtInput(amount)}
                        onChange={e => { handleNumericInput(e, setAmount); setShowValidation(false); }}
                        placeholder="0"
                        className="w-full p-3 border-2 focus:outline-none text-base min-h-[48px] font-sans"
                        style={{ borderRadius: 'var(--radius-md)', borderColor: showValidation && (!sellingPrice || sellingPrice <= 0) ? '#dc2626' : '#e8e2d8' }}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                    </div>
                    {showValidation && (!sellingPrice || sellingPrice <= 0) && (
                      <p className="text-xs text-red-500 mt-1 font-medium font-sans">{lang === 'am' ? 'መጠን ያስገቡ' : 'Enter an amount'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-2 font-sans">
                      {t.phoneOptional} <span className="text-gray-400 font-normal text-sm">{t.phoneOptionalHint}</span>
                    </label>
                    <div className="flex gap-0">
                      <div className="flex items-center justify-center px-3 py-3 border-2 border-r-0 text-sm font-bold flex-shrink-0 font-sans"
                        style={{ background: 'rgba(27,67,50,0.06)', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : '#e8e2d8', color: '#1B4332', minWidth: '64px', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}>
                        +251
                      </div>
                      <input
                        type="tel" inputMode="numeric"
                        value={phoneDigits}
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, '');
                          if (raw.length <= 9) setPhoneDigits(raw);
                        }}
                        onBlur={() => setPhoneTouched(true)}
                        placeholder="9XXXXXXXX" maxLength={9}
                        className="flex-1 p-4 border-2 text-base focus:outline-none min-h-[52px] font-sans"
                        style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : (phoneEntered && phoneValid ? '#1B4332' : '#e8e2d8') }}
                      />
                    </div>
                    {phoneTouched && phoneEntered && !phoneValid && (
                      <p className="text-xs text-red-500 mt-1 font-medium font-sans">{t.creditPhoneHint}</p>
                    )}
                    {!phoneTouched && <p className="text-xs text-gray-400 mt-1 font-sans">{t.creditPhoneHint}</p>}
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-2 font-sans">{t.whenDue} <span className="text-red-500">*</span></label>
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
                      className="w-full p-3 border-2 text-sm font-semibold transition-colors min-h-[52px] press-scale font-sans"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        borderColor: selectedDue === 'custom' ? '#1B4332' : '#e8e2d8',
                        background: selectedDue === 'custom' ? 'rgba(27,67,50,0.07)' : '#fff',
                        color: selectedDue === 'custom' ? '#1B4332' : '#4b5563',
                      }}>
                      {t.pickDate}
                    </button>
                    {!hasDueDate && <p className="text-xs mt-1.5 font-medium font-sans" style={{ color: '#C4883A' }}>{t.selectDueDate}</p>}
                    {selectedDue === 'custom' && (
                      <input type="date" value={customDue} onChange={e => setCustomDue(e.target.value)}
                        className="w-full mt-2 p-4 border-2 focus:outline-none text-base font-sans"
                        style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
                    )}
                  </div>
                </>
              )}

              {!isCredit && (
                <div className="mt-1">
                  <PaymentTypeChips
                    paymentType={paymentType}
                    provider={paymentProvider}
                    onTypeChange={setPaymentType}
                    onProviderChange={setPaymentProvider}
                    enabledProviders={enabledProviders}
                  />
                </div>
              )}

              {/* Optional details for non-sale */}
              {isSale && (
                <div>
                  <div className="h-px" style={{ background: '#e8e2d8' }}></div>
                  <button type="button" onClick={() => setShowMoreDetails(v => !v)}
                    className="flex items-center gap-1 text-sm font-semibold py-1 min-h-[44px] font-sans"
                    style={{ color: '#C4883A' }}>
                    {showMoreDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {lang === 'am' ? 'አማራጭ ዝርዝሮች' : 'Optional details'}
                  </button>
                  {showMoreDetails && (
                    <div className="mt-2 p-4 border animate-slide-up" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                      {isSale && (
                        <div className="mb-4">
                          <label className="block text-gray-600 text-sm font-semibold mb-2 font-sans">{t.howMany}</label>
                          <input
                            type="number" inputMode="numeric"
                            value={quantity}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') { setQuantity(''); return; }
                              const v = parseInt(raw);
                              if (!isNaN(v) && v >= 1) setQuantity(String(v));
                            }}
                            onBlur={e => {
                              const v = parseInt(e.target.value);
                              setQuantity(isNaN(v) || v < 1 ? '1' : String(v));
                            }}
                            min="1"
                            className="w-full p-3 border-2 focus:outline-none text-base min-h-[48px] font-sans"
                            style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                          />
                        </div>
                      )}
                      <label className="block text-gray-600 text-sm font-semibold mb-2 font-sans">
                        {lang === 'am' ? 'የግዢ ዋጋ' : 'Buying cost'}
                      </label>
                      <div className="relative">
                        <input
                          type="text" inputMode="decimal"
                          value={fmtInput(costPrice)}
                          onChange={e => handleNumericInput(e, setCostPrice)}
                          placeholder="0"
                          className="w-full p-3 pr-14 border-2 focus:outline-none text-base min-h-[48px] font-sans"
                          style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium font-sans">{t.birr}</span>
                      </div>
                      <p className="text-xs mt-2 font-sans" style={{ color: '#9ca3af' }}>
                        {lang === 'am' ? 'ይህ ዕቃ ምን ያስከፈለው?' : 'How much did this item cost you?'}
                      </p>
                      {belowCost && (
                        <div className="mt-3 flex items-start gap-2 p-3" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)' }}>
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                          <p className="text-xs font-sans" style={{ color: '#92400e' }}>{t.sellingBelowCost}</p>
                        </div>
                      )}
                      {cost > 0 && !belowCost && sellingPrice > 0 && (
                        <div className="mt-3 p-3 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 'var(--radius-sm)' }}>
                          <p className="text-xs text-green-700 font-semibold font-sans">{t.profitOnSale} {fmt(sellingPrice - cost * qty)} {t.birr}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
              )}

              {/* Inline save guidance for Expense */}
              {isExpense && !canSave && (
                <div className="flex items-center gap-1.5 text-xs font-medium font-sans px-1" style={{ color: '#9ca3af' }}>
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: '#d1d5db' }} />
                  {(() => {
                    if (!sellingPrice) return lang === 'am' ? 'መጠን ያስገቡ' : 'Enter an amount';
                    if (!item.trim()) return lang === 'am' ? 'የዕቃ ስም ያስገቡ' : 'Enter expense reason';
                    return '';
                  })()}
                </div>
              )}

              {/* Save button for non-sale */}
          {!isSale && (
            <div className="sticky bottom-0 bg-white pt-2 pb-4 px-1 -mx-1 border-t" style={{ borderColor: '#e8e2d8' }}>
              <button onClick={handleSave} disabled={!canSave || saveState === 'saving'}
                className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 transition-all min-h-[56px] active:scale-95 press-scale font-sans"
                style={{
                  background: canSave ? accent.btn : '#e5e7eb',
                  color: canSave ? '#fff' : '#9ca3af',
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: canSave ? `0 4px 0 ${accent.shadow}` : 'none',
                }}>
                <Save className="w-5 h-5" />
                {config.buttonText}
              </button>
            </div>
          )}
        </div>

        {/* Draft prompt */}
        {showDraftPrompt && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] animate-fade" onClick={e => { if (e.target === e.currentTarget) setShowDraftPrompt(false); }}>
            <div className="bg-white w-full max-w-sm p-6 pb-8 animate-elastic" style={{ borderRadius: '24px 24px 0 0', boxShadow: 'var(--shadow-lg)' }}>
              <h3 className="text-lg font-black text-gray-900 text-center mb-2 font-sans">{t.keepDraft}</h3>
              <p className="text-sm text-gray-500 text-center mb-5 font-sans">Your unfinished sale is saved. Continue later.</p>
              <div className="space-y-3">
                <button
                  onClick={() => { setShowDraftPrompt(false); onDone(); }}
                  className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale font-sans"
                  style={{ background: '#2d6a4f', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 0 #1B4332' }}>
                  {t.keepDraft}
                </button>
                <button
                  onClick={() => {
                    const draftKey = isSale ? SALE_DRAFT_KEY : isExpense ? EXPENSE_DRAFT_KEY : null;
                    if (draftKey) clearDraft(draftKey);
                    setShowDraftPrompt(false);
                    onDone();
                  }}
                  className="w-full p-4 font-bold text-gray-600 text-base min-h-[52px] press-scale font-sans"
                  style={{ background: '#f5f5f5', borderRadius: 'var(--radius-md)' }}>
                  {t.discardDraft}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recurring expense popup */}
        {showAddRecurring && (
          <div className="fixed inset-0 flex items-end sm:items-center justify-center" style={{ zIndex: 60, background: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white w-full max-w-md p-6 animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-black text-gray-900 font-sans">{t.addRecurring}</h3>
                <button onClick={() => setShowAddRecurring(false)} aria-label={t.close}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center press-scale">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4 font-sans">{t.addRecurringPopupGuide}</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm font-sans">{t.whatDidYouSpendOn}</label>
                  <input type="text" value={popupName} onChange={e => setPopupName(e.target.value)}
                    placeholder={t.spendPlaceholder}
                    className="w-full p-3 border-2 focus:outline-none text-sm font-sans"
                    style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm font-sans">{t.howMuchTotal}</label>
                  <div className="relative">
                    <input type="text" inputMode="decimal" value={fmtInput(popupAmount)}
                      onChange={e => handleNumericInput(e, setPopupAmount)}
                      placeholder="0"
                      className="w-full p-3 pr-14 border-2 focus:outline-none text-sm font-sans"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium font-sans">{t.birr}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm font-sans">{t.frequency}</label>
                  <div className="flex gap-2">
                    {[{ id: 'daily', label: t.daily }, { id: 'weekly', label: t.weekly }, { id: 'monthly', label: t.monthly }].map(f => (
                      <button key={f.id} type="button"
                        onClick={() => setPopupFreq(f.id)}
                        className="flex-1 py-2 text-xs font-bold border-2 transition-all press-scale font-sans"
                        style={{
                          borderRadius: 'var(--radius-sm)',
                          borderColor: popupFreq === f.id ? '#D4654A' : '#e8e2d8',
                          background: popupFreq === f.id ? 'rgba(212,101,74,0.08)' : '#fff',
                          color: popupFreq === f.id ? '#D4654A' : '#6b7280',
                        }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={handleAddAndUse}
                disabled={!popupName.trim() || !parseFloat(parseInput(popupAmount))}
                className="w-full mt-5 p-4 font-black text-base flex items-center justify-center gap-2 transition-all min-h-[52px] press-scale font-sans"
                style={{
                  borderRadius: 'var(--radius-md)',
                  background: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? '#D4654A' : '#e5e7eb',
                  color: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? '#fff' : '#9ca3af',
                  cursor: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? 'pointer' : 'not-allowed',
                  boxShadow: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? '0 4px 0 #a84c37' : 'none',
                }}>
                <Plus className="w-5 h-5" />
                {t.addAndUse}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TransactionForm;
