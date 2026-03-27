import { useState, useEffect } from 'react';
import { Eye, EyeOff, Download, Trash2, Info, Shield, ChevronRight, Store, Phone, Check, CreditCard, RefreshCw, Plus, MessageCircle, X, TrendingUp, TrendingDown, Share2 } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { useLang } from '../context/LangContext';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt } from '../utils/numformat';
import db from '../db';
import { ALL_BANKS, ALL_WALLETS } from './PaymentTypeChips';
import { BADGE_DEFINITIONS } from '../utils/badges';
import { fireToast } from './Toast';

const FREQ_LABELS_EN = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQ_LABELS_AM = { daily: 'ዕለታዊ', weekly: 'ሳምንታዊ', monthly: 'ወርሃዊ' };

function SettingsPage({
  transactions,
  todayTransactions,
  customerSummaries,
  shopProfile,
  onProfileSave,
  enabledProviders,
  onProvidersChange,
  recurringExpenses,
  onRecurringChange,
  usageStats,
  earnedBadges,
  onShareToday,
}) {
  const { hidden, toggle } = usePrivacy();
  const { lang, t } = useLang();
  const FREQ_LABELS = lang === 'am' ? FREQ_LABELS_AM : FREQ_LABELS_EN;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);

  const [editName, setEditName] = useState(shopProfile?.name || '');
  const [editPhoneDigits, setEditPhoneDigits] = useState(() => {
    const raw = shopProfile?.phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [editTelegram, setEditTelegram] = useState(shopProfile?.telegram || '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const phoneValid = /^[79]\d{8}$/.test(editPhoneDigits);
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

  const handleProfileSave = async () => {
    if (!editName.trim() || !phoneValid) return;
    const fullPhone = '+251' + editPhoneDigits;
    await onProfileSave(editName.trim(), fullPhone, editTelegram.trim());
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const exportToCSV = () => {
    const headers = ['Date (Ethiopian)', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Cost (birr)', 'Profit (birr)', 'Payment', 'Customer'];
    const rows = transactions.map(tx => [
      formatEthiopian(tx.created_at),
      tx.type,
      `"${tx.item_name || ''}"`,
      tx.quantity || 1,
      tx.amount || 0,
      tx.cost_price || '',
      tx.profit !== null && tx.profit !== undefined ? tx.profit : '',
      [tx.payment_type, tx.payment_provider].filter(Boolean).join(' ') || '',
      `"${tx.customer_name || ''}"`,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gebya-backup-${new Date().toISOString().split('T')[0]}.csv`;
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
      `🛒 Entries: ${fc.sales || 0} sales · ${fc.expenses || 0} expenses · ${fc.credits || 0} credits`,
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
  const currentFullPhone = '+251' + editPhoneDigits;
  const profileChanged = (
    editName.trim() !== (shopProfile?.name || '') ||
    currentFullPhone !== (shopProfile?.phone || '') ||
    editTelegram.trim() !== (shopProfile?.telegram || '')
  );

  const badgeList = (earnedBadges || []);

  const todaySales = (todayTransactions || []).filter(tx => tx.type === 'sale');
  const todayExpenses = (todayTransactions || []).filter(tx => tx.type === 'expense');
  const todayRevenue = todaySales.reduce((s, tx) => s + (tx.amount || 0), 0);
  const todayCostOfGoods = todaySales.reduce((s, tx) => s + ((tx.cost_price || 0) * (tx.quantity || 1)), 0);
  const todayExpTotal = todayExpenses.reduce((s, tx) => s + (tx.amount || 0), 0);
  const todayHasCost = todaySales.some(tx => tx.cost_price > 0);
  const todayProfit = todayRevenue - todayCostOfGoods - todayExpTotal;

  return (
    <div className="space-y-5 pb-4">

      {(todayTransactions && todayTransactions.length > 0) && (
        <section>
          <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.todaysBreakdown}</h2>
          <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
            <div className="px-4 py-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5" style={{ color: '#6b7280' }}>
                  <TrendingUp className="w-3.5 h-3.5 text-green-600" /> {t.salesLabel}
                </span>
                <span className="font-bold" style={{ color: '#15803d' }}>{fmt(todayRevenue)} {t.birr}</span>
              </div>

              {todayExpTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1.5" style={{ color: '#6b7280' }}>
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" /> {t.expenses}
                  </span>
                  <span className="font-bold text-red-500">-{fmt(todayExpTotal)} {t.birr}</span>
                </div>
              )}

              {todayHasCost && (
                <>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: '#6b7280' }}>{t.costOfGoods}</span>
                    <span className="font-bold" style={{ color: '#ea580c' }}>-{fmt(todayCostOfGoods)} {t.birr}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="font-bold" style={{ color: '#374151' }}>{t.netProfit}</span>
                    <span className={`font-black ${todayProfit >= 0 ? 'text-green-700' : 'text-red-500'}`}>
                      {todayProfit >= 0 ? '+' : ''}{fmt(todayProfit)} {t.birr}
                    </span>
                  </div>
                </>
              )}

              {!todayHasCost && !todayExpTotal && (
                <p className="text-xs" style={{ color: '#9ca3af' }}>{t.advancedHint}</p>
              )}
            </div>
          </div>
        </section>
      )}

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
              {onShareToday && (
                <button
                  onClick={onShareToday}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 min-h-[44px]"
                  style={{ background: '#1B4332' }}
                >
                  <Share2 className="w-4 h-4" />
                  {t.shareReportBtn}
                </button>
              )}
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
                style={{ borderColor: '#e8e2d8' }}
              />
            </div>
            <button
              onClick={handleProfileSave}
              disabled={!editName.trim() || !phoneValid || (!profileChanged && !profileSaved)}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{
                background: profileSaved ? '#15803d' : (editName.trim() && phoneValid && profileChanged ? '#C4883A' : '#e5e7eb'),
                color: (editName.trim() && phoneValid && (profileChanged || profileSaved)) ? '#fff' : '#9ca3af',
              }}
            >
              {profileSaved ? <><Check className="w-4 h-4" /> {t.saved}</> : t.saveChanges}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.privacy}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-green-50 transition-colors min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: hidden ? 'rgba(196,136,58,0.12)' : '#dcfce7' }}>
              {hidden ? <EyeOff className="w-5 h-5 text-green-800" /> : <Eye className="w-5 h-5 text-green-700" />}
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-gray-800">{t.hideAmounts}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {hidden ? t.totalsHidden : t.totalsVisible}
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 flex items-center px-1 ${hidden ? 'bg-green-700' : 'bg-gray-200'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${hidden ? 'translate-x-6' : 'translate-x-0'}`} />
            </div>
          </button>
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
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.recurringExpenses}</h2>
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
        <h2 className="text-xs font-bold tracking-widest uppercase text-green-800 mb-2 px-1">{t.yourData}</h2>
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f0fdf4' }}>
              <Info className="w-5 h-5 text-green-700" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">{t.storedOnDevice}</div>
              <div className="text-xs text-gray-500 mt-0.5">{totalEntries} entries · {totalCustomersWithLedger} customers in credit ledger</div>
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
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-red-50 transition-colors min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fff1f2' }}>
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-red-600">{t.clearAll}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t.clearHint}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </button>
        </div>
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
