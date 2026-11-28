/**
 * @vitest-environment node
 *
 * H4 (conflict merge): field-level 3-way merge. These tests pin the rule that
 * on a push/pull conflict BOTH devices' edits survive, and that a money field
 * both sides changed is never summed or silently dropped.
 */
import { describe, it, expect } from 'vitest';
import { mergeFieldLevel, deepEqual, MONEY_FIELDS } from '../src/utils/syncEngineHelpers.js';

describe('deepEqual', () => {
  it('compares primitives, arrays, objects and NaN', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});

describe('mergeFieldLevel', () => {
  it('keeps both devices\' edits when they touched different fields', () => {
    // Common ancestor both phones started from.
    const base = { display_name: 'Shop', note: 'old', phone_number: '111', balance: 500 };
    // Phone B edited the note.
    const local = { ...base, note: 'B-note' };
    // Phone A (server) edited the phone number.
    const server = { ...base, phone_number: '999' };

    const { merged, conflicts } = mergeFieldLevel(base, local, server);

    expect(merged.note).toBe('B-note');          // local edit survived
    expect(merged.phone_number).toBe('999');     // server edit survived
    expect(merged.display_name).toBe('Shop');
    expect(conflicts).toHaveLength(0);
  });

  it('takes the server value when only the server changed a field', () => {
    const base = { note: 'a', phone_number: '111' };
    const local = { ...base };
    const server = { ...base, note: 'server-note' };

    const { merged, conflicts } = mergeFieldLevel(base, local, server);

    expect(merged.note).toBe('server-note');
    expect(conflicts).toHaveLength(0);
  });

  it('keeps the local value when only the local side changed a field', () => {
    const base = { note: 'a', phone_number: '111' };
    const local = { ...base, note: 'local-note' };
    const server = { ...base };

    const { merged, conflicts } = mergeFieldLevel(base, local, server);

    expect(merged.note).toBe('local-note');
    expect(conflicts).toHaveLength(0);
  });

  it('never sums a money field both sides changed; keeps local and flags it', () => {
    const base = { paid_amount: 100 };
    const local = { ...base, paid_amount: 150 };
    const server = { ...base, paid_amount: 120 };

    const { merged, conflicts } = mergeFieldLevel(base, local, server);

    // Not 270 (sum) and not silently the server's 120 — the local value is kept
    // and the field is surfaced as a money conflict for explicit resolution.
    expect(merged.paid_amount).toBe(150);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: 'paid_amount', money: true, base: 100, local: 150, server: 120 });
    expect(MONEY_FIELDS.has('paid_amount')).toBe(true);
  });

  it('flags a non-money field both sides changed but still keeps local', () => {
    const base = { note: 'a' };
    const local = { ...base, note: 'local' };
    const server = { ...base, note: 'server' };

    const { merged, conflicts } = mergeFieldLevel(base, local, server);

    expect(merged.note).toBe('local');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: 'note', money: false });
  });

  it('degrades to keep-local + surface every difference when no base exists', () => {
    const local = { note: 'local', phone_number: '111' };
    const server = { note: 'server', phone_number: '999' };

    const { merged, conflicts } = mergeFieldLevel(null, local, server);

    expect(merged.note).toBe('local');
    expect(merged.phone_number).toBe('111');
    expect(conflicts.map((c) => c.key).sort()).toEqual(['note', 'phone_number']);
  });

  it('never merges bookkeeping columns as conflicts', () => {
    const base = { id: 1, sync_version: 1, updated_at: 100, device_id: 'd', note: 'a' };
    const local = { ...base, sync_version: 5, updated_at: 200, note: 'b' };
    const server = { ...base, sync_version: 9, updated_at: 300, note: 'a' };

    const { merged, conflicts } = mergeFieldLevel(base, local, server);

    expect(merged.id).toBe(1);
    expect(conflicts).toHaveLength(0);
  });
});