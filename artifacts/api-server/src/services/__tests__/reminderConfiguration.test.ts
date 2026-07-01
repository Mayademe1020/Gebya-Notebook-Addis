/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getShopDefault,
  setShopDefault,
  getCustomerFrequency,
  setCustomerFrequency,
  isRemindersEnabled,
  clearCustomerOverride,
  clearAllConfigs,
  getStorageStatus,
} from "../reminderConfiguration.js";

describe("reminderConfiguration", () => {
  beforeEach(() => {
    clearAllConfigs();
  });

  it("getShopDefault returns daily for new shop", async () => {
    const result = await getShopDefault(1);
    expect(result).toBe("daily");
  });

  it("setShopDefault persists and is retrievable", async () => {
    await setShopDefault(2, "weekly");
    expect(await getShopDefault(2)).toBe("weekly");
  });

  it("setShopDefault updates existing value", async () => {
    await setShopDefault(3, "daily");
    await setShopDefault(3, "weekly");
    expect(await getShopDefault(3)).toBe("weekly");
  });

  it("getCustomerFrequency falls back to shop default when no override", async () => {
    await setShopDefault(4, "weekly");
    expect(await getCustomerFrequency(4, 100)).toBe("weekly");
  });

  it("setCustomerFrequency creates override", async () => {
    await setShopDefault(5, "daily");
    await setCustomerFrequency(5, 200, "disabled");
    expect(await getCustomerFrequency(5, 200)).toBe("disabled");
  });

  it("setCustomerFrequency takes precedence over shop default", async () => {
    await setShopDefault(6, "daily");
    await setCustomerFrequency(6, 300, "weekly");
    expect(await getCustomerFrequency(6, 300)).toBe("weekly");
  });

  it("clearCustomerOverride reverts to shop default", async () => {
    await setShopDefault(7, "daily");
    await setCustomerFrequency(7, 400, "disabled");
    expect(await getCustomerFrequency(7, 400)).toBe("disabled");
    await clearCustomerOverride(7, 400);
    expect(await getCustomerFrequency(7, 400)).toBe("daily");
  });

  it("isRemindersEnabled returns true for daily", async () => {
    await setShopDefault(8, "daily");
    expect(await isRemindersEnabled(8, 500)).toBe(true);
  });

  it("isRemindersEnabled returns true for weekly", async () => {
    await setShopDefault(9, "weekly");
    expect(await isRemindersEnabled(9, 600)).toBe(true);
  });

  it("isRemindersEnabled returns false for disabled", async () => {
    await setCustomerFrequency(10, 700, "disabled");
    expect(await isRemindersEnabled(10, 700)).toBe(false);
  });

  it("multiple shops have independent settings", async () => {
    await setShopDefault(16, "daily");
    await setShopDefault(17, "weekly");
    expect(await getShopDefault(16)).toBe("daily");
    expect(await getShopDefault(17)).toBe("weekly");
  });

  it("multiple customers in same shop can have different overrides", async () => {
    await setShopDefault(18, "daily");
    await setCustomerFrequency(18, 900, "weekly");
    await setCustomerFrequency(18, 901, "disabled");
    expect(await getCustomerFrequency(18, 900)).toBe("weekly");
    expect(await getCustomerFrequency(18, 901)).toBe("disabled");
  });

  it("rejects invalid frequency", async () => {
    await expect(setShopDefault(11, "invalid" as any)).rejects.toThrow();
    await expect(setCustomerFrequency(12, 800, "invalid" as any)).rejects.toThrow();
  });

  it("rejects invalid shopId", async () => {
    await expect(getShopDefault(0)).rejects.toThrow();
    await expect(getShopDefault(-1 as any)).rejects.toThrow();
  });

  it("rejects invalid customerId", async () => {
    await expect(getCustomerFrequency(15, -1)).rejects.toThrow();
  });

  it("storage status reflects in-memory backend", () => {
    const status = getStorageStatus();
    expect(status.backend).toBe("memory");
  });
});
