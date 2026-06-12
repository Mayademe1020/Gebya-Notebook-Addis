// paymentChannels.js — Unified payment-channels model (Commit C.4)
//
// Replaces the split between "enabled_payment_methods" (sale-form filter)
// and "shop_pay_*" (Pay-it-now URL data). One row per payment channel,
// each with its own enabled toggle + account fields.
//
// Stored under db.settings key "shop_payment_channels" as JSON.
// Legacy keys (enabled_payment_methods, custom_banks, custom_wallets,
// shop_pay_*) are kept in sync as a compat shim so PaymentTypeChips
// and ReminderSheet continue to work without changes.
//
// Channel object shape:
//   {
//     id: string,            // stable slug — 'telebirr', 'cbe_birr', 'bank_cbe', 'custom_w_xyz'
//     kind: 'wallet' | 'bank',
//     name: string,          // human label
//     enabled: boolean,      // appears in sale dropdown + Pay-it-now URL
//     phone: string,         // E.164 if set (wallets + CBE Birr)
//     account: string,       // bank account number (banks + CBE Birr)
//     usePhoneFromShop: bool,// telebirr-style: phone defaults to shop_phone
//     custom: boolean,       // true when user-added (not a built-in)
//   }

import { normalizeEthiopianPhone, extractSubscriberDigits } from './phoneNumber';

// ─── built-in channel registry ────────────────────────────────────────

// Order matters — this is how channels render in Settings and PayPage.
// Mobile money first (highest usage in Ethiopia), then banks alphabetical.
export const DEFAULT_CHANNEL_DEFINITIONS = [
  // ─── Mobile wallets ─────────────────────────────────────────
  { id: 'telebirr',     kind: 'wallet', name: 'telebirr',     emoji: '💛', ussd: '*127#' },
  { id: 'cbe_birr',     kind: 'wallet', name: 'CBE Birr',     emoji: '💜', ussd: '*847#' },
  { id: 'awash_mobile', kind: 'wallet', name: 'Awash Mobile', emoji: '🟡', ussd: '*901#' },
  { id: 'mbirr',        kind: 'wallet', name: 'M-Birr',       emoji: '🟢', ussd: '*818#' },
  // ─── Banks ──────────────────────────────────────────────────
  { id: 'bank_cbe',         kind: 'bank', name: 'CBE',                emoji: '🏦' },
  { id: 'bank_dashen',      kind: 'bank', name: 'Dashen',             emoji: '🏦' },
  { id: 'bank_awash',       kind: 'bank', name: 'Awash Bank',         emoji: '🏦' },
  { id: 'bank_abyssinia',   kind: 'bank', name: 'Abyssinia',          emoji: '🏦' },
  { id: 'bank_zemen',       kind: 'bank', name: 'Zemen',              emoji: '🏦' },
  { id: 'bank_hibret',      kind: 'bank', name: 'Hibret',             emoji: '🏦' },
];

export function getChannelDefinition(id) {
  return DEFAULT_CHANNEL_DEFINITIONS.find(d => d.id === id) || null;
}

// ─── helpers ──────────────────────────────────────────────────────────

