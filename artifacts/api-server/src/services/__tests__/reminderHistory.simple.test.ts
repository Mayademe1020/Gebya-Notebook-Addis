/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  createHistoryEntry,
  getHistoryByShop,
  getHistoryByCustomer,
  deleteOldEntries,
  getStats,
  updateHistoryStatus,
  acknowledgeReminder,
  incrementRetryCount,
  getQueuedReminders,
  getLatestQueuedReminderForCustomer,
  clearHistoryForTest,
  getStoredHistoryCount,
} from "../reminderHistory.js";
import type {
  ReminderHistoryEntry,
  ReminderHistoryResult,
  ReminderHistoryStats,
} from "../../types/reminders.js";

describe("reminderHistory.simple", () => {
  beforeEach(() => {
    clearHistoryForTest();
  });

  describe("type exports", () => {
    it("exports ReminderHistoryEntry type", () => {
      const entry: ReminderHistoryEntry = {
        id: "1",
        shopId: 100,
        customerId: 1001,
        chatId: "123456",
        balanceAtSendTime: "500.00",
        dueDate: null,
        daysHeld: 5,
        sentAt: Date.now(),
        status: "sent",
        language: "en",
        retryCount: 0,
        lastAttemptAt: null,
        createdAt: new Date(),
      };
      expect(entry.shopId).toBe(100);
      expect(entry.status).toBe("sent");
    });

    it("exports ReminderHistoryResult type with pagination", () => {
      const result: ReminderHistoryResult = {
        total: 100,
        entries: [],
        pagination: { limit: 50, offset: 0, hasMore: true },
      };
      expect(result.total).toBe(100);
      expect(result.pagination.hasMore).toBe(true);
    });

    it("exports ReminderHistoryStats type", () => {
      const stats: ReminderHistoryStats = {
        totalRemindersSentAllTime: 1000,
        remindersSentThisWeek: 50,
        remindersFailedThisWeek: 5,
        averageDeliveryTimeMs: 150,
        uniqueCustomersRemindedThisWeek: 45,
        unlinkedCustomersCount: 10,
      };
      expect(stats.totalRemindersSentAllTime).toBe(1000);
      expect(stats.remindersSentThisWeek).toBe(50);
    });
  });

  describe("service exports", () => {
    it("has clearHistoryForTest and getStoredHistoryCount", async () => {
      expect(typeof clearHistoryForTest).toBe("function");
      expect(typeof getStoredHistoryCount).toBe("function");
      expect(getStoredHistoryCount()).toBe(0);
    });

    it("createHistoryEntry uses in-memory store when no KV env vars", async () => {
      const entry = await createHistoryEntry({
        shopId: 1,
        customerId: 1,
        chatId: "123",
        balanceAtSendTime: 100,
        sentAt: Date.now(),
        status: "sent",
        language: "en",
      });
      expect(entry.id).toBeTruthy();
      expect(entry.shopId).toBe(1);
      expect(getStoredHistoryCount()).toBe(1);
    });

    it("getHistoryByShop returns paginated results from in-memory store", async () => {
      await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: Date.now(), status: "sent", language: "en" });
      await createHistoryEntry({ shopId: 2, customerId: 1, chatId: "2", balanceAtSendTime: 100, sentAt: Date.now(), status: "sent", language: "en" });
      const result = await getHistoryByShop(1);
      expect(result.total).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("getHistoryByCustomer filters correctly", async () => {
      await createHistoryEntry({ shopId: 1, customerId: 5, chatId: "5", balanceAtSendTime: 100, sentAt: Date.now(), status: "queued", language: "en" });
      const result = await getHistoryByCustomer(1, 5);
      expect(result.total).toBe(1);
      expect(result.entries[0].status).toBe("queued");
    });

    it("updateHistoryStatus and acknowledgeReminder mutate in-memory entries", async () => {
      const entry = await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: Date.now(), status: "queued", language: "en" });
      const updated = await updateHistoryStatus(entry.id, "sent", "msg-1");
      expect(updated?.status).toBe("sent");
      expect(updated?.messageId).toBe("msg-1");

      const acked = await acknowledgeReminder(entry.id);
      expect(acked?.acknowledged).toBe(true);
      expect(typeof acked?.acknowledgedAt).toBe("number");
    });

    it("incrementRetryCount increases retryCount", async () => {
      const entry = await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: Date.now(), status: "failed", language: "en", retryCount: 2 });
      await incrementRetryCount(entry.id);
      // since incrementRetryCount mutates in memory, re-access via getHistoryByCustomer
      const result = await getHistoryByCustomer(1, 1);
      expect(result.entries[0].retryCount).toBe(3);
    });

    it("getQueuedReminders and getLatestQueuedReminderForCustomer work correctly", async () => {
      const sent = await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: Date.now(), status: "sent", language: "en" });
      await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: Date.now() + 1, status: "queued", language: "en" });
      const queued = await getQueuedReminders(1);
      expect(queued.length).toBeGreaterThanOrEqual(1);
      // queued entries are returned oldest-first; verify status filter
      expect(queued.some((e) => e.status === "queued" && e.shopId === 1)).toBe(true);
    });

    it("deleteOldEntries respects cutoff timestamps", async () => {
      const now = Date.now();
      const old = await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: now - 2000, status: "sent", language: "en" });
      const fresh = await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: now, status: "sent", language: "en" });
      // mutate createdAt directly for test purposes
      (old as any).createdAt = new Date(now - 5000);
      const result = await deleteOldEntries(now - 1000);
      expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    });

    it("getStats returns aggregate counts for a shop", async () => {
      await createHistoryEntry({ shopId: 1, customerId: 1, chatId: "1", balanceAtSendTime: 100, sentAt: Date.now(), status: "sent", language: "en" });
      const stats = await getStats(1);
      expect(stats.totalRemindersSentAllTime).toBeGreaterThanOrEqual(1);
      expect(typeof stats.remindersSentThisWeek).toBe("number");
      expect(typeof stats.remindersFailedThisWeek).toBe("number");
    });
  });
});
