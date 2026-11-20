// R2.1 central labels — reports surface.
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
  "reports.all-events": { en: "All Events", am: "ሁሉም ክስተቶች" },
  "reports.ask-the-owner-to-link-this-device-to-your": { en: "Ask the owner to link this device to your staff profile.", am: "መሣሪያዎን ከሰራተኛ መገለጫዎ ጋር እንዲገናኝ ባለቤቱን ይጠይቁ።" },
  "reports.balanced": { en: "Balanced", am: "ተመጣጣኚ" },
  "reports.business-summary": { en: "BUSINESS SUMMARY", am: "የንግድ ማጠቃለያ" },
  "reports.closing-recorded": { en: "Closing recorded ✓", am: "ዝጋ ተመዝገቧል ✓" },
  "reports.custom": { en: "Custom", am: "ብጁ" },
  "reports.custom-range": { en: "Custom Range", am: "ብጁ ክልል" },
  "reports.device-not-linked-yet": { en: "Device not linked yet", am: "መሣሪያዎ ገና አልተገናኘም" },
  "reports.difference": { en: (v0, v1, v2) => `Difference: ${v0()} ${v1()} ✓`, am: (v0, v1, v2) => `ልዩነት: ${v0()} ${v2()} ✓` },
  "reports.do-this-next": { en: "DO THIS NEXT", am: "በመቀጠል ይህን አድርግ" },
  "reports.en-us": { en: "en-US", am: "am-ET" },
  "reports.entries": { en: "ENTRIES", am: "እንቅስቃሴዎች" },
  "reports.everyone": { en: "Everyone", am: "ሁሉም" },
  "reports.expected-cash-digital": { en: (a0, a1) => `Expected: 💵 ${a0} cash · 📱 ${a1} digital`, am: (a0, a1) => `የሚጠበቅ: 💵 ${a0} · 📱 ${a1} ETB` },
  "reports.from": { en: "From", am: "ከ" },
  "reports.handover-recorded": { en: "Handover recorded ✓", am: "ማስረከቢያ ተመዝግቧል ✓" },
  "reports.last-30-days": { en: "Last 30 Days", am: "ባለፉት 30 ቀናት" },
  "reports.last-7-days": { en: "Last 7 Days", am: "ባለፉት 7 ቀናት" },
  "reports.loading": { en: "Loading...", am: "በመጫን ላይ..." },
  "reports.month": { en: "Month", am: "ወር" },
  "reports.my-day": { en: "MY DAY", am: "የእኔ ቀን" },
  "reports.my-shop": { en: "My shop", am: "ሱቅ" },
  "reports.no-analytics-data-available": { en: "No analytics data available", am: "ምንም መረጃ የለም" },
  "reports.no-entries-in-the-selected-dates-pick": { en: "No entries in the selected dates. Pick another period or record something new.", am: "በመረጡት ቀናት ውስጥ መዝገብ የለም። ሌላ ጊዜ ይምረጡ ወይም አዲስ እንቅስቃሴ ይመዝግብ።" },
  "reports.notebook": { en: "Notebook", am: "ማስታወሻ ደብተር" },
  "reports.nothing-recorded-in-this-period": { en: "Nothing recorded in this period", am: "በዚህ ጊዜ ውስጥ ምንም እንቅስቃሴ የለም" },
  "reports.of": { en: "of", am: "ከ" },
  "reports.owner": { en: "Owner", am: "ባለቤት" },
  "reports.ready-to-hand-over": { en: "Ready to hand over?", am: "ገንዘብ ለማስረከብ ዝግጁ ነዎት?" },
  "reports.record-first-sale": { en: "Record First Sale", am: "የመጀመሪያ ሽያጭ መዝግብ" },
  "reports.record-your-first-sale-today-your-shop": { en: "Record your first sale today — your shop summary appears here instantly.", am: "ዛሬውን ሽያጭ ይመዝግቡ — ሱቅዎ ሁኔታ በፈጣን ይዘርጋል።" },
  "reports.sale": { en: "Sale", am: "ሽያጭ" },
  "reports.search-notebook": { en: "Search notebook", am: "ፈልግ" },
  "reports.search-notebook-2": { en: "Search notebook... (/)", am: "ፈልግ... (/)" },
  "reports.sessions": { en: "Sessions", am: "ክፍለ ጊዜዎች" },
  "reports.share": { en: "Share", am: "አጋራ" },
  "reports.share-report-summary": { en: "Share report summary", am: "አጋራ" },
  "reports.shop-status": { en: "SHOP STATUS", am: "የሱቅ ሁኔታ" },
  "reports.staff-handover": { en: "STAFF HANDOVER", am: "🤝 የሰራተኛ ማስረከቢያ" },
  "reports.summary": { en: "SUMMARY", am: "ማጠቃለያ" },
  "reports.surrender": { en: "Surrender", am: "አሳልፍ" },
  "reports.this-month": { en: "This Month", am: "ወር" },
  "reports.this-week": { en: "This Week", am: "ሳምንት" },
  "reports.to": { en: "To", am: "ወደ" },
  "reports.today": { en: "Today", am: "ዛሬ" },
  "reports.today-2": { en: "TODAY", am: "ዛሬ" },
  "reports.today-s-business": { en: "TODAY'S BUSINESS", am: "የዛሬ ንግድ" },
  "reports.today-s-entries": { en: "TODAY'S ENTRIES", am: "የዛሬ እንቅስቃሴ" },
  "reports.today-s-story": { en: "TODAY'S STORY", am: "የዛሬ ታሪክ" },
  "reports.top-seller-etb": { en: (a0, a1) => `🏅 Top seller: ${a0} · ${a1} ETB`, am: (a0, a1) => `🏅 ብዙ የተሸጠ: ${a0} · ${a1} ETB` },
  "reports.transactions": { en: "Transactions", am: "ግብይቶች" },
  "reports.transactions-2": { en: "transactions", am: "ግብይቶች" },
  "reports.usage-analytics": { en: "Usage Analytics", am: "የአጠቃቀም ትንተና" },
  "reports.voice-usage": { en: "Voice Usage", am: "የድምጽ አጠቃቀም" },
  "reports.week": { en: "Week", am: "ሳምንት" },
  "reports.welcome-to-your-shop": { en: "Welcome to your shop", am: "ወደ ሱቅ ታሪክ እንኳን በደህና መጡ" },
  "reports.what-i-noticed": { en: "WHAT I NOTICED", am: "ያስተዋልኩት" },
  "reports.your-shop": { en: "Your shop", am: "ሱቅህ" },
};
