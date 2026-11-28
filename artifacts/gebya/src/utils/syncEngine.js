import db from '../db';
import { getOrCreateCloudProofDeviceId } from './cloudProof';
import { camelToSnake, mapPullRow, fetchWithRetry, fetchWithRetryAndAuthRefresh } from './syncEngineHelpers.js';
import { ensureFreshToken as _ensureFreshToken } from './authClient.js';
import { useSyncStore } from '../stores/syncStore';

const SYNC_API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';
const AUTH_TOKEN_KEY = 'gebya_auth_token';
const LAST_SYNC_AT_KEY = 'gebya_last_sync_at';
const TABLE_LAST_SYNC_KEY = 'gebya_table_last_sync';
const BUSINESS_ID_KEY = 'gebya_business_id';
const OUTBOX_SEED_KEY = 'gebya_outbox_seeded_v1';

// Entity tables tracked by the durable outbox (create/update hooks + push).
const SYNC_TABLES = [
  'transactions',
  'customers',
  'customer_transactions',
  'catalog_entries',
  'suppliers',
  'supplier_transactions',
  'staff_members',
  'settlements',
];
// Key-value tables keep the legacy timestamp-based push (device-scoped noise,
// not user-facing "pending" data).
const KV_TABLES = ['settings', 'analytics'];

// Hard cap on rows per table in a single push payload. Must match the
// server's MAX_ROWS_PER_TABLE_PUSH in api-server/src/routes/sync.ts — if
// either side raises the limit, the other must follow. Without this cap
// the server silently slices the payload and the client would ack rows the
// server never applied (permanent data loss for long-offline devices).
const MAX_PUSH_ROWS_PER_TABLE = 500;

// Pull requests re-read a safety window behind the cursor so records stamped by
// devices with skewed clocks are never skipped. Re-delivered rows are deduped
// by the version-aware merge below.
const PULL_OVERLAP_MS = 60 * 1000;
// Batch window for hook-triggered pushes.
const PUSH_DEBOUNCE_MS = 500;

// Retry constants for exponential backoff
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 300000; // 5 minutes
const RETRY_BACKOFF_MULTIPLIER = 2;

// Maximum outbox size to prevent indefinite growth during extended outages
const MAX_OUTBOX_SIZE = 10000;
// Maximum queue size per table
const MAX_TABLE_QUEUE_SIZE = 1000;

function _deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' && isNaN(a) && isNaN(b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!_deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

let syncEngineInstance = null;

// ─── JWT helpers ───
export async function getAuthToken() {
  const row = await db.settings.get(AUTH_TOKEN_KEY);
  return row?.value || null;
}

export async function setAuthToken(token) {
  await db.settings.put({ key: AUTH_TOKEN_KEY, value: token });
  // Auto-trigger sync after setting auth token (e.g., after sign-in)
  // This makes the "Sign in to sync" button unnecessary - sync happens automatically
  // Use microtask to ensure we yield to the event loop, then sync if needed
  if (typeof window !== 'undefined' && window.queueMicrotask) {
    queueMicrotask(async () => {
      try {
        if (!syncEngineInstance) return;
        if (syncEngineInstance.status === 'syncing') return;
        const pending = await db.sync_outbox.count();
        if (pending > 0) {
          await syncEngineInstance.sync();
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[sync] auto-sync after auth failed:', err);
        }
      }
    });
  } else {
    // Fallback for older browsers
    setTimeout(async () => {
      try {
        if (!syncEngineInstance) return;
        if (syncEngineInstance.status === 'syncing') return;
        const pending = await db.sync_outbox.count();
        if (pending > 0) {
          await syncEngineInstance.sync();
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[sync] auto-sync after auth failed:', err);
        }
      }
    }, 0);
  }
}

export async function clearAuthToken() {
  await db.settings.delete(AUTH_TOKEN_KEY);
}

// Wrap ensureFreshToken for the 401-retry path: persist the refreshed token
// so the very next getToken() read (same tick, retry attempt) sees the new
// value. Idempotent with ensureFreshToken's own persistence.
async function _refreshAuth() {
  const result = await _ensureFreshToken();
  if (result?.ok && result.token) await setAuthToken(result.token);
  return result;
}

/**
 * Decide what a failed sync means for the session.
 *
 * 401 after the refresh attempt already failed = the session is gone, so the
 * caller may clear the token and show sign-in. 403 is different: the token is
 * valid, the shop or feature simply does not allow this action. Treating 403
 * as an expired session deleted a staff phone's token when the owner switched
 * "view reports" off (H3), which stopped its sync entirely.
 *
 * Exported so the classification can be tested without a live engine.
 */
