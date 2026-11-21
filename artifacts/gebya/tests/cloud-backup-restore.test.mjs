// P0-4b — cloud backup history + one-tap restore.
//
// The server has stored snapshots for months (api-server/src/routes/backup.ts)
// and nothing in the client ever listed or downloaded one, so a shop whose
// phone died had no way back. These tests are the contract for the missing
// half: list, download, and a restore that is recoverable.
//
// Run: ./node_modules/.bin/vitest run tests/cloud-backup-restore.test.mjs
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import db from '../src/db.js';
import {
  listCloudSnapshots,
  downloadCloudSnapshot,
  restoreSnapshot,
  restoreLocalSafetySnapshot,
  validateSnapshotPayload,
} from '../src/utils/cloudBackups.js';
import { LOCAL_SAFETY_KEY } from '../src/utils/localSafetyBackup.js';
import { buildBackupPayload } from '../src/utils/backupPayload.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function snapshotRow(overrides = {}) {
  return {
    id: 7,
    name: 'Auto-backup 2026-11-20',
    description: 'Weekly auto-backup from Gebya',
    deviceId: 'device-1',
    sizeBytes: 512,
    tables: ['transactions', 'customers'],
    recordCount: 3,
    checksum: 'abc',
    createdAt: Date.UTC(2026, 10, 20, 9, 0, 0),
    ...overrides,
  };
}

function makeTables(overrides = {}) {
  return {
    transactions: [{ id: 1, amount: 100, item_name: 'Teff' }],
    customers: [{ id: 1, display_name: 'Tigist' }],
    suppliers: [],
    ...overrides,
  };
}

function makePayload(tables = makeTables(), count = 3) {
  return buildBackupPayload(tables, count);
}

const originalOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');

function setOnline(online) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

beforeEach(async () => {
  const tables = [
    db.transactions, db.customers, db.customer_transactions, db.catalog_entries,
    db.suppliers, db.supplier_transactions, db.staff_members, db.settings,
    db.analytics, db.suggestion_log, db.cross_shop_unmatched, db.credit_records,
    db.credit_payment_logs, db.daily_closings, db.local_backups,
  ];
  await Promise.all(tables.map((table) => table.clear().catch(() => null)));
  setOnline(true);
});

afterEach(() => {
  if (originalOnLine) {
    Object.defineProperty(globalThis.navigator, 'onLine', originalOnLine);
  }
});

