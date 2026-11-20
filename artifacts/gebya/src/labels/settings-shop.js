// R2.1 central labels — settings-shop surface.
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
  "settings-shop.activity": { en: "Activity", am: "እንቅስቃሴ" },
  "settings-shop.add-to-get-started": { en: "Add to get started", am: "ለመጀመር ይጨምሩ" },
  "settings-shop.all-set-up": { en: "All set up", am: "ሁሉም ተዋቅሯል" },
  "settings-shop.analytics": { en: "Analytics", am: "ትንተና" },
  "settings-shop.archive": { en: "Archive", am: "ደብቅ" },
  "settings-shop.archived": { en: "Archived", am: "ተደብቋል" },
  "settings-shop.birr": { en: "birr", am: "ብር" },
  "settings-shop.cancel": { en: "Cancel", am: "ይቅር" },
  "settings-shop.cost": { en: "Cost", am: "መግዣ" },
  "settings-shop.cost-optional": { en: "Cost (optional)", am: "መግዣ ዋጋ (አማራጭ)" },
  "settings-shop.curation": { en: "Curation", am: "ማስተካከያ ወረፍ" },
  "settings-shop.details": { en: "Details", am: "ተጨማሪ" },
  "settings-shop.edit": { en: "Edit", am: "አስተካክል" },
  "settings-shop.empty": { en: "Empty", am: "ባዶ" },
  "settings-shop.for-profit": { en: "for profit", am: "ለትርፍ ስሌት" },
  "settings-shop.item": { en: "📦 Item", am: "📦 ዕቃ" },
  "settings-shop.item-2": { en: "Item", am: "ዕቃ" },
  "settings-shop.items": { en: "Items", am: "እቃዎች" },
  "settings-shop.metrics": { en: "Metrics", am: "ሜትሪክስ" },
  "settings-shop.monthly-bills": { en: (a0) => `${a0} monthly bills`, am: (a0) => `${a0} ወርሃዊ ወጪ` },
  "settings-shop.name-e-g-sugar": { en: "Name · e.g. Sugar", am: "ስም · ለምሳሌ ስኳር" },
  "settings-shop.no-name": { en: "No name", am: "ስም የለም" },
  "settings-shop.no-saved-items-yet": { en: "No saved items yet.", am: "ገና ምንም ዕቃ አልተቀመጠም።" },
  "settings-shop.none": { en: "None", am: "ባዶ" },
  "settings-shop.of-set-up": { en: (a0, a1) => `${a0} of ${a1} set up`, am: (a0, a1) => `${a0} ከ ${a1} ተዋቅሯል` },
  "settings-shop.open-command-center": { en: "Open Command Center", am: "የመሣሪያ ስርዓት ማዕከል ክፈት" },
  "settings-shop.partial": { en: "Partial", am: "ይጨምሩ" },
  "settings-shop.platform-admin": { en: "Platform Admin", am: "ፕላትፎርም አስተዳዳሪ" },
  "settings-shop.recurring-expenses": { en: "Recurring Expenses", am: "ወርሃዊ ወጪ" },
  "settings-shop.rent-internet-electricity-etc": { en: "Rent, internet, electricity, etc.", am: "ኪራይ፣ ኢንተርኔት፣ ወዘተ" },
  "settings-shop.restore": { en: "Restore", am: "መልስ" },
  "settings-shop.sale": { en: "Sale", am: "ሽያጭ" },
  "settings-shop.sale-price": { en: "Sale price", am: "የሽያጭ ዋጋ" },
  "settings-shop.save": { en: "+ Save", am: "+ አስቀምጥ" },
  "settings-shop.save-items-you-sell-often-with-their-prices": { en: "Save items you sell often with their prices — they autofill when you record a sale.", am: "በተደጋጋሚ የሚሸጡትን ዕቃዎች ከነ ዋጋቸው ያስቀምጡ — ሽያጭ ሲመዘግቡ በፍጥነት ይመጣሉ።" },
  "settings-shop.saved-items": { en: (a0) => `${a0} saved items`, am: (a0) => `${a0} እቃዎች ተቀምጠዋል` },
  "settings-shop.service": { en: "🛠 Service", am: "🛠 አገልግሎት" },
  "settings-shop.service-2": { en: "Service", am: "አገልግሎት" },
  "settings-shop.set": { en: "Set", am: "ተዋቅሯል" },
  "settings-shop.share-with-your-team-admin": { en: "Share with your team: /admin", am: "ለቡድኑ ተጋሩ፡ /admin" },
  "settings-shop.shop": { en: "Shop", am: "ሱቅ" },
  "settings-shop.shop-admin": { en: "Shop Admin", am: "የሱቅ አስተዳዳሪ" },
  "settings-shop.shop-profile": { en: "Shop Profile", am: "የሱቅ መገለጫ" },
  "settings-shop.support": { en: "Support", am: "ድጋፍ" },
  "settings-shop.this-profile-is-the-main-owner-identity-for": { en: "This profile is the main owner identity for this phone's notebook. Changes here affect the whole shop notebook.", am: "ይህ የዚህ ስልክ ዋና ባለቤት መለያ ነው። እዚህ የሚደረጉ ለውጦች መላውን ሱቅ ማስታወሻ ይነካሉ።" },
  "settings-shop.update": { en: "Update", am: "አስተካክል" },
};
