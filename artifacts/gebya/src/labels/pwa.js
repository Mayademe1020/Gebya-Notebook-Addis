// R2.1 central labels — pwa surface.
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
  "pwa.ask": { en: "Ask", am: "ጠይቅ" },
  "pwa.ask-my-notebook": { en: "Ask my notebook", am: "ማስታወሻ ደብተርዎን ይጠይቁ" },
  "pwa.gebya-is-installed-on-this-device": { en: "Gebya is installed on this device", am: "ገበያ በስልክዎ ላይ ተጭኗል" },
};
