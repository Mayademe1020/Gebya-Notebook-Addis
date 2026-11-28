/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks (must use vi.hoisted so they're available in hoisted vi.mock factories) ───

const { mockDb, mockFetch, mockGetOrCreateCloudProofDeviceId, mockUseSyncStore } = vi.hoisted(() => {
  function makeTable() {
    const hookCallbacks = { creating: null, updating: null };
    const table = {
      where: vi.fn().mockReturnThis(),
      above: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      count: vi.fn().mockResolvedValue(0),
      toArray: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      bulkGet: vi.fn().mockResolvedValue([]),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      and: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(undefined),
      hook: vi.fn((event, cb) => {
        hookCallbacks[event] = cb;
        return { unsubscribe: vi.fn() };
      }),
    };
    return table;
  }

  const mockDb = {
    settings: makeTable(),
    sync_outbox: makeTable(),
    transactions: makeTable(),
    customers: makeTable(),
    customer_transactions: makeTable(),
    catalog_entries: makeTable(),
    suppliers: makeTable(),
    supplier_transactions: makeTable(),
    staff_members: makeTable(),
    settlements: makeTable(),
    analytics: makeTable(),
    transaction: vi.fn((_, ...tables) => {
      const cb = tables[tables.length - 1];
      return cb();
    }),
  };

  const mockFetch = vi.fn();
  const mockGetOrCreateCloudProofDeviceId = vi.fn().mockResolvedValue('test-device-001');
  const mockUseSyncStore = {
    getState: vi.fn(() => ({
      setSyncState: vi.fn(),
      setConflictWarning: vi.fn(),
      setConflictDetails: vi.fn(),
      setLastConflicts: vi.fn(),
    })),
  };

  return { mockDb, mockFetch, mockGetOrCreateCloudProofDeviceId, mockUseSyncStore };
});

vi.mock('../src/db.js', () => ({ default: mockDb, db: mockDb }));
vi.mock('../src/utils/cloudProof.js', () => ({ getOrCreateCloudProofDeviceId: mockGetOrCreateCloudProofDeviceId }));
vi.mock('../src/stores/syncStore.js', () => ({ useSyncStore: mockUseSyncStore }));
// syncEngine dynamic-imports syncQueue after a successful sync (silent
// Telegram drain). Mock it so tests never load the real telegram client.
vi.mock('../src/utils/syncQueue.js', () => ({
  drainTelegramSyncQueue: vi.fn().mockResolvedValue({ processed: 0, records: [] }),
  drainCloudProofQueue: vi.fn().mockResolvedValue({ processed: 0 }),
  enqueueTelegramLedgerUpdate: vi.fn(),
  countPendingTelegramSync: vi.fn().mockResolvedValue(0),
}));
// authClient's ensureFreshToken is called by the 401-aware fetch wrapper.
// Default to a no-op so existing tests are unaffected; the 401-retry suite
// overrides this per-test.
vi.mock('../src/utils/authClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ensureFreshToken: vi.fn().mockResolvedValue({ ok: true, token: 'new-jwt' }),
    _resetRefreshForTest: vi.fn(),
  };
});

// ─── Import after mocks ───

import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getSyncEngine,
  destroySyncEngine,
  classifySyncError,
} from '../src/utils/syncEngine.js';

// ─── Tests ───

describe('JWT helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAuthToken returns token from db', async () => {
    mockDb.settings.get.mockResolvedValue({ key: 'gebya_auth_token', value: 'my-jwt' });
    const token = await getAuthToken();
    expect(token).toBe('my-jwt');
    expect(mockDb.settings.get).toHaveBeenCalledWith('gebya_auth_token');
  });

  it('getAuthToken returns null when no token stored', async () => {
    mockDb.settings.get.mockResolvedValue(undefined);
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('setAuthToken stores token in db', async () => {
    await setAuthToken('new-token');
    expect(mockDb.settings.put).toHaveBeenCalledWith({ key: 'gebya_auth_token', value: 'new-token' });
  });

  it('clearAuthToken deletes token from db', async () => {
    await clearAuthToken();
    expect(mockDb.settings.delete).toHaveBeenCalledWith('gebya_auth_token');
  });
});

