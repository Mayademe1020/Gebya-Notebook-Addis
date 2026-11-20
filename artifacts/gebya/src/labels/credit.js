// R2.1 central labels — credit surface.
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
  "credit.add": { en: "Add", am: "አክል" },
  "credit.add-as-new-customer": { en: "Add as new customer", am: "እንደ አዲስ ደንበኛ አክል" },
  "credit.amount-received": { en: "Amount Received", am: "የተቀበሉት መጠን" },
  "credit.amount-received-equals-total-use-paid": { en: "Amount received equals total — use \"Paid\" instead.", am: "የተቀበሉት ሙሉ ነው — \"ሙሉ\" ይምረጡ" },
  "credit.back": { en: "Back", am: "ተመለስ" },
  "credit.bal": { en: "BAL", am: "ዱቤ" },
  "credit.birr": { en: "birr", am: "ብር" },
  "credit.close": { en: "Close", am: "ዝጋ" },
  "credit.code-expires-in-15-minutes": { en: "Code expires in 15 minutes", am: "ኮዱ በ15 ደቂቃ ውስጥ ያበቃል" },
  "credit.copied": { en: "Copied!", am: "ተቀድቷል!" },
  "credit.copied-2": { en: "Copied", am: "ተቀዳ" },
  "credit.copy": { en: "Copy", am: "ቅዳ" },
  "credit.copy-link": { en: "Copy link", am: "አገናኝ ቅዳ" },
  "credit.could-not-copy": { en: "Could not copy", am: "መቅዳት አልተሳካም" },
  "credit.could-not-generate-code": { en: "Could not generate code", am: "ኮድ ማመንጨት አልተሳካም" },
  "credit.customer": { en: "Customer", am: "ደንበኛ" },
  "credit.customer-for-remaining-dubie": { en: "Customer (for remaining Dubie)", am: "ደንበኛ (ለቀሪው ዱቤ)" },
  "credit.customer-taps-start-linked-automatically": { en: "Customer taps Start → linked automatically", am: "ደንበኛው በStart በኋላ በራስ ይታያል" },
  "credit.dismiss": { en: "Dismiss", am: "ካንዳ" },
  "credit.en": { en: "en", am: "am" },
  "credit.en-us": { en: "en-US", am: "am-ET" },
  "credit.error": { en: "Error: ", am: "ስህተት፦ " },
  "credit.etb": { en: "ETB", am: "ብር" },
  "credit.failed-to-load-reminder-history": { en: "Failed to load reminder history", am: "ማስታወሻ ታሪክ መጫን አልተቻለም" },
  "credit.generate-new-code": { en: "Generate new code", am: "ሌላ ኮድ" },
  "credit.how-was-the-amount-paid": { en: "How was the amount paid?", am: "የተቀበሉት እንዴት ተከፈለ?" },
  "credit.last": { en: "last", am: "መጨረሻ" },
  "credit.linked": { en: "✓ Linked", am: "✓ ተገናኝቷል" },
  "credit.linking": { en: "Linking...", am: "በራስ ይታያል..." },
  "credit.message": { en: "Message", am: "መልዕክት" },
  "credit.message-is-sent-via-your-telegram-bot": { en: "Message is sent via your Telegram bot directly — no manual paste needed.", am: "መልዕክት በራስ ይላካል።" },
  "credit.more": { en: "more", am: "የሚግንሳ" },
  "credit.no-customer-found": { en: "No customer found", am: "ደንበኛ አልተገኘም" },
  "credit.no-link-token-for-this-customer": { en: "No link token for this customer", am: "መረጃ የለም" },
  "credit.no-overdue-customers": { en: "No overdue customers", am: "ምንም የዘገዩ ደንበኞች የሉም" },
  "credit.no-phone-or-telegram-on-file-add-contact": { en: "No phone or Telegram on file. Add contact info on the customer page.", am: "ስልክ ወይም ቴሌግራም አልተመዘገበም። የደንበኛውን ገጽ ላይ መረጃ ይጨምሩ።" },
  "credit.no-reminder-history": { en: "No reminder history", am: "ምንም ማስታወሻ ታሪክ የለም" },
  "credit.no-reminders-sent": { en: "No reminders sent", am: "ምንም ማስታወሻ አልተላከም" },
  "credit.open-in-telegram": { en: "Open in Telegram", am: "ቴሌግራም ይክፈቱ" },
  "credit.optional": { en: "optional", am: "አማራጭ" },
  "credit.outstanding": { en: "Outstanding", am: "ቀሪ ዱቤ" },
  "credit.overdue-customers": { en: "Overdue Customers", am: "ቀታና አንዳ ሳቶኋቶ኉኉" },
  "credit.overdue-no-contact-info-to-remind": { en: (a0) => `${a0} overdue — no contact info to remind`, am: (a0) => `${a0} የዘገዩ ደንበኞች አሏቸው ግን ስልክ ወይም ቴሌግራም የላቸውም` },
  "credit.partial-payment": { en: "½ Partial Payment", am: "½ ከፊል ክፍያ" },
  "credit.pick": { en: "Pick", am: "ምረጥ" },
  "credit.remaining-dubie": { en: "Remaining Dubie", am: "ቀሪ ዱቤ" },
  "credit.remaining-due-date": { en: "Remaining Due Date", am: "የቀሪው መክፈያ ቀን" },
  "credit.reminder-history": { en: "Reminder history", am: "የማስታወሻ ታሪክ" },
  "credit.reminder-sent": { en: (v0, v1, v2, v3) => `${v0()} reminder${v1()} sent${v2()}`, am: (v0, v1, v2, v3) => `${v0()} ማስታወሻ ተልኳል${v3()}` },
  "credit.reminding-skipped-no-contact": { en: (a0, a1) => `Reminding ${a0} · ${a1} skipped (no contact)`, am: (a0, a1) => `${a0} እያስታወስን · ${a1} ተዘለለ (ስልክ የለም)` },
  "credit.retry": { en: "Retry", am: "እንደገና ሞክር" },
  "credit.save-partial-payment": { en: "Save Partial Payment", am: "ከፊል ክፍያ አስቀምጥ" },
  "credit.saving": { en: "Saving...", am: "በማስቀመጥ ላይ..." },
  "credit.select-or-add-a-customer-above": { en: "Select or add a customer above", am: "ከላይ ደንበኛ ይምረጡ ወይም ያክሉ" },
  "credit.send-reminder": { en: "Send reminder", am: "ማስታወሻ ላክ" },
  "credit.send-reminder-2": { en: "Send reminder", am: "ላክ" },
  "credit.send-via": { en: "Send via", am: "በምን ይላኩ" },
  "credit.sending": { en: "Sending…", am: "እየተላከ…" },
  "credit.telegram-connected": { en: "Telegram connected", am: "ቴሌግራም ተገናኝቷል" },
  "credit.today": { en: "today", am: "ዛሬ" },
  "credit.tone": { en: "Tone", am: "አንደ ምን ያስታውሱ" },
  "credit.total-amount": { en: "Total Amount", am: "ጠቅላላ መጠን" },
  "credit.type-customer-name": { en: "Type customer name...", am: "ስም ይተይቡ..." },
  "credit.use-a-code-instead": { en: "🔢 Use a code instead", am: "🎲 በኮድ አገናኝ" },
  "credit.use-qr-instead": { en: "Use QR instead", am: "ወደ QR ተመለስ" },
  "credit.via": { en: "via", am: "በ" },
  "credit.you-can-edit-the-message-before-sending": { en: "You can edit the message before sending.", am: "መልዕክቱን ማርትዕ ይችላሉ።" },
};
