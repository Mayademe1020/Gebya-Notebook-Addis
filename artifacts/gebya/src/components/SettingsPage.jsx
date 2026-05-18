import { useState, useEffect } from 'react';
import { Download, Trash2, Info, Shield, ChevronRight, Store, Phone, Check, CreditCard, RefreshCw, Plus, MessageCircle, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt, parseInput } from '../utils/numformat';
import db from '../db';
import { ALL_BANKS, ALL_WALLETS } from './PaymentTypeChips';
import { fireToast } from './Toast';
import { normalizeTelegram } from '../utils/customerTelegram';
import PwaInstallPanel from './PwaInstallPanel.jsx';
import { SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';
import { BUSINESS_TYPE_OPTIONS, getTemplatesForType } from '../utils/itemTemplates';

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
  onSaveCatalogEntry,
  onToggleCatalogEntryActive,
  onCatalogRefresh,
  onSaveSupplier,
  onSaveSupplierTransaction,
  onUpdateSupplierTransaction,
  onDeleteSupplierTransaction,
  pwa,
  earnedBadges,
}) {
  const { lang, toggleLang, t } = useLang();
  const FREQ_LABELS = lang === 'am' ? FREQ_LABELS_AM : FREQ_LABELS_EN;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [lastBackupTime, setLastBackupTime] = useState(null);
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
  const [showAddCommonItems, setShowAddCommonItems] = useState(false);

  const [editName, setEditName] = useState(shopProfile?.name || '');
  const [editPhoneDigits, setEditPhoneDigits] = useState(() => {
    const raw = shopProfile?.phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [editTelegram, setEditTelegram] = useState(shopProfile?.telegram || '');
  const [editAddress, setEditAddress] = useState(shopProfile?.address || '');
  const [editBusinessType, setEditBusinessType] = useState(shopProfile?.businessType || '');
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
      const lbRow = await db.settings.get('last_backup_time');
      const addrRow = await db.settings.get('shop_address');
      const btRow = await db.settings.get('shop_business_type');
      if (addrRow?.value) setEditAddress(addrRow.value);
      if (btRow?.value) setEditBusinessType(btRow.value);
      if (cbRow?.value) {
        try { setCustomBanks(JSON.parse(cbRow.value)); } catch { /* ignore */ }
      }
      if (cwRow?.value) {
        try { setCustomWallets(JSON.parse(cwRow.value)); } catch { /* ignore */ }
      }
      if (lbRow?.value) {
        setLastBackupTime(Number(lbRow.value));
      }
    };
    load();
  }, []);

  const [recurring, setRecurring] = useState(recurringExpenses || []);
  const [reName, setReName] = useState('');
  const [reAmount, setReAmount] = useState('');
  const [reFreq, setReFreq] = useState('monthly');
  const [showReForm, setShowReForm] = useState(false);

  const activeCatalogEntries = (catalogEntries || []).filter(entry => entry.active !== false);
  const selectedSupplier = (supplierSummaries || []).find(item => String(item.id) === String(supplierTxForm.supplier_id)) || null;

  const handleProfileSave = async () => {
    if (!editName.trim() || !phoneValid || !telegramValid) return;
    const fullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
    await onProfileSave(editName.trim(), fullPhone, normalizedTelegram || '', editAddress.trim(), editBusinessType);
    setEditTelegram(normalizedTelegram || '');
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleAddCommonItems = async () => {
    const templates = getTemplatesForType(editBusinessType);
    if (!templates || templates.length === 0) {
      fireToast(t.itemsAlreadyExist || 'No templates for this business type');
      return;
    }
    const existingNames = new Set((catalogEntries || []).map(e => e.name.toLowerCase()));
    const toAdd = templates.filter(tpl => !existingNames.has(tpl.name.toLowerCase()));
    if (toAdd.length === 0) {
      fireToast(t.itemsAlreadyExist || 'These items are already in your catalog');
      setShowAddCommonItems(false);
      return;
    }
    for (const tpl of toAdd) {
      await db.catalog_entries.add({
        name: tpl.name,
        kind: tpl.kind,
        default_price: 0,
        default_cost: 0,
        note: '',
        active: true,
        created_at: Date.now(),
      });
    }
    fireToast(t.itemsAddedSuccess || `${toAdd.length} items added`);
    setShowAddCommonItems(false);
    if (onCatalogRefresh) onCatalogRefresh();
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

  const handleExport = async () => {
     if (totalEntries === 0) return;
     await exportToCSV();
   };

   const exportToCSV = async () => {
     const [customerRows, customerTransactionRows, supplierRows, supplierTransactionRows] = await Promise.all([
       db.customers.toArray(),
       db.customer_transactions.toArray(),
       db.suppliers?.toArray?.() || [],
       db.supplier_transactions?.toArray?.() || [],
     ]);

      const decrypt = null;

      const maybeDecrypt = async (val) => val;

     const transactionSection = buildCsvSection(
       'Transactions',
       ['Date (Ethiopian)', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Cost (birr)', 'Profit (birr)', 'Payment', 'Customer'],
       await Promise.all(transactions.map(async tx => [
         formatEthiopian(tx.created_at),
         tx.type,
         await maybeDecrypt(tx.item_name) || '',
         tx.quantity || 1,
         tx.amount || 0,
         tx.cost_price || '',
         tx.profit !== null && tx.profit !== undefined ? tx.profit : '',
         [tx.payment_type, tx.payment_provider].filter(Boolean).join(' ') || '',
         await maybeDecrypt(tx.customer_name) || '',
       ]))
     );

     const customerSection = buildCsvSection(
       'Customers',
       ['ID', 'Name', 'Phone', 'Note', 'Telegram', 'Telegram notify enabled', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
       await Promise.all(customerRows.map(async customer => [
         customer.id,
         await maybeDecrypt(customer.display_name) || '',
         await maybeDecrypt(customer.phone_number) || '',
         customer.note || '',
         customer.telegram_username || '',
         customer.telegram_notify_enabled ? 'yes' : 'no',
         customer.created_at ? formatEthiopian(customer.created_at) : '',
         customer.updated_at ? formatEthiopian(customer.updated_at) : '',
       ]))
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
       await Promise.all(supplierRows.map(async supplier => [
         supplier.id,
         await maybeDecrypt(supplier.display_name) || '',
         await maybeDecrypt(supplier.phone_number) || '',
         supplier.note || '',
         supplier.active === false ? 'no' : 'yes',
         supplier.created_at ? formatEthiopian(supplier.created_at) : '',
         supplier.updated_at ? formatEthiopian(supplier.updated_at) : '',
       ]))
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
      const now = Date.now();
      setLastBackupTime(now);
      await db.settings.put({ key: 'last_backup_time', value: String(now) });
    };

const clearAllData = async () => {
     // Require typed confirmation
     if (clearConfirmText !== 'DELETE') {
       fireToast(t.typeDeleteConfirm || 'Type DELETE to confirm', 2200);
       return;
     }
     await Promise.all([
       db.transactions.clear(),
       db.customers.clear(),
       db.customer_transactions.clear(),
       db.catalog_entries.clear(),
       db.suppliers.clear(),
       db.supplier_transactions.clear(),
       db.credit_records?.clear?.() || Promise.resolve(),
       db.credit_payment_logs?.clear?.() || Promise.resolve(),
       db.analytics?.clear?.() || Promise.resolve(),
       db.settings.delete('last_saved_snapshot'),
     ]);
     // Also clear localStorage drafts
     try { localStorage.removeItem('gebya_sale_draft'); } catch {}
     setCleared(true);
     setShowClearConfirm(false);
     setClearConfirmText('');
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
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> {t.shopAddress} <span className="text-gray-400 font-normal">{t.shopAddressOptional}</span>
              </label>
              <input
                type="text"
                value={editAddress}
                onChange={e => setEditAddress(e.target.value)}
                placeholder={t.shopAddressPlaceholder}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                style={{ borderColor: '#e8e2d8' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> {t.editBusinessType} <span className="text-gray-400 font-normal">{t.onboardBusinessTypeOptional}</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {BUSINESS_TYPE_OPTIONS.map((option) => {
                  const active = editBusinessType === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setEditBusinessType(option)}
                      className="px-2.5 py-1.5 border text-xs font-bold min-h-[32px] transition-all"
                      style={{
                        borderRadius: '999px',
                        borderColor: active ? '#C4883A' : '#e8e2d8',
                        background: active ? 'rgba(196,136,58,0.1)' : '#FAF8F5',
                        color: active ? '#C4883A' : '#4b5563',
                      }}
                    >
                      {t[`businessType${option.charAt(0).toUpperCase()}${option.slice(1)}`] || option}
                    </button>
                  );
                })}
              </div>
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

      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.language}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{lang === 'am' ? 'አማርኛ' : 'English'}</span>
            <button
              onClick={toggleLang}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white min-h-[40px]"
              style={{ background: '#C4883A' }}
            >
              {lang === 'am' ? 'English' : 'አማርኛ'}
            </button>
          </div>
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
              {lastBackupTime && (
                <div className="text-xs mt-1 font-medium" style={{ color: '#15803d' }}>
                  {t.lastBackup}: {formatEthiopian(lastBackupTime)}
                </div>
              )}
              {!lastBackupTime && (
                <div className="text-xs mt-1 font-medium" style={{ color: '#dc2626' }}>
                  {t.noBackupYet}
                </div>
              )}
            </div>
          </div>

<button
             onClick={handleExport}
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
             onClick={() => { setShowClearConfirm(true); setClearConfirmText(''); }}
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

          {showClearConfirm && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade">
              <div className="bg-white w-full max-w-md p-6 pb-8 animate-elastic" style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}>
                <h2 className="text-lg font-black text-gray-900 mb-2">{t.clearConfirm || 'Clear all data?'}</h2>
                <p className="text-sm text-gray-500 mb-4">
                  {t.clearConfirmMsg || 'This will permanently delete all your data. This cannot be undone.'}
                </p>

                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-600 mb-1">{t.typeDeleteConfirm || 'Type DELETE to confirm'}</label>
                  <input
                    type="text"
                    value={clearConfirmText}
                    onChange={e => setClearConfirmText(e.target.value.trim())}
                    placeholder="DELETE"
                    className="w-full px-3 py-2 border rounded-lg text-sm font-bold text-red-600 focus:outline-none"
                    style={{ borderColor: clearConfirmText === 'DELETE' ? '#15803d' : '#e8e2d8' }}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold min-h-[44px]"
                    style={{ background: '#f5f5f5', color: '#6b7280' }}
                  >
                    {t.cancel || 'Cancel'}
                  </button>
                  <button
                    onClick={clearAllData}
                    disabled={clearConfirmText !== 'DELETE'}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px] ${
                      clearConfirmText === 'DELETE'
                        ? 'bg-red-600' : 'bg-gray-400'
                    }`}
                    style={{ cursor: clearConfirmText === 'DELETE' ? 'pointer' : 'not-allowed' }}
                  >
                    {t.yesDelete || 'Delete Everything'}
                  </button>
                </div>
              </div>
            </div>
          )}
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

            {/* Frequent Expenses — moved from main surface; feature and quick-fill data intact */}
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

            <PwaInstallPanel pwa={pwa} variant="settings" />

            {/* Items & Services — used by sale/expense quick-pick dropdowns; kept in More for pilot */}
            <section>
              <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">Items & Services</h2>
              <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
                {editBusinessType && (
                  <div className="px-5 pt-4 pb-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCommonItems(true)}
                      className="w-full py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[44px]"
                      style={{
                        borderColor: '#C4883A',
                        background: 'rgba(196,136,58,0.08)',
                        color: '#C4883A',
                      }}
                    >
                      {t.addCommonItems || 'Add common items'}
                    </button>
                    <p className="text-xs text-gray-400 mt-1">{t.addCommonItemsHint || 'Quick-fill your catalog with items for your business type'}</p>
                  </div>
                )}
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

            {/*
              Supplier Dubie is intentionally hidden from My Shop pending relocation
              into a future two-sided Dubie ledger (To Collect / To Pay).
              All supplier data, handlers, and DB logic are preserved.
            */}

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

      {showAddCommonItems && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{t.addCommonItems || 'Add common items'}</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              {t.addCommonItemsHint || 'This will add common items for your business type to your catalog.'}
            </p>
            <div className="space-y-2">
              <button
                onClick={handleAddCommonItems}
                className="w-full p-4 text-white rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#C4883A' }}
              >
                {t.add || 'Add items'}
              </button>
              <button
                onClick={() => setShowAddCommonItems(false)}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
