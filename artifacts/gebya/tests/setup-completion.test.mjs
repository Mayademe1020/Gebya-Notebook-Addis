/**
 * Gate D — `setup_completed_at` (the R2 success metric).
 *
 * Runs against the real Dexie database on fake-indexeddb: the point of these
 * tests is the write-if-null transaction, not a mock of it.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

const { db } = await import('../src/db');
const {
  SETUP_COMPLETED_AT_KEY,
  SETUP_CHECK_IDS,
  computeSetupChecks,
  buildSetupSummary,
  isSetupComplete,
  readSetupCompletedAt,
  stampSetupCompletedAt,
} = await import('../src/utils/setupCompletion');

const COMPLETE_SHOP = {
  shopProfile: { name: 'Gebya Merkato', phone: '0911234567' },
  paymentChannels: [{ enabled: true, phone: '0911234567' }],
  catalogEntries: [{ id: 1, name: 'Buna', active: true }],
  recurring: [{ id: 1, name: 'Rent' }],
};

const clear = async () => {
  await db.settings.delete(SETUP_COMPLETED_AT_KEY);
};

beforeEach(clear);

describe('computeSetupChecks — the five checks the owner sees', () => {
  it('asks exactly the five checklist questions, in display order', () => {
    const checks = computeSetupChecks({});
    expect(checks.map(c => c.id)).toEqual(SETUP_CHECK_IDS);
    expect(SETUP_CHECK_IDS).toEqual(['name', 'phone', 'channels', 'items', 'recurring']);
    expect(checks.every(c => c.done === false)).toBe(true);
  });

  it('counts profile name and phone separately', () => {
    const checks = computeSetupChecks({ shopProfile: { name: 'Shop' } });
    expect(checks.find(c => c.id === 'name').done).toBe(true);
    expect(checks.find(c => c.id === 'phone').done).toBe(false);
  });

  it('requires a usable payment channel, not just an enabled row', () => {
    const bare = computeSetupChecks({ paymentChannels: [{ enabled: true }] });
    expect(bare.find(c => c.id === 'channels').done).toBe(false);

    const withPhone = computeSetupChecks({ paymentChannels: [{ enabled: true, phone: '0911' }] });
    expect(withPhone.find(c => c.id === 'channels').done).toBe(true);

    const viaShopPhone = computeSetupChecks({ paymentChannels: [{ enabled: true, usePhoneFromShop: true }] });
    expect(viaShopPhone.find(c => c.id === 'channels').done).toBe(true);

    const disabled = computeSetupChecks({ paymentChannels: [{ enabled: false, phone: '0911' }] });
    expect(disabled.find(c => c.id === 'channels').done).toBe(false);
  });

  it('ignores inactive catalog entries', () => {
    const inactiveOnly = computeSetupChecks({ catalogEntries: [{ name: 'Old', active: false }] });
    expect(inactiveOnly.find(c => c.id === 'items').done).toBe(false);

    const oneActive = computeSetupChecks({
      catalogEntries: [{ name: 'Old', active: false }, { name: 'Buna', active: true }],
    });
    expect(oneActive.find(c => c.id === 'items').done).toBe(true);
  });

  it('treats a missing `active` flag as active', () => {
    expect(computeSetupChecks({ catalogEntries: [{ name: 'Buna' }] }).find(c => c.id === 'items').done).toBe(true);
  });

  it('needs at least one recurring expense', () => {
    expect(computeSetupChecks({ recurring: [] }).find(c => c.id === 'recurring').done).toBe(false);
  });

  it('summarises progress without partial credit', () => {
    expect(buildSetupSummary({ shopProfile: { name: 'Shop' } })).toMatchObject({
      done: 1,
      total: 5,
      allDone: false,
    });
    expect(buildSetupSummary(COMPLETE_SHOP)).toMatchObject({ done: 5, total: 5, allDone: true });
    expect(isSetupComplete(COMPLETE_SHOP)).toBe(true);
  });
});

describe('stampSetupCompletedAt — immutable, write-if-null', () => {
  it('writes nothing while the shop is incomplete', async () => {
    expect(await stampSetupCompletedAt({ shopProfile: { name: 'Shop' } })).toBeNull();
    expect(await readSetupCompletedAt()).toBeNull();
    expect(await db.settings.get(SETUP_COMPLETED_AT_KEY)).toBeUndefined();
  });

  it('stamps an ISO timestamp the first time all five are green', async () => {
    const stamp = await stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:00.000Z'));
    expect(stamp).toBe('2026-11-18T09:30:00.000Z');
    expect(await readSetupCompletedAt()).toBe(stamp);
    expect((await db.settings.get(SETUP_COMPLETED_AT_KEY)).value).toBe(stamp);
  });

  it('keeps the first stamp when called again later (immutable)', async () => {
    const first = await stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:00.000Z'));
    const second = await stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-12-01T00:00:00.000Z'));
    expect(second).toBe(first);
    expect(await readSetupCompletedAt()).toBe(first);
  });

  it('never overwrites a stamp that arrived with a restored backup', async () => {
    // Simulate restore-from-backup: the row is already there, dated long ago.
    await db.settings.put({ key: SETUP_COMPLETED_AT_KEY, value: '2026-01-05T07:00:00.000Z' });
    const stamp = await stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:00.000Z'));
    expect(stamp).toBe('2026-01-05T07:00:00.000Z');
    expect(await readSetupCompletedAt()).toBe('2026-01-05T07:00:00.000Z');
  });

  it('backfills a shop that was already 5/5 before the metric existed', async () => {
    expect(await readSetupCompletedAt()).toBeNull();
    await stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:00.000Z'));
    expect(await readSetupCompletedAt()).toBe('2026-11-18T09:30:00.000Z');
  });

  it('re-stamps over a value in an unusable shape', async () => {
    await db.settings.put({ key: SETUP_COMPLETED_AT_KEY, value: 12345 });
    const stamp = await stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:00.000Z'));
    expect(stamp).toBe('2026-11-18T09:30:00.000Z');
  });

  it('survives concurrent stamps from two tabs', async () => {
    const [a, b] = await Promise.all([
      stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:00.000Z')),
      stampSetupCompletedAt(COMPLETE_SHOP, () => Date.parse('2026-11-18T09:30:01.000Z')),
    ]);
    expect(a).toBe(b);
    expect(await readSetupCompletedAt()).toBe(a);
  });
});
