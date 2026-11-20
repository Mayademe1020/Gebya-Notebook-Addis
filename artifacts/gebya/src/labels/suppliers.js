// R2.1 central labels — suppliers surface.
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
  "suppliers.add-photo": { en: "Add photo", am: "ፎቶ ይጨምሩ" },
  "suppliers.add-photo-2": { en: "Add Photo", am: "ፎቶ ይምረጡ" },
  "suppliers.add-supplier": { en: "Add supplier", am: "አቅራቢ አክል" },
  "suppliers.after": { en: "After", am: "ከዚህ በኋላ" },
  "suppliers.amount": { en: "Amount", am: "መጠን" },
  "suppliers.back": { en: "Back", am: "ተመለስ" },
  "suppliers.birr": { en: "birr", am: "ብር" },
  "suppliers.buy": { en: "+ Buy", am: "+ ግዢ" },
  "suppliers.currently-owed": { en: "Currently owed", am: "አሁን ለመክፈል" },
  "suppliers.due-date-optional": { en: "Due date (optional)", am: "የሚከፈልበት ቀን" },
  "suppliers.e-g-5-bags-coffee": { en: "e.g. 5 bags coffee", am: "ለምሳሌ 5 ቦርሳ ቡና" },
  "suppliers.e-g-current-stock-status": { en: "e.g. current stock status", am: "ለምሳሌ የትንዳገብ ወቅታዊ ሁኔታ" },
  "suppliers.e-g-kiros-coffee-wholesale": { en: "e.g. Kiros Coffee Wholesale", am: "ለምሳሌ ቡና ቤት ኪሮስ" },
  "suppliers.e-g-wholesale-coffee-distributor": { en: "e.g. wholesale coffee distributor", am: "ለምሳሌ ጥቅል ቡና አከፋፋይ" },
  "suppliers.edit-payment": { en: "✏️ Edit payment", am: "✏️ ክፍያ አስተካክል" },
  "suppliers.edit-purchase": { en: "✏️ Edit purchase", am: "✏️ ግዢ አስተካክል" },
  "suppliers.edit-supplier": { en: "Edit supplier", am: "አስተካክል" },
  "suppliers.edit-supplier-2": { en: "Edit supplier", am: "አቅራቢ አስተካክል" },
  "suppliers.entries": { en: "entries", am: "መዝገብ" },
  "suppliers.first-purchase": { en: "First purchase", am: "የመጀመሪያ ግዢ" },
  "suppliers.history": { en: "History", am: "መዝገብ" },
  "suppliers.i-owe": { en: "I owe", am: "ለመክፈል" },
  "suppliers.no-entries-yet": { en: "No entries yet", am: "መዝገብ የለም" },
  "suppliers.no-phone": { en: "No phone", am: "ስልክ የለም" },
  "suppliers.note-optional": { en: "Note (optional)", am: "ማስታወሻ (አማራጭ)" },
  "suppliers.note-optional-2": { en: "Note (optional)", am: "መልእክት (አማራጭ)" },
  "suppliers.nothing-outstanding-to-pay": { en: "Nothing outstanding to pay", am: "ለመክፈል ምንም የለም" },
  "suppliers.open": { en: "OPEN", am: "ቆይቷል" },
  "suppliers.open-2": { en: "open", am: "ቆይቷል" },
  "suppliers.optional": { en: "optional", am: "አማራጭ" },
  "suppliers.pay": { en: "PAY (-)", am: "ክፍያ (-)" },
  "suppliers.payment": { en: "Payment", am: "ክፍያ" },
  "suppliers.payment-2": { en: "− Payment", am: "− ክፍያ" },
  "suppliers.payment-exceeds-what-is-owed": { en: "Payment exceeds what is owed", am: "ከዱቤ በላይ ነው" },
  "suppliers.payment-method": { en: "Payment Method", am: "የክፍያ ዘዴ" },
  "suppliers.phone": { en: "Phone", am: "ስልክ" },
  "suppliers.phone-must-start-with-9-or-7-9-digits-total": { en: "Phone must start with 9 or 7 — 9 digits total", am: "ስልክ 9 ወይም 7 ይጀምር — 9 አኃዝ መሆን አለበት" },
  "suppliers.photo-added-kb-on-this-phone-only": { en: (a0) => `Photo added · ~${a0} KB · on this phone only`, am: (a0) => `ፎቶ ተጨምሯል · ~${a0} KB · በዚህ ስልክ ብቻ` },
  "suppliers.photos": { en: "photos", am: "ፎቶዎች" },
  "suppliers.pick": { en: "Pick", am: "ምረጥ" },
  "suppliers.proof-photos": { en: "Proof photos", am: "ፎቶ" },
  "suppliers.purchase": { en: "PURCHASE (+)", am: "ግዢ ጨምር (+)" },
  "suppliers.purchase-2": { en: "Purchase", am: "ግዢ" },
  "suppliers.record-what-you-buy-on-credit-from-this": { en: "Record what you buy on credit from this supplier.", am: "ከዚህ አቅራቢ ግዢዎችን ይመዝግቡ።" },
  "suppliers.remove": { en: "Remove", am: "አስወግድ" },
  "suppliers.remove-photo": { en: (v0) => `Remove photo ${v0()}`, am: (v0) => `ፎቶ አስወግድ` },
  "suppliers.replace": { en: "Replace", am: "መልሰው ይውሰዱ" },
  "suppliers.replace-photo": { en: (v0) => `Replace photo ${v0()}`, am: (v0) => `ፎቶ ቀይር` },
  "suppliers.save-changes": { en: "Save changes", am: "አስተካክል" },
  "suppliers.save-payment": { en: "Save payment", am: "ክፍያ አስቀምጥ" },
  "suppliers.save-purchase": { en: "Save purchase", am: "ግዢ አስቀምጥ" },
  "suppliers.save-supplier": { en: "Save supplier", am: "አስቀምጥ" },
  "suppliers.saved-on-this-phone-only": { en: "Saved on this phone only", am: "መረጃው በዚህ ስልክ ብቻ ይቀመጣል" },
  "suppliers.saving": { en: "Saving…", am: "እያስቀመጥኩ…" },
  "suppliers.someone-you-buy-from-on-credit": { en: "Someone you buy from on credit", am: "የምትገዙበት ሰው" },
  "suppliers.stored-on-this-phone-only": { en: "Stored on this phone only", am: "መረጃው በዚህ ስልክ ላይ ብቻ ይቀመጣል" },
  "suppliers.supplier-name": { en: "Supplier name", am: "የአቅራቢ ስም" },
  "suppliers.take-a-photo-optional": { en: "Take a photo (optional)", am: "ፎቶ ይውሰዱ (አማራጭ)" },
  "suppliers.take-or-choose-photo": { en: "Take or choose photo", am: "ፎቶ ያንሱ ወይም ይምረጡ" },
  "suppliers.update": { en: "Update", am: "አስተካክል" },
  "suppliers.what-did-you-buy-optional": { en: "What did you buy (optional)", am: "ምን ገዙ (አማራጭ)" },
};
