import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, Camera, Save, Image, X } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { db } from '../../db';
import { fmt, fmtInput } from '../../utils/numformat';
import { compressPhoto } from '../../utils/photoCapture';
import { buildPhotoFields, createPhotoProof } from '../../utils/photoProof';
import { fireToast } from '../Toast';
import PaymentTypeChips from '../PaymentTypeChips';
import ItemRow from './ItemRow';
import { useSmartSaleRows } from './useSmartSaleRows';
import RecentSalesSheet from './RecentSalesSheet';
import { getDueDateOptions, formatEthiopian } from '../../utils/ethiopianCalendar';
import EthiopianDatePicker from '../EthiopianDatePicker';

const MAX_PHOTOS = 3;
const DRAFT_KEY = 'gebya_sale_draft';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch { return null; }
}

function saveDraft(data) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function ItemizedSaleView({
  onSave,
  onDone,
  enabledProviders = {},
  catalogEntries = [],
  customers = [],
  onSaveCatalogEntry,
  onAddCustomerInline,
  transactions = [],
  actorLabel = '',
  onHistory,
}) {
  const { lang, t } = useLang();

  const draft = loadDraft();

  const [paymentType, setPaymentType] = useState(draft?.paymentType || 'cash');
  const [paymentProvider, setPaymentProvider] = useState(draft?.paymentProvider || '');
  const [shareAuto, setShareAuto] = useState(draft?.shareAuto || false);
  const [photos, setPhotos] = useState(draft?.photos || []);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const hasUnsavedChanges = useRef(false);
  const [discount, setDiscount] = useState(draft?.discount || 0);
  const [showDiscount, setShowDiscount] = useState(draft?.showDiscount || false);
  const [sessionRecentIds, setSessionRecentIds] = useState(new Set());
  const [lastSaleItems, setLastSaleItems] = useState([]);
  const [showCameraSheet, setShowCameraSheet] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(!!draft);
  const [creditCustomerSearch, setCreditCustomerSearch] = useState('');
  const [creditCustomerId, setCreditCustomerId] = useState(null);
  const [creditCustomerName, setCreditCustomerName] = useState('');
  const [creditCustomerPhone, setCreditCustomerPhone] = useState('');
  const [selectedDueTs, setSelectedDueTs] = useState(null);
  const [customDueIso, setCustomDueIso] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const fileInputRef = useRef(null);
  const creditSearchRef = useRef(null);
  const filteredCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(creditCustomerSearch.toLowerCase())
  );
  const recentCreditCustomers = useMemo(() =>
    customers
      .filter(c => c.last_activity_at)
      .sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0))
      .slice(0, 4),
    [customers]
  );
  const dueDateOptions = useMemo(() => getDueDateOptions(), []);

  const {
    rows,
    updateRow,
    deleteRow,
    undoDelete,
    undoStack,
    clearRows,
    addEmptyRows,
    ensureEmptyRow,
    filledRows,
    totalQty,
    totalAmount,
    buildItemsArray,
  } = useSmartSaleRows(3, draft?.rows || null);

  // Draft recovery
  useEffect(() => {
    if (!draft || !showDraftBanner) return;
    const timer = setTimeout(() => setShowDraftBanner(false), 8000);
    return () => clearTimeout(timer);
  }, [draft, showDraftBanner]);

  const restoreDraft = () => {
    if (!draft) return;
    setShowDraftBanner(false);
    fireToast(lang === 'am' ? 'ያልተጠናቀቀ ሽያጭ ተመልሷል' : 'Unfinished sale restored', 2000);
  };

  const discardDraft = () => {
    clearDraft();
    setShowDraftBanner(false);
    clearRows();
    setPhotos([]);
    setPaymentType('cash');
    setPaymentProvider('');
    setDiscount(0);
    setShowDiscount(false);
  };

  // Auto-save draft on changes
  const draftRef = useRef({ rows: [], paymentType, paymentProvider, shareAuto, photos, discount, showDiscount });
  useEffect(() => {
    draftRef.current = { rows, paymentType, paymentProvider, shareAuto, photos, discount, showDiscount };
    const timer = setTimeout(() => {
      saveDraft(draftRef.current);
    }, 500);
    return () => clearTimeout(timer);
  }, [rows, paymentType, paymentProvider, shareAuto, photos, discount, showDiscount]);

  // Track unsaved changes
  useEffect(() => {
    hasUnsavedChanges.current = filledRows.length > 0 || photos.length > 0;
  }, [filledRows, photos]);

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // --- Photo handlers ---
  const handlePhotoCapture = async (files) => {
    if (!files || files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      fireToast(lang === 'am' ? `ከፍተኛ ${MAX_PHOTOS} ፎቶ` : `Max ${MAX_PHOTOS} photos`, 2500);
      return;
    }
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const next = await Promise.all(files.map(async (f) => createPhotoProof(await compressPhoto(f))));
      setPhotos(prev => [...prev, ...next.filter(Boolean)].slice(0, MAX_PHOTOS));
    } catch (err) {
      setPhotoError(err.message || 'Photo failed');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleRemovePhoto = (id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleCameraOption = (option) => {
    setShowCameraSheet(false);
    if (option === 'camera') {
      fileInputRef.current?.setAttribute('capture', 'environment');
      fileInputRef.current?.click();
    } else if (option === 'gallery') {
      fileInputRef.current?.removeAttribute('capture');
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    handlePhotoCapture(files);
    e.target.value = '';
  };

  // --- Save ---
  const isCredit = paymentType === 'credit';
  const canSave = filledRows.length > 0 && totalAmount > 0 && !isSaving && (!isCredit || !!creditCustomerId);

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const items = buildItemsArray();
      const itemNameForSave = items.map(i => i.name).join(', ').substring(0, 200);
      const photoFields = buildPhotoFields(photos);
      const now = Date.now();
      const grandTotal = Math.max(0, totalAmount - discount);
      const normalizePhone = (phone) => {
        if (!phone) return null;
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 9 && /^[79]/.test(digits)) return '+251' + digits;
        return phone;
      };
      const data = {
        type: 'sale',
        item_name: itemNameForSave,
        catalog_entry_id: items[0]?.catalog_entry_id || null,
        item_kind: items[0]?.item_kind || null,
        quantity: totalQty,
        amount: grandTotal,
        cost_price: 0,
        profit: null,
        is_credit: false,
        customer_id: isCredit ? creditCustomerId : null,
        customer_name: isCredit ? (creditCustomerName || creditCustomerSearch) : null,
        customer_phone: isCredit ? normalizePhone(creditCustomerPhone) : null,
        due_date: isCredit ? (customDueIso ? new Date(`${customDueIso}T12:00:00`).getTime() : selectedDueTs) : null,
        payment_type: paymentType === 'cash' ? 'cash' : paymentType,
        payment_provider: paymentType !== 'cash' ? paymentProvider || null : null,
        direction: null,
        ...photoFields,
        items,
        settlement_mode: isCredit ? 'credit' : 'paid',
        cash_received: paymentType === 'cash' ? grandTotal : 0,
        credit_amount: isCredit ? grandTotal : 0,
        entered_total: null,
        items_subtotal: totalAmount,
        discount: discount > 0 ? discount : null,
        amount_basis: 'items',
        created_at: now,
      };

      await onSave(data);

      // Update catalog entries for merchant memory
      const savedCatalogIds = [];
      for (const item of items) {
        if (item.catalog_entry_id) {
          savedCatalogIds.push(item.catalog_entry_id);
          await db.catalog_entries.where('id').equals(item.catalog_entry_id).modify(entry => {
            entry.use_count = (entry.use_count || 0) + 1;
            entry.last_used_at = Date.now();
            entry.last_price = item.unit_price;
          });
        }
      }
      // Auto-remember unknown products so they appear in Merchant Memory next time.
      // Preserve the name EXACTLY as typed — no normalization, no casing, no spelling
      // correction.  If a catalog entry with this exact name already exists (byte-
      // identical), reuse it instead of creating a duplicate.
      for (const item of items) {
        if (!item.catalog_entry_id && item.name) {
          const existing = catalogEntries.find(e => e.name === item.name);
          if (existing) {
            savedCatalogIds.push(existing.id);
            await db.catalog_entries.where('id').equals(existing.id).modify(entry => {
              entry.use_count = (entry.use_count || 0) + 1;
              entry.last_used_at = Date.now();
              entry.last_price = item.unit_price;
            });
          } else {
            try {
              const saved = await onSaveCatalogEntry?.({ name: item.name, kind: 'item', default_price: item.unit_price || null });
              if (saved?.id) savedCatalogIds.push(saved.id);
            } catch {}
          }
        }
      }
      setSessionRecentIds(new Set(savedCatalogIds));
      setLastSaleItems(items.map(i => i.name));

      // Reset
      clearRows();
      setPhotos([]);
      setPaymentType('cash');
      setPaymentProvider('');
      setDiscount(0);
      setShowDiscount(false);
      hasUnsavedChanges.current = false;
      clearDraft();

      fireToast(
        shareAuto
          ? (lang === 'am' ? 'ተጠናቋል · ተጋሯል' : 'Completed · Shared')
          : (lang === 'am' ? 'ተጠናቋል' : 'Completed'),
        1500
      );

      setTimeout(() => onDone(), 200);
    } catch (err) {
      fireToast(lang === 'am' ? 'መቀመጫ አልተሳካም — እንደገና ይሞክሩ' : "Couldn't save — retry", 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Discard on back ---
  const handleBack = () => {
    if (hasUnsavedChanges.current) {
      setShowDiscardConfirm(true);
    } else {
      clearDraft();
      onDone();
    }
  };

  const confirmDiscard = () => {
    hasUnsavedChanges.current = false;
    clearDraft();
    onDone();
  };

  // --- Undo delete ---
  useEffect(() => {
    if (!undoStack) return;
    fireToast(
      lang === 'am' ? 'ተሰርዟል · UNDO' : 'Deleted · UNDO',
      5000,
      () => undoDelete()
    );
  }, [undoStack, lang, undoDelete]);

  // --- Save button label ---
  const saveLabel = (() => {
    if (shareAuto) {
      return lang === 'am' ? 'አጠናቅ እና አጋራ' : 'Complete & Share';
    }
    return lang === 'am' ? 'ሽያጩን አጠናቅ' : 'Complete Sale';
  })();

  const grandTotal = Math.max(0, totalAmount - discount);

  return (
    <div className="fixed inset-x-0 top-0 bottom-[60px] max-w-md mx-auto flex flex-col" style={{ background: '#fff' }}>
      {/* Draft recovery banner */}
      {showDraftBanner && draft && (
        <div className="flex-shrink-0 px-2 py-1.5 flex items-center justify-between" style={{ background: '#fef3c7' }}>
          <span className="text-[11px] font-bold" style={{ color: '#92400e' }}>
            {lang === 'am' ? 'ያልተጠናቀቀ ሽያጭ ተገኝቷል' : 'Unfinished sale'}
          </span>
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="text-[11px] font-bold px-1.5" style={{ color: '#14532d' }}>
              {lang === 'am' ? 'ወደነበረበት መልስ' : 'Restore'}
            </button>
            <button onClick={discardDraft} className="text-[11px] font-bold px-1.5" style={{ color: '#dc2626' }}>
              {lang === 'am' ? 'አስወግድ' : 'Discard'}
            </button>
          </div>
        </div>
      )}

      {/* Header — minimal, like a notebook page heading */}
      <div className="flex-shrink-0 px-2 py-1.5 flex items-center justify-between">
        <button
          onClick={handleBack}
          aria-label={lang === 'am' ? 'ተመለስ' : 'Back'}
          className="press-scale flex items-center justify-center"
          style={{ minWidth: '40px', minHeight: '40px' }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: '#6b7280' }} />
        </button>
        <h2 className="text-sm font-bold" style={{ color: '#16a34a' }}>
          {lang === 'am' ? 'አዲስ ሽያጭ' : 'New Sale'}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCameraSheet(true)}
            className="press-scale flex items-center justify-center relative"
            style={{ minWidth: '40px', minHeight: '40px' }}
            disabled={photoLoading}
          >
            {photoLoading ? (
              <span className="text-xs">...</span>
            ) : (
              <Camera className="w-4 h-4" style={{ color: photos.length > 0 ? '#16a34a' : '#9ca3af' }} />
            )}
            {photos.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[8px] font-black" style={{ color: '#16a34a' }}>
                {photos.length}
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => setShowRecentSales(true)}
            className="press-scale flex items-center justify-center"
            style={{ minWidth: '36px', minHeight: '36px' }}
            aria-label={lang === 'am' ? 'የዛሬ ሽያጭ' : "Today's Sales"}
          >
            <span className="text-base">📋</span>
          </button>
        </div>
      </div>

      {/* Camera action sheet */}
      {showCameraSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowCameraSheet(false)}>
          <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
            <button onClick={() => handleCameraOption('camera')} className="w-full px-4 py-3 text-left text-xs font-bold border-b flex items-center gap-3" style={{ borderColor: '#edeae5', minHeight: '44px' }}>
              <Camera className="w-4 h-4" /> {lang === 'am' ? 'ፎቶ አንሳ' : 'Take Photo'}
            </button>
            <button onClick={() => handleCameraOption('gallery')} className="w-full px-4 py-3 text-left text-xs font-bold border-b flex items-center gap-3" style={{ borderColor: '#edeae5', minHeight: '44px' }}>
              <Image className="w-4 h-4" /> {lang === 'am' ? 'ከማዕከለ-ስዕላት ምረጥ' : 'Choose from Gallery'}
            </button>
            <button onClick={() => setShowCameraSheet(false)} className="w-full px-4 py-3 text-left text-xs font-bold flex items-center gap-3" style={{ minHeight: '44px', color: '#6b7280' }}>
              {lang === 'am' ? 'ተው' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Photo indicators — inline, no background */}
      {photos.length > 0 && (
        <div className="flex-shrink-0 px-2 py-0.5 flex items-center gap-1.5">
          <span className="text-[10px] font-bold" style={{ color: '#16a34a' }}>
            📷 {photos.length}
          </span>
          {photos.map(p => (
            <button key={p.id} onClick={() => handleRemovePhoto(p.id)} className="text-[9px]" style={{ color: '#dc2626' }}>
              ✕
            </button>
          ))}
        </div>
      )}
      {photoError && (
        <div className="flex-shrink-0 px-2 py-0.5">
          <span className="text-[10px] font-semibold" style={{ color: '#dc2626' }}>{photoError}</span>
        </div>
      )}

      {/* Column headers — like notebook column labels */}
      <div className="flex-shrink-0 px-2 flex gap-1 items-center" style={{ borderBottom: '1px solid #edeae5' }}>
        <span className="text-[8px] font-bold uppercase tracking-widest" style={{ flex: '5 1 0%', color: '#bbb0a0' }}>
          {lang === 'am' ? 'ንጥል' : 'Item'}
        </span>
        <span className="text-[8px] font-bold text-center uppercase tracking-widest" style={{ width: '40px', color: '#bbb0a0' }}>
          {lang === 'am' ? 'ብዛት' : 'Qty'}
        </span>
        <span className="text-[8px] font-bold text-right uppercase tracking-widest" style={{ width: '64px', color: '#bbb0a0' }}>
          {lang === 'am' ? 'ዋጋ' : 'Price'}
        </span>
        <span className="text-[8px] font-bold text-right uppercase tracking-widest" style={{ width: '58px', color: '#bbb0a0' }}>
          {lang === 'am' ? 'ጠቅላላ' : 'Total'}
        </span>
      </div>

      {/* Scrollable item grid — notebook lines */}
      <div className="flex-1 overflow-y-auto px-2">
        {rows.map((row, idx) => (
          <ItemRow
            key={row.id}
            row={row}
            index={idx}
            catalogEntries={catalogEntries}
            sessionRecentIds={sessionRecentIds}
            lastSaleItems={lastSaleItems}
            onUpdate={updateRow}
            onDelete={deleteRow}
            onRemember={async (name) => {
              await onSaveCatalogEntry?.({ name, kind: 'item', default_price: null });
            }}
            onEnterLastRow={ensureEmptyRow}
            isLastRow={idx === rows.length - 1}
            autoFocus={idx === 0}
          />
        ))}
        {/* Add 3 Rows — always visible when merchant has started writing */}
        {filledRows.length >= 1 && (
          <div className="py-1">
            <button
              onClick={() => addEmptyRows(3)}
              className="w-full py-1.5 text-[10px] font-bold press-scale"
              style={{ color: '#bbb0a0' }}
            >
              + {lang === 'am' ? '3 ተጨማሪ ረድፎች' : 'Add 3 Rows'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar — no borders, like the bottom margin of a notebook page */}
      <div className="flex-shrink-0" style={{ background: '#fff' }}>
        {/* Running Summary — compact, no internal borders */}
        <div className="px-2 py-1.5 space-y-0.5">
          <div className="flex justify-between items-center text-[10px]">
            <span style={{ color: '#9ca3af' }}>
              {lang === 'am' ? 'እቃዎች' : 'Items'}: <span className="font-bold" style={{ color: '#374151' }}>{filledRows.length}</span>
              <span className="ml-2">
                {lang === 'am' ? 'ብዛት' : 'Qty'}: <span className="font-bold" style={{ color: '#374151' }}>{totalQty}</span>
              </span>
            </span>
            <span className="text-[10px]" style={{ color: '#9ca3af' }}>
              {lang === 'am' ? 'ድምር' : 'Subtotal'}: <span className="font-bold" style={{ color: '#374151' }}>{fmt(totalAmount)}</span>
            </span>
          </div>
          {showDiscount && (
            <div className="flex justify-between items-center">
              <span className="text-[10px]" style={{ color: '#9ca3af' }}>{lang === 'am' ? 'ቅናሽ' : 'Discount'}</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px]" style={{ color: '#dc2626' }}>−</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fmtInput(String(discount))}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
                    const val = parseFloat(raw) || 0;
                    setDiscount(Math.min(val, totalAmount));
                  }}
                  className="w-14 text-right text-[10px] font-bold px-0.5"
                  style={{ border: 'none', borderBottom: '1px solid #e8e2d8', borderRadius: '0', minHeight: '20px', background: 'transparent' }}
                />
              </div>
            </div>
          )}
          {!showDiscount && totalAmount > 0 && (
            <button
              onClick={() => setShowDiscount(true)}
              className="text-[9px] font-bold"
              style={{ color: '#c4b9a8' }}
            >
              + {lang === 'am' ? 'ቅናሽ' : 'Discount'}
            </button>
          )}
          <div className="flex justify-between items-center pt-0.5">
            <span className="text-xs font-black" style={{ color: '#111827' }}>{lang === 'am' ? 'ጠቅላላ' : 'TOTAL'}</span>
            <span className="text-sm font-black" style={{ color: '#16a34a' }}>
              {fmt(grandTotal)} ETB
            </span>
          </div>
        </div>

        {/* Credit fields — customer search + recent chips + due date + phone */}
        {isCredit && (
          <div className="px-2 py-2 space-y-2">
            {/* Search + Add button */}
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  ref={creditSearchRef}
                  type="text"
                  value={creditCustomerSearch}
                  onChange={e => setCreditCustomerSearch(e.target.value)}
                  placeholder={lang === 'am' ? 'ደንበኛ ፈልግ...' : 'Customer name...'}
                  className="w-full px-2 py-1.5 text-[11px] border font-bold"
                  style={{ borderColor: creditCustomerId ? '#16a34a' : '#edeae5', borderRadius: 'var(--radius-sm)', minHeight: '38px' }}
                />
                {creditCustomerSearch && !creditCustomerId && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white border shadow-sm max-h-[160px] overflow-y-auto" style={{ borderColor: '#edeae5', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
                    {filteredCustomers.length > 0 ? (
                      <>
                        {filteredCustomers.slice(0, 6).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCreditCustomerId(c.id);
                              setCreditCustomerName(c.name);
                              setCreditCustomerPhone(c.phone || '');
                              setCreditCustomerSearch(c.name);
                            }}
                            className="w-full px-2.5 py-2 text-left text-[11px] font-bold border-b flex items-center gap-2"
                            style={{ borderColor: '#f3f4f6', minHeight: '40px' }}
                          >
                            <span>{c.name}</span>
                            {c.phone && <span className="text-[10px]" style={{ color: '#9ca3af' }}>{c.phone}</span>}
                          </button>
                        ))}
                        {onAddCustomerInline && (
                          <button
                            type="button"
                            onClick={async () => {
                              const name = creditCustomerSearch.trim();
                              if (!name) return;
                              const saved = await onAddCustomerInline({ display_name: name });
                              if (saved?.id) {
                                setCreditCustomerId(saved.id);
                                setCreditCustomerName(saved.display_name || saved.name || name);
                                setCreditCustomerSearch(saved.display_name || saved.name || name);
                              }
                            }}
                            className="w-full px-2.5 py-2 text-left text-[11px] font-bold border-t border-dashed"
                            style={{ borderColor: '#16a34a', color: '#16a34a', minHeight: '40px' }}
                          >
                            + {lang === 'am' ? 'እንደ አዲስ ደንበኛ አክል' : 'Add as new customer'}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="px-2.5 py-2.5 text-[11px]" style={{ color: '#9ca3af' }}>
                        {lang === 'am' ? 'ደንበኛ አልተገኘም' : 'No customer found'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  const name = creditCustomerSearch.trim();
                  if (!name) {
                    creditSearchRef.current?.focus();
                    return;
                  }
                  if (!onAddCustomerInline) return;
                  const saved = await onAddCustomerInline({ display_name: name, phone: creditCustomerPhone || null });
                  if (saved?.id) {
                    setCreditCustomerId(saved.id);
                    setCreditCustomerName(saved.display_name || saved.name || name);
                    setCreditCustomerSearch(saved.display_name || saved.name || name);
                  }
                }}
                className="flex-shrink-0 px-3 text-[11px] font-bold border press-scale"
                style={{ borderColor: '#16a34a', color: '#16a34a', borderRadius: 'var(--radius-sm)', minHeight: '38px', background: 'rgba(22,163,74,0.06)' }}
              >
                <span className="text-[14px] mr-1">+</span>{lang === 'am' ? 'አክል' : 'Add'}
              </button>
            </div>

            {/* Recent credit customers — quick-select chips, name only */}
            {!creditCustomerSearch && !creditCustomerId && recentCreditCustomers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recentCreditCustomers.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCreditCustomerId(c.id);
                      setCreditCustomerName(c.name);
                      setCreditCustomerPhone(c.phone || '');
                      setCreditCustomerSearch(c.name);
                    }}
                    className="px-2.5 py-1.5 text-[11px] font-bold border press-scale"
                    style={{ borderColor: '#edeae5', borderRadius: 'var(--radius-sm)', minHeight: '34px', background: '#fff' }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Customer summary when selected */}
            {creditCustomerId && (
              <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: 'rgba(22,163,74,0.06)', borderRadius: 'var(--radius-sm)', minHeight: '34px' }}>
                <span className="text-[13px] font-bold flex-1">{creditCustomerName}</span>
                {creditCustomerPhone && <span className="text-[10px]" style={{ color: '#6b7280' }}>{creditCustomerPhone}</span>}
                <button
                  type="button"
                  onClick={() => {
                    setCreditCustomerId(null);
                    setCreditCustomerName('');
                    setCreditCustomerPhone('');
                    setCreditCustomerSearch('');
                    setSelectedDueTs(null);
                    setCustomDueIso('');
                  }}
                  className="text-[12px] font-bold press-scale px-1" style={{ color: '#9ca3af', minHeight: '30px' }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Due date presets row + phone row */}
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
                  {lang === 'am' ? 'መክፈያ ቀን' : 'Due date'}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {dueDateOptions.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setSelectedDueTs(opt.value); setCustomDueIso(''); }}
                      className="px-2 py-1 text-[10px] font-bold border press-scale"
                      style={{
                        borderColor: selectedDueTs === opt.value && !customDueIso ? '#16a34a' : '#edeae5',
                        background: selectedDueTs === opt.value && !customDueIso ? 'rgba(22,163,74,0.06)' : '#fff',
                        color: selectedDueTs === opt.value && !customDueIso ? '#16a34a' : '#374151',
                        borderRadius: 'var(--radius-sm)', minHeight: '34px',
                      }}
                    >
                      {opt.label.split('(')[0].trim()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(true)}
                    className="px-2 py-1 text-[10px] font-bold border press-scale"
                    style={{
                      borderColor: customDueIso ? '#16a34a' : '#edeae5',
                      background: customDueIso ? 'rgba(22,163,74,0.06)' : '#fff',
                      color: customDueIso ? '#16a34a' : '#374151',
                      borderRadius: 'var(--radius-sm)', minHeight: '34px',
                    }}
                  >
                    {customDueIso
                      ? formatEthiopian(new Date(`${customDueIso}T12:00:00`))
                      : (lang === 'am' ? '📅 ቀን ምረጥ' : '📅 Custom')}
                  </button>
                </div>
              </div>
              <div className="w-1/3 min-w-[110px]">
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>
                  {lang === 'am' ? 'ስልክ' : 'Phone'}
                </div>
                <input
                  type="tel"
                  value={creditCustomerPhone}
                  onChange={e => setCreditCustomerPhone(e.target.value)}
                  placeholder="+251 9XX XXX XXX"
                  className="w-full px-2 py-1.5 text-[11px] border font-bold"
                  style={{ borderColor: '#edeae5', borderRadius: 'var(--radius-sm)', minHeight: '34px' }}
                />
              </div>
            </div>

            <EthiopianDatePicker
              open={showDatePicker}
              value={customDueIso}
              onChange={(iso) => { setCustomDueIso(iso); setSelectedDueTs(null); }}
              onClose={() => setShowDatePicker(false)}
              lang={lang}
            />
          </div>
        )}

        {/* Payment chips — no label, more compact */}
        <div className="px-2 py-1">
          <PaymentTypeChips
            paymentType={paymentType}
            provider={paymentProvider}
            onTypeChange={(type) => {
              setPaymentType(type);
              if (type === 'cash') setPaymentProvider('');
            }}
            onProviderChange={setPaymentProvider}
            enabledProviders={enabledProviders}
          />
        </div>

        {/* Share toggle + Preview + Complete — single row */}
        <div className="px-2 pb-1.5 flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer select-none" style={{ color: shareAuto ? '#16a34a' : '#9ca3af', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={shareAuto}
              onChange={(e) => setShareAuto(e.target.checked)}
              className="sr-only"
            />
            <div className="relative w-6 h-3.5 rounded-full transition-colors" style={{ background: shareAuto ? '#16a34a' : '#d1d5db' }}>
              <div className="absolute top-[1px] left-[1px] w-2.5 h-2.5 rounded-full bg-white transition-transform" style={{ transform: shareAuto ? 'translateX(10px)' : 'translateX(0)' }} />
            </div>
            {lang === 'am' ? 'አጋራ' : 'Share'}
          </label>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setShowReceipt(true)}
            disabled={!canSave}
            className="px-2 py-1.5 text-[10px] font-bold press-scale"
            style={{ color: canSave ? '#6b7280' : '#d1d5db', cursor: canSave ? 'pointer' : 'not-allowed' }}
          >
            📄 {lang === 'am' ? 'ቅድመ-እይታ' : 'Preview'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 font-black text-[11px] flex items-center justify-center gap-1 transition-all press-scale"
            style={{
              background: canSave ? '#16a34a' : '#e5e7eb',
              color: canSave ? '#fff' : '#9ca3af',
              cursor: canSave ? 'pointer' : 'not-allowed',
              borderRadius: '3px',
              minHeight: '36px',
            }}
          >
            <Save className="w-3.5 h-3.5" />
            {saveLabel}
          </button>
        </div>
      </div>

      {/* Receipt Preview — paper style, no shadow */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.2)' }} onClick={() => setShowReceipt(false)}>
          <div className="bg-white w-full max-w-sm p-4" style={{ fontFamily: 'monospace' }} onClick={e => e.stopPropagation()}>
            <div className="text-center mb-2">
              <p className="text-xs font-bold" style={{ color: '#111827' }}>{actorLabel || 'Shop'}</p>
              <p className="text-[9px]" style={{ color: '#6b7280' }}>{new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div className="border-t border-b py-1 mb-1.5" style={{ borderColor: '#d1d5db' }}>
              <div className="flex justify-between text-[9px] font-bold mb-0.5" style={{ color: '#6b7280' }}>
                <span style={{ flex: 2 }}>{lang === 'am' ? 'ንጥል' : 'Item'}</span>
                <span style={{ width: '28px', textAlign: 'center' }}>{lang === 'am' ? 'ብ' : 'Qty'}</span>
                <span style={{ width: '56px', textAlign: 'right' }}>{lang === 'am' ? 'ድምር' : 'Total'}</span>
              </div>
              {buildItemsArray().map((it, i) => (
                <div key={i} className="flex justify-between text-[10px] py-0.5">
                  <span className="truncate" style={{ flex: 2, color: '#374151' }}>{it.name}</span>
                  <span style={{ width: '28px', textAlign: 'center', color: '#374151' }}>{it.qty}</span>
                  <span style={{ width: '56px', textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>{fmt(it.amount)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-0.5 text-[10px] mb-2">
              <div className="flex justify-between">
                <span style={{ color: '#6b7280' }}>{lang === 'am' ? 'ድምር' : 'Subtotal'}</span>
                <span className="font-bold">{fmt(totalAmount)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: '#6b7280' }}>{lang === 'am' ? 'ቅናሽ' : 'Discount'}</span>
                  <span style={{ color: '#dc2626' }}>−{fmt(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-0.5" style={{ borderColor: '#d1d5db' }}>
                <span className="font-bold">{lang === 'am' ? 'ጠቅላላ' : 'Grand Total'}</span>
                <span className="font-bold">{fmt(grandTotal)} ETB</span>
              </div>
              <div className="flex justify-between" style={{ color: '#6b7280' }}>
                <span>{lang === 'am' ? 'ክፍያ' : 'Payment'}</span>
                <span>{paymentType === 'cash' ? 'Cash' : paymentProvider || paymentType}</span>
              </div>
            </div>
            <button
              onClick={() => setShowReceipt(false)}
              className="w-full py-1.5 text-[10px] font-bold press-scale"
              style={{ color: '#6b7280', minHeight: '36px' }}
            >
              {lang === 'am' ? 'ዝጋ' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="bg-white rounded-xl p-4 max-w-sm w-full">
            <h3 className="text-sm font-bold mb-1.5" style={{ color: '#111827' }}>
              {lang === 'am' ? 'ሽያጩን ይተው?' : 'Discard Sale?'}
            </h3>
            <p className="text-[11px] mb-3" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ያልተቀመጠ ሁሉ ይጠፋል' : 'Unsaved data will be lost'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2 text-[11px] font-bold border-2 press-scale"
                style={{ borderColor: '#e8e2d8', borderRadius: 'var(--radius-md)', minHeight: '40px' }}
              >
                {lang === 'am' ? 'ቀጥል' : 'Continue'}
              </button>
              <button
                onClick={confirmDiscard}
                className="flex-1 py-2 text-[11px] font-bold text-white press-scale"
                style={{ background: '#dc2626', borderRadius: 'var(--radius-md)', minHeight: '40px' }}
              >
                {lang === 'am' ? 'ተው' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Sales sheet */}
      {showRecentSales && (
        <RecentSalesSheet
          transactions={transactions}
          onClose={() => setShowRecentSales(false)}
          onHistory={onHistory}
        />
      )}
    </div>
  );
}