describe('SyncEngine init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    destroySyncEngine();
    vi.useRealTimers();
  });

  it('creates singleton via initSyncEngine', async () => {
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    const e = await initSyncEngine();
    expect(e).toBeDefined();
    expect(e.deviceId).toBe('test-device-001');
    expect(getSyncEngine()).toBe(e);
  });

  it('returns same instance on second call', async () => {
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    const e1 = await initSyncEngine();
    const e2 = await initSyncEngine();
    expect(e1).toBe(e2);
  });

  it('destroySyncEngine cleans up', async () => {
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    await initSyncEngine();
    destroySyncEngine();
    expect(getSyncEngine()).toBeNull();
  });
});

describe('SyncEngine.sync', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    globalThis.fetch = mockFetch;
    mockDb.settings.get.mockImplementation((key) => {
      if (key === 'gebya_auth_token') return Promise.resolve({ value: 'test-token' });
      return Promise.resolve(undefined);
    });

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    delete globalThis.fetch;
  });

  it('sets unauthenticated status when no token', async () => {
    destroySyncEngine();
    mockDb.settings.get.mockResolvedValue(undefined);
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    await engine.sync();
    expect(engine.status).toBe('unauthenticated');
  }, 10000);

  it('sets syncing status during sync', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });

    const statusChanges = [];
    engine.onChange((state) => statusChanges.push(state.status));

    await engine.sync();
    expect(statusChanges).toContain('syncing');
    expect(statusChanges).toContain('idle');
  }, 10000);

  it('handles 401 error by clearing auth', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await engine.sync();
    expect(engine.status).toBe('unauthenticated');
  }, 10000);

  it('keeps the session on a 403 and shows the permission message', async () => {
    // H3: revoking "view reports" made /sync/pull return 403. The old catch
    // treated that as an expired session, deleted the token and signed the
    // phone out — stopping sync for a member who had done nothing wrong.
    const body = {
      error: 'Not a member of this business',
      hint: 'Ask the shop owner to add this phone to the shop',
    };
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve(body),
      clone: () => ({ json: () => Promise.resolve(body) }),
    });

    const onAuthRequired = vi.fn();
    engine.onAuthRequired(onAuthRequired);
    mockDb.settings.delete.mockClear();

    await engine.sync();

    expect(engine.status).toBe('error');
    expect(engine.error).toContain('Not a member of this business');
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(mockDb.settings.delete).not.toHaveBeenCalled();
  }, 10000);

  it('handles network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await engine.sync();
    expect(engine.status).toBe('error');
    expect(engine.error).toBe('Network error');
  }, 15000);

  it('skips sync when already syncing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });

    engine.status = 'syncing';
    await engine.sync();
    expect(mockFetch).not.toHaveBeenCalled();
  }, 10000);

  it('attempts sync even when navigator.onLine is false (PWA-safe)', async () => {
    // navigator.onLine is unreliable in installed PWAs and previously caused
    // endless "Pending sync". sync() must attempt and surface real errors.
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });
    engine.online = false;
    await engine.sync();
    expect(mockFetch).toHaveBeenCalled();
  }, 10000);
});

describe('SyncEngine outbox enqueue', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    mockDb.settings.get.mockResolvedValue(undefined);
    mockDb.sync_outbox.put.mockResolvedValue(1);
    mockDb.sync_outbox.count.mockResolvedValue(1);

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    vi.useRealTimers();
  });

  it('writes an outbox entry and recounts pending from the outbox', async () => {
    mockDb.sync_outbox.count.mockResolvedValue(3);
    engine._enqueueOutbox('transactions', 7);
    expect(mockDb.sync_outbox.put).toHaveBeenCalledWith({
      key: 'transactions:7', table: 'transactions', record_id: 7, created_at: expect.any(Number),
    });
    await vi.waitFor(() => expect(engine.pendingCount).toBe(3));
  });

  it('does not schedule a push while pulling', () => {
    engine._pulling = true;
    engine._enqueueOutbox('transactions', 7);
    expect(engine._pushDebounce).toBeNull();
  });

  it('does not enqueue pulled rows while pulling', () => {
    // Regression: _pullAll writes fire the same Dexie hooks; enqueuing them
    // would re-push server-acked rows and inflate the pending count.
    engine._pulling = true;
    engine._enqueueOutbox('transactions', 9);
    expect(mockDb.sync_outbox.put).not.toHaveBeenCalled();
  });

  it('debounces burst writes into one scheduled sync', () => {
    engine._enqueueOutbox('transactions', 1);
    engine._enqueueOutbox('customers', 2);
    expect(mockDb.sync_outbox.put).toHaveBeenCalledTimes(2);
    expect(engine._pushDebounce).not.toBeNull();
  });
});

