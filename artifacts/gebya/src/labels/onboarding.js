// R2.1 central labels — onboarding surface.
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
  "onboarding.back": { en: "Back", am: "ተመለስ" },
  "onboarding.copy": { en: "ወደ አማርኛ ቀይር", am: "Switch to English" },
  "onboarding.copy-2": { en: "አማርኛ", am: "English" },
  "onboarding.enter-a-valid-phone-number": { en: "Enter a valid phone number", am: "እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ" },
  "onboarding.phone-number": { en: "Phone Number", am: "ስልክ ቁጥር" },
  "onboarding.please-enter-your-name": { en: "Please enter your name", am: "እባክዎ ስም ያስገቡ" },
  "onboarding.saved-on-this-phone-connect-to-internet-to": { en: "Saved on this phone — connect to internet to enable sync", am: "በዚህ ስልክ ብቻ ተቀምጧል — ኢንተርኔት ሲገኝ ማገናኘት ይችላሉ" },
  "onboarding.saving": { en: "Saving...", am: "በማስቀመጥ ላይ..." },
  "onboarding.select-account-type": { en: "Select Account Type", am: "የአጠቃቀም አይነት ይምረጡ" },
  "onboarding.set-up-your-notebook": { en: "Set up your notebook", am: "የሱቅዎን ማስታወሻ ደብተር ያዘጋጁ" },
  "onboarding.start": { en: "Start", am: "ጀምር" },
  "onboarding.two-ways-to-use-gebya": { en: "Two ways to use Gebya", am: "ገበያን ለመጠቀም ሁለት መንገዶች" },
  "onboarding.your-name": { en: "Your Name", am: "ስም" },
};
