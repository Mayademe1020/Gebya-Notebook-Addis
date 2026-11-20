// R2.1 central labels — staff surface.
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
  "staff.add-member": { en: "Add member", am: "ጨምር" },
  "staff.add-team-member": { en: "Add team member", am: "አዲስ አባል ጨምር" },
  "staff.added": { en: "added", am: "ተጨምራል" },
  "staff.already-on-the-list": { en: "Already on the list", am: "አስቀድሞ አለ" },
  "staff.error": { en: "Error: ", am: "ስህተት፡ " },
  "staff.ethiopian-mobile-09-2519-or-email-google": { en: "Ethiopian mobile 09... / +2519... OR email (Google sign-in)", am: "የኢትዮጵያ ስልክ ቁጥር (09... ወይም +2519...) ወይም ኢሜይል" },
  "staff.member-added": { en: "Member added ✓", am: "ተጨምሯል ✓" },
  "staff.no-members-yet": { en: "No members yet", am: "አባላት የሉም ገና" },
  "staff.note-optional": { en: "Note (optional)", am: "ማስታወሻ (አማራጭ)" },
  "staff.owner-accepted-collection-settled": { en: "✅ Owner accepted! Collection settled", am: "✅ ባለቤት ተቀባው አደረገ! ስብስብ ተስርቷል" },
  "staff.owner-flagged-a-difference": { en: "⚠️ Owner flagged a difference", am: "⚠️ ባለቤት ልዩነት አስተዋውሏል" },
  "staff.owner-reviewed-your-submission": { en: "👀 Owner reviewed your submission", am: "👀 ባለቤት ስብስብ አድርጓል" },
  "staff.remove": { en: "Remove", am: "አስወግድ" },
  "staff.remove-from-platform-admins": { en: (a0) => `Remove ${a0} from platform admins?`, am: (a0) => `${a0} ይወገድ?` },
  "staff.staff": { en: "Staff", am: "ሰራተኛ" },
  "staff.team-members": { en: "Team members", am: "የቡድን አባላት" },
  "staff.top-performer": { en: "Top Performer", am: "ረዢ ሰራተኛ" },
};