export function classifySyncError(err) {
  const status = typeof err?.status === 'number'
    ? err.status
    : (() => {
        const match = /(?:HTTP\s+|failed:\s*)(\d{3})/.exec(err?.message || '');
        return match ? Number(match[1]) : null;
      })();

  if (status === 401) return { kind: 'auth', status };

  if (status === 403) {
    const body = err?.body;
    const message = body?.error
      ? `${body.error}${body.hint ? ` — ${body.hint}` : ''}`
      : (err?.message || 'Permission denied');
    return { kind: 'permission', status, message };
  }

  return { kind: 'error', status, message: err?.message || 'Sync failed' };
}


class SyncEngine {
  constructor() {
    this.deviceId = null;
    this.status = 'idle';
    this.error = null;
    this.lastSyncAt = 0;
    this.tableLastSync = {};
    this.businessId = null;
    this.listeners = [];
    this.unsubscribers = [];
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.timer = null;
    this._pushDebounce = null;
    this._pulling = false;
    this.pendingCount = 0;
    this._wroteDuringSync = false;
    this._isCharging = true;
    this._batteryLevel = 1;
  }

  _notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
    try {
      useSyncStore.getState().setSyncState(state);
    } catch { /* ignore if store not initialized yet */ }
  }

  _warnConflict(message, details) {
    try {
      useSyncStore.getState().setConflictWarning(message);
      if (details && details.length > 0) {
        useSyncStore.getState().setConflictDetails(details);
      }
      // Log conflict event for frequency tracking (Section D)
      this._logConflictEvent(message, details);
    } catch { /* ignore */ }
  }

  async _logConflictEvent(message, details) {
    try {
      const now = Date.now();
      const day = new Date(now).toISOString().split('T')[0];
      const existing = await db.settings.get(`conflict_log_${day}`);
      const prev = existing?.value || { count: 0, events: [] };
      await db.settings.put({
        key: `conflict_log_${day}`,
        value: {
          count: (prev.count || 0) + 1,
          events: [
            ...(prev.events || []),
            {
              ts: now,
              message,
              table: details?.[0]?.table || 'unknown',
              recordCount: details?.length || 0,
              changedFields: details?.[0]?.changedFields || [],
            },
          ].slice(-50), // keep last 50 per day
        },
      });
    } catch { /* non-critical */ }
  }

  _diffFields(local, remote, excludeKeys = ['id', 'sync_version', 'updated_at', 'created_at', 'device_id', 'transaction_id']) {
    const changed = [];
    for (const key of Object.keys(remote)) {
      if (excludeKeys.includes(key)) continue;
      const l = local?.[key];
      const r = remote?.[key];
      if (!_deepEqual(l, r)) {
        changed.push(key);
      }
    }
    return changed;
  }

  getState() {
    return {
      status: this.status,
      error: this.error,
      lastSyncAt: this.lastSyncAt,
      online: this.online,
      businessId: this.businessId,
      pendingCount: this.pendingCount,
    };
  }

  onChange(cb) {
    this.listeners.push(cb);
    cb(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  onAuthRequired(cb) {
    this._onAuthRequired = cb;
  }

  async init() {
    this.deviceId = await getOrCreateCloudProofDeviceId();

    const globalRow = await db.settings.get(LAST_SYNC_AT_KEY);
    if (globalRow?.value) this.lastSyncAt = Number(globalRow.value);

    const tableRow = await db.settings.get(TABLE_LAST_SYNC_KEY);
    if (tableRow?.value) this.tableLastSync = tableRow.value;

    const bizRow = await db.settings.get(BUSINESS_ID_KEY);
    if (bizRow?.value) this.businessId = bizRow.value;

    this._setupOnlineListeners();
    this._setupDexieHooks();
    this._setupPeriodicSync();
    this._requestPersistentStorage();
    this._initBatteryStatus();
    await this._seedOutbox();
    await this._countPending();

    // No navigator.onLine gate here: it is unreliable in installed PWAs and
    // previously caused endless "Pending sync". sync() attempts unconditionally
    // and surfaces real network failures instead.
    if (this.pendingCount > 0) {
      this.sync();
    }
  }

  async _initBatteryStatus() {
    // Battery-aware sync: check if device is charging before syncing
    // If battery API is unavailable, assume device is always charging
    if (typeof navigator === 'undefined' || !navigator.getBattery) return;
    
    try {
      const battery = await navigator.getBattery();
      this._isCharging = battery.charging;
      this._batteryLevel = battery.level;
      
      // Update charging status when it changes
      battery.addEventListener('chargingchange', () => {
        this._isCharging = battery.charging;
        if (this._isCharging && this.pendingCount > 0 && this.status === 'idle') {
          // Start syncing when device starts charging
          this.sync();
        }
      });
      
      battery.addEventListener('levelchange', () => {
        this._batteryLevel = battery.level;
      });
      
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[sync] battery status:', battery.charging ? 'charging' : 'discharging', Math.round(battery.level * 100) + '%');
      }
    } catch {
      // Battery API not supported - default to syncing
      this._isCharging = true;
    }
  }

  /**
   * Request persistent storage so the OS does not evict our IndexedDB under
   * disk pressure. The browser may grant or deny (and may not support the
   * API at all in private mode); any of those outcomes is fine — we just try.
   */
  _requestPersistentStorage() {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    navigator.storage.persist().then((granted) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[sync] persistent storage', granted ? 'granted' : 'not granted');
      }
    }).catch(() => { /* non-fatal */ });
  }

  /**
   * One-time migration: seed the outbox with any entity rows newer than the
   * last acknowledged sync so upgrades never lose already-pending writes.
   */
  async _seedOutbox() {
    try {
      const seeded = await db.settings.get(OUTBOX_SEED_KEY);
      if (seeded?.value) return;
      const now = Date.now();
      for (const name of SYNC_TABLES) {
        const table = db[name];
        if (!table) continue;
        const rows = await table.where('updated_at').above(this.lastSyncAt).toArray();
        for (const row of rows) {
          if (row?.id == null) continue;
          await db.sync_outbox.put({ key: `${name}:${row.id}`, table: name, record_id: row.id, created_at: now });
        }
      }
      await db.settings.put({ key: OUTBOX_SEED_KEY, value: true });
    } catch { /* non-fatal: worst case the next hook write re-enqueues */ }
  }

  _setupPeriodicSync() {
    this.timer = setInterval(async () => {
      // Battery-aware periodic sync:
      // - When charging or on AC power: sync normally
      // - When on battery: only sync if battery level > 20% to preserve user's battery
      // - When app is in foreground: sync regardless (user is actively using it)
      const appVisible = document.visibilityState === 'visible';
      const canAffordSync = appVisible || this._isCharging || this._batteryLevel > 0.2;
      
      if (canAffordSync) {
        this.sync();
      } else if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[sync] skipping periodic sync (battery conservation):', Math.round(this._batteryLevel * 100) + '%');
      }
    }, 5 * 60 * 1000);
  }

  _setupOnlineListeners() {
    const onOnline = () => { this.online = true; this.sync(); };
    const onOffline = () => { this.online = false; this.status = 'offline'; this._notify(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.unsubscribers.push(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });

    // Professional touch: when the tab/app returns to the foreground (e.g. the
    // user switched away and back, or the PWA was backgrounded), kick a sync
    // immediately if there is anything pending. Combined with the `online`
    // event and the periodic timer, this means sync "just happens" on
    // reconnect or resume — no tap, no sign-in required.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.pendingCount > 0) {
        this.sync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    this.unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisible));
  }

  async _registerBackgroundSync(tag = 'gebya-sync') {
    // Register a background sync event via the Service Worker
    // This ensures sync happens when connectivity returns, even if the PWA is closed
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        await registration.sync.register(tag);
        return true;
      }
    } catch (err) {
      // Sync registration may fail if SW is not active or browser doesn't support it
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[sync] background sync registration failed:', err);
      }
    }
    return false;
  }

  _setupDexieHooks() {
    SYNC_TABLES.forEach((tableName) => {
      const table = db[tableName];
      if (!table?.hook) return;

      const onCreate = (primKey, obj, trans) => {
        // Ensure sync_version is set on new records
        if (obj.sync_version === undefined || obj.sync_version === null) {
          obj.sync_version = 1;
        }
        this._enqueueOutbox(tableName, primKey);
      };
      const onUpdate = (modifications, primKey, obj, trans) => {
        // Increment sync_version on updates (if not already set by caller)
        if (!modifications.sync_version) {
          const currentVersion = obj.sync_version || 1;
          modifications.sync_version = currentVersion + 1;
        }
        this._enqueueOutbox(tableName, primKey);
      };

      table.hook('creating', onCreate);
      table.hook('updating', onUpdate);

      this.unsubscribers.push(() => {
        table.hook('creating').unsubscribe(onCreate);
        table.hook('updating').unsubscribe(onUpdate);
      });
    });

    KV_TABLES.forEach((tableName) => {
      const table = db[tableName];
      if (!table?.hook) return;
      const onCreate = (primKey, obj, trans) => {
        if (obj.sync_version === undefined || obj.sync_version === null) {
          obj.sync_version = 1;
        }
        this._schedulePush();
      };
      const onUpdate = (modifications, primKey, obj, trans) => {
        if (!modifications.sync_version) {
          const currentVersion = obj.sync_version || 1;
          modifications.sync_version = currentVersion + 1;
        }
        this._schedulePush();
      };
      table.hook('creating', onCreate);
      table.hook('updating', onUpdate);
      this.unsubscribers.push(() => {
        table.hook('creating').unsubscribe(onCreate);
        table.hook('updating').unsubscribe(onUpdate);
      });
    });
  }

  /**
   * Record a local write in the durable outbox and schedule a push.
   * Safe to call from synchronous Dexie hooks (fire-and-forget promise).
   * Also registers background sync to ensure data is pushed when connectivity returns.
   */
  async _enqueueOutbox(tableName, recordId) {
    if (this._pulling) return;
    if (recordId == null || !db.sync_outbox) return;
    if (this.status === 'syncing') this._wroteDuringSync = true;
    
    Promise.resolve(
      db.sync_outbox.put({ key: `${tableName}:${recordId}`, table: tableName, record_id: recordId, created_at: Date.now() })
    )
      .then(() => this._refreshPending())
      .catch(() => { /* outbox unavailable — legacy timestamp scan still covers it */ });
    
    this._schedulePush();
    
    // Register background sync for offline-first guarantee
    // This ensures data syncs even if the user closes the app or loses connectivity
    if (this.pendingCount > 0) {
      this._registerBackgroundSync('gebya-sync');
    }
  }

  /** Recount pending from the authoritative source (the outbox itself). */
  async _refreshPending() {
    try {
      const count = await db.sync_outbox.count();
      // Enforce max queue size
      if (count > MAX_OUTBOX_SIZE) {
        console.warn(`[sync] outbox exceeded max size: ${count} > ${MAX_OUTBOX_SIZE}. Consider full sync.`);
        // Could implement FIFO eviction here, but for now just warn
      }
      this.pendingCount = count;
      this._notify();
    } catch { /* ignore */ }
  }

  /** Debounce a near-term sync burst into one network round-trip. */
  _schedulePush() {
    if (this._pulling) return;
    if (this._pushDebounce) clearTimeout(this._pushDebounce);
    this._pushDebounce = setTimeout(() => this.sync(), PUSH_DEBOUNCE_MS);
  }

  async _countPending() {
    // The outbox is the single source of truth for unacknowledged writes.
    try {
      const count = await db.sync_outbox.count();
      if (count > MAX_OUTBOX_SIZE) {
        console.warn(`[sync] outbox size ${count} exceeds max ${MAX_OUTBOX_SIZE}`);
      }
      this.pendingCount = count;
    } catch {
      this.pendingCount = 0;
    }
  }

  async sync() {
    const token = await getAuthToken();
    if (!token) {
      this.status = 'unauthenticated';
      this._notify();
      return;
    }
    // NOTE: intentionally do NOT gate on `this.online` here. `navigator.onLine`
    // is unreliable inside installed PWA / standalone webviews and can stay
    // `false` even when the network is fine, which previously made sync()
    // silently no-op forever (endless "Pending sync"). We always attempt and
    // let the fetch fail loudly so the real error is surfaced.
    if (this.status === 'syncing') return;

    this.status = 'syncing';
    this.error = null;
    this._notify();

    try {
      await Promise.all([
        this._pushAll(token),
        this._pullAll(token),
      ]);
      // Update lastSyncAt BEFORE recounting pending, otherwise the recount
      // uses the stale timestamp and the queue never appears to drain.
      this.lastSyncAt = Date.now();
      await db.settings.put({ key: LAST_SYNC_AT_KEY, value: this.lastSyncAt });
      await db.settings.put({ key: TABLE_LAST_SYNC_KEY, value: this.tableLastSync });
      await this._countPending();
      this.status = 'idle';
      // If records were written while this cycle was pushing, their debounced
      // sync was swallowed by the 'syncing' guard — schedule another now so
      // they never sit behind the next periodic tick.
      if (this._wroteDuringSync) {
        this._wroteDuringSync = false;
        this._schedulePush();
      }
      // Silent background follow-through for integration queues (fire-and-
      // forget; dynamic import avoids a static import cycle with syncQueue).
      if (typeof window !== 'undefined') {
        import('./syncQueue')
          .then((m) => m.drainTelegramSyncQueue({ limit: 3 }).catch(() => {}))
          .catch(() => {});
      }
    } catch (err) {
      const failure = classifySyncError(err);
      if (failure.kind === 'auth') {
        this.status = 'unauthenticated';
        await clearAuthToken();
        if (this._onAuthRequired) {
          try { this._onAuthRequired(); } catch { /* listener error */ }
        }
      } else {
        this.status = 'error';
        this.error = failure.message;
      }
      if (import.meta.env.DEV) console.error('[sync]', err);
    }
    this._notify();
  }

  /**
   * Force a full sync from the beginning of time. Used when a user joins a
   * new business so they download the entire shop history immediately.
   */
  async fullSync() {
    const token = await getAuthToken();
    if (!token) {
      this.status = 'unauthenticated';
      this._notify();
      return;
    }
    if (this.status === 'syncing') return;

    const previousLastSync = this.lastSyncAt;
    const previousTableLastSync = { ...this.tableLastSync };

    this.lastSyncAt = 0;
    this.tableLastSync = {};
    this.status = 'syncing';
    this.error = null;
    this._notify();

    try {
      await Promise.all([
        this._pushAll(token),
        this._pullAll(token),
      ]);
      this.lastSyncAt = Date.now();
      await db.settings.put({ key: LAST_SYNC_AT_KEY, value: this.lastSyncAt });
      await db.settings.put({ key: TABLE_LAST_SYNC_KEY, value: this.tableLastSync });
      await this._countPending();
      this.status = 'idle';
      if (this._wroteDuringSync) {
        this._wroteDuringSync = false;
        this._schedulePush();
      }
    } catch (err) {
      this.lastSyncAt = previousLastSync;
      this.tableLastSync = previousTableLastSync;
      const failure = classifySyncError(err);
      if (failure.kind === 'auth') {
        this.status = 'unauthenticated';
        await clearAuthToken();
        if (this._onAuthRequired) {
          try { this._onAuthRequired(); } catch { /* listener error */ }
        }
      } else {
        this.status = 'error';
        this.error = failure.message;
      }
      if (import.meta.env.DEV) console.error('[sync full]', err);
    }
    this._notify();
  }

  async _pushAll(token) {
    const payload = { device_id: this.deviceId, tables: {} };
    // Per-table ack keys so the server's per-table applied-count can decide
    // which entries are safe to retire (defence-in-depth against the server
    // capping rows and the client not knowing which were dropped).
    const ackKeysByTable = Object.create(null);
    // Per-table count of rows actually included in the payload — compared
    // against response.results[name].count to detect truncation.
    const sentCountByTable = Object.create(null);

    const entries = db.sync_outbox ? await db.sync_outbox.toArray() : [];
    const byTable = {};
    for (const entry of entries) {
      if (!byTable[entry.table]) byTable[entry.table] = [];
      byTable[entry.table].push(entry);
    }

    for (const name of SYNC_TABLES) {
      const tableEntries = byTable[name];
      if (!tableEntries?.length) continue;

      const ids = tableEntries.map((e) => e.record_id);
      const loaded = (await db[name].bulkGet(ids)) || [];
      // Cap the per-table payload at the server's hard limit. The remaining
      // outbox entries for this table stay queued and ship on the next cycle
      // — never silently dropped.
      const rows = loaded.filter(Boolean).slice(0, MAX_PUSH_ROWS_PER_TABLE);

      // Rows pulled from another device carry their origin here. Re-key them
      // to that origin so edits (e.g. an owner's settlement review) update the
      // same server row instead of spawning a duplicate.
      payload.tables[name] = rows.map((row) =>
        (row.remote_local_id != null && row.device_id)
          ? { ...row, id: row.remote_local_id, device_id: row.device_id }
          : row
      );

      // Only mark outbox entries whose rows we actually included in the
      // payload. Entries beyond the cap stay in the outbox for next cycle.
      const includedIds = new Set(rows.map((r) => r.id));
      ackKeysByTable[name] = tableEntries
        .filter((entry) => includedIds.has(entry.record_id))
        .map((entry) => entry.key);
      sentCountByTable[name] = rows.length;
      if (!rows.length) delete payload.tables[name];
    }

    for (const name of KV_TABLES) {
      const all = await db[name].toArray();
      const changed = all.filter((r) => (r.updated_at || r.created_at || 0) > this.lastSyncAt);
      if (changed.length) payload.tables[name] = changed;
    }

    const hasData = Object.values(payload.tables).some((arr) => arr.length > 0);
    if (!hasData) return;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.businessId) headers['x-business-id'] = String(this.businessId);

    const res = await fetchWithRetryAndAuthRefresh(`${SYNC_API_BASE}/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }, {
      onAuthExpired: _refreshAuth,
      getToken: getAuthToken,
    });

    if (!res.ok) {
      let friendly = `Push failed: ${res.status}`;
      try {
        const errBody = await res.json();
        if (res.status === 403 && errBody.missing_permission) {
          const permLabel = {
            can_add_records: 'record sales & expenses',
            can_delete_records: 'delete records',
            can_edit_settings: 'edit shop settings',
            can_view_reports: 'view reports',
          }[errBody.missing_permission] || errBody.missing_permission;
          friendly = `You don't have permission to ${permLabel}. Ask your shop owner to enable it in Team settings.`;
        } else if (errBody.error) {
          friendly = errBody.error;
        }
      } catch { /* ignore */ }
      const error = new Error(friendly);
      error.status = res.status;
      throw error;
    }

    const response = await res.json();

    // Server acknowledged — retire only the outbox entries the server
    // confirmed it applied. If a table was truncated (results[name].count
    // < sentCountByTable[name]), KEEP those entries: they will retry on the
    // next sync cycle instead of being silently lost. If `results` is absent
    // (older server / cached response), fall back to the legacy behaviour
    // and trust the HTTP 200.
    const ackKeys = [];
    const results = response?.results;
    for (const name of Object.keys(ackKeysByTable)) {
      const applied = results?.[name]?.count;
      if (typeof applied === 'number' && applied < (sentCountByTable[name] || 0)) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            `[sync] push truncated on ${name}: sent ${sentCountByTable[name]}, ` +
            `server applied ${applied} — keeping outbox entries for retry`
          );
        }
        continue;
      }
      ackKeys.push(...ackKeysByTable[name]);
    }
    if (ackKeys.length && db.sync_outbox) {
      try { await db.sync_outbox.bulkDelete(ackKeys); } catch { /* recount heals */ }
    }

    // Track business_id from server if returned
    if (response.business_id) {
      this.businessId = response.business_id;
      await db.settings.put({ key: BUSINESS_ID_KEY, value: response.business_id });
    }

    // Handle conflicts: re-pull and re-merge conflicting records
    if (response.conflicts && response.conflicts.length > 0) {
      const count = response.conflicts.length;
      const summary = `${count} record${count > 1 ? 's' : ''} had conflicting edits. The latest version was kept.`;
      this._warnConflict(summary);
      try { useSyncStore.getState().setLastConflicts(response.conflicts); } catch { /* ignore */ }
      await this._resolveConflicts(response.conflicts, token);
      try { useSyncStore.getState().setLastConflicts([]); } catch { /* ignore */ }
    }
  }

  async _resolveConflicts(conflicts, token) {
    // Batched resolution: ONE pull request covers every conflicting record,
    // instead of the previous one-request-per-record pattern that multiplied
    // latency (and rate-limit pressure) during multi-record conflicts.
    const resolveConflicts = []; // field-level diffs surfaced to the user
    if (!Array.isArray(conflicts) || conflicts.length === 0) return;

    // Load local records once (by provenance first; localId is the origin id
    // for rows re-keyed from another device).
    const locals = new Map(); // `${table}:${localId}` -> localRecord
    let minUpdatedAt = Infinity;
    for (const conflict of conflicts) {
      const tableName = conflict.table;
      const localId = conflict.localId;
      let localRecord = await db[tableName]?.get(localId);
      if (!localRecord && tableName !== 'settings' && tableName !== 'analytics') {
        localRecord = await db[tableName]?.where('remote_local_id').equals(localId).first();
      }
      if (!localRecord) continue;
      locals.set(`${tableName}:${localId}`, { localRecord, table: tableName, localId });
      minUpdatedAt = Math.min(minUpdatedAt, localRecord.updated_at || 0);
    }
    if (locals.size === 0) return;

    // Single server pull covering every conflicted row.
    const resolveHeaders = {};
    if (this.businessId) resolveHeaders['x-business-id'] = String(this.businessId);
    let serverTables = {};
    try {
      const serverRes = await fetchWithRetryAndAuthRefresh(
        `${SYNC_API_BASE}/sync/pull?since=${Math.max(0, minUpdatedAt - 1)}&limit=1000`,
        { headers: resolveHeaders },
        {
          onAuthExpired: _refreshAuth,
          getToken: getAuthToken,
        }
      );
      if (serverRes.ok) ({ tables: serverTables = {} } = await serverRes.json());
    } catch { /* network hiccup — keep local versions, next cycle retries */ }

    // Index server rows by origin localId per table.
    const serverIndex = {};
    for (const [tableName, rows] of Object.entries(serverTables || {})) {
      serverIndex[tableName] = new Map();
      for (const row of rows || []) {
        serverIndex[tableName].set(row.localId != null ? row.localId : row.id, row);
      }
    }

    for (const { localRecord, table: tableName, localId } of locals.values()) {
      try {
        const serverRecord = serverIndex[tableName]?.get(localId);
        if (!serverRecord) continue;

        // Compute diff before resolving
        const mappedServer = mapPullRow(serverRecord);
        const changedFields = this._diffFields(localRecord, mappedServer);
        if (changedFields.length > 0) {
          resolveConflicts.push({
            table: tableName,
            recordId: localId,
            transactionId: localRecord.transaction_id || null,
            changedFields,
            localVersion: localRecord,
            serverVersion: mappedServer,
          });
        }

        // Merge: accept server version but bump local version so next push wins
        const merged = { ...localRecord };
        merged.sync_version = (serverRecord.syncVersion || 1) + 1;
        merged.updated_at = Date.now();

        await db[tableName].put(merged);
      } catch (err) {
        if (import.meta.env.DEV) console.error('[sync] conflict resolution failed:', err);
      }
    }

    // Re-push the merged records
    await this._pushAll(token);

    // Surface push-conflict diffs to the user
    if (resolveConflicts.length > 0) {
      const count = resolveConflicts.length;
      const summary = `${count} record${count > 1 ? 's' : ''} had conflicting edits. Your version was kept; here's what changed elsewhere:`;
      this._warnConflict(summary, resolveConflicts);
    }
  }

  async _pullAll(token) {
    this._pulling = true;
    try {
      const tables = [
        'transactions',
        'customers',
        'customer_transactions',
        'catalog_entries',
        'suppliers',
        'supplier_transactions',
        'staff_members',
        'settlements',
      ];
      const kvTables = ['settings', 'analytics'];
      const allTables = [...tables, ...kvTables];

      let hasMore = true;
      // Start slightly behind the cursor: other devices' `updated_at` values
      // come from their own clocks, so a strict `>` cutoff can permanently
      // skip rows stamped by a skewed device. Re-delivered rows are cheap —
      // the merge below is idempotent and version-aware.
      let cursor = Math.max(0, this.lastSyncAt - PULL_OVERLAP_MS);
      let pulledAny = false;
      const pullConflicts = [];

      while (hasMore) {
        const pullHeaders = {};
        if (this.businessId) pullHeaders['x-business-id'] = String(this.businessId);

        const res = await fetchWithRetryAndAuthRefresh(
          `${SYNC_API_BASE}/sync/pull?since=${cursor}&limit=200`,
          { headers: pullHeaders },
          {
            onAuthExpired: _refreshAuth,
            getToken: getAuthToken,
          }
        );
        if (!res.ok) {
          const error = new Error(`Pull failed: ${res.status}`);
          error.status = res.status;
          throw error;
        }
        const { tables: serverTables, hasMore: pageHasMore, nextCursor, business_id } = await res.json();
        if (!serverTables) break;

        if (business_id) {
          this.businessId = business_id;
          await db.settings.put({ key: BUSINESS_ID_KEY, value: business_id });
        }

        await db.transaction(
          'rw',
          db.transactions,
          db.customers,
          db.customer_transactions,
          db.catalog_entries,
          db.suppliers,
          db.supplier_transactions,
          db.staff_members,
          db.settlements,
          db.settings,
          db.analytics,
          async () => {
            for (const [name, rows] of Object.entries(serverTables)) {
              const table = db[name];
              if (!table || !rows?.length) continue;

              const isKeyValueTable = name === 'settings' || name === 'analytics';

              for (const row of rows) {
                const mapped = mapPullRow(row);

                if (isKeyValueTable) {
                  const local = await table.get(mapped.key);
                  if (local && (local.updated_at || 0) >= (mapped.updated_at || 0)) continue;
                  await table.put(mapped);
                  continue;
                }

                let local = null;
                if (mapped.transaction_id) {
                  local = await table.where('transaction_id').equals(mapped.transaction_id).first();
                }
                // Match by origin (deviceId, localId) before falling back to local
                // id. This avoids duplicate rows when two devices auto-increment to
                // the same local id.
                if (!local && mapped.remote_local_id != null && mapped.device_id) {
                  local = await table.where('remote_local_id').equals(mapped.remote_local_id)
                    .and((r) => r.device_id === mapped.device_id)
                    .first();
                }
                if (!local) {
                  local = await table.get(mapped.id);
                }

                if (!local) {
                  delete mapped.id;
                  await table.add(mapped);
                } else {
                  // Skip only when the local copy is strictly not older.
                  // Comparing sync_version as a tie-breaker protects against
                  // clock skew between devices (same timestamp, newer version
                  // must still win).
                  const lUpd = local.updated_at || 0;
                  const rUpd = mapped.updated_at || 0;
                  const lVer = local.sync_version || 0;
                  const rVer = mapped.sync_version || 0;
                  if (lUpd > rUpd || (lUpd === rUpd && lVer >= rVer)) continue;
                  const changedFields = this._diffFields(local, mapped);
                  if (changedFields.length > 0) {
                    pullConflicts.push({
                      table: name,
                      recordId: local.id,
                      transactionId: mapped.transaction_id,
                      changedFields,
                      localVersion: local,
                      serverVersion: mapped,
                    });
                  }
                  await table.put({ ...mapped, id: local.id });
                }
              }

              if (rows.length > 0) {
                const maxUpdatedAt = Math.max(...rows.map((r) => r.updatedAt || r.createdAt || 0));
                this.tableLastSync[name] = Math.max(this.tableLastSync[name] || 0, maxUpdatedAt);
                pulledAny = true;
              }
            }
          }
        );

        hasMore = !!pageHasMore;
        if (hasMore && nextCursor) {
          cursor = nextCursor;
        } else {
          hasMore = false;
        }

        if (!pulledAny && !hasMore) break;
      }

      if (pullConflicts.length > 0) {
        const count = pullConflicts.length;
        const summary = `${count} record${count > 1 ? 's' : ''} updated elsewhere. Local edits were preserved where possible.`;
        this._warnConflict(summary, pullConflicts);
      }
    } finally {
      this._pulling = false;
    }
  }

  destroy() {
    this.unsubscribers.forEach((fn) => fn());
    this.unsubscribers = [];
    if (this._pushDebounce) clearTimeout(this._pushDebounce);
    if (this.timer) clearInterval(this.timer);
  }
}

