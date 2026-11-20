// R2.1 central labels — auth surface.
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
  "auth.cashier": { en: "Cashier", am: "ካሸር" },
  "auth.go-to-gebya": { en: "Go to Gebya", am: "ወደ ጌባያ ይሂዱ" },
  "auth.please-sign-in-first-then-enter-the-code": { en: "Please sign in first, then enter the code", am: "በመጀመሪያ ይግቡ ከዚያ ኮዱን ይጠቀሙ" },
  "auth.signed-in-successfully-set-a-password-for": { en: "Signed in successfully! Set a password for faster logins?", am: "OTP በተሳካ ሁኔታ ገብተዋል። የሚስጥር ቃል መዲዛ ይጨምሩ ለ ፍጥነታዊ መግቢያ?" },
  "auth.sorry": { en: "Sorry", am: "ይቅርታ" },
  "auth.viewer": { en: "Viewer", am: "ተመልካች" },
};
