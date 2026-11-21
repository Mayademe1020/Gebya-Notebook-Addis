/**
 * @vitest-environment node
 *
 * Settings and analytics hold one row per (business, device, key).
 *
 * They were keyed by (device, key) only, so two businesses signed in on the
 * same phone shared a row: the second shop's settings overwrote the first's,
 * with no way back. The push path upserts on exactly the columns declared
 * here, so this contract is what keeps the two in step.
 */
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { settings, analytics } from "@workspace/db/schema";

function uniqueColumnSets(table: any): string[][] {
  return getTableConfig(table).uniqueConstraints.map((u: any) => u.columns.map((c: any) => c.name).sort());
}

describe("key-value table scoping", () => {
  it("keys settings by business, device and key", () => {
    expect(uniqueColumnSets(settings)).toContainEqual(["business_id", "device_id", "key"]);
  });

  it("keys analytics by business, device and key", () => {
    expect(uniqueColumnSets(analytics)).toContainEqual(["business_id", "device_id", "key"]);
  });

  it("no longer allows one row per device and key across businesses", () => {
    expect(uniqueColumnSets(settings)).not.toContainEqual(["device_id", "key"]);
    expect(uniqueColumnSets(analytics)).not.toContainEqual(["device_id", "key"]);
  });
});