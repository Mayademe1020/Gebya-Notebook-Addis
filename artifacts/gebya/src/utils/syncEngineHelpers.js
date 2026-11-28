// Pure helpers for the sync engine: case conversion, pull-row mapping, and a
// fetch wrapper with exponential backoff. No module-level state.

export function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Structural equality used by the diff/merge logic. Handles primitives,
// NaN, Date, arrays and plain objects; returns false for mismatched shapes.
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' && isNaN(a) && isNaN(b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// Fields that carry money. A true (both-sides-edited) conflict on one of these
// must never be auto-resolved by summing or by silently taking one side — that
// would duplicate or drop money. The merge keeps the local value and surfaces
// the field as a conflict for explicit resolution.
export const MONEY_FIELDS = new Set([
  'amount', 'original_amount', 'paid_amount', 'remaining_amount', 'total_debt',
  'cost_price', 'profit', 'detected_total', 'recorded_sold', 'recorded_spent',
  'recorded_collected', 'recorded_cash', 'recorded_transfer', 'actual_cash',
  'actual_transfer', 'cash_variance', 'change', 'discount', 'tax',
]);

// Bookkeeping columns that are not user data and must never be merged as
// conflicting fields (they are reconciled separately by the caller).
export const MERGE_EXCLUDED_KEYS = [
  'id', 'sync_version', 'updated_at', 'created_at', 'device_id',
  'transaction_id', 'remote_local_id',
];

/**
 * Three-way, field-level merge of one record.
 *
 * `base` is the last server-acknowledged version both devices started from
 * (the common ancestor). `local` is this device's current row; `server` is the
 * freshly pulled winning row. For each user field:
 *   - local == server           → nothing to do (both agree / both unchanged)
 *   - only local changed        → keep local
 *   - only server changed       → take server
 *   - both changed differently  → keep local, record a conflict (never sum)
 *
 * Returns { merged, conflicts }. `merged` starts from `local` so local-only
 * bookkeeping (id, sync_version, …) and shape are preserved. When `base` is
 * missing (no ancestor recorded yet) every differing field is treated as a
 * both-changed conflict — the merge degrades to "keep local, surface every
 * difference" instead of silently dropping the other device's edit.
 */
export function mergeFieldLevel(base, local, server, { excludeKeys = MERGE_EXCLUDED_KEYS } = {}) {
  const excluded = new Set(excludeKeys);
  const merged = { ...(local || {}) };
  const conflicts = [];

  const keys = new Set();
  for (const src of [base, local, server]) {
    if (src && typeof src === 'object') {
      for (const k of Object.keys(src)) keys.add(k);
    }
  }

  for (const key of keys) {
    if (excluded.has(key)) continue;
    const b = base ? base[key] : undefined;
    const l = local ? local[key] : undefined;
    const s = server ? server[key] : undefined;

    if (deepEqual(l, s)) continue; // both agree (incl. both unchanged)

    const localChanged = !deepEqual(l, b);
    const serverChanged = !deepEqual(s, b);

    if (localChanged && !serverChanged) continue; // only local edited → keep local
    if (!localChanged && serverChanged) {         // only server edited → take server
      merged[key] = s;
      continue;
    }

    // Both sides changed this field to different values (or there is no base):
    // keep the local value and surface it. Money is never summed or auto-picked.
    conflicts.push({
      key,
      base: b === undefined ? null : b,
      local: l === undefined ? null : l,
      server: s === undefined ? null : s,
      money: MONEY_FIELDS.has(key),
    });
  }

  return { merged, conflicts };
}

export function mapPullRow(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const snakeKey = camelToSnake(key);
    mapped[snakeKey] = value;
  }
  // Preserve the origin (deviceId, localId) so later edits re-key to the same
  // server row even when local auto-increment ids collide across devices.
  if (row.localId != null) mapped.remote_local_id = row.localId;
  mapped.id = row.localId || row.id;
  return mapped;
}

export async function fetchWithRetry(url, options, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // Don't retry on 4xx errors (client errors)
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      // Retry on 5xx or network errors
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText} after ${retries} retries`);
      }
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

/**
 * fetchWithRetry + transparent 401 recovery. On a 401 response, calls
 * `onAuthExpired` (typically `ensureFreshToken`) and retries the request
 * once with the new bearer. Bounded — never loops. Concurrent 401s share a
 * single in-flight refresh (handled by ensureFreshToken itself).
 *
 * `getToken` is invoked on every attempt to build the Authorization header
 * — it must read the current token from the DB so the post-refresh retry
 * picks up the new value.
 */
export async function fetchWithRetryAndAuthRefresh(
  url,
  options,
  { retries = 3, baseDelay = 1000, onAuthExpired, getToken } = {}
) {
  let didRefresh = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const reqOptions = { ...(options || {}) };
    if (typeof getToken === "function") {
      const token = await getToken();
      reqOptions.headers = {
        ...(reqOptions.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    }
    try {
      const res = await fetch(url, reqOptions);
      if (res.ok) return res;
      if (res.status === 401 && !didRefresh && typeof onAuthExpired === "function") {
        try {
          await onAuthExpired();
          didRefresh = true;
          continue; // retry with the new token (next iteration re-reads)
        } catch {
          return res; // refresh failed; surface the original 401
        }
      }
      if (res.status >= 400 && res.status < 500) {
        // Keep the status (and, when available, the server's JSON body) on the
        // error so callers can tell an expired session (401) from a permission
        // refusal (403) without parsing the message. A 4xx is not transient:
        // retrying it wastes seconds and hides the real cause.
        const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
        err.status = res.status;
        err.noRetry = res.status !== 429;
        if (typeof res.clone === "function") {
          try { err.body = await res.clone().json(); } catch { /* body not JSON */ }
        }
        throw err;
      }
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText} after ${retries} retries`);
      }
    } catch (err) {
      if (err.noRetry) throw err;
      if (attempt >= retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}
