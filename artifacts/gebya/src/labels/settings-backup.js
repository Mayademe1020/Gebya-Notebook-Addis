// Post-R2.1 labels — server backup history + one-tap restore (pilot P0-4b).
//
// Rule: "no anchor, no string". Every string that already exists in the R2.1
// baseline is reused from its own surface (settings-data.*, admin.*, history.*,
// customers.*, sync.*); only concepts with no approved anchor live here.
//
// The four entries below are NEW. Their Amharic is intentionally left as the
// English anchor rather than hand-written: the repo forbids inventing Amharic
// (docs/NEW_AMHARIC_STRINGS.md, "no string enters wiring without that anchor +
// reviewer pass"). They are listed there as PENDING the Merkato reviewer, who
// replaces `am` with the approved term. Until then an Amharic user sees the
// English string, which is honest and reviewable.
export default {
  "settings-backup.title": { en: "Cloud backups", am: "Cloud backups" },
  "settings-backup.no-backups-yet": { en: "No backups yet", am: "No backups yet" },
  "settings-backup.could-not-load": { en: "Could not load backups", am: "Could not load backups" },
  "settings-backup.previous-data": { en: "Previous data", am: "Previous data" },
};