describe('listCloudSnapshots', () => {
  it('returns an empty list when the server has no snapshots', async () => {
    const fetchImpl = async () => jsonResponse({ ok: true, snapshots: [] });
    const result = await listCloudSnapshots({ fetchImpl, token: 'token-1' });
    expect(result).toEqual({ ok: true, snapshots: [] });
  });

  it('passes the snapshots through newest-first as the server returns them', async () => {
    const rows = [snapshotRow({ id: 2 }), snapshotRow({ id: 1 })];
    const fetchImpl = async () => jsonResponse({ ok: true, snapshots: rows });
    const result = await listCloudSnapshots({ fetchImpl, token: 'token-1' });
    expect(result.ok).toBe(true);
    expect(result.snapshots.map((s) => s.id)).toEqual([2, 1]);
  });

  it('reports unauthorized on 401 instead of throwing', async () => {
    const fetchImpl = async () => jsonResponse({ error: 'Authorization required' }, 401);
    const result = await listCloudSnapshots({ fetchImpl, token: 'token-1' });
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('reports a server failure with its message', async () => {
    const fetchImpl = async () => jsonResponse({ error: 'boom' }, 500);
    const result = await listCloudSnapshots({ fetchImpl, token: 'token-1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('reports offline without touching the network', async () => {
    setOnline(false);
    let called = false;
    const fetchImpl = async () => { called = true; return jsonResponse({ snapshots: [] }); };
    const result = await listCloudSnapshots({ fetchImpl, token: 'token-1' });
    expect(result).toEqual({ ok: false, error: 'offline' });
    expect(called).toBe(false);
  });

  it('reports a network failure when fetch rejects', async () => {
    const fetchImpl = async () => { throw new Error('ECONNRESET'); };
    const result = await listCloudSnapshots({ fetchImpl, token: 'token-1' });
    expect(result).toEqual({ ok: false, error: 'network' });
  });

  it('reports unauthorized when there is no token to send', async () => {
    const fetchImpl = async () => { throw new Error('should not be called'); };
    const result = await listCloudSnapshots({ fetchImpl, token: null });
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('downloadCloudSnapshot', () => {
  it('returns the parsed payload and per-table counts', async () => {
    const payload = makePayload();
    const fetchImpl = async () => jsonResponse({ ok: true, snapshot: { ...snapshotRow(), payload } });
    const result = await downloadCloudSnapshot(7, { fetchImpl, token: 'token-1' });
    expect(result.ok).toBe(true);
    expect(result.snapshot.counts).toEqual({ transactions: 1, customers: 1, suppliers: 0 });
    expect(result.snapshot.data.gebya_backup_version).toBe(1);
  });

  it('rejects a snapshot this build cannot restore', async () => {
    const fetchImpl = async () => jsonResponse({
      ok: true,
      snapshot: { ...snapshotRow(), payload: JSON.stringify({ tables: makeTables() }) },
    });
    const result = await downloadCloudSnapshot(7, { fetchImpl, token: 'token-1' });
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('reports 404 and 401 distinctly', async () => {
    const notFound = await downloadCloudSnapshot(7, {
      fetchImpl: async () => jsonResponse({ error: 'Snapshot not found' }, 404),
      token: 'token-1',
    });
    expect(notFound).toEqual({ ok: false, error: 'not-found' });

    const unauthorized = await downloadCloudSnapshot(7, {
      fetchImpl: async () => jsonResponse({ error: 'Authorization required' }, 401),
      token: 'token-1',
    });
    expect(unauthorized).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('reports offline and network failures', async () => {
    setOnline(false);
    expect(await downloadCloudSnapshot(7, { fetchImpl: async () => jsonResponse({}), token: 't' }))
      .toEqual({ ok: false, error: 'offline' });
    setOnline(true);
    const fetchImpl = async () => { throw new Error('down'); };
    expect(await downloadCloudSnapshot(7, { fetchImpl, token: 't' }))
      .toEqual({ ok: false, error: 'network' });
  });
});

describe('validateSnapshotPayload', () => {
  it('throws on non-JSON and on a payload without the version stamp', () => {
    expect(() => validateSnapshotPayload('not json')).toThrow();
    expect(() => validateSnapshotPayload(JSON.stringify({ tables: makeTables() }))).toThrow();
    expect(() => validateSnapshotPayload(null)).toThrow();
  });
});

describe('restoreSnapshot', () => {
  it('replaces the ledger with the snapshot and writes the expected records', async () => {
    await db.customers.add({ id: 99, display_name: 'Stale customer' });
    await db.transactions.add({ id: 99, amount: 1 });

    const tables = makeTables();
    const result = await restoreSnapshot({ payload: makePayload(tables, 3) }, { now: 1_000 });

    expect(result.ok).toBe(true);
    expect(await db.customers.toArray()).toEqual(tables.customers);
    expect(await db.transactions.toArray()).toEqual(tables.transactions);
    expect(result.safety.created_at).toBe(1_000);
    expect(result.safety.record_count).toBe(2); // the two rows that were replaced
  });

  it('keeps a local copy of what it replaced, under the safety key', async () => {
    await db.customers.add({ id: 42, display_name: 'Before restore' });
    await restoreSnapshot({ payload: makePayload(makeTables(), 2) }, { now: 2_000 });

    const row = await db.local_backups.get(LOCAL_SAFETY_KEY);
    expect(row).toBeTruthy();
    expect(row.created_at).toBe(2_000);
    const saved = JSON.parse(row.payload);
    expect(saved.gebya_backup_version).toBe(1);
    expect(saved.tables.customers).toEqual([{ id: 42, display_name: 'Before restore' }]);
  });

  it('changes nothing when the snapshot is invalid', async () => {
    await db.customers.add({ id: 42, display_name: 'Keep me' });
    const result = await restoreSnapshot({ payload: JSON.stringify({ count: 0, tables: {} }) });

    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(await db.customers.toArray()).toEqual([{ id: 42, display_name: 'Keep me' }]);
    expect(await db.local_backups.count()).toBe(0);
  });

  it('does not restore the snapshot\'s session keys over this phone\'s', async () => {
    // The backup was taken while signed in, so it carries gebya_auth_token.
    // Restoring it must not swap this phone's live session for a stale token,
    // and must not collide with the preserved row under the settings key.
    await db.settings.put({ key: 'gebya_auth_token', value: 'live-token' });
    await db.settings.put({ key: 'gebya_device_id', value: 'this-phone' });

    const tables = makeTables({
      settings: [
        { key: 'gebya_auth_token', value: 'stale-token-from-old-phone' },
        { key: 'gebya_device_id', value: 'old-phone' },
        { key: 'shop_name', value: 'Tigist Shop' },
      ],
    });

    const result = await restoreSnapshot({ payload: makePayload(tables, 4) }, { now: 3_000 });

    expect(result.ok).toBe(true);
    expect((await db.settings.get('gebya_auth_token')).value).toBe('live-token');
    expect((await db.settings.get('gebya_device_id')).value).toBe('this-phone');
    expect((await db.settings.get('shop_name')).value).toBe('Tigist Shop');
  });
});

describe('restoreLocalSafetySnapshot', () => {
  it('puts back the data that was replaced by the last restore', async () => {
    await db.customers.add({ id: 42, display_name: 'Before restore' });
    await restoreSnapshot({ payload: makePayload(makeTables(), 1) }, { now: 4_000 });
    expect(await db.customers.toArray()).toEqual(makeTables().customers);

    const undone = await restoreLocalSafetySnapshot();
    expect(undone.ok).toBe(true);
    expect(await db.customers.toArray()).toEqual([{ id: 42, display_name: 'Before restore' }]);
  });

  it('reports missing when there is no local copy', async () => {
    expect(await restoreLocalSafetySnapshot()).toEqual({ ok: false, error: 'missing' });
  });
});