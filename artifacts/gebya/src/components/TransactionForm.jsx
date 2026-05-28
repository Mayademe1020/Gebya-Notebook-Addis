// TransactionForm.jsx — single-screen v4 redesign.
//
// Renders an inline (not-modal) page covering the screen except the bottom nav.
// User can navigate away via the bottom nav at any time — no trap.
//
// Layout (top to bottom):
//   - Header: ← back, colored type label
//   - Scrollable body:
//       actor chip
//       credit direction (credit only)
//       recurring quick-fill (expense only)
//       saved-item dropdown (catalog)
//       AMOUNT (large, auto-focused) + quick-pick chips (50/100/200/500/1k)
//       ITEM/NAME (optional for sale+expense, required name for credit) + photo button
//       quick saved-item chips (from catalogEntries)
//       payment chips (sale+expense) OR phone+due+direction (credit)
//       advanced cost-price (sale+expense)
//       photo preview if attached
//   - Sticky bottom: solid colored save button per type
//
// Preserves all existing handlers, save data shape, success screen, recurring popup.
// NEW: photo capture (B-009) — base64 stored on transaction record.

import { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Save,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Minus,
  Camera,
  ArrowLeft,
} from 'lucide-react';
import { useLang } from '../context/LangContext';
import PaymentTypeChips from './PaymentTypeChips';
import { getDueDateOptions } from '../utils/ethiopianCalendar';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { compressPhoto, photoSizeBytes } from '../utils/photoCapture';
import { db } from '../db';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
  setter(raw);
}

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

