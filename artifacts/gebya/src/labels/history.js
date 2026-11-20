// R2.1 central labels — history surface.
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
  "history.all": { en: "All", am: "ሁሉም" },
  "history.birr": { en: "birr", am: "ብር" },
  "history.cash": { en: "Cash", am: "ጥሬ" },
  "history.collections": { en: "Collections", am: "መሰብሰብ" },
  "history.could-not-load-activity": { en: "Could not load activity", am: "ስህተት" },
  "history.credit": { en: "Credit", am: "ዱቤ" },
  "history.credit-2": { en: "credit", am: "ዱቤ" },
  "history.current": { en: "current", am: "አሁን" },
  "history.delete": { en: "Delete", am: "ሰርዝ" },
  "history.disc": { en: "disc", am: "ቅናሽ" },
  "history.discount": { en: "Discount", am: "ቅናሽ" },
  "history.edit": { en: "Edit", am: "አርትዕ" },
  "history.excess": { en: "Excess", am: "በላይ" },
  "history.expenses": { en: "Expenses", am: "ወጪ" },
  "history.export": { en: "Export", am: "ላክ" },
  "history.load-more-months": { en: "Load more months", am: "ተጨማሪ ወራት አሳይ" },
  "history.load-more-weeks": { en: "Load more weeks", am: "ተጨማሪ ሳምንታት አሳይ" },
  "history.loading-activity": { en: "Loading activity...", am: "በመጫን ላይ..." },
  "history.more": { en: "More", am: "ተጨማሪ" },
  "history.no-admin-actions-yet": { en: "No admin actions yet", am: "ምንም እርምጃ የለም" },
  "history.no-entries-yet": { en: "No entries yet", am: "ምንም እንቅስቃሴ የለም" },
  "history.paid": { en: "Paid", am: "ተከፍሏል" },
  "history.partial": { en: "½ Partial", am: "½ ከፊል" },
  "history.payment": { en: "Payment", am: "ክፍያ" },
  "history.record": { en: "Record", am: "መዝገብ" },
  "history.reversal": { en: "Reversal", am: "ሰርዝ" },
  "history.sales": { en: "Sales", am: "ሽያጭ" },
  "history.settled": { en: (a0) => `Settled ${a0}`, am: (a0) => `${a0} ተከፍሏል` },
  "history.show-items": { en: "Show items", am: "እቃዎችን አሳይ" },
  "history.team-actions-across-all-shops-will-appear": { en: "Team actions across all shops will appear here.", am: "የቡድን እርምጃዎች እዚህ ይታያሉ።" },
  "history.team-activity-admin-shop-logs": { en: "Team activity (admin shop logs)", am: "የቡድን እርምጃ (አድሚን ሾፕ ሎግ)" },
  "history.unaccounted": { en: "Unaccounted", am: "ቀሪ" },
  "history.view-transaction-photo": { en: "View transaction photo", am: "የግብይት ፎቶ ይመልከቱ" },
};