function slugify(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Build a fresh default channel set (used when no prior data exists).
 * telebirr defaults enabled with usePhoneFromShop=true. CBE bank enabled too
 * (most common bank in Ethiopia). Others off until user opts in.
 */
export function buildDefaultChannels() {
  return DEFAULT_CHANNEL_DEFINITIONS.map((def) => ({
    id: def.id,
    kind: def.kind,
    name: def.name,
    enabled: def.id === 'telebirr' || def.id === 'bank_cbe',
    phone: '',
    account: '',
    usePhoneFromShop: def.id === 'telebirr',
    custom: false,
  }));
}

// ─── migration from legacy storage ────────────────────────────────────

/**
 * Read legacy Dexie rows and produce a unified channels[] array.
 * Used once on first load after C.4 ships — the result then becomes the
 * canonical store and the legacy keys become read-only (synced from
 * channels on every save for backwards compat).
 *
 * Accepts the raw row .value strings, not the parsed shapes, so this
 * helper is callable directly from the loadData Promise.all results.
 */
export function migrateLegacyToChannels(legacy) {
  const enabledProviders = safeParse(
    legacy.enabledProvidersRaw,
    { banks: ['CBE', 'Dashen', 'Awash', 'Abyssinia'], wallets: ['telebirr', 'CBE Birr'] }
  );
  const customBanks = safeParse(legacy.customBanksRaw, []);
  const customWallets = safeParse(legacy.customWalletsRaw, []);
  const enabledWalletSet = new Set(enabledProviders.wallets || []);
  const enabledBankSet = new Set(enabledProviders.banks || []);

  const channels = [];

  // Built-in wallets
  for (const def of DEFAULT_CHANNEL_DEFINITIONS.filter(d => d.kind === 'wallet')) {
    let phone = '';
    let usePhoneFromShop = false;
    let account = '';

    if (def.id === 'telebirr') {
      phone = legacy.payTelebirr || '';
      usePhoneFromShop = !phone;
    } else if (def.id === 'cbe_birr') {
      phone = legacy.payCbePhone || '';
      account = legacy.payCbeAccount || '';
    } else if (def.id === 'awash_mobile') {
      phone = legacy.payAwashPhone || '';
    }

    channels.push({
      id: def.id,
      kind: 'wallet',
      name: def.name,
      enabled: enabledWalletSet.has(def.name),
      phone,
      account,
      usePhoneFromShop,
      custom: false,
    });
  }

  // Custom wallets (user-added)
  for (const w of customWallets) {
    if (!w || channels.some(c => c.name === w)) continue;
    channels.push({
      id: `custom_w_${slugify(w)}`,
      kind: 'wallet',
      name: w,
      enabled: enabledWalletSet.has(w),
      phone: '',
      account: '',
      usePhoneFromShop: false,
      custom: true,
    });
  }

  // Built-in banks
  const bankNameMatch = (legacy.payBankName || '').toLowerCase().trim();
  for (const def of DEFAULT_CHANNEL_DEFINITIONS.filter(d => d.kind === 'bank')) {
    // If the user previously had an Other-bank field with an account that
    // matches this bank's name, carry the account over.
    const isMatch = bankNameMatch && def.name.toLowerCase().includes(bankNameMatch.replace(/\s+bank$/, ''));
    // Legacy enabled list uses 'Awash' for the bank, not 'Awash Bank'
    const legacyName = def.id === 'bank_awash' ? 'Awash' : def.name;
    channels.push({
      id: def.id,
      kind: 'bank',
      name: def.name,
      enabled: enabledBankSet.has(legacyName),
      phone: '',
      account: isMatch ? (legacy.payBankAccount || '') : '',
      usePhoneFromShop: false,
      custom: false,
    });
  }

  // Custom banks
  for (const b of customBanks) {
    if (!b || channels.some(c => c.name === b)) continue;
    channels.push({
      id: `custom_b_${slugify(b)}`,
      kind: 'bank',
      name: b,
      enabled: enabledBankSet.has(b),
      phone: '',
      account: '',
      usePhoneFromShop: false,
      custom: true,
    });
  }

  // If the legacy "Other bank" had a name that didn't match any built-in
  // bank, append it as a custom bank.
  if (
    legacy.payBankName &&
    legacy.payBankAccount &&
    !channels.some(c => c.account === legacy.payBankAccount)
  ) {
    const name = legacy.payBankName.trim();
    if (!channels.some(c => c.name === name)) {
      channels.push({
        id: `custom_b_${slugify(name)}`,
        kind: 'bank',
        name,
        enabled: true,
        phone: '',
        account: legacy.payBankAccount,
        usePhoneFromShop: false,
        custom: true,
      });
    }
  }

  return channels;
}

// ─── reverse derivation (channels → legacy) ──────────────────────────

/**
 * Produce legacy-shape values from the canonical channels[] array.
 * Called on every save so PaymentTypeChips (reads enabled_payment_methods)
 * and ReminderSheet (reads shopProfile.payments) continue to work without
 * needing their own refactor.
 */
export function deriveLegacyFromChannels(channels) {
  const enabledWallets = channels
    .filter(c => c.kind === 'wallet' && c.enabled)
    .map(c => c.name);
  const enabledBanks = channels
    .filter(c => c.kind === 'bank' && c.enabled)
    .map(c => c.id === 'bank_awash' ? 'Awash' : c.name);

  const customWallets = channels
    .filter(c => c.kind === 'wallet' && c.custom)
    .map(c => c.name);
  const customBanks = channels
    .filter(c => c.kind === 'bank' && c.custom)
    .map(c => c.name);

  // Pay-it-now legacy shape — pick the first enabled+configured for each slot
  const telebirr = channels.find(c => c.id === 'telebirr');
  const cbeBirr = channels.find(c => c.id === 'cbe_birr');
  const awashMobile = channels.find(c => c.id === 'awash_mobile');
  // For "other bank" legacy slot: prefer the first enabled bank with an account
  // that isn't already covered by CBE Birr's account slot.
  const enabledBankWithAcct = channels.find(c => c.kind === 'bank' && c.enabled && c.account);

  return {
    enabledProviders: { banks: enabledBanks, wallets: enabledWallets },
    customBanks,
    customWallets,
    payments: {
      telebirr: (telebirr?.usePhoneFromShop) ? '' : (telebirr?.phone || ''),
      cbe_phone: cbeBirr?.phone || '',
      cbe_account: cbeBirr?.account || '',
      awash_phone: awashMobile?.phone || '',
      bank_name: enabledBankWithAcct?.name || '',
      bank_account: enabledBankWithAcct?.account || '',
    },
  };
}

// ─── channel-level helpers (immutable updates) ────────────────────────

export function updateChannel(channels, id, updates) {
  return channels.map(c => (c.id === id ? { ...c, ...updates } : c));
}

export function removeChannel(channels, id) {
  return channels.filter(c => c.id !== id);
}

export function addCustomChannel(channels, { kind, name }) {
  if (!name) return channels;
  const trimmed = name.trim();
  if (!trimmed) return channels;
  if (channels.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return channels;
  const prefix = kind === 'bank' ? 'custom_b_' : 'custom_w_';
  let baseId = `${prefix}${slugify(trimmed)}`;
  // Resolve id collisions by appending a counter
  let id = baseId;
  let counter = 1;
  while (channels.some(c => c.id === id)) {
    id = `${baseId}_${counter}`;
    counter += 1;
  }
  return [
    ...channels,
    {
      id,
      kind,
      name: trimmed,
      enabled: true,
      phone: '',
      account: '',
      usePhoneFromShop: false,
      custom: true,
    },
  ];
}

// ─── normalization on save ────────────────────────────────────────────

/**
 * Clean up a channels[] array before persisting:
 *   - Normalize phone fields to E.164 (or empty)
 *   - Trim account numbers (strip whitespace)
 *   - Drop transient form state if any leaked in
 */
export function normalizeChannelsForSave(channels) {
  return channels.map(c => {
    const out = {
      id: c.id,
      kind: c.kind,
      name: String(c.name || '').trim(),
      enabled: !!c.enabled,
      phone: '',
      account: String(c.account || '').replace(/\s+/g, ''),
      usePhoneFromShop: !!c.usePhoneFromShop,
      custom: !!c.custom,
    };
    // Phone normalization — accept any input shape, store E.164
    if (c.usePhoneFromShop) {
      out.phone = ''; // signal "default to shop phone"
    } else if (c.phone) {
      const digits = extractSubscriberDigits(c.phone);
      const e164 = digits ? normalizeEthiopianPhone(digits) : null;
      out.phone = e164 || ''; // store empty if invalid
    }
    return out;
  });
}