function TransactionForm({
  type,
  onSave,
  onDone,
  actorLabel,
  enabledProviders,
  catalogEntries = [],
  recurringExpenses,
  onRecurringChange,
  initialPaymentType,
  initialPaymentProvider,
  lastPaymentHistory,
}) {
  const { lang, t } = useLang();

  // ─── Type config (color, header label, icon, save button text) ─────────
  const headerLabel = {
    sale: lang === 'am' ? '+ ሽያጭ' : '+ Sale',
    expense: lang === 'am' ? '− ወጪ' : '− Expense',
    credit: lang === 'am' ? '↻ ዱቤ' : '↻ Credit',
  }[type] || (lang === 'am' ? '+ ሽያጭ' : '+ Sale');

  const accentColor = {
    sale: '#16a34a',
    expense: '#dc2626',
    credit: '#2563eb',
  }[type] || '#16a34a';

  const isCredit = type === 'credit';
  const isExpense = type === 'expense';

  const itemPlaceholder = isCredit
    ? (lang === 'am' ? 'ለምሳሌ አበበ…' : 'e.g. Abebe...')
    : isExpense
      ? (lang === 'am' ? 'ለምሳሌ ትራንስፖርት፣ ኪራይ…' : 'e.g. transport, rent...')
      : (lang === 'am' ? 'ለምሳሌ ዳቦ፣ ስኳር…' : 'e.g. bread, sugar...');

  const itemLabel = isCredit
    ? (lang === 'am' ? 'ስም' : 'NAME')
    : (lang === 'am' ? 'ዕቃ (አማራጭ)' : 'ITEM (OPTIONAL)');

  const saveButtonText = isCredit
    ? (lang === 'am' ? 'ዱቤ አስቀምጥ' : 'Save Dubie')
    : isExpense
      ? (lang === 'am' ? 'ወጪ አስቀምጥ' : 'Save Expense')
      : (lang === 'am' ? 'ሽያጭ አስቀምጥ' : 'Save Sale');

  // ─── State ──────────────────────────────────────────────────────────────
  const [item, setItem] = useState('');
  const [catalogEntryId, setCatalogEntryId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [selectedDue, setSelectedDue] = useState(null);
  const [customDue, setCustomDue] = useState('');
  const [paymentType, setPaymentType] = useState(initialPaymentType || 'cash');
  const [paymentProvider, setPaymentProvider] = useState(initialPaymentProvider || '');
  const [creditDirection, setCreditDirection] = useState('owes_me');
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [popupName, setPopupName] = useState('');
  const [popupAmount, setPopupAmount] = useState('');
  const [popupFreq, setPopupFreq] = useState('monthly');
  const [addRecurringHint, setAddRecurringHint] = useState(false);
  // Multi-item breakdown
  const [lineItems, setLineItems] = useState([]); // [{id, name, amount}]
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Derived ────────────────────────────────────────────────────────────
  const dueDateOptions = getDueDateOptions();
  const selectedCatalogEntry =
    catalogEntries.find(entry => String(entry.id) === String(catalogEntryId)) || null;
  const sellingPrice = parseFloat(parseInput(amount)) || 0;
  const cost = parseFloat(parseInput(costPrice)) || 0;
  const qty = Math.max(1, parseInt(quantity) || 1);
  const belowCost = !isCredit && cost > 0 && sellingPrice < cost * qty;

  const phoneValid = !phoneDigits || /^[79]\d{8}$/.test(phoneDigits);
  const phoneEntered = phoneDigits.length > 0;

  const hasDueDate = isCredit
    ? (selectedDue !== null && selectedDue !== undefined && selectedDue !== 'custom')
        || (selectedDue === 'custom' && customDue)
    : true;

  // Item is OPTIONAL for sale/expense; REQUIRED (as customer name) for credit
  const canSave =
    sellingPrice > 0
    && (isCredit ? item.trim() && hasDueDate : true)
    && (!phoneEntered || phoneValid)
    && !isSaving;

  // Top catalog items (active ones) — shown as chips below item input
  const topCatalogItems = catalogEntries
    .filter(e => e && e.is_active !== false && e.name)
    .slice(0, 8);

  // Multi-item breakdown — derived
  const lineItemsTotal = lineItems.reduce((sum, l) => {
    const v = parseFloat(parseInput(l.amount));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const validLineItems = lineItems.filter(
    l => l.name.trim() && parseFloat(parseInput(l.amount)) > 0
  );
  const breakdownDelta = sellingPrice - lineItemsTotal; // +ve: items < total, -ve: items > total

  // ─── Handlers ───────────────────────────────────────────────────────────
  const getEffectiveDueDate = () => {
    if (selectedDue === 'custom' && customDue) return new Date(customDue).getTime();
    return selectedDue;
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const dataUrl = await compressPhoto(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
    }
    // Reset the input so the same file can be picked again
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const fullPhone = phoneEntered && phoneValid ? '+251' + phoneDigits : null;

    // If breakdown has valid items, build a clean items array; let item_name
    // derive from the items so the row is self-describing in History/Reports.
    const cleanedItems = validLineItems.map(l => ({
      name: l.name.trim(),
      amount: parseFloat(parseInput(l.amount)),
    }));
    const itemNameForSave = (!isCredit && cleanedItems.length > 0)
      ? cleanedItems.map(li => li.name).join(', ').substring(0, 200)
      : item.trim();

    const data = {
      type,
      item_name: itemNameForSave,
      catalog_entry_id: catalogEntryId ? Number(catalogEntryId) : null,
      item_kind: selectedCatalogEntry?.kind || null,
      quantity: isCredit ? 1 : qty,
      amount: sellingPrice,
      cost_price: isCredit ? 0 : cost,
      profit: (!isCredit && cost > 0) ? (sellingPrice - cost * qty) : null,
      is_credit: isCredit,
      customer_phone: isCredit ? fullPhone : null,
      due_date: isCredit ? getEffectiveDueDate() : null,
      payment_type: isCredit ? null : paymentType,
      payment_provider: (!isCredit && paymentType !== 'cash') ? paymentProvider || null : null,
      direction: isCredit ? creditDirection : null,
      photo: photo || null,
      photo_taken_at: photo ? Date.now() : null,
      items: cleanedItems.length > 0 ? cleanedItems : null,  // NEW: multi-item breakdown
      created_at: Date.now(),
    };
    try {
      await onSave(data);
      // Auto-return — no success screen. App.jsx shows the new entry on Today.
      onDone();
    } catch (err) {
      setIsSaving(false);
      // error surfaced via App.jsx
    }
  };

  // ─── Multi-item breakdown handlers ─────────────────────────────────────
  const addLineItem = (preset = {}) => {
    setLineItems(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        name: preset.name || '',
        amount: preset.amount != null ? String(preset.amount) : '',
      },
    ]);
    setShowBreakdown(true);
  };

  const removeLineItem = (id) => {
    setLineItems(prev => prev.filter(l => l.id !== id));
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleLineItemAmount = (id, e) => {
    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    updateLineItem(id, 'amount', raw);
  };

  const addFromCatalogToBreakdown = (entry) => {
    addLineItem({ name: entry.name, amount: entry.default_price });
  };

  // Sync total amount from breakdown sum (if user has items but no manual total)
  const syncAmountToBreakdownSum = () => {
    if (lineItemsTotal > 0) setAmount(String(lineItemsTotal));
  };

  const handleSelectCatalogEntry = (value) => {
    setCatalogEntryId(value);
    const entry = catalogEntries.find(it => String(it.id) === String(value));
    if (!entry) return;
    setItem(entry.name || '');
    if (!amount && entry.default_price != null) setAmount(String(entry.default_price));
    if (!costPrice && entry.default_cost != null) setCostPrice(String(entry.default_cost));
  };

  const handleQuickItem = (entry) => {
    setCatalogEntryId(String(entry.id));
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
    const current = recurringExpenses || [];
    const updated = [...current, newItem];
    await db.settings.put({ key: 'recurring_expenses', value: JSON.stringify(updated) });
    onRecurringChange?.(updated);
    setShowAddRecurring(false);
    setItem(newItem.name);
    setAmount(String(newItem.amount));
    setAddRecurringHint(true);
    setTimeout(() => setAddRecurringHint(false), 4000);
  };

  // ─── Main form ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-30 max-w-md mx-auto flex flex-col"
      style={{ background: '#ffffff' }}
    >
      {/* Header: back arrow + type label */}
      <div
        className="flex-shrink-0 px-3 sm:px-4 py-3 flex items-center justify-between"
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
        <h2 className="text-base font-bold" style={{ color: accentColor }}>{headerLabel}</h2>
        {actorLabel ? (
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: '#6b4f1d', maxWidth: '100px', textAlign: 'right' }}
            title={actorLabel}
          >
            {actorLabel}
          </span>
        ) : (
          <div style={{ width: '36px' }} />
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 pb-2 space-y-4">

        {/* Credit direction picker */}
        {isCredit && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'አቅጣጫ' : 'DIRECTION'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'owes_me', label: lang === 'am' ? 'ያበደርኩት' : 'They owe me' },
                { id: 'i_owe',   label: lang === 'am' ? 'የተበደርኩት' : 'I owe them' },
              ].map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setCreditDirection(d.id)}
                  className="p-3 border-2 text-center transition-all min-h-[48px] press-scale text-sm font-bold"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    borderColor: creditDirection === d.id ? accentColor : '#e8e2d8',
                    background: creditDirection === d.id ? `${accentColor}10` : '#fff',
                    color: creditDirection === d.id ? accentColor : '#6b7280',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recurring quick-fill (expense only) */}
        {isExpense && recurringExpenses && recurringExpenses.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ፈጣን ሙላ' : 'QUICK-FILL'}
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {recurringExpenses.map(re => (
                <button
                  key={re.id}
                  type="button"
                  onClick={() => { setItem(re.name); setAmount(String(re.amount)); }}
                  className="flex-shrink-0 px-3 py-1.5 border text-xs font-bold press-scale"
                  style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff', color: '#1B4332' }}
                >
                  <div>{re.name}</div>
                  <div className="font-normal text-[10px]" style={{ color: '#C4883A' }}>
                    {fmt(re.amount)} {lang === 'am' ? 'ብር' : 'birr'}
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => openAddRecurring('')}
                className="flex-shrink-0 px-3 py-1.5 border text-xs font-bold press-scale flex items-center justify-center"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  borderColor: '#c9bfa8',
                  borderStyle: 'dashed',
                  background: '#faf9f7',
                  color: '#9ca3af',
                  minWidth: '40px',
                }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {addRecurringHint && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: '#C4883A' }}>
                {lang === 'am' ? 'በቅንብሮች ውስጥ ሌሎች ተደጋጋሚ ወጪዎችን ማከል ይችላሉ' : 'You can add more recurring expenses in Settings'}
              </p>
            )}
          </div>
        )}
        {isExpense && (!recurringExpenses || recurringExpenses.length === 0) && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ፈጣን ሙላ' : 'QUICK-FILL (EXAMPLES)'}
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[lang === 'am' ? 'ኪራይ' : 'Rent', lang === 'am' ? 'እቁብ' : 'እቁብ'].map(demoName => (
                <button
                  key={demoName}
                  type="button"
                  onClick={() => openAddRecurring(demoName)}
                  className="flex-shrink-0 px-3 py-1.5 border text-xs font-bold press-scale"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    borderColor: '#c9bfa8',
                    borderStyle: 'dashed',
                    background: '#faf9f7',
                    color: '#9ca3af',
                  }}
                >
                  {demoName}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openAddRecurring('')}
                className="flex-shrink-0 px-3 py-1.5 border text-xs font-bold press-scale flex items-center justify-center"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  borderColor: '#c9bfa8',
                  borderStyle: 'dashed',
                  background: '#faf9f7',
                  color: '#9ca3af',
                  minWidth: '40px',
                }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Catalog dropdown (compact) */}
        {catalogEntries.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'የተቀመጡ ዕቃዎች' : 'SAVED ITEMS'}
            </label>
            <select
              value={catalogEntryId}
              onChange={e => handleSelectCatalogEntry(e.target.value)}
              className="w-full px-3 py-2.5 border-2 focus:outline-none text-sm bg-white"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            >
              <option value="">{lang === 'am' ? 'በእጅ ይተይቡ' : 'Type manually'}</option>
              {catalogEntries.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} {entry.kind === 'service' ? '• Service' : '• Item'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* AMOUNT — the hero */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
            {lang === 'am' ? 'መጠን' : 'AMOUNT'}
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
              {lang === 'am' ? 'ብር' : 'birr'}
            </span>
          </div>

          {/* Quick-pick amount chips — ADDITIVE: tap to add to current amount */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 items-center">
            {QUICK_AMOUNTS.map(amt => (
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
                +{amt >= 1000 ? `${amt / 1000}K` : amt}
              </button>
            ))}
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
        </div>

        {/* Multi-item breakdown (sale/expense only) */}
        {!isCredit && (
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
                {/* Catalog quick-add chips (tap to add as line item) */}
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

                {/* Line items list */}
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

                {/* Add custom item button */}
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

                {/* Totals + remaining hint */}
                {validLineItems.length > 0 && (
                  <div className="text-xs pt-2 border-t space-y-1" style={{ borderColor: '#e8e2d8' }}>
                    <div className="flex justify-between" style={{ color: '#374151' }}>
                      <span>{lang === 'am' ? 'የዕቃዎች ድምር' : 'Items total'}:</span>
                      <span className="font-bold">{fmt(lineItemsTotal)} {lang === 'am' ? 'ብር' : 'birr'}</span>
                    </div>
                    {sellingPrice > 0 && Math.abs(breakdownDelta) > 0.01 && (
                      <button
                        type="button"
                        onClick={syncAmountToBreakdownSum}
                        className="w-full flex justify-between items-center px-1.5 py-1 press-scale"
                        style={{
                          color: breakdownDelta > 0 ? '#C4883A' : '#dc2626',
                          background: breakdownDelta > 0 ? 'rgba(196,136,58,0.08)' : 'rgba(220,38,38,0.06)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        title={lang === 'am' ? 'መጠን ወደ ድምር አስተካክል' : 'Set total to items sum'}
                      >
                        <span>
                          {breakdownDelta > 0
                            ? (lang === 'am' ? 'ቀሪ (አልተመዘገበም)' : 'Unaccounted')
                            : (lang === 'am' ? 'ድምር ከመጠን በላይ' : 'Items exceed total')}
                          :
                        </span>
                        <span className="font-bold">
                          {fmt(Math.abs(breakdownDelta))} {lang === 'am' ? 'ብር' : 'birr'} ⤴
                        </span>
                      </button>
                    )}
                    {(sellingPrice === 0 || sellingPrice === lineItemsTotal) && (
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

        {/* ITEM / NAME + photo button (side by side) */}
        {/* When breakdown has items, this becomes an optional note since items provide their own names */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
              {validLineItems.length > 0 && !isCredit
                ? (lang === 'am' ? 'ማስታወሻ (አማራጭ)' : 'NOTE (OPTIONAL)')
                : itemLabel}
            </label>

            {/* Photo button — visible by default. Sale/expense only. */}
            {!isCredit && (
              <label
                className="cursor-pointer press-scale flex items-center justify-center"
                style={{
                  width: '40px',
                  height: '40px',
                  border: '1.5px solid #e8e2d8',
                  borderRadius: 'var(--radius-sm)',
                  background: photo ? '#f0fdf4' : '#fff',
                }}
                aria-label={lang === 'am' ? 'ፎቶ ያንሱ' : 'Take photo'}
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                  disabled={photoLoading}
                />
                {photoLoading
                  ? <span className="text-xs">…</span>
                  : photo
                    ? <CheckCircle2 className="w-5 h-5" style={{ color: '#16a34a' }} />
                    : <Camera className="w-5 h-5" style={{ color: '#6b7280' }} />
                }
              </label>
            )}
          </div>

          <input
            type="text"
            value={item}
            onChange={e => setItem(e.target.value)}
            placeholder={itemPlaceholder}
            className="w-full p-3 border-2 focus:outline-none text-base"
            style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
          />

          {photoError && (
            <p className="text-xs mt-1 font-medium" style={{ color: '#dc2626' }}>
              {photoError}
            </p>
          )}

          {/* Photo preview */}
          {photo && (
            <div className="mt-2 flex items-center gap-2 p-2" style={{ background: '#fafaf6', border: '1px solid #e8e2d8', borderRadius: 'var(--radius-sm)' }}>
              <img src={photo} alt="" className="w-12 h-12 object-cover" style={{ borderRadius: '6px' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>
                  {lang === 'am' ? 'ፎቶ ተጨምሯል' : 'Photo attached'}
                </p>
                <p className="text-[10px]" style={{ color: '#9ca3af' }}>
                  {Math.round(photoSizeBytes(photo) / 1024)} KB
                </p>
              </div>
              <button
                onClick={() => setPhoto(null)}
                className="press-scale flex items-center justify-center"
                style={{ minWidth: '32px', minHeight: '32px' }}
                aria-label={lang === 'am' ? 'ፎቶ አስወግድ' : 'Remove photo'}
              >
                <X className="w-4 h-4" style={{ color: '#6b7280' }} />
              </button>
            </div>
          )}

          {/* Quick item chips from catalog */}
          {!isCredit && topCatalogItems.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-medium mb-1" style={{ color: '#6b7280' }}>
                {lang === 'am' ? 'ፈጣን ዕቃዎች:' : 'Quick items:'}
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
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

        {/* Phone (credit) */}
        {isCredit && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ስልክ (አማራጭ)' : 'PHONE (OPTIONAL)'}
            </label>
            <div className="flex gap-0">
              <div
                className="flex items-center justify-center px-3 py-3 border-2 border-r-0 text-sm font-bold flex-shrink-0"
                style={{
                  background: 'rgba(27,67,50,0.06)',
                  borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : '#e8e2d8',
                  color: '#1B4332',
                  minWidth: '60px',
                  borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                }}
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
                className="flex-1 p-3 border-2 text-base focus:outline-none"
                style={{
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  borderColor: (phoneTouched && phoneEntered && !phoneValid) ? '#dc2626' : (phoneEntered && phoneValid ? '#1B4332' : '#e8e2d8'),
                }}
              />
            </div>
            {phoneTouched && phoneEntered && !phoneValid && (
              <p className="text-xs text-red-500 mt-1 font-medium">
                {lang === 'am' ? '9 አሃዞች፣ ከ7 ወይም 9 ይጀምሩ' : '9 digits starting with 7 or 9'}
              </p>
            )}
          </div>
        )}

        {/* Due date (credit) */}
        {isCredit && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'መቼ ይከፍላል?' : 'WHEN IS IT DUE?'} <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {dueDateOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedDue(opt.value)}
                  className="p-2.5 border-2 text-xs font-bold transition-all min-h-[48px] press-scale"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    borderColor: selectedDue === opt.value ? accentColor : '#e8e2d8',
                    background: selectedDue === opt.value ? `${accentColor}10` : '#fff',
                    color: selectedDue === opt.value ? accentColor : '#374151',
                  }}
                >
                  <div className="font-bold">{opt.label.split(' ')[0]}</div>
                  <div className="text-[10px] opacity-70">{opt.display}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSelectedDue('custom')}
              className="w-full p-2.5 border-2 text-sm font-semibold transition-all min-h-[44px] press-scale"
              style={{
                borderRadius: 'var(--radius-sm)',
                borderColor: selectedDue === 'custom' ? accentColor : '#e8e2d8',
                background: selectedDue === 'custom' ? `${accentColor}10` : '#fff',
                color: selectedDue === 'custom' ? accentColor : '#374151',
              }}
            >
              {lang === 'am' ? 'ቀን ይምረጡ' : 'Pick a date'}
            </button>
            {!hasDueDate && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: '#C4883A' }}>
                {lang === 'am' ? 'የመክፍያ ቀን ይምረጡ' : 'Please select a due date'}
              </p>
            )}
            {selectedDue === 'custom' && (
              <input
                type="date"
                value={customDue}
                onChange={e => setCustomDue(e.target.value)}
                className="w-full mt-2 p-3 border-2 focus:outline-none text-base"
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
              />
            )}
          </div>
        )}

        {/* Payment chips (sale/expense only) */}
        {!isCredit && (
          <PaymentTypeChips
            paymentType={paymentType}
            provider={paymentProvider}
            onTypeChange={setPaymentType}
            onProviderChange={setPaymentProvider}
            enabledProviders={enabledProviders}
            lastProviderByType={lastPaymentHistory}
          />
        )}

        {/* More options toggle (sale/expense) — collapses quantity + cost price */}
        {!isCredit && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-sm font-semibold py-1 min-h-[36px]"
              style={{ color: '#C4883A' }}
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {lang === 'am'
                ? `ተጨማሪ (ብዛት፣ ዋጋ) ${qty > 1 ? `• ×${qty}` : ''}`
                : `More options (qty, cost) ${qty > 1 ? `• ×${qty}` : ''}`}
            </button>

            {showAdvanced && (
              <div
                className="mt-2 p-3 border space-y-3"
                style={{ background: 'var(--color-bg)', borderColor: '#e8e2d8', borderRadius: 'var(--radius-md)' }}
              >
                {/* Quantity */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                    {lang === 'am' ? 'ብዛት' : 'Quantity'}{' '}
                    <span style={{ color: '#9ca3af' }}>{lang === 'am' ? '(በነባሪ 1)' : '(default 1)'}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity(String(Math.max(1, qty - 1)))}
                      className="flex items-center justify-center press-scale"
                      style={{
                        minWidth: '44px',
                        minHeight: '44px',
                        border: '2px solid #e8e2d8',
                        borderRadius: 'var(--radius-md)',
                        background: '#fff',
                      }}
                      aria-label={lang === 'am' ? 'ቀንስ' : 'Decrease'}
                    >
                      <Minus className="w-4 h-4" style={{ color: '#374151' }} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
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
                      className="flex-1 p-2.5 border-2 focus:outline-none text-base text-center font-bold"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(String(qty + 1))}
                      className="flex items-center justify-center press-scale"
                      style={{
                        minWidth: '44px',
                        minHeight: '44px',
                        border: '2px solid #e8e2d8',
                        borderRadius: 'var(--radius-md)',
                        background: '#fff',
                      }}
                      aria-label={lang === 'am' ? 'ጨምር' : 'Increase'}
                    >
                      <Plus className="w-4 h-4" style={{ color: '#374151' }} />
                    </button>
                  </div>
                </div>

                {/* Cost price */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                    {lang === 'am' ? 'ለዚህ ምን ከፈሉ?' : 'What did you pay for this?'}{' '}
                    <span style={{ color: '#9ca3af' }}>{lang === 'am' ? '(በአንድ)' : '(per unit)'}</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fmtInput(costPrice)}
                      onChange={e => handleNumericInput(e, setCostPrice)}
                      placeholder="0"
                      className="w-full p-3 pr-14 border-2 focus:outline-none text-base"
                      style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: '#9ca3af' }}>
                      {lang === 'am' ? 'ብር' : 'birr'}
                    </span>
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: '#9ca3af' }}>
                    {lang === 'am' ? 'አማራጭ — ትክክለኛውን ትርፍ ለማየት ይረዳል' : 'Optional — helps you see your true profit'}
                  </p>

                  {belowCost && (
                    <div className="mt-2 flex items-start gap-2 p-2.5" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)' }}>
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                      <p className="text-xs" style={{ color: '#92400e' }}>
                        {lang === 'am' ? 'ከዋጋ በታች እየሸጡ ነው።' : 'You are selling below cost.'}
                      </p>
                    </div>
                  )}
                  {cost > 0 && !belowCost && sellingPrice > 0 && (
                    <div className="mt-2 p-2.5 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 'var(--radius-sm)' }}>
                      <p className="text-xs font-semibold" style={{ color: '#166534' }}>
                        {lang === 'am' ? 'በዚህ ሽያጭ ትርፍ:' : 'Profit on this sale:'}{' '}
                        {fmt(sellingPrice - cost * qty)} {lang === 'am' ? 'ብር' : 'birr'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
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
          {saveButtonText}
        </button>
      </div>

      {/* Recurring expense popup */}
      {showAddRecurring && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center"
          style={{ zIndex: 60, background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="bg-white w-full max-w-md p-5 sm:p-6"
            style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold" style={{ color: '#1a1a1a' }}>
                {lang === 'am' ? 'ተደጋጋሚ ወጪ አክል' : 'Add recurring expense'}
              </h3>
              <button
                onClick={() => setShowAddRecurring(false)}
                className="press-scale flex items-center justify-center"
                style={{ minWidth: '36px', minHeight: '36px' }}
                aria-label={lang === 'am' ? 'ዝጋ' : 'Close'}
              >
                <X className="w-4 h-4" style={{ color: '#6b7280' }} />
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ይህን ወጪ ለሚቀጥሉ ጊዜያት አስቀምጥ' : 'Save this as a recurring expense to reuse it anytime'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
                  {lang === 'am' ? 'ምን ላይ ወጪ?' : 'What did you spend on?'}
                </label>
                <input
                  type="text"
                  value={popupName}
                  onChange={e => setPopupName(e.target.value)}
                  placeholder={lang === 'am' ? 'ለምሳሌ ትራንስፖርት፣ ኪራይ…' : 'e.g. transport, rent...'}
                  className="w-full p-2.5 border-2 focus:outline-none text-sm"
                  style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
                  {lang === 'am' ? 'ጠቅላላ ስንት?' : 'How much total?'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fmtInput(popupAmount)}
                    onChange={e => handleNumericInput(e, setPopupAmount)}
                    placeholder="0"
                    className="w-full p-2.5 pr-12 border-2 focus:outline-none text-sm"
                    style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#9ca3af' }}>
                    {lang === 'am' ? 'ብር' : 'birr'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
                  {lang === 'am' ? 'ድግግሞሽ' : 'Frequency'}
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'daily',   label: lang === 'am' ? 'ዕለታዊ' : 'Daily' },
                    { id: 'weekly',  label: lang === 'am' ? 'ሳምንታዊ' : 'Weekly' },
                    { id: 'monthly', label: lang === 'am' ? 'ወርሃዊ' : 'Monthly' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPopupFreq(f.id)}
                      className="flex-1 py-2 text-xs font-bold border-2 press-scale"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        borderColor: popupFreq === f.id ? '#D4654A' : '#e8e2d8',
                        background: popupFreq === f.id ? 'rgba(212,101,74,0.08)' : '#fff',
                        color: popupFreq === f.id ? '#D4654A' : '#6b7280',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={handleAddAndUse}
              disabled={!popupName.trim() || !parseFloat(parseInput(popupAmount))}
              className="w-full mt-4 p-3 font-bold text-base flex items-center justify-center gap-2 press-scale"
              style={{
                borderRadius: 'var(--radius-md)',
                background: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? '#D4654A' : '#e5e7eb',
                color: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? '#fff' : '#9ca3af',
                cursor: (popupName.trim() && parseFloat(parseInput(popupAmount))) ? 'pointer' : 'not-allowed',
              }}
            >
              <Plus className="w-5 h-5" />
              {lang === 'am' ? 'አስቀምጥ እና ተጠቀም' : 'Add & Use'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionForm;
