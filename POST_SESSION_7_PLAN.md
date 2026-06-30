# Post-Session 7 Implementation Plan

## Priority Order

### 1. Permission-Denied UX in Sync (30 min)
**Problem:** Staff gets generic "Something went wrong" when they try to delete/edit without permission.
**Fix:**
- Backend returns 403 with body: `{ error: "Permission denied", missing_permission: "can_delete_records", hint: "Contact your shop owner to grant access" }`
- Frontend catches 403 during sync push → shows staff-friendly message: "You don't have permission to do this. Ask your owner to enable it in Team settings."

### 2. Offline Conflict Warning for Staff (20 min)
**Problem:** When staff's offline changes conflict with server version, sync fails silently.
**Fix:**
- In `syncEngine.js`, when server returns 409 Conflict, surface a warning: "Your changes conflict with someone else's edits. Your version was saved locally. Ask the owner to resolve it."

### 3. Conflict Resolution UI for Owner (1 hour)
**Problem:** Two staff edit same record offline → backend returns conflict → owner has no way to see/resolve.
**Fix:**
- Add "Conflicts" card in OwnerActivityDashboard
- Show conflicting records: local version vs server version
- Owner picks which version to keep
- Click "Keep mine" or "Keep theirs"

### 4. Bulk Staff Import (45 min)
**Problem:** Shops with 5+ staff need faster onboarding.
**Fix:**
- In Team page, add "Import from CSV" button
- Parse CSV: name, phone, role
- Create all invites in batch
- Show success count + failures per row

---

**Recommended order: 1 → 2 → 3 → 4**

Start with #1 and #2 because they're fast and immediately improve the real-user experience.