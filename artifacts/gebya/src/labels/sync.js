// R2.1 central labels — sync surface.
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
  "sync.ago": { en: "ago", am: "በፊት" },
  "sync.day": { en: "day", am: "ቀን" },
  "sync.error": { en: "Error: ", am: "ስህተት: " },
  "sync.first-sync-pending": { en: "First sync pending", am: "የመጀመሪያ ማስተካከያ" },
  "sync.hr": { en: "hr", am: "ሰዓት" },
  "sync.just-now": { en: "Just now", am: "አሁን" },
  "sync.min": { en: "min", am: "ደቂቃ" },
  "sync.no-auth-token-manual-sync-will-not-upload": { en: "No auth token. Manual sync will not upload data.", am: "የሂለው መረጃ ይስጠው አለህ። ከዚህ ማስተካከያ ይቀኝባታ።" },
  "sync.offline": { en: "Offline", am: "ኔትወርክ የለም" },
  "sync.offline-ready": { en: "Offline ready", am: "ከመስመር ውጭ ዝግጁ" },
  "sync.pending": { en: "Pending", am: "የተመለከተው" },
  "sync.pending-sync": { en: "Pending sync", am: "ወደ ደመና እየጠበቀ" },
  "sync.record": { en: "record", am: "ሪከርድ" },
  "sync.retry": { en: "Retry", am: "እንደገና" },
  "sync.retry-2": { en: "Retry", am: "እንደገና ሞክር" },
  "sync.saves-on-this-phone": { en: "saves on this phone", am: "በዚህ ስልክ ይቀመጣል" },
  "sync.staff-haven-t-handed-over-yet-wait-or-ask": { en: "Staff haven't handed over yet — wait or ask them", am: "ሰራተኞች ገና አላስረከቡም — ይጠብቁ ወይም እራሳቸውን ይጠይቁ" },
  "sync.sync": { en: "Sync", am: "ማስተካከያ" },
  "sync.sync-conflict": { en: "Sync conflict", am: "ሁከት ተፈጠረ" },
  "sync.sync-failed": { en: "Sync failed", am: "ማመሳሰል አልተሳካም" },
  "sync.syncing": { en: "Syncing…", am: "በማመሳሰል ላይ…" },
  "sync.syncing-2": { en: "Syncing...", am: "የተላሳዊ ማስተካከያ..." },
  "sync.tap-to-refresh": { en: "tap to refresh", am: "ለማደስ ይጫኑ" },
  "sync.telegram-waiting": { en: "Telegram waiting", am: "ቴሌግራም ይጠብቃል" },
  "sync.update": { en: "Update", am: "አድስ" },
  "sync.update-ready": { en: "Update ready", am: "አዲስ ስሪት ዝግጁ ነው" },
  "sync.works-without-internet": { en: "works without internet", am: "ያለ ኢንተርኔት ይሰራል" },
};