export async function initSyncEngine(onAuthRequired) {
  if (syncEngineInstance) return syncEngineInstance;
  syncEngineInstance = new SyncEngine();
  if (onAuthRequired) syncEngineInstance.onAuthRequired(onAuthRequired);
  await syncEngineInstance.init();
  return syncEngineInstance;
}

export function getSyncEngine() {
  return syncEngineInstance;
}

export function destroySyncEngine() {
  syncEngineInstance?.destroy();
  syncEngineInstance = null;
}

/**
 * Trigger a full sync from the beginning of time. Call this after a user
 * joins a new business so their phone downloads the entire shop history.
 */
export async function forceFullSync() {
  if (!syncEngineInstance) return false;
  await syncEngineInstance.fullSync();
  return true;
}

/**
 * Listen for SW sync trigger messages and execute sync
 * This enables background sync to work when the SW receives sync events
 * even if the page is not active
 */
export function initSwSyncListener() {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  
  const handleMessage = (event) => {
    if (event.data?.type === 'gebya-sync-trigger') {
      if (syncEngineInstance && syncEngineInstance.status !== 'syncing') {
        syncEngineInstance.sync();
      }
    }
  };
  
  window.addEventListener('message', handleMessage);
  
  // Return cleanup function
  return () => window.removeEventListener('message', handleMessage);
}