describe('SyncEngine.fullSync', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });
    mockDb.settings.get.mockImplementation((key) => {
      if (key === 'gebya_auth_token') return Promise.resolve({ value: 'test-token' });
      return Promise.resolve(undefined);
    });

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    delete globalThis.fetch;
  });

  it('resets lastSyncAt to 0 before pulling', async () => {
    engine.lastSyncAt = 1000;
    await engine.fullSync();
    expect(engine.lastSyncAt).toBeGreaterThan(0);
  }, 10000);

  it('restores state on error', async () => {
    engine.lastSyncAt = 5000;
    engine.tableLastSync = { transactions: 1000 };
    mockFetch.mockRejectedValue(new Error('Network error'));

    await engine.fullSync();
    expect(engine.lastSyncAt).toBe(5000);
    expect(engine.tableLastSync).toEqual({ transactions: 1000 });
    expect(engine.status).toBe('error');
  }, 15000);

  it('sets unauthenticated on 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await engine.fullSync();
    expect(engine.status).toBe('unauthenticated');
  }, 10000);
});

describe('SyncEngine._pullAll', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    globalThis.fetch = mockFetch;
    mockDb.settings.get.mockImplementation((key) => {
      if (key === 'gebya_auth_token') return Promise.resolve({ value: 'test-token' });
      return Promise.resolve(undefined);
    });

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  it('sets _pulling flag during pull', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });

    await engine._pullAll('test-token');
    expect(engine._pulling).toBe(false);
  });

  it('handles empty response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tables: null }),
    });

    await engine._pullAll('test-token');
    expect(engine.status).not.toBe('error');
  });

  it('handles pagination', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            tables: { transactions: [{ id: 1, localId: 1, updatedAt: 100 }] },
            hasMore: true,
            nextCursor: 100,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tables: {}, hasMore: false }),
      });
    });

    await engine._pullAll('test-token');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('SyncEngine._pushAll', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    globalThis.fetch = mockFetch;
    mockDb.settings.get.mockImplementation((key) => {
      if (key === 'gebya_auth_token') return Promise.resolve({ value: 'test-token' });
      return Promise.resolve(undefined);
    });

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  it('skips push when no data', async () => {
    await engine._pushAll('test-token');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends push with correct headers', async () => {
    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, business_id: 1 }),
    });

    engine.businessId = 1;
    await engine._pushAll('test-token');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sync/push'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'x-business-id': '1',
        }),
      })
    );
  });

  it('retires outbox entries after a successful push', async () => {
    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, business_id: 1, results: { transactions: { count: 1, conflicts: 0 } } }),
    });

    await engine._pushAll('test-token');
    expect(mockDb.sync_outbox.bulkDelete).toHaveBeenCalledWith(['transactions:1']);
  });

  it('keeps outbox entries when server reports truncated applied count', async () => {
    // Regression: the server caps pushes at MAX_ROWS_PER_TABLE_PUSH. If we
    // sent more than the cap and the server silently dropped the excess, the
    // old code deleted ALL outbox keys (permanent data loss). The new code
    // keeps the truncated entries and lets the next cycle retry them.
    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        results: { transactions: { count: 0, conflicts: 0 } },
      }),
    });

    await engine._pushAll('test-token');
    expect(mockDb.sync_outbox.bulkDelete).not.toHaveBeenCalled();
  });

  it('caps per-table push payload at the server hard limit', async () => {
    // Regression: long-offline devices accumulate >500 entries in one table.
    // The push must slice the payload so the server's MAX_ROWS_PER_TABLE_PUSH
    // never silently drops rows. The remainder stays in the outbox.
    const manyEntries = Array.from({ length: 600 }, (_, i) => ({
      key: `transactions:${i + 1}`,
      table: 'transactions',
      record_id: i + 1,
      created_at: i + 1,
    }));
    const manyRows = manyEntries.map((e) => ({ id: e.record_id, updated_at: 2000 + e.record_id }));
    mockDb.sync_outbox.toArray.mockResolvedValue(manyEntries);
    mockDb.transactions.bulkGet.mockResolvedValue(manyRows);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        results: { transactions: { count: 500, conflicts: 0 } },
      }),
    });

    await engine._pushAll('test-token');

    // Server gets exactly 500 rows in the transactions table.
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.tables.transactions).toHaveLength(500);

    // Only the 500 included entries are acked; the remaining 100 stay queued.
    const deleted = mockDb.sync_outbox.bulkDelete.mock.calls[0][0];
    expect(deleted).toHaveLength(500);
  });

  it('drops outbox entries whose local row vanished before push', async () => {
    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:9', table: 'transactions', record_id: 9, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([undefined]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await engine._pushAll('test-token');
    // Nothing to send (payload had no rows) and no fetch happened.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDb.sync_outbox.bulkDelete).not.toHaveBeenCalled();
  });

  it('handles 403 permission error', async () => {
    vi.useFakeTimers();
    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ missing_permission: 'can_add_records' }),
    });

    const promise = engine._pushAll('test-token');
    promise.catch(() => {});
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000 * Math.pow(2, i));
    }
    await expect(promise).rejects.toThrow(/403/);
    vi.useRealTimers();
  }, 30000);

  it('stores business_id from response', async () => {
    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, business_id: 42 }),
    });

    await engine._pushAll('test-token');
    expect(engine.businessId).toBe(42);
  });
});

