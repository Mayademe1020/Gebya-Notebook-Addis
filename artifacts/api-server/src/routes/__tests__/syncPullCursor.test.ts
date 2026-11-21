/**
 * @vitest-environment node
 *
 * The /pull cursor must never advance past a table that still has rows.
 *
 * Ten tables are paged independently per request, each with its own next
 * cursor. Collapsing them with Math.max() skipped every table whose remaining
 * rows were older than the fastest one — a shop with 5,000 transactions and 30
 * customers would get all the transactions and only the first page of
 * customers, forever. Two phones then computed different balances.
 */
import { describe, it, expect } from "vitest";
import { nextPullCursor } from "../sync.js";

describe("nextPullCursor", () => {
  it("returns null when no table has another page", () => {
    expect(nextPullCursor([null, null, null], false)).toBeNull();
  });

  it("returns the only pending cursor when a single table has more", () => {
    expect(nextPullCursor([null, 4200, null], true)).toBe(4200);
  });

  it("advances to the slowest pending table, not the fastest", () => {
    // The defect: Math.max picked 9000, so the table at 3000 was never asked
    // again and its remaining rows were lost.
    expect(nextPullCursor([9000, 3000, null, null], true)).toBe(3000);
  });

  it("ignores tables that are already finished instead of collapsing to 0", () => {
    // A finished table has a null cursor. Treating that as 0 would restart the
    // pull from the beginning on every page.
    expect(nextPullCursor([null, null, 7000], true)).toBe(7000);
  });

  it("returns null rather than 0 when every cursor is null", () => {
    expect(nextPullCursor([null, null], true)).toBeNull();
  });

  it("stops at zero when that is genuinely the slowest pending row", () => {
    expect(nextPullCursor([0, 500], true)).toBe(0);
  });
});