import { db } from '../db';

/**
 * setupCompletion — the ONE definition of "this shop is set up".
 *
 * Gate D exists to make the R2 success metric (setup completion / Ready-%)
 * measurable BEFORE the redesign ships. The metric's definition must equal the
 * readiness checklist the owner actually sees, so both the checklist
 * (ReadinessHero) and the stamp read `computeSetupChecks()` from here — they
 * cannot drift apart. See docs/R2-PLAN.md, "5/5 definition (FIX FIRST)".
 *
 * The stamp lives in `db.settings` (key/value) on purpose: that table already
 * rides the backup JSON and the sync payload, so this needs no schema change
 * and no server migration.
 */

export const SETUP_COMPLETED_AT_KEY = 'setup_completed_at';

/** Check ids in display order. ReadinessHero maps each id to its label/CTA. */
export const SETUP_CHECK_IDS = ['name', 'phone', 'channels', 'items', 'recurring'];

/**
 * The five checks, exactly as the owner defined them:
 *   1. shop profile name
 *   2. shop phone number
 *   3. at least one configured payment channel
 *   4. at least one active catalog item
 *   5. at least one recurring expense
 *
 * Never add, remove or reorder a check without recording the metric era
 * (Ruling A: the checklist composition is frozen for R2).
 */
export function computeSetupChecks({
  shopProfile = null,
  paymentChannels = [],
  catalogEntries = [],
  recurring = [],
} = {}) {
  return [
    { id: 'name', done: !!shopProfile?.name },
    { id: 'phone', done: !!shopProfile?.phone },
    {
      id: 'channels',
      done: (paymentChannels || []).some(
        c => c?.enabled && (c.usePhoneFromShop || c.phone || c.account),
      ),
    },
    {
      id: 'items',
      done: (catalogEntries || []).filter(e => e?.active !== false).length > 0,
    },
    { id: 'recurring', done: (recurring || []).length > 0 },
  ];
}

/** Progress summary: the checks plus how many are done. */
export function buildSetupSummary(input) {
  const checks = computeSetupChecks(input);
  const done = checks.filter(c => c.done).length;
  return { checks, done, total: checks.length, allDone: done === checks.length };
}

/** True only when every check is green (5/5 — no partial credit). */
export function isSetupComplete(input) {
  return buildSetupSummary(input).allDone;
}

/**
 * The stamped timestamp (ISO 8601), or null if the shop never reached 5/5.
 * Never throws: a broken settings read must not disturb the UI.
 */
export async function readSetupCompletedAt() {
  try {
    const row = await db.settings.get(SETUP_COMPLETED_AT_KEY);
    const value = row?.value;
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Write-if-null stamp — the first stamp wins, forever (Ruling 1: immutable).
 *
 * * Restore-safe: a restored old backup carries its own value, which is worn
 *   as-is; a non-null value is never overwritten, so a restore can never
 *   clobber a real timestamp.
 * * Backfill-on-encounter: shops that were already 5/5 before Gate D get
 *   stamped the first time we see them complete — immutable alone would
 *   undercount everyone.
 * * Idempotent + cheap: safe to call on every boot and every data change.
 *
 * Runs in one read/write transaction on `settings` so two tabs (or a sync
 * write landing mid-flight) cannot produce a second, later timestamp.
 *
 * @returns the stored ISO string, or null when the shop is not 5/5 yet.
 */
export async function stampSetupCompletedAt(input, now = () => Date.now()) {
  if (!isSetupComplete(input)) return null;
  try {
    return await db.transaction('rw', db.settings, async () => {
      const row = await db.settings.get(SETUP_COMPLETED_AT_KEY);
      const existing = row?.value;
      if (typeof existing === 'string' && existing) return existing;
      const stamp = new Date(now()).toISOString();
      await db.settings.put({ key: SETUP_COMPLETED_AT_KEY, value: stamp });
      return stamp;
    });
  } catch {
    // Metric only — never let a settings write break boot or a save.
    return null;
  }
}
