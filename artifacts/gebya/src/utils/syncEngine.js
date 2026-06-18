import db from '../db';
import { getOrCreateCloudProofDeviceId } from './cloudProof';
import { useSyncStore } from '../stores/syncStore';

const SYNC_API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';
const AUTH_TOKEN_KEY = 'gebya_auth_token';

let syncEngineInstance = null;

// ─── JWT helpers ───
export async function getAuthToken() {
  const row = await db.settings.get(AUTH_TOKEN_KEY);
  return row?.value || null;
}

export async function setAuthToken(token) {
  await db.settings.put({ key: AUTH_TOKEN_KEY, value: token });
}

export async function clearAuthToken() {
  await db.settings.delete(AUTH_TOKEN_KEY);
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function mapPullRow(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const snakeKey = camelToSnake(key);
    mapped[snakeKey] = value;
  }
  mapped.id = row.localId || row.id;
  return mapped;
}

class SyncEngine {
  constructor() {
    this.deviceId = null;
    this.status = 'idle'; // idle | syncing | error | offline | unauthenticated
    this.error = null;
    this.lastSyncAt = 0;
    this.listeners = [];
    this.unsubscribers = [];
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.timer = null;
  }

  _notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
    // Phase B: Also update Zustand syncStore for global access
    try {
      useSyncStore.getState().setSyncState(state);
    } catch { /* ignore if store not initialized yet */ }
  }

  getState() {
    return {
      status: this.status,
      error: this.error,
      lastSyncAt: this.lastSyncAt,
      online: this.online,
    };
  }

  onChange(cb) {
    this.listeners.push(cb);
    cb(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  async init() {
    this.deviceId = await getOrCreateCloudProofDeviceId();
    const row = await db.settings.get('gebya_last_sync_at');
    if (row?.value) this.lastSyncAt = Number(row.value);

    this._setupOnlineListeners();
    this._setupDexieHooks();
    this._setupPeriodicSync();
  }

  _setupPeriodicSync() {
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible' && this.online) {
        this.sync();
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
  }

  _setupDexieHooks() {
    const tables = [
      'transactions',
      'customers',
      'customer_transactions',
      'catalog_entries',
      'suppliers',
      'supplier_transactions',
      'staff_members',
    ];

    tables.forEach((tableName) => {
      const table = db[tableName];
      if (!table?.hook) return;

      const onCreate = (primKey, obj, trans) => {
        this._schedulePush(tableName, 'create', obj);
      };
      const onUpdate = (modifications, primKey, obj, trans) => {
        this._schedulePush(tableName, 'update', obj);
      };

      table.hook('creating', onCreate);
      table.hook('updating', onUpdate);

      this.unsubscribers.push(() => {
        table.hook('creating').unsubscribe(onCreate);
        table.hook('updating').unsubscribe(onUpdate);
      });
    });

    const kvTables = ['settings', 'analytics'];
    kvTables.forEach((tableName) => {
      const table = db[tableName];
      if (!table?.hook) return;
      const onCreate = (primKey, obj, trans) => {
        this._schedulePush(tableName, 'create', obj);
      };
      table.hook('creating', onCreate);
      this.unsubscribers.push(() => {
        table.hook('creating').unsubscribe(onCreate);
      });
    });
  }

  _schedulePush(table, operation, record) {
    if (this._pushDebounce) clearTimeout(this._pushDebounce);
    this._pushDebounce = setTimeout(() => this.sync(), 800);
  }

  async sync() {
    const token = await getAuthToken();
    if (!token) {
      this.status = 'unauthenticated';
      this._notify();
      return;
    }
    if (!this.online || this.status === 'syncing') return;

    this.status = 'syncing';
    this.error = null;
    this._notify();

    try {
      await this._pushAll(token);
      await this._pullAll(token);
      this.lastSyncAt = Date.now();
      await db.settings.put({ key: 'gebya_last_sync_at', value: this.lastSyncAt });
      this.status = 'idle';
    } catch (err) {
      if (err.message?.includes('401') || err.message?.includes('403')) {
        this.status = 'unauthenticated';
        await clearAuthToken();
      } else {
        this.status = 'error';
        this.error = err.message || 'Sync failed';
      }
      if (import.meta.env.DEV) console.error('[sync]', err);
    }
    this._notify();
  }

  async _pushAll(token) {
    const tables = [
      'transactions',
      'customers',
      'customer_transactions',
      'catalog_entries',
      'suppliers',
      'supplier_transactions',
      'staff_members',
    ];
    const payload = { device_id: this.deviceId, tables: {} };

    for (const name of tables) {
      const rows = await db[name]
        .where('updated_at')
        .above(this.lastSyncAt)
        .toArray();
      if (rows.length) payload.tables[name] = rows;
    }

    for (const name of ['settings', 'analytics']) {
      const all = await db[name].toArray();
      const changed = all.filter((r) => (r.updated_at || r.created_at || 0) > this.lastSyncAt);
      if (changed.length) payload.tables[name] = changed;
    }

    const hasData = Object.values(payload.tables).some((arr) => arr.length > 0);
    if (!hasData) return;

    const res = await fetch(`${SYNC_API_BASE}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Push failed: ${res.status}`);
  }

  async _pullAll(token) {
    const res = await fetch(
      `${SYNC_API_BASE}/sync/pull?since=${this.lastSyncAt}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
    const { tables } = await res.json();
    if (!tables) return;

    await db.transaction(
      'rw',
      db.transactions,
      db.customers,
      db.customer_transactions,
      db.catalog_entries,
      db.suppliers,
      db.supplier_transactions,
      db.staff_members,
      db.settings,
      db.analytics,
      async () => {
        for (const [name, rows] of Object.entries(tables)) {
          const table = db[name];
          if (!table || !rows?.length) continue;

          const isKeyValueTable = name === 'settings' || name === 'analytics';

          for (const row of rows) {
            const mapped = mapPullRow(row);
            if (isKeyValueTable) {
              const local = await table.get(mapped.key);
              if (local && (local.updated_at || 0) >= (mapped.updated_at || 0)) continue;
              await table.put(mapped);
            } else {
              const local = await table.get(mapped.id);
              if (local && (local.updated_at || 0) >= (mapped.updated_at || 0)) continue;
              await table.put(mapped);
            }
          }
        }
      }
    );
  }

  destroy() {
    this.unsubscribers.forEach((fn) => fn());
    this.unsubscribers = [];
    if (this._pushDebounce) clearTimeout(this._pushDebounce);
    if (this.timer) clearInterval(this.timer);
  }
}

export async function initSyncEngine() {
  if (syncEngineInstance) return syncEngineInstance;
  syncEngineInstance = new SyncEngine();
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
