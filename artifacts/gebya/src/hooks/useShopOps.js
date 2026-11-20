import { useCallback } from 'react';
import db, { getIdentity, setIdentity } from '../db';
import { fireToast } from '../components/Toast';
import {
  buildDefaultChannels,
  migrateLegacyToChannels,
  deriveLegacyFromChannels,
  normalizeChannelsForSave,
  addCustomChannel,
} from '../utils/paymentChannels';
import { getAuthToken } from '../utils/syncEngine';
import identityApi from '../api/identity';
import { label } from '../labels/index.js';

export function useShopOps({ shopProfile, setShopProfile, setEnabledProviders, setOnboardingType, setCatalogEntries, setCustomQuickAmounts, fireToast, lang }) {

  const handleSavePaymentChannels = useCallback(async (channels) => {
    const normalized = normalizeChannelsForSave(channels || []);
    setShopProfile({
      ...(shopProfile || {}),
      paymentChannels: normalized,
      payments: deriveLegacyFromChannels(normalized).payments,
    });
    const derived = deriveLegacyFromChannels(normalized);
    setEnabledProviders(derived.enabledProviders || { banks: [], wallets: [] });

    try {
      await db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(normalized) });
      await db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(derived.enabledProviders) });
      await db.settings.put({ key: 'custom_banks', value: JSON.stringify(derived.customBanks) });
      await db.settings.put({ key: 'custom_wallets', value: JSON.stringify(derived.customWallets) });
      await db.settings.put({ key: 'shop_pay_telebirr', value: derived.payments.telebirr });
      await db.settings.put({ key: 'shop_pay_cbe_phone', value: derived.payments.cbe_phone });
      await db.settings.put({ key: 'shop_pay_cbe_account', value: derived.payments.cbe_account });
      await db.settings.put({ key: 'shop_pay_awash_phone', value: derived.payments.awash_phone });
      await db.settings.put({ key: 'shop_pay_bank_name', value: derived.payments.bank_name });
      await db.settings.put({ key: 'shop_pay_bank_account', value: derived.payments.bank_account });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Payment channels save failed:', err);
    }
  }, [shopProfile, setShopProfile, setEnabledProviders]);

  const handleQuickAddProvider = useCallback((kind, name) => {
    const channels = shopProfile?.paymentChannels || [];
    const before = channels.length;
    const updated = addCustomChannel(channels, { kind, name });
    if (updated.length === before) {
      fireToast(label('common.already-exists', lang), 1800);
      return;
    }
    handleSavePaymentChannels(updated);
  }, [shopProfile, handleSavePaymentChannels, fireToast, lang]);

  const handleProfileSave = useCallback(async (name, phone, telegram) => {
    await db.settings.put({ key: 'shop_name', value: name });
    await db.settings.put({ key: 'shop_phone', value: phone || '' });
    await db.settings.put({ key: 'shop_telegram', value: telegram || '' });

    setShopProfile({
      ...(shopProfile || {}),
      name,
      phone: phone || '',
      telegram: telegram || '',
      paymentChannels: shopProfile?.paymentChannels,
      payments: shopProfile?.payments,
    });
  }, [shopProfile, setShopProfile]);

  const handleRotateJoinCode = useCallback(async (shopId) => {
    try {
      const token = await getAuthToken();
      if (!token) return { error: label('common.you-need-to-be-signed-in-connected-to-the', lang) };
      const result = await identityApi.rotateJoinCode(shopId, token);
      const current = shopProfile || {};
      setShopProfile(current ? { ...current, join_code: result.join_code, join_url: result.join_url } : current);
      // Persist to the local identity so the owner still sees the (rotated) code after a reload.
      // The backend only returns join_code on create/rotate, never on a plain GET.
      try {
        const identity = await getIdentity();
        if (identity) {
          await setIdentity({ ...identity, join_code: result.join_code, join_url: result.join_url });
        }
      } catch { /* non-critical — in-session display already updated above */ }
      return result;
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Unknown error';
      return { error: String(msg) };
    }
  }, [shopProfile, setShopProfile]);

  const handleUpdateShopSettings = useCallback(async (shopId, patch) => {
    try {
      const token = await getAuthToken();
      if (!token) return null;
      return identityApi.updateShopSettings(shopId, {
        phone_required: patch.require_phone_on_join,
        approval_required: patch.require_approval,
      }, token);
    } catch {
      return null;
    }
  }, []);

  const handleCustomQuickAmountsChange = useCallback(async (nextList) => {
    const clean = Array.from(new Set((nextList || [])
      .filter(n => typeof n === 'number' && n > 0 && Number.isFinite(n))
    )).slice(-8);
    setCustomQuickAmounts(clean);
    try {
      await db.settings.put({ key: 'custom_quick_amounts', value: JSON.stringify(clean) });
    } catch {
      // non-critical
    }
  }, [setCustomQuickAmounts]);

  const handleSaveCatalogEntry = useCallback(async (payload) => {
    const now = Date.now();
    const entry = {
      name: String(payload.name || '').trim(),
      kind: payload.kind === 'service' ? 'service' : 'item',
      default_price: payload.default_price != null && payload.default_price !== '' ? Number(payload.default_price) : null,
      default_cost: payload.default_cost != null && payload.default_cost !== '' ? Number(payload.default_cost) : null,
      note: payload.note ? String(payload.note).trim() : null,
      active: payload.active !== false,
      created_at: payload.created_at || now,
      updated_at: now,
    };

    if (!entry.name) return null;

    if (payload.id) {
      await db.catalog_entries.update(payload.id, entry);
      const saved = await db.catalog_entries.get(payload.id);
      setCatalogEntries(prev => prev.map(item => item.id === payload.id ? saved : item));
      return saved;
    }

    const id = await db.catalog_entries.add(entry);
    const saved = await db.catalog_entries.get(id);
    setCatalogEntries(prev => [...prev, saved]);
    return saved;
  }, [setCatalogEntries]);

  const handleToggleCatalogEntryActive = useCallback(async (entry) => {
    if (!entry?.id) return;
    const updatedAt = Date.now();
    await db.catalog_entries.update(entry.id, { active: entry.active === false, updated_at: updatedAt });
    setCatalogEntries(prev => prev.map(item => (
      item.id === entry.id ? { ...item, active: item.active === false, updated_at: updatedAt } : item
    )));
  }, [setCatalogEntries]);

  const handleOnboardingComplete = useCallback((profile) => {
    if (profile?.__staff_join) {
      setOnboardingType('staff');
      return;
    }
    const defaults = buildDefaultChannels();
    setShopProfile({
      ...profile,
      id: profile?.id || profile?.shop_id || null,
      shop_id: profile?.shop_id || profile?.id || null,
      telegram: profile?.telegram || '',
      role: profile?.role || 'owner',
      paymentChannels: profile?.paymentChannels || defaults,
      payments: profile?.payments || deriveLegacyFromChannels(defaults).payments,
    });
    db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(defaults) })
      .catch(() => { /* non-critical */ });
  }, [setShopProfile, setOnboardingType]);

  const handleStaffJoined = useCallback((identity) => {
    setOnboardingType(null);
    setShopProfile({
      id: identity?.shop_id || null,
      shop_id: identity?.shop_id || null,
      name: identity?.shop_name || 'Gebya',
      phone: identity?.phone_number || '',
      telegram: '',
      role: identity?.role || 'staff',
      paymentChannels: buildDefaultChannels(),
      payments: deriveLegacyFromChannels(buildDefaultChannels()).payments,
    });
  }, [setShopProfile, setOnboardingType]);

  return {
    handleSavePaymentChannels,
    handleQuickAddProvider,
    handleProfileSave,
    handleRotateJoinCode,
    handleUpdateShopSettings,
    handleCustomQuickAmountsChange,
    handleSaveCatalogEntry,
    handleToggleCatalogEntryActive,
    handleOnboardingComplete,
    handleStaffJoined,
  };
}