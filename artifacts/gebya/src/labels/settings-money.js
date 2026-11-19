// R2.1 central labels — settings-money surface.
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
  "settings-money.9xxxxxxxx": { en: "9XXXXXXXX", am: "9XXXXXXXX" },
  "settings-money.add": { en: "Add", am: "ጨምር" },
  "settings-money.add-payment-method": { en: "Add payment method", am: "መክፈያ ዘዴ ጨምር" },
  "settings-money.automatic-reminders-are-managed-in-settings": { en: "Automatic reminders are managed in Settings → Data.", am: "ራስ-ሰር ማስታወቂያ በቅንብሮች → ውሂብ ይተዳደራል።" },
  "settings-money.bank": { en: "Bank", am: "ባንክ" },
  "settings-money.banks": { en: "Banks", am: "ባንኮች" },
  "settings-money.cancel": { en: "Cancel", am: "ሰርዝ" },
  "settings-money.configured": { en: "configured", am: "ተዋቅሯል" },
  "settings-money.configured-2": { en: "configured", am: "መንገድ ዝግጁ" },
  "settings-money.days": { en: "days", am: "ቀን" },
  "settings-money.dubie-credit-rules": { en: "Dubie (Credit) Rules", am: "የዱቤ ህጎች" },
  "settings-money.dubie-overdue-threshold-days": { en: "Dubie overdue threshold (days)", am: "ዱቤ ጊዜ ማብቂያ (ቀናት)" },
  "settings-money.e-g-zemen-bank": { en: "e.g. Zemen Bank", am: "ስም ያስገቡ..." },
  "settings-money.enable-channels-they-appear-when-you-record": { en: "Enable channels — they appear when you record a sale.", am: "መንገድ ይምረጡ — በሽያጭ መመዝገብ ጊዜ ይታያል።" },
  "settings-money.free-plan": { en: "Free Plan", am: "ነፃ ፕላን" },
  "settings-money.limited-staff-and-reports": { en: "Limited staff and reports", am: "የሰራተኞች እና የሪፖርት ገደቦች አሉ" },
  "settings-money.mobile-wallets": { en: "Mobile wallets", am: "ሞባይል ዋሌት" },
  "settings-money.monthly-tx": { en: "Monthly tx", am: "ወርሃዊ ግብይቶች" },
  "settings-money.no-results": { en: "No results", am: "ምንም ውጤት አልተገኘም" },
  "settings-money.none": { en: "None", am: "ምንም" },
  "settings-money.overdue-threshold-reminders-in-data-tab": { en: "Overdue threshold · reminders in Data tab", am: "የዘገዬ ጊዜ · ማስታወቂያ በውሂብ ውስጥ" },
  "settings-money.payment-channels": { en: "Payment channels", am: "የክፍያ መንገዶች" },
  "settings-money.payment-channels-2": { en: "Payment Channels", am: "የክፍያ መንገዶች" },
  "settings-money.remove": { en: "Remove", am: "አስወግድ" },
  "settings-money.remove-this-channel": { en: "Remove this channel?", am: "ይህን መንገድ ይሰርዙ?" },
  "settings-money.same-as-shop-phone": { en: "Same as shop phone", am: "ከሱቅ ስልክ ጋር አንድ" },
  "settings-money.save": { en: "Save", am: "አስቀምጥ" },
  "settings-money.search-banks-and-wallets": { en: "Search banks and wallets...", am: "ባንኮች እና ዋሌቶችን ፈልጉ..." },
  "settings-money.set-up-a-payment-channel": { en: "Set up a payment channel", am: "አንድ መንገድ ያዋቅሩ" },
  "settings-money.something-went-wrong": { en: "Something went wrong", am: "እባክዎ እንደገና ይሞክሩ" },
  "settings-money.staff": { en: "Staff", am: "ሰራተኞች" },
  "settings-money.stored-on-this-phone-only-gebya-never": { en: "Stored on this phone only. Gebya never touches the money — customers pay you direct.", am: "መረጃው በዚህ ስልክ ላይ ብቻ ይቀመጣል። Gebya ገንዘቡን አያይም — እርስዎ በቀጥታ ይቀበላሉ።" },
  "settings-money.this-channel-will-be-removed-from-your-list": { en: "This channel will be removed from your list.", am: "ይህ መንገድ ከዝርዝርዎ ይወገዳል።" },
  "settings-money.tied-to-this-device-no-payment-is-taken": { en: "Tied to this device. No payment is taken.", am: "ከዚህ ስልክ ጋር የተያያዘ ነው። ምንም ክፍያ አይጠየቅም።" },
  "settings-money.unlock-everything-and-scale-your-business": { en: "Unlock everything and scale your business", am: "ሁሉንም ገደቦች ይክፈቱ እና የንግድዎን አቅም ይጨምሩ" },
  "settings-money.upgrade-now": { en: "Upgrade Now", am: "ወደ Plus አሻሽል" },
  "settings-money.upgrade-to-plus": { en: "Upgrade to Plus", am: "ወደ Plus አሻሽል" },
  "settings-money.upgraded-to-gebya-plus": { en: "Upgraded to Gebya Plus! 🎉", am: "ወደ Gebya Plus ተሻሽሏል! 🎉" },
  "settings-money.upgrading": { en: "Upgrading...", am: "በመስራት ላይ..." },
  "settings-money.wallet": { en: "Wallet", am: "ዋሌት" },
};