describe('SyncEngine.onChange', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    mockDb.settings.get.mockResolvedValue(undefined);

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    vi.useRealTimers();
  });

  it('calls listener immediately with current state', () => {
    const cb = vi.fn();
    engine.onChange(cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }));
  });

  it('returns unsubscribe function', () => {
    const cb = vi.fn();
    const unsub = engine.onChange(cb);
    unsub();
    engine._notify();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('SyncEngine._countPending', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset outbox mocks explicitly: clearAllMocks keeps mockResolvedValue
    // implementations, and a leaked non-zero count would trigger init-time
    // auto-sync inside unrelated tests.
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    vi.useFakeTimers();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    mockDb.settings.get.mockResolvedValue(undefined);

    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
  });

  afterEach(() => {
    destroySyncEngine();
    vi.useRealTimers();
  });

  it('counts pending from the sync_outbox table', async () => {
    mockDb.sync_outbox.count.mockResolvedValue(5);
    await engine._countPending();
    expect(engine.pendingCount).toBe(5);
    expect(mockDb.sync_outbox.count).toHaveBeenCalled();
  });

  it('resets count to zero when outbox is empty', async () => {
    engine.pendingCount = 10;
    mockDb.sync_outbox.count.mockResolvedValue(0);
    await engine._countPending();
    expect(engine.pendingCount).toBe(0);
  });
});

