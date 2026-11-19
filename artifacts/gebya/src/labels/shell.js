// R2.1 central labels — shell surface.
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
  "shell.all-reminders-sent": { en: "All reminders sent", am: "ሁሉም ማሳሰቢያዎች ተልከዋል" },
  "shell.entry-deleted": { en: "Entry deleted", am: "ተሰርዟል" },
  "shell.free-plan-limit-month-reached-see-plus-in": { en: (a0) => `Free plan limit (${a0}/month) reached — see Plus in Settings → Money.`, am: (a0) => `የዚህ ወር ${a0} ግብይቶች ተደርሰዋል። Plus ለማግኘት ቅንብሮች → ገንዘብ ይመልከቱ።` },
  "shell.restored": { en: "Restored ✓", am: "ተመልሷል ✓" },
};
