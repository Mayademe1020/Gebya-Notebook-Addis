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

import { useMemo, useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Save,
  AlertTriangle,
  Plus,
  Minus,
  Camera,
  ArrowLeft,
} from 'lucide-react';
import { useLang } from '../context/LangContext';
import PaymentTypeChips from './PaymentTypeChips';
import EthiopianDatePicker from './EthiopianDatePicker';
import { getDueDateOptions, formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { compressPhoto, photoSizeBytes } from '../utils/photoCapture';
import { buildPhotoFields, createPhotoProof, MAX_PROOF_PHOTOS } from '../utils/photoProof';
import { db } from '../db';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
  setter(raw);
}

const DEFAULT_QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

function safeMathTotal(input) {
  const normalized = String(input || '')
    .replace(/[×x]/gi, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');
  if (!normalized || !/^\d+(?:\.\d+)?(?:[+\-*/]\d+(?:\.\d+)?)*$/.test(normalized)) return null;

  const tokens = normalized.match(/\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;

  const values = [Number(tokens[0])];
  const ops = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const next = Number(tokens[i + 1]);
    if (!Number.isFinite(next)) return null;
    if (op === '*') {
      values[values.length - 1] *= next;
    } else if (op === '/') {
      if (next === 0) return null;
      values[values.length - 1] /= next;
    } else {
      ops.push(op);
      values.push(next);
    }
  }

  const result = values.reduce((sum, value, index) => (
    index === 0 ? value : (ops[index - 1] === '-' ? sum - value : sum + value)
  ), 0);
  return Number.isFinite(result) && result > 0 ? Math.round(result * 100) / 100 : null;
}

function parseItemDraft(input, catalogEntries = []) {
  const raw = String(input || '').trim();
  if (!raw) return { kind: 'empty', raw: '' };
  const query = raw.toLowerCase();
  const exactCatalog = catalogEntries.find((entry) => {
    const name = String(entry?.name || '').trim().toLowerCase();
    const code = String(entry?.code || entry?.sku || entry?.item_code || '').trim().toLowerCase();
    return query && (query === name || query === code);
  });
  if (exactCatalog) return { kind: 'catalog', entry: exactCatalog, raw };

  const qtyMatch = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
  if (qtyMatch) {
    const qty = Number(qtyMatch[2]);
    const unitPrice = Number(qtyMatch[3]);
    if (qty > 0 && unitPrice > 0) {
      return { kind: 'item', name: qtyMatch[1].trim(), qty, unitPrice, raw };
    }
  }

  const itemAmountMatch = raw.match(/^(.+?)\s+(\d+(?:\.\d+)?)(?:\s*(?:etb|birr))?$/i);
  if (itemAmountMatch) {
    const unitPrice = Number(itemAmountMatch[2]);
    if (unitPrice > 0) return { kind: 'item', name: itemAmountMatch[1].trim(), qty: 1, unitPrice, raw };
  }

  return { kind: 'item', name: raw, qty: 1, unitPrice: null, raw };
}

function TransactionForm({
  type,
  onSave,
  onDone,
  actorLabel,
  enabledProviders,
  catalogEntries = [],
  recurringExpenses,
  onRecurringChange,
  onSaveCatalogEntry,
  customQuickAmounts = [],
  onCustomQuickAmountsChange,
  customers = [],
  onAddCustomerInline,
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
      ? (lang === 'am' ? 'ዝርዝሩን ይመዝቡ...' : 'Add details...')
      : (lang === 'am' ? 'ዝርዝሩን ይመዝቡ...' : 'Add details...');

  const itemLabel = isCredit
    ? (lang === 'am' ? 'ስም' : 'NAME')
    : (lang === 'am' ? 'ዕቃ / አገልግሎት (አማራጭ)' : 'Item / Service (Optional)');

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
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [selectedDue, setSelectedDue] = useState(null);
  const [customDue, setCustomDue] = useState('');
  // Commit P: Ethiopian calendar picker modal for the "Pick a date" path
  const [showDatePicker, setShowDatePicker] = useState(false);
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
  // Inline custom-amount add (+ button on amount chips)
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('');
  // Inline catalog add (+ button on quick items)
  const [showAddCatalog, setShowAddCatalog] = useState(false);
  const [showAddCatalogBreakdown, setShowAddCatalogBreakdown] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState('');
  const [newCatalogPrice, setNewCatalogPrice] = useState('');
  const [catalogSaving, setCatalogSaving] = useState(false);
  // Paid · Partial · Pay Later (sale/expense only)
  const [settlementMode, setSettlementMode] = useState('paid'); // 'paid' | 'partial' | 'later'
  const [partialReceived, setPartialReceived] = useState('');
  const [selectedCustomerForCredit, setSelectedCustomerForCredit] = useState(null);
  const [showNewCustomerInline, setShowNewCustomerInline] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [saleItemInput, setSaleItemInput] = useState('');
  const [saleItems, setSaleItems] = useState([]);
  const [saleAmountBasis, setSaleAmountBasis] = useState('entered');
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorInput, setCalculatorInput] = useState('');

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

  // Top catalog items (active ones) — shown as chips below item input
  const activeCatalogItems = useMemo(() => (
    catalogEntries
      .filter(e => e && e.is_active !== false && e.name)
      .slice()
      .sort((a, b) => {
        const bScore = Number(b.use_count || 0) * 10000000000000 + Number(b.last_used_at || b.updated_at || 0);
        const aScore = Number(a.use_count || 0) * 10000000000000 + Number(a.last_used_at || a.updated_at || 0);
        return bScore - aScore;
      })
  ), [catalogEntries]);
  const topCatalogItems = activeCatalogItems.slice(0, 8);

  // Multi-item breakdown — derived
  const lineItemsTotal = lineItems.reduce((sum, l) => {
    const v = parseFloat(parseInput(l.amount));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const validLineItems = lineItems.filter(
    l => l.name.trim() && parseFloat(parseInput(l.amount)) > 0
  );
  const breakdownDelta = sellingPrice - lineItemsTotal; // +ve: items < total, -ve: items > total

  // Paid / Partial / Pay Later — derived (must come BEFORE canSave because canSave uses them)
  const partialReceivedAmount = parseFloat(parseInput(partialReceived)) || 0;
  const creditAmount = !isCredit
    ? (settlementMode === 'paid'
        ? 0
        : settlementMode === 'partial'
          ? Math.max(0, sellingPrice - partialReceivedAmount)
          : sellingPrice)
    : 0;
  const needsCustomer = !isCredit && settlementMode !== 'paid';
  const recentCustomers = (customers || [])
    .slice()
    .sort((a, b) => (b.last_activity_at || b.updated_at || 0) - (a.last_activity_at || a.updated_at || 0))
    .slice(0, 5);
  const saleItemDraft = useMemo(
    () => parseItemDraft(saleItemInput, activeCatalogItems),
    [activeCatalogItems, saleItemInput]
  );
  const saleItemSuggestions = useMemo(() => {
    const query = saleItemInput.trim().toLowerCase();
    if (!query) return [];
    return activeCatalogItems
      .filter(entry => {
        const haystack = [
          entry.name,
          entry.code,
          entry.sku,
          entry.item_code,
          entry.note,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 5);
  }, [activeCatalogItems, saleItemInput]);
  const saleItemsSubtotal = saleItems.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
  const saleUnitCount = saleItems.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const saleFinalAmount = isCredit || isExpense
    ? sellingPrice
    : (saleAmountBasis === 'items' && saleItemsSubtotal > 0 ? saleItemsSubtotal : sellingPrice);
  const saleHasMismatch = type === 'sale'
    && sellingPrice > 0
    && saleItemsSubtotal > 0
    && Math.abs(sellingPrice - saleItemsSubtotal) >= 0.01;
  const salePaymentOptions = useMemo(() => {
    const banks = enabledProviders?.banks || ['CBE', 'Dashen', 'Awash', 'Abyssinia'];
    const wallets = enabledProviders?.wallets || ['telebirr', 'CBE Birr'];
    return [
      { id: 'cash', label: 'Cash', paymentType: 'cash', provider: '' },
      ...wallets.map(provider => ({ id: `wallet:${provider}`, label: provider, paymentType: 'wallet', provider })),
      ...banks.map(provider => ({ id: `bank:${provider}`, label: provider, paymentType: 'bank', provider })),
      { id: 'later', label: 'Pay later', paymentType: 'credit', provider: '', settlementMode: 'later' },
    ];
  }, [enabledProviders]);
  const selectedSalePaymentId = settlementMode === 'later'
    ? 'later'
    : paymentType === 'cash'
      ? 'cash'
      : `${paymentType}:${paymentProvider}`;
  const activeSalePayment = salePaymentOptions.find(option => option.id === selectedSalePaymentId) || salePaymentOptions[0];

  // Item is OPTIONAL for sale/expense; REQUIRED (as customer name) for credit
  // For Partial/Later settlement modes, a customer is also required.
  const canSave =
    (type === 'sale' ? saleFinalAmount : sellingPrice) > 0
    && (isCredit ? item.trim() && hasDueDate : true)
    && (!phoneEntered || phoneValid)
    && !isSaving
    && (!needsCustomer || !!selectedCustomerForCredit)
    && (settlementMode !== 'partial' || (partialReceivedAmount > 0 && partialReceivedAmount < (type === 'sale' ? saleFinalAmount : sellingPrice)));

  // ─── Handlers ───────────────────────────────────────────────────────────
  const getEffectiveDueDate = () => {
    if (selectedDue === 'custom' && customDue) return new Date(customDue).getTime();
    return selectedDue;
  };

  const handlePhotoCapture = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, MAX_PROOF_PHOTOS - photos.length));
    if (files.length === 0) return;
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const nextPhotos = await Promise.all(files.map(async (file) => (
        createPhotoProof(await compressPhoto(file))
      )));
      setPhotos(prev => [...prev, ...nextPhotos.filter(Boolean)].slice(0, MAX_PROOF_PHOTOS));
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
    }
    // Reset the input so the same file can be picked again
    e.target.value = '';
  };

  const handleRemovePhoto = (photoId) => {
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
    setPhotoError(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const fullPhone = phoneEntered && phoneValid ? '+251' + phoneDigits : null;

    // If breakdown has valid items, build a clean items array; let item_name
    // derive from the items so the row is self-describing in History/Reports.
    const saleCleanedItems = saleItems.map(line => ({
      name: line.name,
      code: line.code || null,
      amount: Number(line.line_total || 0),
      qty: Number(line.qty || 1),
      unit_price: Number(line.unit_price || 0),
      line_total: Number(line.line_total || 0),
      catalog_entry_id: line.catalog_entry_id || null,
      item_kind: line.item_kind || 'item',
      photo_uri: line.photo_uri || null,
    }));
    const cleanedItems = type === 'sale'
      ? saleCleanedItems
      : validLineItems.map(l => ({
          name: l.name.trim(),
          amount: parseFloat(parseInput(l.amount)),
        }));
    const effectiveSellingPrice = type === 'sale' ? saleFinalAmount : sellingPrice;
    const itemNameForSave = (!isCredit && cleanedItems.length > 0)
      ? cleanedItems.map(li => li.name).join(', ').substring(0, 200)
      : item.trim();

    // Cash actually received from this sale (drives Today's cash tally vs gross sales)
    const cashReceived = !isCredit
      ? (settlementMode === 'paid'
          ? effectiveSellingPrice
          : settlementMode === 'partial'
            ? partialReceivedAmount
            : 0)
      : null;

    const photoFields = buildPhotoFields(photos);
    const data = {
      type,
      item_name: itemNameForSave,
      catalog_entry_id: type === 'sale'
        ? (saleItems[0]?.catalog_entry_id ? Number(saleItems[0].catalog_entry_id) : null)
        : (catalogEntryId ? Number(catalogEntryId) : null),
      item_kind: type === 'sale' ? (saleItems[0]?.item_kind || null) : (selectedCatalogEntry?.kind || null),
      quantity: isCredit ? 1 : (type === 'sale' && saleUnitCount > 0 ? saleUnitCount : qty),
      amount: effectiveSellingPrice,
      cost_price: isCredit ? 0 : cost,
      profit: (!isCredit && cost > 0) ? (effectiveSellingPrice - cost * qty) : null,
      is_credit: isCredit,
      customer_id: !isCredit && settlementMode !== 'paid' ? (selectedCustomerForCredit?.id || null) : null,
      customer_name: !isCredit && settlementMode !== 'paid' ? (selectedCustomerForCredit?.display_name || null) : null,
      customer_phone: isCredit ? fullPhone : null,
      due_date: isCredit ? getEffectiveDueDate() : null,
      // 'credit' payment_type marks a Pay-later sale (no cash exchanged this turn)
      payment_type: isCredit ? null : (settlementMode === 'later' ? 'credit' : paymentType),
      payment_provider: (!isCredit && settlementMode !== 'later' && paymentType !== 'cash') ? paymentProvider || null : null,
      direction: isCredit ? creditDirection : null,
      ...photoFields,
      items: cleanedItems.length > 0 ? cleanedItems : null,  // multi-item breakdown
      // Paid · Partial · Pay Later metadata
      settlement_mode: !isCredit ? settlementMode : null,
      cash_received: cashReceived,
      credit_amount: !isCredit && (settlementMode === 'partial'
        ? Math.max(0, effectiveSellingPrice - partialReceivedAmount)
        : settlementMode === 'later' ? effectiveSellingPrice : 0) > 0
        ? (settlementMode === 'partial' ? Math.max(0, effectiveSellingPrice - partialReceivedAmount) : effectiveSellingPrice)
        : null,
      entered_total: type === 'sale' && sellingPrice > 0 ? sellingPrice : null,
      items_subtotal: type === 'sale' && saleItemsSubtotal > 0 ? saleItemsSubtotal : null,
      amount_basis: type === 'sale' ? saleAmountBasis : null,
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

  // ─── Inline custom-amount add ──────────────────────────────────────────
  const applyCustomAmount = () => {
    const val = parseFloat(parseInput(customAmountValue));
    if (!val || val <= 0) return;
    const current = parseFloat(parseInput(amount)) || 0;
    setAmount(String(current + val));
    // Persist the new chip so it's tappable next time
    if (onCustomQuickAmountsChange && !DEFAULT_QUICK_AMOUNTS.includes(val)) {
      onCustomQuickAmountsChange([...customQuickAmounts, val]);
    }
    setCustomAmountValue('');
    setShowCustomAmount(false);
  };

  // ─── Inline catalog add ───────────────────────────────────────────────
  const submitNewCatalog = async () => {
    if (!newCatalogName.trim() || !onSaveCatalogEntry || catalogSaving) return;
    setCatalogSaving(true);
    try {
      const saved = await onSaveCatalogEntry({
        name: newCatalogName.trim(),
        kind: 'item',
        default_price: newCatalogPrice ? parseFloat(parseInput(newCatalogPrice)) : null,
      });
      if (saved) {
        // Auto-fill the form with the new item
        setItem(saved.name);
        if (saved.default_price != null && (!amount || parseFloat(parseInput(amount)) === 0)) {
          setAmount(String(saved.default_price));
        }
        setCatalogEntryId(String(saved.id));
      }
      setNewCatalogName('');
      setNewCatalogPrice('');
      setShowAddCatalog(false);
    } catch (err) {
      // surface via App.jsx
    } finally {
      setCatalogSaving(false);
    }
  };

  // ─── Inline customer add (for Partial / Pay Later flows) ──────────────
  const submitNewCustomerInline = async () => {
    if (!newCustomerName.trim() || !onAddCustomerInline || savingCustomer) return;
    setSavingCustomer(true);
    try {
      const saved = await onAddCustomerInline({
        display_name: newCustomerName.trim(),
      });
      if (saved && saved.id) {
        setSelectedCustomerForCredit(saved);
        setNewCustomerName('');
        setShowNewCustomerInline(false);
      }
    } catch (err) {
      // surface via App.jsx
    } finally {
      setSavingCustomer(false);
    }
  };

  const submitNewCatalogToBreakdown = async () => {
    if (!newCatalogName.trim() || !onSaveCatalogEntry || catalogSaving) return;
    setCatalogSaving(true);
    try {
      const saved = await onSaveCatalogEntry({
        name: newCatalogName.trim(),
        kind: 'item',
        default_price: newCatalogPrice ? parseFloat(parseInput(newCatalogPrice)) : null,
      });
      if (saved) {
        addLineItem({ name: saved.name, amount: saved.default_price });
      }
      setNewCatalogName('');
      setNewCatalogPrice('');
      setShowAddCatalogBreakdown(false);
    } catch (err) {
      // surface via App.jsx
    } finally {
      setCatalogSaving(false);
    }
  };

  const handleQuickItem = (entry) => {
    setCatalogEntryId(String(entry.id));
    setItem(entry.name || '');
    if (!amount && entry.default_price != null) setAmount(String(entry.default_price));
    if (!costPrice && entry.default_cost != null) setCostPrice(String(entry.default_cost));
  };

  const addSaleItem = (draft) => {
    if (!draft?.name) return;
    const qtyValue = Math.max(1, Number(draft.qty || 1));
    const unitPrice = Number(draft.unitPrice || 0);
    const lineTotal = Math.round(qtyValue * unitPrice * 100) / 100;
    const nextItem = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: draft.name.trim(),
      code: draft.code || '',
      qty: qtyValue,
      unit_price: unitPrice,
      line_total: lineTotal,
      catalog_entry_id: draft.catalog_entry_id || null,
      item_kind: draft.item_kind || 'item',
      photo_uri: photos[0]?.dataUrl || null,
    };
    setSaleItems(prev => {
      const matchKey = String(nextItem.catalog_entry_id || nextItem.code || nextItem.name).toLowerCase();
      const existing = prev.find(line => String(line.catalog_entry_id || line.code || line.name).toLowerCase() === matchKey);
      if (existing) {
        return prev.map(line => {
          const lineKey = String(line.catalog_entry_id || line.code || line.name).toLowerCase();
          if (lineKey !== matchKey) return line;
          const nextQty = Number(line.qty || 1) + nextItem.qty;
          const nextUnitPrice = Number(line.unit_price || nextItem.unit_price || 0);
          return {
            ...line,
            qty: nextQty,
            unit_price: nextUnitPrice,
            line_total: Math.round(nextQty * nextUnitPrice * 100) / 100,
            photo_uri: line.photo_uri || nextItem.photo_uri || null,
          };
        });
      }
      return [...prev, nextItem];
    });
    if (!amount && lineTotal > 0) {
      setAmount(String(lineTotal));
      setSaleAmountBasis('items');
    }
    setSaleItemInput('');
    navigator.vibrate?.(40);
  };

  const addSaleCatalogItem = (entry) => {
    const unitPrice = Number(entry?.default_price || entry?.last_price || 0);
    addSaleItem({
      name: entry?.name || '',
      code: entry?.code || entry?.sku || entry?.item_code || '',
      qty: 1,
      unitPrice: unitPrice || (saleItems.length === 0 ? sellingPrice : 0),
      catalog_entry_id: entry?.id || null,
      item_kind: entry?.kind || 'item',
    });
    setCatalogEntryId(String(entry?.id || ''));
    setItem(entry?.name || '');
  };

  const handleSaleAddItem = () => {
    if (saleItemDraft.kind === 'catalog' && saleItemDraft.entry) {
      addSaleCatalogItem(saleItemDraft.entry);
      return;
    }
    if (saleItemDraft.kind === 'item') {
      const fallbackUnitPrice = saleItemDraft.unitPrice ?? (saleItems.length === 0 ? sellingPrice : 0);
      addSaleItem({ ...saleItemDraft, unitPrice: fallbackUnitPrice });
      if (!item) setItem(saleItemDraft.name || '');
    }
  };

  const updateSaleItemQty = (id, nextQty) => {
    setSaleItems(prev => prev.map(line => {
      if (line.id !== id) return line;
      const qtyValue = Math.max(1, Number(nextQty || 1));
      const unitPrice = Number(line.unit_price || 0);
      return { ...line, qty: qtyValue, line_total: Math.round(qtyValue * unitPrice * 100) / 100 };
    }));
    setSaleAmountBasis(current => (current === 'items' ? 'items' : current));
  };

  const removeSaleItem = (id) => {
    setSaleItems(prev => prev.filter(line => line.id !== id));
  };

  const handleSalePaymentSelect = (option) => {
    if (option.id === 'later') {
      setSettlementMode('later');
      setPartialReceived('');
      return;
    }
    if (settlementMode === 'later') setSettlementMode('paid');
    setPaymentType(option.paymentType);
    setPaymentProvider(option.provider || '');
  };

  const applyCalculatorResult = () => {
    const result = safeMathTotal(calculatorInput);
    if (!result) return;
    setAmount(String(result));
    setSaleAmountBasis('entered');
    setCalculatorInput('');
    setShowCalculator(false);
  };

  const buildSaleSaveLabel = () => {
    if (saleFinalAmount <= 0) return photos.length > 0 ? 'Add amount to save photo sale' : 'Save';
    if (settlementMode === 'partial' && partialReceivedAmount > 0 && partialReceivedAmount < saleFinalAmount) {
      return `Save Partial · ${fmt(partialReceivedAmount)} paid · ${fmt(saleFinalAmount - partialReceivedAmount)} remaining`;
    }
    if (settlementMode === 'later') {
      return selectedCustomerForCredit?.display_name
        ? `Save Credit · ${selectedCustomerForCredit.display_name} · ${fmt(saleFinalAmount)} ETB`
        : `Save Credit · ${fmt(saleFinalAmount)} ETB`;
    }
    if (saleItems.length > 0) {
      const itemCount = saleUnitCount || saleItems.length;
      return `Save ${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${fmt(saleFinalAmount)} ETB`;
    }
    if (photos.length > 0) return `Save photo sale · ${fmt(saleFinalAmount)} ETB`;
    if (activeSalePayment.id !== 'cash') return `Save ${activeSalePayment.label} · ${fmt(saleFinalAmount)} ETB`;
    return `Save ${fmt(saleFinalAmount)} ETB`;
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
  if (type === 'sale') {
    const saleSaveLabel = buildSaleSaveLabel();
    const remainingAmount = Math.max(0, saleFinalAmount - partialReceivedAmount);
    const canAddSaleItem = saleItemDraft.kind === 'item' || saleItemDraft.kind === 'catalog';

    return (
      <div
        className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-30 max-w-md mx-auto flex flex-col"
        style={{ background: '#ffffff' }}
      >
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
          <div className="text-center min-w-0">
            <h2 className="text-base font-bold" style={{ color: accentColor }}>{headerLabel}</h2>
            {actorLabel && (
              <p className="text-[11px] font-semibold truncate" style={{ color: '#6b7280', maxWidth: '220px' }}>
                Recording as {actorLabel}
              </p>
            )}
          </div>
          <div style={{ width: '36px' }} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 pb-28 space-y-3">
          <section className="border" style={{ borderColor: '#d8eadf', borderRadius: 'var(--radius-md)', background: '#f7fcf8' }}>
            <div className="px-3 py-2.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold" style={{ color: '#4b6855' }}>Total amount</p>
                <p className="text-2xl font-black leading-tight" style={{ color: saleFinalAmount > 0 ? '#14532d' : '#9ca3af' }}>
                  {fmt(saleFinalAmount)} ETB
                </p>
              </div>
              <span className="px-2.5 py-1.5 text-xs font-black border" style={{ borderColor: '#bbd7c5', borderRadius: 'var(--radius-sm)', background: '#fff', color: '#14532d' }}>
                {activeSalePayment.label} ▾
              </span>
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={fmtInput(amount)}
                onChange={event => {
                  handleNumericInput(event, setAmount);
                  setSaleAmountBasis('entered');
                }}
                placeholder="0"
                className="flex-1 min-w-0 px-3 py-3 border-2 focus:outline-none text-2xl font-black"
                style={{ borderRadius: 'var(--radius-md)', borderColor: amount ? '#86efac' : '#d7e3da', color: amount ? '#14532d' : '#9ca3af' }}
              />
              <button
                type="button"
                onClick={() => setShowCalculator(true)}
                className="px-3 py-2 text-sm font-black border-2 press-scale"
                style={{ borderRadius: 'var(--radius-md)', borderColor: '#d7e3da', background: '#fff', color: '#14532d', minWidth: '92px' }}
              >
                Calculator
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#6b7280' }}>
                Item details - optional
              </p>
              {saleItems.length > 0 && (
                <p className="text-[11px] font-bold" style={{ color: '#14532d' }}>
                  {saleItems.length} {saleItems.length === 1 ? 'item' : 'items'}
                </p>
              )}
            </div>
            <div className="flex gap-2 items-stretch">
              <label
                className="cursor-pointer press-scale flex items-center justify-center flex-shrink-0"
                style={{ width: 48, minHeight: 48, border: '2px solid #d7e3da', borderRadius: 'var(--radius-md)', background: photos.length > 0 ? '#f0fdf4' : '#fafaf6' }}
                aria-label="Take or choose photo"
              >
                <input type="file" accept="image/*" multiple onChange={handlePhotoCapture} className="hidden" disabled={photoLoading || photos.length >= MAX_PROOF_PHOTOS} />
                {photoLoading ? <span className="text-xs">...</span> : <Camera className="w-5 h-5" style={{ color: photos.length > 0 ? '#16a34a' : '#4b5563' }} />}
              </label>
              <input
                type="text"
                inputMode="text"
                value={saleItemInput}
                onChange={event => setSaleItemInput(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && canAddSaleItem) handleSaleAddItem(); }}
                placeholder="Search item name or code..."
                className="flex-1 min-w-0 px-3 py-3 border-2 focus:outline-none text-base"
                style={{ borderRadius: 'var(--radius-md)', borderColor: saleItemInput ? '#86efac' : '#d7e3da' }}
              />
              <button
                type="button"
                onClick={handleSaleAddItem}
                disabled={!canAddSaleItem}
                className="px-3 py-2 text-sm font-black press-scale flex-shrink-0"
                style={{ borderRadius: 'var(--radius-md)', background: canAddSaleItem ? '#14532d' : '#e5e7eb', color: canAddSaleItem ? '#fff' : '#6b7280', minWidth: 66 }}
              >
                <span className="hidden min-[390px]:inline">Add item</span>
                <span className="min-[390px]:hidden">Add</span>
              </button>
            </div>
            {photos.length > 0 && (
              <div className="flex items-center gap-2 p-2 border" style={{ borderColor: '#d7e3da', borderRadius: 'var(--radius-sm)', background: '#f8faf8' }}>
                <img src={photos[0].dataUrl} alt="" className="w-10 h-10 object-cover" style={{ borderRadius: 6 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black" style={{ color: '#14532d' }}>Photo attached</p>
                  <p className="text-xs truncate" style={{ color: '#6b7280' }}>Add amount or item details</p>
                </div>
                <button type="button" onClick={() => handleRemovePhoto(photos[0].id)} aria-label="Remove photo" className="p-2">
                  <X className="w-4 h-4" style={{ color: '#6b7280' }} />
                </button>
              </div>
            )}
            {photoError && <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>{photoError}</p>}
          </section>

          <section className="space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#6b7280' }}>
              {saleItemInput.trim() ? 'Suggestions' : 'Recent / most sold'}
            </p>
            {saleItemInput.trim() ? (
              saleItemSuggestions.length > 0 ? (
                <div className="space-y-1.5">
                  {saleItemSuggestions.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => addSaleCatalogItem(entry)}
                      className="w-full p-2.5 border text-left press-scale flex items-center justify-between gap-2"
                      style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black truncate" style={{ color: '#111827' }}>{entry.name}</span>
                        {(entry.code || entry.sku || entry.item_code) && <span className="block text-xs truncate" style={{ color: '#6b7280' }}>Code: {entry.code || entry.sku || entry.item_code}</span>}
                      </span>
                      {(entry.default_price || entry.last_price) && <span className="text-sm font-black flex-shrink-0" style={{ color: '#14532d' }}>{fmt(entry.default_price || entry.last_price)} ETB</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs border p-2.5" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', color: '#6b7280' }}>No local item match. Add it as typed.</p>
              )
            ) : topCatalogItems.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {topCatalogItems.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => addSaleCatalogItem(entry)}
                    className="flex-shrink-0 px-3 py-2 text-xs font-black border press-scale"
                    style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', background: '#fff', color: '#14532d' }}
                  >
                    {entry.code || entry.sku || entry.item_code || entry.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 border text-sm" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', color: '#6b7280' }}>
                <p className="font-bold" style={{ color: '#374151' }}>No items yet</p>
                <p>Saved items will appear here after you use them.</p>
              </div>
            )}
          </section>

          {saleItems.length > 0 && (
            <section className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#6b7280' }}>Items in this sale</p>
              {saleItems.map(line => (
                <div key={line.id} className="p-2.5 border" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', background: '#fff' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black truncate" style={{ color: '#111827' }}>{line.name}</p>
                      {line.code && <p className="text-xs" style={{ color: '#6b7280' }}>{line.code}</p>}
                      <p className="text-xs" style={{ color: '#6b7280' }}>Qty: {line.qty} · Unit: {fmt(line.unit_price)}</p>
                    </div>
                    <p className="text-sm font-black flex-shrink-0" style={{ color: '#14532d' }}>{fmt(line.line_total)} ETB</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateSaleItemQty(line.id, Number(line.qty || 1) - 1)} className="p-2 border press-scale" style={{ borderColor: '#e8e2d8', borderRadius: 6 }}><Minus className="w-4 h-4" /></button>
                      <span className="text-sm font-black min-w-6 text-center">{line.qty}</span>
                      <button type="button" onClick={() => updateSaleItemQty(line.id, Number(line.qty || 1) + 1)} className="p-2 border press-scale" style={{ borderColor: '#e8e2d8', borderRadius: 6 }}><Plus className="w-4 h-4" /></button>
                    </div>
                    <button type="button" onClick={() => removeSaleItem(line.id)} className="px-3 py-2 text-xs font-bold border press-scale" style={{ borderColor: '#fecaca', color: '#b91c1c', borderRadius: 6 }}>Delete</button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-sm font-black px-1" style={{ color: '#374151' }}>
                <span>Items subtotal ({saleUnitCount || saleItems.length} units)</span>
                <span>{fmt(saleItemsSubtotal)} ETB</span>
              </div>
              {saleHasMismatch && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaleAmountBasis('entered')}
                    className="p-2 text-xs font-black border-2 press-scale"
                    style={{ borderColor: saleAmountBasis === 'entered' ? '#14532d' : '#e8e2d8', borderRadius: 6, background: saleAmountBasis === 'entered' ? '#ecfdf3' : '#fff', color: '#14532d' }}
                  >
                    Use entered total {fmt(sellingPrice)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleAmountBasis('items')}
                    className="p-2 text-xs font-black border-2 press-scale"
                    style={{ borderColor: saleAmountBasis === 'items' ? '#14532d' : '#e8e2d8', borderRadius: 6, background: saleAmountBasis === 'items' ? '#ecfdf3' : '#fff', color: '#14532d' }}
                  >
                    Use item subtotal {fmt(saleItemsSubtotal)}
                  </button>
                </div>
              )}
            </section>
          )}

          <section>
            <p className="text-[11px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#6b7280' }}>Payment method</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {salePaymentOptions.map(option => {
                const active = option.id === selectedSalePaymentId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSalePaymentSelect(option)}
                    className="flex-shrink-0 px-3 py-2 text-xs font-black border-2 press-scale"
                    style={{ borderColor: active ? '#14532d' : '#e8e2d8', borderRadius: 'var(--radius-sm)', background: active ? '#ecfdf3' : '#fff', color: active ? '#14532d' : '#374151' }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <label className="flex items-center justify-between gap-3 p-2.5 border" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)' }}>
              <span className="text-sm font-black" style={{ color: '#374151' }}>Partial payment</span>
              <input
                type="checkbox"
                checked={settlementMode === 'partial'}
                onChange={event => {
                  setSettlementMode(event.target.checked ? 'partial' : 'paid');
                  if (!event.target.checked) setPartialReceived('');
                  if (event.target.checked && settlementMode === 'later') {
                    setPaymentType('cash');
                    setPaymentProvider('');
                  }
                }}
                className="w-5 h-5"
              />
            </label>
            {settlementMode === 'partial' && (
              <div className="space-y-2 p-2.5 border" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', background: '#fafaf6' }}>
                <input type="text" inputMode="decimal" value={fmtInput(partialReceived)} onChange={event => handleNumericInput(event, setPartialReceived)} placeholder="Paid amount" className="w-full p-2.5 border focus:outline-none text-sm" style={{ borderColor: '#e8e2d8', borderRadius: 6 }} />
                <p className="text-xs font-bold" style={{ color: '#6b7280' }}>Remaining: {fmt(remainingAmount)} ETB</p>
              </div>
            )}
            {(settlementMode === 'later' || settlementMode === 'partial') && (
              <div className="space-y-2 p-2.5 border" style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', background: '#fff' }}>
                {selectedCustomerForCredit ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-black truncate">{selectedCustomerForCredit.display_name}</span>
                    <button type="button" onClick={() => setSelectedCustomerForCredit(null)} className="p-2"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <>
                    <input type="text" value={newCustomerName} onChange={event => setNewCustomerName(event.target.value)} placeholder="Customer name" className="w-full p-2.5 border focus:outline-none text-sm" style={{ borderColor: '#e8e2d8', borderRadius: 6 }} />
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {recentCustomers.map(customer => (
                        <button key={customer.id} type="button" onClick={() => setSelectedCustomerForCredit(customer)} className="flex-shrink-0 px-3 py-1.5 text-xs font-bold border" style={{ borderColor: '#e8e2d8', borderRadius: 6 }}>{customer.display_name}</button>
                      ))}
                      {onAddCustomerInline && (
                        <button type="button" onClick={submitNewCustomerInline} disabled={!newCustomerName.trim() || savingCustomer} className="flex-shrink-0 px-3 py-1.5 text-xs font-black" style={{ background: newCustomerName.trim() ? '#14532d' : '#e5e7eb', color: newCustomerName.trim() ? '#fff' : '#6b7280', borderRadius: 6 }}>Add customer</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex-shrink-0 px-3 sm:px-4 py-3" style={{ borderTop: '1px solid #e8e2d8', background: '#fff' }}>
          {!canSave && saleFinalAmount > 0 && needsCustomer && <p className="text-xs font-semibold text-center mb-2" style={{ color: '#92400e' }}>Add or pick a customer above</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="w-full p-3 font-black text-base flex items-center justify-center gap-2 transition-all press-scale"
            style={{ background: canSave ? '#14532d' : '#e5e7eb', color: canSave ? '#fff' : '#9ca3af', cursor: canSave ? 'pointer' : 'not-allowed', borderRadius: 'var(--radius-md)' }}
          >
            <Save className="w-5 h-5" />
            {saleSaveLabel}
          </button>
          <p className="text-[11px] font-semibold text-center mt-1.5" style={{ color: '#6b7280' }}>Saved on this phone · Syncs later</p>
        </div>

        {showCalculator && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(17,24,39,0.35)', paddingBottom: '68px' }}>
            <div className="w-full max-w-md bg-white p-3 space-y-3" style={{ borderRadius: '16px 16px 0 0' }}>
              <div className="flex items-center gap-2">
                <input value={calculatorInput} onChange={event => setCalculatorInput(event.target.value)} placeholder="350 + 250" className="flex-1 p-3 border text-xl font-black focus:outline-none" style={{ borderColor: '#e8e2d8', borderRadius: 8 }} />
                <button type="button" onClick={() => setShowCalculator(false)} className="p-3"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', 'C', '0', '.', '+'].map(key => (
                  <button key={key} type="button" onClick={() => setCalculatorInput(prev => key === 'C' ? '' : `${prev}${key}`)} className="p-3 text-lg font-black border press-scale" style={{ borderColor: '#e8e2d8', borderRadius: 8, background: '#fafaf6' }}>{key}</button>
                ))}
              </div>
              <button type="button" onClick={applyCalculatorResult} disabled={!safeMathTotal(calculatorInput)} className="w-full p-3 font-black" style={{ background: safeMathTotal(calculatorInput) ? '#14532d' : '#e5e7eb', color: safeMathTotal(calculatorInput) ? '#fff' : '#9ca3af', borderRadius: 8 }}>
                Done{safeMathTotal(calculatorInput) ? ` · ${fmt(safeMathTotal(calculatorInput))} ETB` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

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

          {/* Quick-pick amount chips — ADDITIVE: tap to add to current amount.
              Defaults + persisted user customs, sorted ascending. Full numbers (e.g. 1000 not 1K). */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 items-center">
            {Array.from(new Set([...DEFAULT_QUICK_AMOUNTS, ...customQuickAmounts]))
              .filter(n => typeof n === 'number' && n > 0)
              .sort((a, b) => a - b)
              .map(amt => {
                const isCustom = !DEFAULT_QUICK_AMOUNTS.includes(amt);
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      const current = parseFloat(parseInput(amount)) || 0;
                      setAmount(String(current + amt));
                    }}
                    onContextMenu={isCustom ? (e) => {
                      // Long-press / right-click: remove custom chip
                      e.preventDefault();
                      if (onCustomQuickAmountsChange) {
                        onCustomQuickAmountsChange(customQuickAmounts.filter(n => n !== amt));
                      }
                    } : undefined}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-bold border press-scale"
                    style={{
                      borderColor: isCustom ? '#C4883A' : '#e8e2d8',
                      borderRadius: 'var(--radius-sm)',
                      background: isCustom ? 'rgba(196,136,58,0.06)' : '#fff',
                      color: isCustom ? '#6b4f1d' : '#374151',
                      minWidth: '52px',
                    }}
                    title={isCustom ? (lang === 'am' ? 'ለማስወገድ ይያዙ' : 'Long-press to remove') : undefined}
                  >
                    +{amt}
                  </button>
                );
              })}
            {/* + custom amount toggle */}
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

          {/* Inline custom amount input */}
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
                {/* Catalog quick-add chips (tap to add as line item, or + to create new) */}
                {(topCatalogItems.length > 0 || onSaveCatalogEntry) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
                      {lang === 'am' ? 'ለማከል ይጫኑ' : 'Tap saved item to add'}
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 items-center">
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
                      {onSaveCatalogEntry && (
                        <button
                          type="button"
                          onClick={() => setShowAddCatalogBreakdown(v => !v)}
                          className="flex-shrink-0 px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center gap-1"
                          style={{
                            borderColor: showAddCatalogBreakdown ? accentColor : '#c9bfa8',
                            borderStyle: 'dashed',
                            borderRadius: 'var(--radius-sm)',
                            background: showAddCatalogBreakdown ? `${accentColor}10` : '#faf9f7',
                            color: showAddCatalogBreakdown ? accentColor : '#6b7280',
                          }}
                          aria-label={lang === 'am' ? 'አዲስ ዕቃ' : 'New item'}
                        >
                          <Plus className="w-3 h-3" />
                          {topCatalogItems.length === 0
                            ? (lang === 'am' ? 'አዲስ ዕቃ' : 'New item')
                            : (lang === 'am' ? 'አዲስ' : 'New')}
                        </button>
                      )}
                    </div>

                    {/* Inline new-catalog form (saves to catalog AND adds to basket) */}
                    {showAddCatalogBreakdown && (
                      <div className="mt-2 p-2.5 border space-y-2"
                        style={{ background: '#fff', borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)' }}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={newCatalogName}
                          onChange={e => setNewCatalogName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') submitNewCatalogToBreakdown(); }}
                          placeholder={lang === 'am' ? 'ስም' : 'Name'}
                          className="w-full p-2 border focus:outline-none text-sm"
                          style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8' }}
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fmtInput(newCatalogPrice)}
                            onChange={e => handleNumericInput(e, setNewCatalogPrice)}
                            onKeyDown={e => { if (e.key === 'Enter') submitNewCatalogToBreakdown(); }}
                            placeholder={lang === 'am' ? 'ዋጋ' : 'Price'}
                            className="flex-1 p-2 border focus:outline-none text-sm"
                            style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8' }}
                          />
                          <button
                            type="button"
                            onClick={submitNewCatalogToBreakdown}
                            disabled={!newCatalogName.trim() || catalogSaving}
                            className="px-3 py-2 text-xs font-bold press-scale flex items-center gap-1"
                            style={{
                              background: newCatalogName.trim() ? accentColor : '#e5e7eb',
                              color: newCatalogName.trim() ? '#fff' : '#9ca3af',
                              borderRadius: 'var(--radius-sm)',
                              cursor: newCatalogName.trim() ? 'pointer' : 'not-allowed',
                              minHeight: '36px',
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {lang === 'am' ? 'ጨምር' : 'Add'}
                          </button>
                        </div>
                      </div>
                    )}
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

        {/* ITEM / NAME + photo button (inline on same row, larger photo tap target) */}
        {/* When breakdown has items, this becomes an optional note since items provide their own names */}
        <div>
          <label className="block text-[10px] font-bold tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
            {validLineItems.length > 0 && !isCredit
              ? (lang === 'am' ? 'ማስታወሻ (አማራጭ)' : 'NOTE (OPTIONAL)')
              : itemLabel}
          </label>

          <div className="flex gap-2 items-stretch">
            <input
              type="text"
              value={item}
              onChange={e => setItem(e.target.value)}
              placeholder={itemPlaceholder}
              className="flex-1 min-w-0 p-3 border-2 focus:outline-none text-base"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />

            {/* Photo button - Sale/expense only. Camera/gallery chooser stays browser-controlled. */}
            {!isCredit && (
              <label
                className="cursor-pointer press-scale flex items-center justify-center flex-shrink-0"
                style={{
                  width: '56px',
                  border: '2px solid #e8e2d8',
                  borderRadius: 'var(--radius-md)',
                  background: photos.length > 0 ? '#f0fdf4' : '#fafaf6',
                  opacity: photos.length >= MAX_PROOF_PHOTOS ? 0.55 : 1,
                  position: 'relative',
                }}
                aria-label={lang === 'am' ? '\u134E\u1276 \u12EB\u1295\u1231 \u12C8\u12ED\u121D \u12ED\u121D\u1228\u1321' : 'Take or choose photo'}
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
                    background: photos.length >= MAX_PROOF_PHOTOS ? '#6b7280' : accentColor,
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
          </div>

          {photoError && (
            <p className="text-xs mt-1 font-medium" style={{ color: '#dc2626' }}>
              {photoError}
            </p>
          )}

          {photos.length > 0 && (
          <div className="mt-2 p-2" style={{ background: '#fafaf6', border: '1px solid #e8e2d8', borderRadius: 'var(--radius-sm)' }}>
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
                  <img src={entry.dataUrl} alt="" className="w-14 h-14 object-cover" style={{ borderRadius: 6 }} />
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

          {/* Quick item chips from catalog (+ inline add new item) */}
          {!isCredit && (
            <div className="mt-2">
              {(topCatalogItems.length > 0 || onSaveCatalogEntry) && (
                <p className="text-[10px] font-medium mb-1" style={{ color: '#6b7280' }}>
                  {lang === 'am' ? 'ፈጣን ዕቃዎች:' : 'Quick items:'}
                </p>
              )}
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
                {/* + inline add to catalog */}
                {onSaveCatalogEntry && (
                  <button
                    type="button"
                    onClick={() => setShowAddCatalog(v => !v)}
                    className="flex-shrink-0 px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center gap-1"
                    style={{
                      borderColor: showAddCatalog ? accentColor : '#c9bfa8',
                      borderStyle: 'dashed',
                      borderRadius: 'var(--radius-sm)',
                      background: showAddCatalog ? `${accentColor}10` : '#faf9f7',
                      color: showAddCatalog ? accentColor : '#6b7280',
                    }}
                    aria-label={lang === 'am' ? 'አዲስ ዕቃ' : 'New item'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {topCatalogItems.length === 0 && (
                      <span>{lang === 'am' ? 'ዕቃ አስቀምጥ' : 'Save item'}</span>
                    )}
                  </button>
                )}
              </div>

              {/* Inline new-catalog form */}
              {showAddCatalog && (
                <div className="mt-2 p-2.5 border space-y-2"
                  style={{ background: '#faf9f7', borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)' }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={newCatalogName}
                    onChange={e => setNewCatalogName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitNewCatalog(); }}
                    placeholder={lang === 'am' ? 'ስም (ለምሳሌ ዳቦ)' : 'Name (e.g. bread)'}
                    className="w-full p-2 border focus:outline-none text-sm"
                    style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fmtInput(newCatalogPrice)}
                      onChange={e => handleNumericInput(e, setNewCatalogPrice)}
                      onKeyDown={e => { if (e.key === 'Enter') submitNewCatalog(); }}
                      placeholder={lang === 'am' ? 'ዋጋ (አማራጭ)' : 'Price (optional)'}
                      className="flex-1 p-2 border focus:outline-none text-sm"
                      style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
                    />
                    <button
                      type="button"
                      onClick={submitNewCatalog}
                      disabled={!newCatalogName.trim() || catalogSaving}
                      className="px-3 py-2 text-xs font-bold press-scale flex items-center gap-1"
                      style={{
                        background: newCatalogName.trim() ? accentColor : '#e5e7eb',
                        color: newCatalogName.trim() ? '#fff' : '#9ca3af',
                        borderRadius: 'var(--radius-sm)',
                        cursor: newCatalogName.trim() ? 'pointer' : 'not-allowed',
                        minHeight: '36px',
                      }}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {lang === 'am' ? 'አስቀምጥ' : 'Save'}
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: '#9ca3af' }}>
                    {lang === 'am'
                      ? 'ይህ ዕቃ ለፈጣን መድረሻ ይቀመጣል'
                      : 'Saves for quick access next time'}
                  </p>
                </div>
              )}
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
              onClick={() => {
                setSelectedDue('custom');
                setShowDatePicker(true);
              }}
              className="w-full p-2.5 border-2 text-sm font-semibold transition-all min-h-[44px] press-scale flex items-center justify-center gap-2"
              style={{
                borderRadius: 'var(--radius-sm)',
                borderColor: selectedDue === 'custom' ? accentColor : '#e8e2d8',
                background: selectedDue === 'custom' ? `${accentColor}10` : '#fff',
                color: selectedDue === 'custom' ? accentColor : '#374151',
              }}
            >
              📅 {selectedDue === 'custom' && customDue
                ? formatEthiopian(new Date(`${customDue}T12:00:00`))
                : (lang === 'am' ? 'ቀን ይምረጡ' : 'Pick a date')}
            </button>
            {!hasDueDate && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: '#C4883A' }}>
                {lang === 'am' ? 'የመክፍያ ቀን ይምረጡ' : 'Please select a due date'}
              </p>
            )}
          </div>
        )}

        {/* Commit P: Ethiopian calendar picker modal for sale/expense form */}
        <EthiopianDatePicker
          open={showDatePicker}
          value={customDue}
          onChange={(iso) => { setCustomDue(iso); setSelectedDue('custom'); }}
          onClose={() => setShowDatePicker(false)}
          lang={lang}
        />

        {/* Settlement: Paid · Partial · Pay Later (sale/expense only) */}
        {!isCredit && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ክፍያ' : 'Settlement'}
            </label>
            <div className="flex gap-1.5">
              {[
                { id: 'paid',    label: lang === 'am' ? 'ሙሉ' : 'Paid',    emoji: '💵' },
                { id: 'partial', label: lang === 'am' ? 'ከፊል' : 'Partial', emoji: '½' },
                { id: 'later',   label: lang === 'am' ? 'ኋላ' : 'Later',   emoji: '⏳' },
              ].map(opt => {
                const active = settlementMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSettlementMode(opt.id);
                      // Reset partial value when leaving partial mode
                      if (opt.id !== 'partial') setPartialReceived('');
                      // Reset customer selection when going back to paid
                      if (opt.id === 'paid') {
                        setSelectedCustomerForCredit(null);
                        setShowNewCustomerInline(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1 border-2 text-xs font-bold transition-all min-h-[44px] press-scale"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      borderColor: active ? accentColor : '#e8e2d8',
                      background: active ? `${accentColor}10` : '#fff',
                      color: active ? accentColor : '#6b7280',
                    }}
                  >
                    <span className="text-base">{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Partial: amount received input + remaining-credit hint */}
            {settlementMode === 'partial' && (
              <div className="mt-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
                  {lang === 'am' ? 'የተቀበሉት መጠን' : 'Amount received'} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fmtInput(partialReceived)}
                    onChange={e => handleNumericInput(e, setPartialReceived)}
                    placeholder="0"
                    className="w-full p-2.5 pr-14 border-2 focus:outline-none text-base"
                    style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: '#9ca3af' }}>
                    {lang === 'am' ? 'ብር' : 'birr'}
                  </span>
                </div>
                {sellingPrice > 0 && partialReceivedAmount > 0 && partialReceivedAmount < sellingPrice && (
                  <p className="text-xs mt-1.5 font-semibold" style={{ color: '#C4883A' }}>
                    {lang === 'am' ? 'ቀሪ ዱቤ' : 'Credit owed'}: {fmt(creditAmount)} {lang === 'am' ? 'ብር' : 'birr'}
                  </p>
                )}
                {partialReceivedAmount > 0 && partialReceivedAmount >= sellingPrice && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: '#dc2626' }}>
                    {lang === 'am'
                      ? 'የተቀበሉት ሙሉ ነው — "ሙሉ" ይምረጡ'
                      : 'Amount received is the full sale — use "Paid" instead.'}
                  </p>
                )}
              </div>
            )}

            {/* Customer picker (Partial or Later) */}
            {needsCustomer && (
              <div className="mt-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
                  {lang === 'am' ? 'ለማን?' : 'For whom?'} <span style={{ color: '#dc2626' }}>*</span>
                </label>

                {selectedCustomerForCredit ? (
                  <div
                    className="flex items-center gap-2 p-2.5 border-2"
                    style={{ borderColor: accentColor, background: `${accentColor}10`, borderRadius: 'var(--radius-md)' }}
                  >
                    <span className="flex-1 font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>
                      {selectedCustomerForCredit.display_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerForCredit(null)}
                      className="press-scale flex items-center justify-center"
                      style={{ minWidth: '32px', minHeight: '32px' }}
                      aria-label={lang === 'am' ? 'አስወግድ' : 'Clear'}
                    >
                      <X className="w-4 h-4" style={{ color: '#6b7280' }} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 items-center">
                      {recentCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCustomerForCredit(c)}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-bold border press-scale"
                          style={{
                            borderColor: '#e8e2d8',
                            borderRadius: 'var(--radius-sm)',
                            background: '#fff',
                            color: '#374151',
                          }}
                        >
                          {c.display_name}
                        </button>
                      ))}
                      {onAddCustomerInline && (
                        <button
                          type="button"
                          onClick={() => setShowNewCustomerInline(v => !v)}
                          className="flex-shrink-0 px-2.5 py-1.5 text-xs font-bold border press-scale flex items-center gap-1"
                          style={{
                            borderColor: showNewCustomerInline ? accentColor : '#c9bfa8',
                            borderStyle: 'dashed',
                            borderRadius: 'var(--radius-sm)',
                            background: showNewCustomerInline ? `${accentColor}10` : '#faf9f7',
                            color: showNewCustomerInline ? accentColor : '#6b7280',
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {lang === 'am' ? 'አዲስ ደንበኛ' : 'New'}
                        </button>
                      )}
                    </div>

                    {showNewCustomerInline && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={newCustomerName}
                          onChange={e => setNewCustomerName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') submitNewCustomerInline(); }}
                          placeholder={lang === 'am' ? 'ስም' : 'Customer name'}
                          className="flex-1 p-2 border focus:outline-none text-sm"
                          style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8' }}
                        />
                        <button
                          type="button"
                          onClick={submitNewCustomerInline}
                          disabled={!newCustomerName.trim() || savingCustomer}
                          className="px-3 py-2 text-xs font-bold press-scale flex items-center gap-1"
                          style={{
                            background: newCustomerName.trim() ? accentColor : '#e5e7eb',
                            color: newCustomerName.trim() ? '#fff' : '#9ca3af',
                            borderRadius: 'var(--radius-sm)',
                            cursor: newCustomerName.trim() ? 'pointer' : 'not-allowed',
                            minHeight: '36px',
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {lang === 'am' ? 'ጨምር' : 'Add'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment chips (sale/expense, but hidden when settlementMode is 'later' — no cash to record) */}
        {!isCredit && settlementMode !== 'later' && (
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
                  {cost > 0 && !belowCost && sellingPrice > 0 && (() => {
                    // Reclaimed from the deprecated ProfitCalculatorModal.jsx —
                    // live profit + margin% indicator. Margin colored by health:
                    // ≥30% green, 15-30% amber, <15% red. Helps shopkeepers price.
                    const profit = sellingPrice - cost * qty;
                    const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
                    const marginColor = margin >= 30 ? '#16a34a' : margin >= 15 ? '#C4883A' : '#dc2626';
                    return (
                      <div className="mt-2 p-2.5 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 'var(--radius-sm)' }}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold" style={{ color: '#166534' }}>
                            {lang === 'am' ? 'ትርፍ' : 'Profit'}: {fmt(profit)} {lang === 'am' ? 'ብር' : 'birr'}
                          </p>
                          <p className="text-xs font-bold flex-shrink-0" style={{ color: marginColor }}>
                            {Math.round(margin * 10) / 10}% {lang === 'am' ? 'ህዳግ' : 'margin'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky save button · with a clear hint when something blocks saving.
          Surfaces "what's missing" so the user doesn't have to guess. */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3" style={{ borderTop: '1px solid #e8e2d8' }}>
        {!canSave && sellingPrice > 0 && (() => {
          // Identify the blocker, in priority order
          let blocker = null;
          if (settlementMode === 'partial' && !(partialReceivedAmount > 0 && partialReceivedAmount < sellingPrice)) {
            blocker = lang === 'am'
              ? '↑ የተቀበሉት መጠን ይተይቡ (ከመጠን ያነሰ)'
              : '↑ Enter amount received (must be less than total)';
          } else if (needsCustomer && !selectedCustomerForCredit) {
            blocker = lang === 'am'
              ? '↑ ለማን? በላይ ላይ ይምረጡ ወይም ይጨምሩ'
              : '↑ Add or pick a customer above';
          } else if (isCredit && !item.trim()) {
            blocker = lang === 'am' ? '↑ ስም ይተይቡ' : '↑ Enter customer name';
          } else if (isCredit && !hasDueDate) {
            blocker = lang === 'am' ? '↑ የመክፈያ ቀን ይምረጡ' : '↑ Pick due date';
          } else if (phoneEntered && !phoneValid) {
            blocker = lang === 'am' ? '↑ ስልክ ስህተት' : '↑ Phone format invalid';
          }
          if (!blocker) return null;
          return (
            <p style={{
              fontSize: '0.78rem',
              color: '#92400e',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 8,
              padding: '8px 10px',
              marginBottom: 8,
              fontWeight: 600,
              textAlign: 'center',
            }}>
              {blocker}
            </p>
          );
        })()}
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
                  placeholder={lang === 'am' ? 'ዝርዝሩን ይመዝቡ...' : 'Add details...'}
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
