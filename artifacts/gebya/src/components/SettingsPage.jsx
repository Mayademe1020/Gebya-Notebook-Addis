import { useState, useEffect } from 'react';
import { Download, Trash2, Info, Shield, ChevronRight, Store, Phone, Check, CreditCard, RefreshCw, Plus, MessageCircle, X, Share2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt, parseInput } from '../utils/numformat';
import db from '../db';
import { ALL_BANKS, ALL_WALLETS } from './PaymentTypeChips';
import { BADGE_DEFINITIONS } from '../utils/badges';
import { fireToast } from './Toast';
import { normalizeTelegram } from '../utils/customerTelegram';
import PwaInstallPanel from './PwaInstallPanel.jsx';
import { SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';

const FREQ_LABELS_EN = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQ_LABELS_AM = { daily: 'ዕለታዊ', weekly: 'ሳምንታዊ', monthly: 'ወርሃዊ' };

function SettingsPage({
  transactions,
  customerSummaries,
  catalogEntries,
  supplierSummaries,
  shopProfile,
  onProfileSave,
  enabledProviders,
  onProvidersChange,
  recurringExpenses,
  onRecurringChange,
  usageStats,
  earnedBadges,
  onShareToday,
  onSaveCatalogEntry,
  onToggleCatalogEntryActive,
  onSaveSupplier,
  onSaveSupplierTransaction,
  onUpdateSupplierTransaction,
  onDeleteSupplierTransaction,
  pwa,
}) {
  const { lang, t } = useLang();
  const FREQ_LABELS = lang === 'am' ? FREQ_LABELS_AM : FREQ_LABELS_EN;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [catalogForm, setCatalogForm] = useState({
    id: null,
    name: '',
    kind: 'item',
    default_price: '',
    default_cost: '',
    note: '',
  });
  const [supplierForm, setSupplierForm] = useState({
    display_name: '',
    phone_number: '',
    note: '',
  });
  const [supplierTxForm, setSupplierTxForm] = useState({
    id: null,
    supplier_id: '',
    type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
    catalog_entry_id: '',
    item_name: '',
    quantity: '1',
    amount: '',
    note: '',
  });
  const [supplierDeleteTarget, setSupplierDeleteTarget] = useState(null);

  const [editName, setEditName] = useState(shopProfile?.name || '');
  const [editPhoneDigits, setEditPhoneDigits] = useState(() => {
    const raw = shopProfile?.phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [editTelegram, setEditTelegram] = useState(shopProfile?.telegram || '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const phoneValid = !editPhoneDigits || /^[79]\d{8}$/.test(editPhoneDigits);
  const normalizedTelegram = normalizeTelegram(editTelegram);
  const telegramValid = !editTelegram.trim() || !!normalizedTelegram;
  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 9) setEditPhoneDigits(raw);
  };

  const [providers, setProviders] = useState(enabledProviders || { banks: [...ALL_BANKS], wallets: [...ALL_WALLETS] });

  const [customBanks, setCustomBanks] = useState([]);
  const [customWallets, setCustomWallets] = useState([]);
  const [addBankInput, setAddBankInput] = useState('');
  const [addWalletInput, setAddWalletInput] = useState('');
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddWallet, setShowAddWallet] = useState(false);

  useEffect(() => {
    const load = async () => {
      const cbRow = await db.settings.get('custom_banks');
      const cwRow = await db.settings.get('custom_wallets');
      if (cbRow?.value) {
        try { setCustomBanks(JSON.parse(cbRow.value)); } catch { /* ignore */ }
      }
      if (cwRow?.value) {
        try { setCustomWallets(JSON.parse(cwRow.value)); } catch { /* ignore */ }
      }
    };
    load();
  }, []);

  const [recurring, setRecurring] = useState(recurringExpenses || []);
  const [reName, setReName] = useState('');
  const [reAmount, setReAmount] = useState('');
  const [reFreq, setReFreq] = useState('monthly');
  const [showReForm, setShowReForm] = useState(false);

  const [shareCopied, setShareCopied] = useState(false);
  const activeCatalogEntries = (catalogEntries || []).filter(entry => entry.active !== false);
  const selectedSupplier = (supplierSummaries || []).find(item => String(item.id) === String(supplierTxForm.supplier_id)) || null;

  const handleProfileSave = async () => {
    if (!editName.trim() || !phoneValid || !telegramValid) return;
    const fullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
    await onProfileSave(editName.trim(), fullPhone, normalizedTelegram || '');
    setEditTelegram(normalizedTelegram || '');
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const csvCell = (value) => {
    const stringValue = value == null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const buildCsvSection = (title, headers, rows) => {
    return [
      [csvCell(title)],
      headers.map(csvCell),
      ...rows.map(row => row.map(csvCell)),
      [],
    ].map(row => row.join(',')).join('\n');
  };

  const exportToCSV = async () => {
    const [customerRows, customerTransactionRows, supplierRows, supplierTransactionRows] = await Promise.all([
      db.customers.toArray(),
      db.customer_transactions.toArray(),
      db.suppliers?.toArray?.() || [],
      db.supplier_transactions?.toArray?.() || [],
    ]);

    const transactionSection = buildCsvSection(
      'Transactions',
      ['Date (Ethiopian)', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Cost (birr)', 'Profit (birr)', 'Payment', 'Customer'],
      transactions.map(tx => [
        formatEthiopian(tx.created_at),
        tx.type,
        tx.item_name || '',
        tx.quantity || 1,
        tx.amount || 0,
        tx.cost_price || '',
        tx.profit !== null && tx.profit !== undefined ? tx.profit : '',
        [tx.payment_type, tx.payment_provider].filter(Boolean).join(' ') || '',
        tx.customer_name || '',
      ])
    );

    const customerSection = buildCsvSection(
      'Customers',
      ['ID', 'Name', 'Phone', 'Note', 'Telegram', 'Telegram notify enabled', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
      customerRows.map(customer => [
        customer.id,
        customer.display_name || '',
        customer.phone_number || '',
        customer.note || '',
        customer.telegram_username || '',
        customer.telegram_notify_enabled ? 'yes' : 'no',
        customer.created_at ? formatEthiopian(customer.created_at) : '',
        customer.updated_at ? formatEthiopian(customer.updated_at) : '',
      ])
    );

    const customerTransactionSection = buildCsvSection(
      'Customer Ledger Transactions',
      ['ID', 'Customer ID', 'Type', 'Amount (birr)', 'Item note', 'Due date (Ethiopian)', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
      customerTransactionRows.map(entry => [
        entry.id,
        entry.customer_id,
        entry.type,
        entry.amount || 0,
        entry.item_note || '',
        entry.due_date ? formatEthiopian(entry.due_date) : '',
        entry.created_at ? formatEthiopian(entry.created_at) : '',
        entry.updated_at ? formatEthiopian(entry.updated_at) : '',
      ])
    );

    const supplierSection = buildCsvSection(
      'Suppliers',
      ['ID', 'Name', 'Phone', 'Note', 'Active', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
      supplierRows.map(supplier => [
        supplier.id,
        supplier.display_name || '',
        supplier.phone_number || '',
        supplier.note || '',
        supplier.active === false ? 'no' : 'yes',
        supplier.created_at ? formatEthiopian(supplier.created_at) : '',
        supplier.updated_at ? formatEthiopian(supplier.updated_at) : '',
      ])
    );

    const supplierTransactionSection = buildCsvSection(
      'Supplier Ledger Transactions',
      ['ID', 'Supplier ID', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Note', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
      supplierTransactionRows.map(entry => [
        entry.id,
        entry.supplier_id,
        entry.type,
        entry.item_name || '',
        entry.quantity != null ? entry.quantity : '',
        entry.amount || 0,
        entry.note || '',
        entry.created_at ? formatEthiopian(entry.created_at) : '',
        entry.updated_at ? formatEthiopian(entry.updated_at) : '',
      ])
    );

    const csv = [
      transactionSection,
      customerSection,
      customerTransactionSection,
      supplierSection,
      supplierTransactionSection,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gebya-backup-full-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAllData = async () => {
    await Promise.all([
      db.transactions.clear(),
      db.customers.clear(),
      db.customer_transactions.clear(),
      db.catalog_entries.clear(),
      db.suppliers.clear(),
      db.supplier_transactions.clear(),
      db.credit_records?.clear?.() || Promise.resolve(),
      db.credit_payment_logs?.clear?.() || Promise.resolve(),
      db.settings.delete('last_saved_snapshot'),
    ]);
    setCleared(true);
    setShowClearConfirm(false);
    setTimeout(() => window.location.reload(), 800);
  };

  const allBanks = [...ALL_BANKS, ...customBanks.filter(b => !ALL_BANKS.includes(b))];
  const allWallets = [...ALL_WALLETS, ...customWallets.filter(w => !ALL_WALLETS.includes(w))];

  const toggleBank = async (bank) => {
    const cur = providers.banks || [];
    const nowEnabled = !cur.includes(bank);
    const next = nowEnabled ? [...cur, bank] : cur.filter(b => b !== bank);
    const updated = { ...providers, banks: next };
    setProviders(updated);
    await db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(updated) });
    onProvidersChange?.(updated);
    fireToast(nowEnabled ? `✓ ${bank} ${t.providerEnabled}` : `${bank} ${t.providerDisabled}`, 1800);
  };

  const toggleWallet = async (wallet) => {
    const cur = providers.wallets || [];
    const nowEnabled = !cur.includes(wallet);
    const next = nowEnabled ? [...cur, wallet] : cur.filter(w => w !== wallet);
    const updated = { ...providers, wallets: next };
    setProviders(updated);
    await db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(updated) });
    onProvidersChange?.(updated);
    fireToast(nowEnabled ? `✓ ${wallet} ${t.providerEnabled}` : `${wallet} ${t.providerDisabled}`, 1800);
  };

  const addCustomBank = async () => {
    const name = addBankInput.trim();
    if (!name || allBanks.includes(name)) return;
    const updatedCustom = [...customBanks, name];
    setCustomBanks(updatedCustom);
    await db.settings.put({ key: 'custom_banks', value: JSON.stringify(updatedCustom) });
    const updatedProviders = { ...providers, banks: [...(providers.banks || []), name] };
    setProviders(updatedProviders);
    await db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(updatedProviders) });
    onProvidersChange?.(updatedProviders);
    setAddBankInput('');
    setShowAddBank(false);
    fireToast(`✓ ${name} ${t.providerEnabled}`, 1800);
  };

  const addCustomWallet = async () => {
    const name = addWalletInput.trim();
    if (!name || allWallets.includes(name)) return;
    const updatedCustom = [...customWallets, name];
    setCustomWallets(updatedCustom);
    await db.settings.put({ key: 'custom_wallets', value: JSON.stringify(updatedCustom) });
    const updatedProviders = { ...providers, wallets: [...(providers.wallets || []), name] };
    setProviders(updatedProviders);
    await db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(updatedProviders) });
    onProvidersChange?.(updatedProviders);
    setAddWalletInput('');
    setShowAddWallet(false);
    fireToast(`✓ ${name} ${t.providerEnabled}`, 1800);
  };

  const addRecurring = async () => {
    const amt = parseFloat(reAmount);
    if (!reName.trim() || !amt) return;
    const newItem = { id: Date.now(), name: reName.trim(), amount: amt, freq: reFreq };
    const updated = [...recurring, newItem];
    setRecurring(updated);
    await db.settings.put({ key: 'recurring_expenses', value: JSON.stringify(updated) });
    onRecurringChange?.(updated);
    setReName('');
    setReAmount('');
    setReFreq('monthly');
    setShowReForm(false);
  };

  const removeRecurring = async (id) => {
    const updated = recurring.filter(r => r.id !== id);
    setRecurring(updated);
    await db.settings.put({ key: 'recurring_expenses', value: JSON.stringify(updated) });
    onRecurringChange?.(updated);
  };

  const handleShareStats = async () => {
    if (!usageStats) return;
    const { streak, longestStreak, daysActive, featureCounts, sessionCount, firstUsed } = usageStats;
    const fc = featureCounts || {};
    let firstUsedDisplay = firstUsed;
    try { firstUsedDisplay = firstUsed ? formatEthiopian(new Date(firstUsed)) : firstUsed; } catch { /* keep ISO fallback */ }
    const text = [
      `📊 Gebya usage stats for ${shopProfile?.name || 'my shop'}:`,
      `🔥 Current streak: ${streak} day${streak !== 1 ? 's' : ''} (longest: ${longestStreak})`,
      `📅 Using since: ${firstUsedDisplay}`,
      `📈 Total days active: ${daysActive?.length || 1}`,
      `🛒 Entries: ${fc.sales || 0} sales · ${fc.expenses || 0} expenses · ${fc.credits || 0} Dubie`,
      `📱 Sessions opened: ${sessionCount}`,
    ].join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: 'Gebya Stats', text }); return; } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const totalEntries = transactions.length;
  const totalCustomersWithLedger = customerSummaries.length;
  const totalSupplierDubie = (supplierSummaries || []).reduce((sum, supplier) => sum + Math.max(supplier.balance || 0, 0), 0);
  const currentFullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
  const profileChanged = (
    editName.trim() !== (shopProfile?.name || '') ||
    currentFullPhone !== (shopProfile?.phone || '') ||
    editTelegram.trim() !== (shopProfile?.telegram || '')
  );

  const badgeList = (earnedBadges || []);

  const resetCatalogForm = () => {
    setCatalogForm({
      id: null,
      name: '',
      kind: 'item',
      default_price: '',
      default_cost: '',
      note: '',
    });
  };

  const resetSupplierForm = () => {
    setSupplierForm({
      display_name: '',
      phone_number: '',
      note: '',
    });
  };

  const resetSupplierTxForm = () => {
    setSupplierTxForm(prev => ({
      id: null,
      supplier_id: prev.supplier_id,
      type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
      catalog_entry_id: '',
      item_name: '',
      quantity: '1',
      amount: '',
      note: '',
    }));
  };

  const handleCatalogSubmit = async () => {
    const saved = await onSaveCatalogEntry?.({
      id: catalogForm.id,
      name: catalogForm.name,
      kind: catalogForm.kind,
      default_price: parseInput(catalogForm.default_price),
      default_cost: parseInput(catalogForm.default_cost),
      note: catalogForm.note,
      active: true,
    });
    if (!saved) return;
    fireToast(catalogForm.id ? 'Catalog updated' : 'Saved to items & services', 1800);
    resetCatalogForm();
  };

  const handleSupplierSubmit = async () => {
    const saved = await onSaveSupplier?.(supplierForm);
    if (!saved) return;
    fireToast('Supplier saved', 1800);
    setSupplierTxForm(prev => ({ ...prev, supplier_id: String(saved.id) }));
    resetSupplierForm();
  };

  const handleSupplierTransactionSubmit = async () => {
    const quantity = Math.max(parseInt(supplierTxForm.quantity || '1', 10) || 1, 1);
    const selectedCatalog = activeCatalogEntries.find(entry => String(entry.id) === String(supplierTxForm.catalog_entry_id));
    const payload = {
      id: supplierTxForm.id,
      supplier_id: Number(supplierTxForm.supplier_id),
      type: supplierTxForm.type,
      catalog_entry_id: supplierTxForm.catalog_entry_id ? Number(supplierTxForm.catalog_entry_id) : null,
      item_name: supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD
        ? (supplierTxForm.item_name.trim() || selectedCatalog?.name || null)
        : null,
      item_kind: selectedCatalog?.kind || null,
      quantity,
      amount: parseInput(supplierTxForm.amount),
      note: supplierTxForm.note.trim() || null,
    };
    const didSave = supplierTxForm.id
      ? await onUpdateSupplierTransaction?.(supplierTxForm.id, payload)
      : await onSaveSupplierTransaction?.(payload);
    if (!didSave) return;
    fireToast(
      supplierTxForm.id
        ? 'Supplier transaction updated'
        : (supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? 'Supplier dubie saved' : 'Supplier payment saved'),
      1800
    );
    resetSupplierTxForm();
  };

  const handleEditSupplierTransaction = (entry) => {
    setSupplierTxForm({
      id: entry.id,
      supplier_id: String(entry.supplier_id || ''),
      type: entry.type || SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
      catalog_entry_id: entry.catalog_entry_id ? String(entry.catalog_entry_id) : '',
      item_name: entry.item_name || '',
      quantity: entry.quantity != null ? String(entry.quantity) : '1',
      amount: entry.amount != null ? String(entry.amount) : '',
      note: entry.note || '',
    });
  };

  const handleConfirmDeleteSupplierTransaction = async () => {
    if (!supplierDeleteTarget?.id) return;
    const deleted = await onDeleteSupplierTransaction?.(supplierDeleteTarget.id);
    if (!deleted) return;
    fireToast('Supplier transaction deleted', 1800);
    if (supplierTxForm.id === supplierDeleteTarget.id) {
      resetSupplierTxForm();
    }
    setSupplierDeleteTarget(null);
  };

  return (
    <div className="space-y-5 pb-4">



      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.shopProfile}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 pt-5 pb-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> {t.userName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t.onboardNamePlaceholder || 'e.g. Tigist'}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                style={{ borderColor: editName.trim() ? '#C4883A' : '#e8e2d8' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {t.phoneNumber} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-0">
                <div
                  className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold"
                  style={{ background: '#f5f0e8', borderColor: (phoneTouched && !phoneValid) ? '#dc2626' : '#e8e2d8', color: '#1B4332', minWidth: '64px' }}
                >
                  +251
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={editPhoneDigits}
                  onChange={handlePhoneChange}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="9XXXXXXXX"
                  maxLength={9}
                  className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
                  style={{ borderColor: (phoneTouched && !phoneValid) ? '#dc2626' : (phoneValid ? '#C4883A' : '#e8e2d8') }}
                />
              </div>
              {phoneTouched && !phoneValid && editPhoneDigits.length > 0 && (
                <p className="text-xs text-red-500 mt-1 font-medium">{t.phoneInvalid}</p>
              )}
              {phoneTouched && editPhoneDigits.length === 0 && (
                <p className="text-xs text-red-500 mt-1 font-medium">{t.phoneRequired}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> {t.telegramLabel}
              </label>
              <input
                type="text"
                value={editTelegram}
                onChange={e => setEditTelegram(e.target.value)}
                placeholder={t.telegramPlaceholder}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                style={{ borderColor: telegramValid ? '#e8e2d8' : '#dc2626' }}
              />
              {!telegramValid && (
                <p className="text-xs text-red-500 mt-1 font-medium">{t.telegramFormatHint}</p>
              )}
            </div>
            <button
              onClick={handleProfileSave}
              disabled={!editName.trim() || !phoneValid || !telegramValid || (!profileChanged && !profileSaved)}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{
                background: profileSaved ? '#15803d' : (editName.trim() && phoneValid && telegramValid && profileChanged ? '#C4883A' : '#e5e7eb'),
                color: (editName.trim() && phoneValid && telegramValid && (profileChanged || profileSaved)) ? '#fff' : '#9ca3af',
              }}
            >
              {profileSaved ? <><Check className="w-4 h-4" /> {t.saved}</> : t.saveChanges}
            </button>
          </div>
        </div>
      </section>

      {onShareToday && (
        <section>
          <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.shareTodayTitle}</h2>
          <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
            <div className="px-5 py-4">
              <p className="text-xs text-gray-500 mb-3">{t.shareTodayHint}</p>
              <button
                onClick={onShareToday}
                className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 min-h-[48px] transition-all"
                style={{ background: '#1B4332' }}
              >
                <Share2 className="w-4 h-4" />
                {t.shareReport}
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.frequentExpenses}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs text-gray-500 mb-3">{t.recurringHint}</p>

            {recurring.length > 0 && (
              <div className="space-y-2 mb-3">
                {recurring.map(re => (
                  <div key={re.id} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                    <RefreshCw className="w-4 h-4 flex-shrink-0" style={{ color: '#C4883A' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{re.name}</p>
                      <p className="text-xs text-gray-500">{fmt(re.amount)} {t.birr} · {FREQ_LABELS[re.freq] || re.freq}</p>
                    </div>
                    <button
                      onClick={() => removeRecurring(re.id)}
                      className="p-1.5 rounded-full hover:bg-red-50 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!showReForm ? (
              <button
                onClick={() => setShowReForm(true)}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 border-dashed transition-all min-h-[48px]"
                style={{ borderColor: '#e8e2d8', color: '#C4883A', background: '#FAF8F5' }}
              >
                <Plus className="w-4 h-4" /> {t.addRecurring}
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl border" style={{ background: '#FAF8F5', borderColor: 'var(--color-border)' }}>
                <input
                  type="text"
                  value={reName}
                  onChange={e => setReName(e.target.value)}
                  placeholder={t.expenseName}
                  className="w-full px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={reAmount}
                    onChange={e => setReAmount(e.target.value)}
                    placeholder={t.amount}
                    className="w-full px-3 py-2.5 pr-14 border-2 rounded-xl text-sm focus:outline-none"
                    style={{ borderColor: '#e8e2d8' }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{t.birr}</span>
                </div>
                <div className="flex gap-2">
                  {['daily', 'weekly', 'monthly'].map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setReFreq(f)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all min-h-[40px]"
                      style={{
                        borderColor: reFreq === f ? '#C4883A' : '#e8e2d8',
                        background: reFreq === f ? 'rgba(196,136,58,0.15)' : '#fff',
                        color: reFreq === f ? '#1B4332' : '#6b7280',
                      }}
                    >
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowReForm(false); setReName(''); setReAmount(''); setReFreq('monthly'); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold min-h-[44px]" style={{ background: '#f5f5f5', color: '#6b7280' }}
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={addRecurring}
                    disabled={!reName.trim() || !parseFloat(reAmount)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 min-h-[44px]"
                    style={{ background: '#C4883A' }}
                  >
                    {t.add}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="h-2" />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.paymentMethods}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">

          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> {t.banks}
              </p>
              <button
                onClick={() => { setShowAddBank(v => !v); setAddBankInput(''); }}
                className="flex items-center gap-1 text-xs font-bold min-h-[36px] px-2 rounded-lg transition-colors"
                style={{ color: '#C4883A', background: showAddBank ? 'rgba(196,136,58,0.12)' : 'transparent' }}
              >
                {showAddBank ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showAddBank ? t.cancel : t.addCustomBank}
              </button>
            </div>
            {showAddBank && (
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={addBankInput}
                  onChange={e => setAddBankInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomBank()}
                  placeholder={t.customProviderName}
                  className="flex-1 px-3 py-2 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
                <button
                  onClick={addCustomBank}
                  disabled={!addBankInput.trim()}
                  className="px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 min-h-[40px]"
                  style={{ background: '#C4883A' }}
                >
                  {t.add}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {allBanks.map(bank => {
                const enabled = (providers.banks || []).includes(bank);
                return (
                  <button
                    key={bank}
                    onClick={() => toggleBank(bank)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all min-h-[36px]"
                    style={{
                      borderColor: enabled ? '#C4883A' : '#e8e2d8',
                      background: enabled ? 'rgba(196,136,58,0.15)' : '#f9fafb',
                      color: enabled ? '#1B4332' : '#9ca3af',
                    }}
                  >
                    {enabled ? '✓ ' : ''}{bank}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">📱 {t.mobileWallets}</p>
              <button
                onClick={() => { setShowAddWallet(v => !v); setAddWalletInput(''); }}
                className="flex items-center gap-1 text-xs font-bold min-h-[36px] px-2 rounded-lg transition-colors"
                style={{ color: '#C4883A', background: showAddWallet ? 'rgba(196,136,58,0.12)' : 'transparent' }}
              >
                {showAddWallet ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showAddWallet ? t.cancel : t.addCustomWallet}
              </button>
            </div>
            {showAddWallet && (
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={addWalletInput}
                  onChange={e => setAddWalletInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomWallet()}
                  placeholder={t.customProviderName}
                  className="flex-1 px-3 py-2 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
                <button
                  onClick={addCustomWallet}
                  disabled={!addWalletInput.trim()}
                  className="px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 min-h-[40px]"
                  style={{ background: '#C4883A' }}
                >
                  {t.add}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {allWallets.map(wallet => {
                const enabled = (providers.wallets || []).includes(wallet);
                return (
                  <button
                    key={wallet}
                    onClick={() => toggleWallet(wallet)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all min-h-[36px]"
                    style={{
                      borderColor: enabled ? '#C4883A' : '#e8e2d8',
                      background: enabled ? 'rgba(196,136,58,0.15)' : '#f9fafb',
                      color: enabled ? '#1B4332' : '#9ca3af',
                    }}
                  >
                    {enabled ? '✓ ' : ''}{wallet}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-5 py-3">
            <p className="text-xs text-gray-400">{t.onlyEnabled}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.yourData}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f0fdf4' }}>
              <Info className="w-5 h-5 text-green-700" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">{t.storedOnDevice}</div>
              <div className="text-xs text-gray-500 mt-0.5">{totalEntries} entries · {totalCustomersWithLedger} customers in Dubie ledger</div>
            </div>
          </div>

          <button
            onClick={exportToCSV}
            disabled={totalEntries === 0}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-green-50 transition-colors min-h-[64px] disabled:opacity-40"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#eff6ff' }}>
              <Download className="w-5 h-5 text-blue-700" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-gray-800">{t.exportCSV}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t.exportHint}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </button>

          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full flex items-center gap-3 px-5 py-3 transition-colors min-h-[52px]"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#f5f5f5' }}>
              <Trash2 className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm text-gray-500">{t.clearAll}</div>
            </div>
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between px-1 mb-2">
          <button
            onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-2"
          >
            <h2 className="text-xs font-bold tracking-widest uppercase text-green-800">{t.more}</h2>
            <ChevronRight className={`w-4 h-4 text-green-800 transition-transform ${showMore ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {showMore && (
          <div className="space-y-5">

            <PwaInstallPanel pwa={pwa} variant="settings" />

            <section>
              <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.achievementBadges}</h2>
              <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
                <div className="px-4 pt-4 pb-3">
                  {badgeList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">{t.noBadges}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {BADGE_DEFINITIONS.filter(b => badgeList.includes(b.id)).map(badge => (
                        <div
                          key={badge.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                          style={{ background: 'rgba(196,136,58,0.12)', border: '1.5px solid #C4883A' }}
                        >
                          <span className="text-xl">{badge.emoji}</span>
                          <div>
                            <div className="text-xs font-bold text-green-900">
                              {lang === 'am' ? badge.titleAm : badge.title}
                            </div>
                            <div className="text-xs text-green-700">
                              {lang === 'am' ? badge.descriptionAm : badge.description}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {badgeList.length > 0 && badgeList.length < BADGE_DEFINITIONS.length && (
                    <p className="text-xs text-gray-400 text-center mt-2">
                      {badgeList.length} / {BADGE_DEFINITIONS.length} {t.badgesEarned}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {usageStats && (
              <section>
                <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.usageInsights}</h2>
                <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
                  <div className="px-4 pt-4 pb-3 space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1 rounded-xl p-3 text-center" style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
                        <div className="text-2xl font-black" style={{ color: '#c2410c' }}>🔥 {usageStats.streak}</div>
                        <div className="text-xs font-semibold text-gray-600 mt-0.5">{t.dayStreak}</div>
                        <div className="text-xs text-gray-400">{t.best}: {usageStats.longestStreak}</div>
                      </div>
                      <div className="flex-1 rounded-xl p-3 text-center" style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
                        <div className="text-2xl font-black text-green-700">📅 {usageStats.daysActive?.length || 1}</div>
                        <div className="text-xs font-semibold text-gray-600 mt-0.5">{t.daysActive}</div>
                        <div className="text-xs text-gray-400">
                          {t.since} {usageStats.firstUsed ? (() => { try { return formatEthiopian(new Date(usageStats.firstUsed)); } catch { return usageStats.firstUsed; } })() : '—'}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                      <div className="text-xs font-bold text-gray-500 mb-1.5">📊 {t.totalEntries}</div>
                      <div className="flex justify-around text-center">
                        <div>
                          <div className="text-base font-black text-green-700">{usageStats.featureCounts?.sales || 0}</div>
                          <div className="text-xs text-gray-500">{t.salesLabel}</div>
                        </div>
                        <div>
                          <div className="text-base font-black text-red-500">{usageStats.featureCounts?.expenses || 0}</div>
                          <div className="text-xs text-gray-500">{t.expenses}</div>
                        </div>
                        <div>
                          <div className="text-base font-black" style={{ color: '#C4883A' }}>{usageStats.featureCounts?.credits || 0}</div>
                          <div className="text-xs text-gray-500">{t.credit}</div>
                        </div>
                        <div>
                          <div className="text-base font-black text-gray-700">{usageStats.sessionCount || 0}</div>
                          <div className="text-xs text-gray-500">{t.sessions}</div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleShareStats}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all min-h-[44px]"
                      style={{ background: shareCopied ? '#15803d' : '#C4883A' }}
                    >
                      {shareCopied ? `✓ ${t.copiedToClipboard}` : t.shareMyStats}
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">Items & Services</h2>
              <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
                <div className="px-5 pt-5 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {['item', 'service'].map(kind => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setCatalogForm(prev => ({ ...prev, kind }))}
                        className="py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[44px]"
                        style={{
                          borderColor: catalogForm.kind === kind ? '#1B4332' : '#e8e2d8',
                          background: catalogForm.kind === kind ? 'rgba(27,67,50,0.07)' : '#fff',
                          color: catalogForm.kind === kind ? '#1B4332' : '#6b7280',
                        }}
                      >
                        {kind === 'item' ? 'Item' : 'Service'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={catalogForm.name}
                    onChange={e => setCatalogForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Name"
                    className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                    style={{ borderColor: '#e8e2d8' }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={catalogForm.default_price}
                      onChange={e => setCatalogForm(prev => ({ ...prev, default_price: e.target.value.replace(/[^\d.,]/g, '') }))}
                      placeholder="Default sale price"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={catalogForm.default_cost}
                      onChange={e => setCatalogForm(prev => ({ ...prev, default_cost: e.target.value.replace(/[^\d.,]/g, '') }))}
                      placeholder="Default cost"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                  </div>
                  <textarea
                    value={catalogForm.note}
                    onChange={e => setCatalogForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="Optional note"
                    rows={2}
                    className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                    style={{ borderColor: '#e8e2d8' }}
                  />
                  <div className="flex gap-2">
                    {catalogForm.id && (
                      <button
                        type="button"
                        onClick={resetCatalogForm}
                        className="px-4 py-3 rounded-xl text-sm font-bold min-h-[44px]"
                        style={{ background: '#f5f5f5', color: '#6b7280' }}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCatalogSubmit}
                      disabled={!catalogForm.name.trim()}
                      className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[44px] disabled:opacity-40"
                      style={{ background: '#1B4332' }}
                    >
                      {catalogForm.id ? 'Update entry' : 'Save entry'}
                    </button>
                  </div>
                  <div className="space-y-2 pt-2">
                    {(catalogEntries || []).length === 0 && (
                      <p className="text-xs text-gray-400">No saved items or services yet.</p>
                    )}
                    {(catalogEntries || []).map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-800 text-sm">{entry.name}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: entry.kind === 'service' ? '#dbeafe' : '#dcfce7', color: entry.kind === 'service' ? '#1d4ed8' : '#166534' }}>
                              {entry.kind === 'service' ? 'Service' : 'Item'}
                            </span>
                            {entry.active === false && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                Archived
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Sale {entry.default_price != null ? fmt(entry.default_price) : '—'} · Cost {entry.default_cost != null ? fmt(entry.default_cost) : '—'}
                          </p>
                          {entry.note && <p className="text-xs text-gray-400 mt-1">{entry.note}</p>}
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => setCatalogForm({
                              id: entry.id,
                              name: entry.name || '',
                              kind: entry.kind || 'item',
                              default_price: entry.default_price != null ? String(entry.default_price) : '',
                              default_cost: entry.default_cost != null ? String(entry.default_cost) : '',
                              note: entry.note || '',
                            })}
                            className="px-3 py-2 rounded-lg text-xs font-bold"
                            style={{ background: '#fff', color: '#1B4332', border: '1px solid #e8e2d8' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleCatalogEntryActive?.(entry)}
                            className="px-3 py-2 rounded-lg text-xs font-bold"
                            style={{ background: entry.active === false ? '#dcfce7' : '#f3f4f6', color: entry.active === false ? '#166534' : '#6b7280' }}
                          >
                            {entry.active === false ? 'Restore' : 'Archive'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">Suppliers & Dubie</h2>
              <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
                <div className="px-5 pt-5 pb-4 space-y-4">
                  <div className="p-4 rounded-2xl" style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
                    <p className="text-xs font-bold tracking-wide uppercase" style={{ color: '#9a3412' }}>Total supplier dubie</p>
                    <p className="text-2xl font-black mt-1" style={{ color: '#9a3412' }}>{fmt(totalSupplierDubie)} {t.birr}</p>
                    <p className="text-xs mt-1 text-gray-500">{(supplierSummaries || []).length} suppliers</p>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={supplierForm.display_name}
                      onChange={e => setSupplierForm(prev => ({ ...prev, display_name: e.target.value }))}
                      placeholder="Supplier name"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                    <input
                      type="text"
                      value={supplierForm.phone_number}
                      onChange={e => setSupplierForm(prev => ({ ...prev, phone_number: e.target.value }))}
                      placeholder="Phone (optional)"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                    <textarea
                      value={supplierForm.note}
                      onChange={e => setSupplierForm(prev => ({ ...prev, note: e.target.value }))}
                      placeholder="Note (optional)"
                      rows={2}
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                    <button
                      type="button"
                      onClick={handleSupplierSubmit}
                      disabled={!supplierForm.display_name.trim()}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white min-h-[44px] disabled:opacity-40"
                      style={{ background: '#C4883A' }}
                    >
                      Save supplier
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(supplierSummaries || []).map(supplier => (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => setSupplierTxForm(prev => ({ ...prev, supplier_id: String(supplier.id) }))}
                        className="w-full text-left p-3 rounded-xl border"
                        style={{
                          background: String(supplierTxForm.supplier_id) === String(supplier.id) ? 'rgba(196,136,58,0.12)' : '#FAF8F5',
                          borderColor: String(supplierTxForm.supplier_id) === String(supplier.id) ? '#C4883A' : 'var(--color-border)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-gray-800">{supplier.display_name}</p>
                            <p className="text-xs text-gray-500">{supplier.transaction_count || 0} entries</p>
                          </div>
                          <p className="text-sm font-black" style={{ color: '#9a3412' }}>{fmt(Math.max(supplier.balance || 0, 0))} {t.birr}</p>
                        </div>
                      </button>
                    ))}
                    {(supplierSummaries || []).length === 0 && (
                      <p className="text-xs text-gray-400">No suppliers saved yet.</p>
                    )}
                  </div>
                  <div className="p-4 rounded-2xl" style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setSupplierTxForm(prev => ({ ...prev, type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD }))}
                        className="py-3 rounded-xl text-sm font-bold"
                        style={{
                          background: supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? '#C4883A' : '#fff',
                          color: supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? '#fff' : '#6b7280',
                          border: '1px solid #e8e2d8',
                        }}
                      >
                        Add purchase dubie
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupplierTxForm(prev => ({ ...prev, type: SUPPLIER_TRANSACTION_TYPES.PAYMENT }))}
                        className="py-3 rounded-xl text-sm font-bold"
                        style={{
                          background: supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT ? '#2d6a4f' : '#fff',
                          color: supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT ? '#fff' : '#6b7280',
                          border: '1px solid #e8e2d8',
                        }}
                      >
                        Record payment
                      </button>
                    </div>
                    <select
                      value={supplierTxForm.supplier_id}
                      onChange={e => setSupplierTxForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                      className="w-full mb-3 px-4 py-3 border-2 rounded-xl text-sm bg-white focus:outline-none"
                      style={{ borderColor: '#e8e2d8' }}
                    >
                      <option value="">Choose supplier</option>
                      {(supplierSummaries || []).map(supplier => (
                        <option key={supplier.id} value={supplier.id}>{supplier.display_name}</option>
                      ))}
                    </select>
                    {supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD && (
                      <>
                        {activeCatalogEntries.length > 0 && (
                          <select
                            value={supplierTxForm.catalog_entry_id}
                            onChange={e => {
                              const value = e.target.value;
                              const selectedCatalog = activeCatalogEntries.find(entry => String(entry.id) === String(value));
                              setSupplierTxForm(prev => ({
                                ...prev,
                                catalog_entry_id: value,
                                item_name: prev.item_name || selectedCatalog?.name || '',
                              }));
                            }}
                            className="w-full mb-3 px-4 py-3 border-2 rounded-xl text-sm bg-white focus:outline-none"
                            style={{ borderColor: '#e8e2d8' }}
                          >
                            <option value="">Choose saved item / service</option>
                            {activeCatalogEntries.map(entry => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name} {entry.kind === 'service' ? '• Service' : '• Item'}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={supplierTxForm.item_name}
                          onChange={e => setSupplierTxForm(prev => ({ ...prev, item_name: e.target.value }))}
                          placeholder="Item or service bought"
                          className="w-full mb-3 px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                          style={{ borderColor: '#e8e2d8' }}
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={supplierTxForm.quantity}
                          onChange={e => setSupplierTxForm(prev => ({ ...prev, quantity: e.target.value }))}
                          placeholder="Quantity"
                          className="w-full mb-3 px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                          style={{ borderColor: '#e8e2d8' }}
                        />
                      </>
                    )}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={supplierTxForm.amount}
                      onChange={e => setSupplierTxForm(prev => ({ ...prev, amount: e.target.value.replace(/[^\d.,]/g, '') }))}
                      placeholder={supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? 'Total amount owed' : 'Amount paid'}
                      className="w-full mb-3 px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                    <textarea
                      value={supplierTxForm.note}
                      onChange={e => setSupplierTxForm(prev => ({ ...prev, note: e.target.value }))}
                      placeholder="Note (optional)"
                      rows={2}
                      className="w-full mb-3 px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                      style={{ borderColor: '#e8e2d8' }}
                    />
                    {selectedSupplier && (
                      <p className="text-xs mb-3" style={{ color: '#6b7280' }}>
                        Remaining dubie for {selectedSupplier.display_name}: {fmt(Math.max(selectedSupplier.balance || 0, 0))} {t.birr}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleSupplierTransactionSubmit}
                      disabled={!supplierTxForm.supplier_id || !parseFloat(parseInput(supplierTxForm.amount || '')) || (supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD && !supplierTxForm.item_name.trim() && !supplierTxForm.catalog_entry_id)}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white min-h-[44px] disabled:opacity-40"
                      style={{ background: supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? '#C4883A' : '#2d6a4f' }}
                    >
                      {supplierTxForm.id
                        ? 'Update supplier transaction'
                        : (supplierTxForm.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? 'Save purchase dubie' : 'Save payment')}
                    </button>
                    {supplierTxForm.id && (
                      <button
                        type="button"
                        onClick={resetSupplierTxForm}
                        className="w-full mt-2 py-3 rounded-xl text-sm font-bold min-h-[44px]"
                        style={{ background: '#f5f5f5', color: '#6b7280' }}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                  {selectedSupplier?.transactions?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold tracking-wide uppercase text-gray-500">Recent supplier entries</p>
                      {selectedSupplier.transactions.slice(0, 6).map(entry => (
                        <div key={entry.id} className="p-3 rounded-xl border" style={{ background: '#fff', borderColor: 'var(--color-border)' }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-800">
                                {entry.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? (entry.item_name || 'Purchase') : 'Payment'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {formatEthiopian(entry.created_at)}
                                {entry.quantity ? ` · x${entry.quantity}` : ''}
                              </p>
                              {entry.note && <p className="text-xs text-gray-400 mt-1">{entry.note}</p>}
                            </div>
                            <p className="text-sm font-black" style={{ color: entry.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? '#9a3412' : '#166534' }}>
                              {entry.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? '+' : '-'}{fmt(entry.amount || 0)} {t.birr}
                            </p>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => handleEditSupplierTransaction(entry)}
                              className="flex-1 py-2 rounded-lg text-xs font-bold"
                              style={{ background: 'rgba(27,67,50,0.08)', color: '#1B4332' }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setSupplierDeleteTarget(entry)}
                              className="flex-1 py-2 rounded-lg text-xs font-bold"
                              style={{ background: '#fff1f2', color: '#dc2626' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.about}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl" style={{ background: 'rgba(196,136,58,0.12)' }}>
              📒
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">ገበያ — Gebya</div>
              <div className="text-xs text-gray-500 mt-0.5">Business Notebook for Ethiopian shopkeepers</div>
              <div className="text-xs text-gray-400 mt-1">{t.worksOffline}</div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-green-100/30 flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-700 flex-shrink-0" />
            <p className="text-xs text-gray-500">{t.privacyNote}</p>
          </div>
        </div>
      </section>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">{t.clearConfirm}</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {t.clearConfirmMsg.replace('{count}', totalEntries).replace('{credits}', totalCustomersWithLedger)}
            </p>
            <div className="space-y-2">
              <button onClick={clearAllData} className="w-full p-4 bg-red-500 text-white rounded-2xl font-bold min-h-[52px]">
                {t.yesDelete}
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#f5f5f5', color: '#374151' }}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {supplierDeleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">🧾</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Delete supplier transaction?</h3>
            <p className="text-sm text-gray-500 text-center mb-2">
              You are deleting this {supplierDeleteTarget.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? 'purchase dubie' : 'payment'} transaction.
            </p>
            <p className="text-sm text-gray-700 text-center mb-6">
              "{supplierDeleteTarget.item_name || 'Payment'}" · {fmt(supplierDeleteTarget.amount || 0)} {t.birr}
            </p>
            <div className="space-y-2">
              <button
                onClick={handleConfirmDeleteSupplierTransaction}
                className="w-full p-4 bg-red-500 text-white rounded-2xl font-bold min-h-[52px]"
              >
                Delete transaction
              </button>
              <button
                onClick={() => setSupplierDeleteTarget(null)}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {cleared && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="text-4xl mb-3">🗑️</div>
            <p className="font-bold text-gray-800">{t.dataCleared}</p>
            <p className="text-sm text-gray-500 mt-1">{t.reloading}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
