// Pure helpers for the sync engine: case conversion, pull-row mapping, and a
// fetch wrapper with exponential backoff. No module-level state.

export function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
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