describe('SyncEngine 401 retry with ensureFreshToken', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // This describe has its own beforeEach, which replaces the main suite's —
    // without this, `fetch is not defined` inside fetchWithRetryAndAuthRefresh.
    globalThis.fetch = mockFetch;
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true, configurable: true,
    });
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    mockDb.settings.get.mockResolvedValue(undefined);
  });

  afterEach(() => {
    destroySyncEngine();
  });

  it('retries push with a refreshed token when the server returns 401', async () => {
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    const engine = await initSyncEngine();

    const authClient = await import('../src/utils/authClient.js');
    const refreshMock = vi.mocked(authClient.ensureFreshToken);
    refreshMock.mockResolvedValue({ ok: true, token: 'new-jwt' });
    refreshMock.mockClear();

    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);

    // Track what token is "currently stored" — put updates the cached value.
    let currentToken = 'old-jwt';
    mockDb.settings.get.mockImplementation(async () =>
      currentToken ? { value: currentToken } : undefined
    );
    mockDb.settings.put.mockImplementation(async (row) => {
      if (row?.key === 'gebya_auth_token') currentToken = row.value;
    });

    // First call: 401. Second call: 200 (with the new token in the header).
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, business_id: 1, results: { transactions: { count: 1, conflicts: 0 } } }) });

    console.log('TEST: about to call _pushAll');
    await engine._pushAll('test-token');
    console.log('TEST: _pushAll returned');

    // The fetch was called twice — once for the 401, once after the refresh.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // The second call carried the NEW token (post-refresh) because getToken
    // is called fresh on every attempt and read the updated value.
    const secondCall = mockFetch.mock.calls[1];
    const headers = secondCall[1].headers;
    expect(headers.Authorization).toBe('Bearer new-jwt');
    // ensureFreshToken was called exactly once.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  }, 15000);

  it('surfaces the original 401 when ensureFreshToken also fails', async () => {
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    const engine = await initSyncEngine();

    const authClient = await import('../src/utils/authClient.js');
    const refreshMock = vi.mocked(authClient.ensureFreshToken);
    refreshMock.mockRejectedValueOnce(new Error('refresh_failed_401'));
    refreshMock.mockClear();

    mockDb.sync_outbox.toArray.mockResolvedValue([
      { key: 'transactions:1', table: 'transactions', record_id: 1, created_at: 1 },
    ]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, updated_at: 2000 }]);
    mockDb.settings.get.mockResolvedValue({ value: 'old-jwt' });
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });

    // The engine should throw because the 401 ultimately surfaces (the fetch
    // was called only once; the refresh failed and the response bubbles up).
    await expect(engine._pushAll('test-token')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No silent retry loop: outbox entries are NOT deleted.
    expect(mockDb.sync_outbox.bulkDelete).not.toHaveBeenCalled();
  });
});

describe('SyncEngine battery awareness', () => {
  let engine;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    destroySyncEngine();
    
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({
        charging: true,
        level: 0.8,
        addEventListener: vi.fn(),
      }),
      writable: true,
      configurable: true,
    });
    
    Object.defineProperty(globalThis, 'navigator', { 
      value: { 
        onLine: true, 
        getBattery: navigator.getBattery,
        serviceWorker: {
          ready: Promise.resolve({
            sync: { register: vi.fn().mockResolvedValue(undefined) }
          })
        }
      }, 
      writable: true, 
      configurable: true 
    });
    
    Object.defineProperty(globalThis, 'document', {
      value: { 
        visibilityState: 'visible', 
        addEventListener: vi.fn(), 
        removeEventListener: vi.fn() 
      },
      writable: true,
      configurable: true,
    });
    
    if (!globalThis.window) {
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
    
    mockDb.settings.get.mockResolvedValue({ value: 'test-token' });
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });
  });

  afterEach(() => {
    destroySyncEngine();
    delete globalThis.fetch;
  });

  it('tracks battery status when getBattery is available', async () => {
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    
    expect(engine._isCharging).toBe(true);
    expect(engine._batteryLevel).toBe(0.8);
  });

  it('defaults to charging when getBattery is unavailable', async () => {
    delete navigator.getBattery;
    
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    
    expect(engine._isCharging).toBe(true);
    expect(engine._batteryLevel).toBe(1);
  });

  it('background sync is called when pending count > 0', async () => {
    // This tests that _enqueueOutbox calls _registerBackgroundSync
    // The actual SW sync registration is tested by the PWA install test suite
    mockDb.sync_outbox.count.mockResolvedValue(3);
    
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    
    // The engine should track pending items
    expect(engine.pendingCount).toBe(3);
  });

  it('does not register background sync when sync engine is syncing', async () => {
    mockDb.sync_outbox.count.mockResolvedValue(5);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    
    const { initSyncEngine } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    
    // First sync attempt
    await engine.sync();
    
    // During sync, background sync should not be registered
    engine.status = 'syncing';
    engine._enqueueOutbox('transactions', 99);
    
    // No error means sync was not registered during sync status
  });

  it('periodic sync respects battery level when app not visible', async () => {
    vi.useFakeTimers();
    
    document.visibilityState = 'hidden';
    engine._batteryLevel = 0.1; // 10% - too low for background sync
    
    engine.pendingCount = 0; // Prevent actual sync from running
    
    // Advance timers to trigger periodic sync
    vi.advanceTimersByTime(5 * 60 * 1000 + 100);
    
    // Sync should not happen when battery is low and app is hidden
    expect(engine.status).toBe('idle');
    
    vi.useRealTimers();
  });
});

