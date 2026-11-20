// R2.1 central labels — today surface.
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
  "today.birr": { en: "birr", am: "ብር" },
  "today.cash": { en: "Cash", am: "ጥሬ" },
  "today.cash-2": { en: "💵 Cash", am: "💵 ጥሬ ገንዘብ" },
  "today.cash-digital-owed-etb": { en: (a0, a1, a2) => `Cash ${a0}, Digital ${a1}, Owed ${a2} ETB`, am: (a0, a1, a2) => `ጥሬ ${a0}፣ ዲጂታል ${a1}፣ ዱቤ ${a2} ETB` },
  "today.cash-i-counted": { en: "Cash I counted", am: "የቆጠርኩት ጥሬ ገንዘብ" },
  "today.cash-in-hand": { en: "↓ Cash in hand", am: "↓ በእጅህ ያለ ገንዘብ" },
  "today.cash-in-hand-2": { en: "Cash in hand", am: "በእጅህ ያለ ገንዘብ" },
  "today.cash-you-should-have": { en: "💵 Cash you should have", am: "💵 ሊኖርህ የሚገባ ገንዘብ" },
  "today.check": { en: "Check", am: "አረጋግጥ" },
  "today.close": { en: "Close", am: "ዝጋ" },
  "today.close-this-day": { en: "✅ Close this day", am: "✅ ዝጋ" },
  "today.collapse": { en: "Collapse", am: "አጥራ" },
  "today.collections": { en: "💰 Collections", am: "💰 የዕዳ መሰብሰብ" },
  "today.difference": { en: "📊 Difference", am: "📊 ልዩነት" },
  "today.digital": { en: "Digital", am: "ዲጂታል" },
  "today.digital-2": { en: "📱 Digital", am: "📱 ዲጂታል" },
  "today.entries": { en: "ENTRIES", am: "ምዝገባዎች" },
  "today.expenses": { en: "📤 Expenses", am: "📤 ወጪ" },
  "today.insights": { en: "Insights", am: "ፈትንስ አንዳ" },
  "today.no-entries-yet": { en: "No entries yet", am: "ገና ምንም ምዝገባ የለም" },
  "today.owed": { en: "Owed", am: "ዱቤ" },
  "today.partial-payments": { en: "Partial payments", am: "ከፊል ክፍያዎች" },
  "today.received-bank-wallet": { en: "📱 Received · bank/wallet", am: "📱 በባንክ/ዋሌት የተቀበለ" },
  "today.received-cash": { en: "💵 Received · cash", am: "💵 በጥሬ የተቀበለ" },
  "today.reveal": { en: "Reveal", am: "አሳይ" },
  "today.sales": { en: "Sales", am: "ሽያጭ" },
  "today.saved-on-this-phone-only-we-never-send-your": { en: "Saved on this phone only. We never send your numbers anywhere.", am: "በዚህ ስልክ ብቻ ይቀመጣል። ለማንም አንልክም።" },
  "today.share": { en: "Share", am: "አጋራ" },
  "today.show-details": { en: "Show details", am: "ዝርዝር አሳይ" },
  "today.spent": { en: "Spent", am: "ወጪ" },
  "today.still-owed-dubie": { en: "↩ Still owed (Dubie)", am: "↩ ገና ያልተከፈለ (ዱቤ)" },
  "today.tap-above-to-start": { en: "Tap above to start", am: "ለመጀመር ከላይ ይጫኑ" },
  "today.this-day-hasn-t-been-closed-yet": { en: "This day hasn't been closed yet.", am: "ይህ ቀን ገና አልተዘጋም" },
  "today.today-net": { en: "TODAY · NET", am: "ዛሬ · ቀሪ" },
  "today.today-s-sales": { en: " · today's sales", am: " · የዛሬ ሽያጭ" },
  "today.toggle-privacy": { en: "Toggle privacy", am: "ቁጥሮችን ደብቅ/አሳይ" },
  "today.top-sellers": { en: "TOP SELLERS", am: "ብዙ የተሸጡ" },
  "today.total-sales": { en: (v0, v1) => `Total sales${v0()}`, am: (v0, v1) => `ዛሬ ጠቅላላ ሽያጭ${v1()}` },
  "today.vs-yesterday": { en: "vs yesterday", am: "ካለፈው ቀን" },
};
