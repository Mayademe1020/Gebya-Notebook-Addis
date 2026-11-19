// R2.1 central labels module — one exported, frozen LABELS object.
//
// A screen resolves copy through label('surface.key', lang) or, in new code,
// useLabels(). The goal of R2.1 is only *where copy lives*: strings are
// byte-identical to the inline ternaries they replaced (owner ruling 2).
//
// Generated index. Regenerate with the R2.1 codemod, never by hand.
import auth from './auth.js';
import onboarding from './onboarding.js';
import nav from './nav.js';
import shell from './shell.js';
import today from './today.js';
import credit from './credit.js';
import history from './history.js';
import customers from './customers.js';
import suppliers from './suppliers.js';
import sales from './sales.js';
import settingsShop from './settings-shop.js';
import settingsMoney from './settings-money.js';
import settingsData from './settings-data.js';
import staff from './staff.js';
import reports from './reports.js';
import admin from './admin.js';
import sync from './sync.js';
import pwa from './pwa.js';
import common from './common.js';
import { useLabels } from './useLabels.js';

const SURFACES = {
  "auth": auth,
  "onboarding": onboarding,
  "nav": nav,
  "shell": shell,
  "today": today,
  "credit": credit,
  "history": history,
  "customers": customers,
  "suppliers": suppliers,
  "sales": sales,
  "settings-shop": settingsShop,
  "settings-money": settingsMoney,
  "settings-data": settingsData,
  "staff": staff,
  "reports": reports,
  "admin": admin,
  "sync": sync,
  "pwa": pwa,
  "common": common,
};

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(obj);
}

export const LABELS = deepFreeze(SURFACES);

// Re-exported so new screens can bind labels to the active language once.
export { useLabels };

/**
 * Resolve one label.
 * @param {string} key  'surface.slug' as exported by LABELS
 * @param {'en'|'am'} lang
 * @param {...any} args positional args (or thunks for kind: 'thunks' entries)
 */
export function label(key, lang, ...args) {
  const entry = LABELS[key.split('.')[0]]?.[key];
  if (!entry) throw new Error(`Unknown label key: ${key}`);
  const value = entry[lang] ?? entry.en;
  return typeof value === 'function' ? value(...args) : value;
}