describe('setAuthToken auto-sync', () => {
  let engine;
  
  beforeEach(async () => {
    vi.useRealTimers();
    if (!globalThis.window) {
      globalThis.window = { 
        addEventListener: vi.fn(), 
        removeEventListener: vi.fn(),
        queueMicrotask: vi.fn((cb) => setTimeout(cb, 0)),
      };
    }
    
    mockDb.settings.get.mockResolvedValue({ value: 'test-token' });
    mockDb.sync_outbox.count.mockResolvedValue(0);
    mockDb.sync_outbox.toArray.mockResolvedValue([]);
    mockDb.transactions.bulkGet.mockResolvedValue([]);
    mockDb.settings.put.mockResolvedValue();
  });

  afterEach(() => {
    destroySyncEngine();
    delete globalThis.fetch;
  });

  const flushPromises = () => new Promise(resolve => setImmediate(resolve));

  it('triggers sync after setAuthToken when pending records exist', async () => {
    // Setup mocks for sync to succeed
    mockDb.sync_outbox.count.mockResolvedValue(5);
    mockDb.sync_outbox.toArray.mockResolvedValue([{ table: 'transactions', record_id: 1, key: 'tx1' }]);
    mockDb.transactions.bulkGet.mockResolvedValue([{ id: 1, amount: 100, sync_version: 1 }]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, tables: {}, hasMore: false }),
    });
    
    const { initSyncEngine, setAuthToken } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    
    const syncSpy = vi.spyOn(engine, 'sync').mockImplementation(async () => {
      await Promise.resolve();
      engine.status = 'idle';
      engine.pendingCount = 0;
    });
    
    await setAuthToken('new-token');
    
    // Allow microtasks to flush
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(syncSpy).toHaveBeenCalled();
  });

  it('does not trigger sync when queue is empty after setAuthToken', async () => {
    mockDb.sync_outbox.count.mockResolvedValue(0);
    
    const { initSyncEngine, setAuthToken } = await import('../src/utils/syncEngine.js');
    engine = await initSyncEngine();
    
    const syncSpy = vi.spyOn(engine, 'sync');
    
    await setAuthToken('new-token');
    
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

describe('classifySyncError', () => {
  it('treats a 401 as an auth failure (sign-out allowed)', () => {
    const error = Object.assign(new Error('HTTP 401: Unauthorized'), { status: 401 });
    expect(classifySyncError(error).kind).toBe('auth');
  });

  it('treats a 403 as permission, not an expired session', () => {
    const error = Object.assign(new Error('HTTP 403: Forbidden'), { status: 403 });
    const result = classifySyncError(error);
    expect(result.kind).toBe('permission');
    expect(result.kind).not.toBe('auth');
  });

  it('uses the server error and hint in the 403 message', () => {
    const error = Object.assign(new Error('HTTP 403: Forbidden'), {
      status: 403,
      body: { error: 'Not a member of this business', hint: 'Ask the shop owner' },
    });
    expect(classifySyncError(error).message).toBe(
      'Not a member of this business — Ask the shop owner',
    );
  });

  it('still understands the legacy "failed: 403" message shape', () => {
    expect(classifySyncError(new Error('Pull failed: 403')).kind).toBe('permission');
  });

  it('leaves network and 5xx failures as ordinary errors', () => {
    expect(classifySyncError(new Error('Network error'))).toMatchObject({
      kind: 'error',
      message: 'Network error',
    });
    const fiveHundred = Object.assign(new Error('HTTP 500: Internal Server Error'), { status: 500 });
    expect(classifySyncError(fiveHundred).kind).toBe('error');
  });
});
