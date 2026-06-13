# AGENTS.md — Gebya Project Rules

## Product identity
Gebya is an offline-first Ethiopian shop memory assistant.

Do not turn Gebya into:
- Full POS
- ERP
- Accounting software
- Full inventory system
- Payroll
- Full HR
- Marketplace
- Credit scoring product

## Current priority
The priority is guided field testing with real shop owners and staff.

Important workflows:
- Quick sale capture
- Dubie / customer credit follow-up
- Quick Notes / shop memory
- Staff sales attribution
- Owner visibility into staff-recorded sales
- Daily reconciliation support
- Report search by item name, item code, amount, staff, note, and date
- Backup/trust cues
- Offline-first behavior

## UX rules
- Must be fast enough for a busy shop.
- Must be usable one-handed.
- Amount-first entry is preferred.
- Do not force detailed item breakdown for every sale.
- Keep optional details optional.
- Copy should feel local, simple, and trustworthy.

## Technical/product constraints
- Offline-first behavior must not break.
- Local data must remain usable even without cloud sync.
- Multi-device/staff sync is important, but should be phased carefully.
- Deleting sales should eventually become void/correction, not hard delete, but do not overbuild unless scoped.
- Do not add complex permission systems until owner/staff flow is validated.

## Required output when asked for changes
When asked to improve or implement something, produce:
1. Product judgment
2. Scope
3. Files likely affected
4. Data model impact
5. UI behavior
6. Offline/sync behavior
7. Tests
8. Acceptance criteria
9. What not to include
