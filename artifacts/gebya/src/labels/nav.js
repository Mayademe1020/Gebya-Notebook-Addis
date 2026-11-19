// R2.1 central labels — nav surface.
//
// Every entry below was extracted mechanically from an inline
// `lang === 'am' ? … : …` ternary and is BYTE-IDENTICAL to it (owner ruling 2,
// 2026-09-16): no wording, punctuation, glyph, NBSP or spacing was changed.
// Do NOT "fix" Amharic here — term decisions and the Merkato review land after
// R2.1 (see docs/R2-LABELS-DRAFT.md for the deferred list).
//
// Shape:
//   'key': { en, am }                      fixed string
//   'key': { en: (a0) => `…`, am: … }     format, positional args
//   'key': { en: (v0) => `…${v0()}…` }    thunks: EN and AM take different
//                                          arguments, so call sites pass lazy
//                                          thunks and only the selected
//                                          language evaluates its own.
//
// Generated file. Regenerate with the R2.1 codemod, never by hand.
export default {
  "nav.app-info": { en: "App info", am: "መስመርቻ መረጃ" },
  "nav.dev-mode-unlocked-this-session-only": { en: "🛠 Dev mode unlocked (this session only)", am: "🛠 የልማት ሁነታ ተከፍቷል (ለዚህ ክፍለ ጊዜ ብቻ)" },
  "nav.enable-dev-mode-this-reveals-shop-level": { en: "Enable dev mode? This reveals shop-level diagnostics for this session.", am: "የልማት ሁነታ እንደገና ያንብት? ይህ ለመጠበቅ ይፈልጋል" },
  "nav.lang-toggle-btn-inactive": { en: "lang-toggle__btn--inactive", am: "lang-toggle__btn--active" },
  "nav.manager": { en: "Manager", am: "ሥራ አስኪያጅ" },
  "nav.more-taps": { en: "more taps", am: "ተጨማሪ መታ" },
  "nav.no-phone-added": { en: "No phone added", am: "ስልክ አልተጨመረም" },
  "nav.notifications": { en: "Notifications", am: "ማስጠንቂቾች" },
  "nav.owner": { en: "Owner", am: "ባለቤት" },
  "nav.shop": { en: "Shop", am: "ሱቅ" },
  "nav.staff": { en: "Staff", am: "ሰራተኛ" },
  "nav.switch-to": { en: "Switch to አማር‌ኛ", am: "አማር‌ኛ በመረጡት" },
  "nav.transparent": { en: "transparent", am: "var(--color-primary)" },
  "nav.var-color-text-soft": { en: "var(--color-text-soft)", am: "var(--color-bg-white)" },
};
