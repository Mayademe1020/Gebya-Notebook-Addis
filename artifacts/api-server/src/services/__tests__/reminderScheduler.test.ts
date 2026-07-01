/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isEligibleToday,
  daysSince,
  queueReminder,
  drainQueue,
  queueSize,
  clearQueueForTest,
  scheduleReminders,
  runRemindersForShop,
} from "../reminderScheduler.js";

vi.mock("../telegramStore.js", () => ({
  getSessionByChatId: vi.fn(),
  getTelegramLinkSession: vi.fn(),
}));

vi.mock("../reminderConfiguration.js", () => ({
  getCustomerFrequency: vi.fn(),
  isRemindersEnabled: vi.fn(),
}));

vi.mock("../reminderSender.js", () => ({
  sendBatchReminders: vi.fn(),
}));

const { getSessionByChatId } = await import("../telegramStore.js");
const { getCustomerFrequency } = await import("../reminderConfiguration.js");
const { sendBatchReminders } = await import("../reminderSender.js");

const mockGetSessionByChatId = getSessionByChatId as ReturnType<typeof vi.fn>;
const mockGetCustomerFrequency = getCustomerFrequency as ReturnType<typeof vi.fn>;
const mockSendBatchReminders = sendBatchReminders as ReturnType<typeof vi.fn>;

// Helper to create EligibleCustomer with sensible defaults
function makeCustomer(overrides: Partial<{
  customerId: number;
  customerName: string;
  balance: number;
  dueDate: number | null;
  customerCreatedAt: number;
  chatId: string;
  updatesEnabled: boolean;
  telegramLanguage: "am" | "en";
  reminderConfig: any;
}> = {}): any {
  return {
    customerId: overrides.customerId ?? 1,
    customerName: overrides.customerName ?? "Test Customer",
    balance: overrides.balance ?? 100,
    dueDate: overrides.dueDate ?? null,
    customerCreatedAt: overrides.customerCreatedAt ?? Date.now() - 86400000,
    chatId: overrides.chatId ?? "12345",
    updatesEnabled: overrides.updatesEnabled ?? true,
    telegramLanguage: overrides.telegramLanguage ?? "en",
    reminderConfig: overrides.reminderConfig ?? {
      id: "cfg-1",
      shopId: 1,
      customerId: 1,
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

describe("reminderScheduler", () => {
  beforeEach(() => {
    clearQueueForTest();
    vi.clearAllMocks();
  });

  describe("isEligibleToday", () => {
    it("returns true for disabled frequency", () => {
      expect(isEligibleToday("disabled", Date.now())).toBe(false);
    });

    it("returns true when never sent", () => {
      expect(isEligibleToday("daily", null)).toBe(true);
      expect(isEligibleToday("weekly", null)).toBe(true);
    });

    it("returns true for daily when 24h has passed", () => {
      const yesterday = Date.now() - 25 * 3600 * 1000;
      expect(isEligibleToday("daily", yesterday)).toBe(true);
    });

    it("returns false for daily when <24h has passed", () => {
      const oneHourAgo = Date.now() - 3600 * 1000;
      expect(isEligibleToday("daily", oneHourAgo)).toBe(false);
    });

    it("returns true for weekly when 7d has passed", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 3600 * 1000;
      expect(isEligibleToday("weekly", eightDaysAgo)).toBe(true);
    });

    it("returns false for weekly when <7d has passed", () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
      expect(isEligibleToday("weekly", threeDaysAgo)).toBe(false);
    });
  });

  describe("daysSince", () => {
    it("returns floor of days since timestamp", () => {
      const now = Date.now();
      expect(daysSince(now - 86400000)).toBe(1); // exactly 1 day
      expect(daysSince(now - 172800000)).toBe(2); // exactly 2 days
    });

    it("floors fractional days", () => {
      const now = Date.now();
      expect(daysSince(now - 86400000 - 3600000)).toBe(1); // 25 hours ago = 1 day
    });
  });

  describe("queue/drain", () => {
    it("queueReminder adds to queue", () => {
      const reminder = {
        id: "r1",
        shopId: 1,
        customerId: 1,
        chatId: "123",
        balance: 100,
        dueDate: null,
        daysHeld: 5,
        language: "en" as const,
        queuedAt: Date.now(),
        priority: 0,
        customerName: "C1",
      };
      queueReminder(reminder);
      expect(queueSize()).toBe(1);
    });

    it("queueReminder deduplicates same customer+shop", () => {
      const r1 = { id: "r1", shopId: 1, customerId: 1 };
      const r2 = { id: "r2", shopId: 1, customerId: 1 };
      queueReminder(r1);
      queueReminder(r2);
      expect(queueSize()).toBe(1);
    });

    it("drainQueue empties and returns items", () => {
      queueReminder({ id: "r1", shopId: 1, customerId: 1, chatId: "1", balance: 10, dueDate: null, daysHeld: 1, language: "en", queuedAt: Date.now(), priority: 0 });
      queueReminder({ id: "r2", shopId: 2, customerId: 2, chatId: "2", balance: 20, dueDate: null, daysHeld: 2, language: "en", queuedAt: Date.now(), priority: 0 });
      const items = drainQueue();
      expect(items).toHaveLength(2);
      expect(queueSize()).toBe(0);
    });
  });

  describe("scheduleReminders", () => {
    it("skips customers with balance <= 0", async () => {
      const stats = await scheduleReminders(1, [makeCustomer({ balance: 0 }), makeCustomer({ balance: -5 })]);
      expect(stats.remindersSkipped).toBe(2);
      expect(stats.remindersQueued).toBe(0);
    });

    it("skips customers with missing Telegram session", async () => {
      mockGetSessionByChatId.mockResolvedValue(null);
      const stats = await scheduleReminders(1, [makeCustomer()]);
      expect(stats.remindersSkipped).toBe(1);
      expect(stats.remindersQueued).toBe(0);
    });

    it("skips customers with session that has updatesEnabled=false and no fallback", async () => {
      mockGetSessionByChatId.mockResolvedValue({
        chatId: "123",
        updatesEnabled: false,
        telegramUsername: null,
      } as any);
      const customer = makeCustomer({ updatesEnabled: false });
      const stats = await scheduleReminders(1, [customer]);
      expect(stats.remindersSkipped).toBe(1);
    });

    it("skips customers with disabled frequency", async () => {
      mockGetSessionByChatId.mockResolvedValue({ chatId: "123", updatesEnabled: true } as any);
      mockGetCustomerFrequency.mockResolvedValue("disabled");
      const stats = await scheduleReminders(1, [
        {
          customerId: 1,
          customerName: "Test Customer",
          balance: 100,
          dueDate: null,
          customerCreatedAt: Date.now() - 86400000,
          chatId: "12345",
          updatesEnabled: true,
          telegramLanguage: "en",
          // omit reminderConfig so scheduler falls back to getCustomerFrequency
        },
      ]);
      expect(stats.remindersSkipped).toBe(1);
      expect(mockGetCustomerFrequency).toHaveBeenCalledWith(1, 1);
    });

    it("queues eligible customers", async () => {
      mockGetSessionByChatId.mockResolvedValue({
        chatId: "123",
        updatesEnabled: true,
        telegramUsername: null,
      } as any);
      mockGetCustomerFrequency.mockResolvedValue("daily");

      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 86400000;
      const stats = await scheduleReminders(1, [
        makeCustomer({
          customerId: 1,
          customerName: "Alice",
          customerCreatedAt: thirtyDaysAgo,
          reminderConfig: {
            id: "cfg-1",
            shopId: 1,
            customerId: 1,
            frequency: "daily",
            lastReminderSentAt: null,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ]);

      expect(stats.customersScanned).toBe(1);
      expect(stats.customersWithBalance).toBe(1);
      expect(stats.remindersQueued).toBe(1);
      expect(stats.remindersSkipped).toBe(0);
      expect(queueSize()).toBe(1);
    });

    it("resolves language from telegramUsername when am", async () => {
      mockGetSessionByChatId.mockResolvedValue({
        chatId: "123",
        updatesEnabled: true,
        telegramUsername: "@am_customer",
      } as any);
      mockGetCustomerFrequency.mockResolvedValue("daily");

      const stats = await scheduleReminders(1, [
        makeCustomer({
          telegramLanguage: "am",
          customerCreatedAt: Date.now() - 86400000,
        }),
      ]);

      expect(stats.remindersQueued).toBe(1);
      const queued = drainQueue();
      expect(queued[0].language).toBe("am");
    });

    it("uses customer.reminderConfig.frequency over getCustomerFrequency when provided", async () => {
      mockGetSessionByChatId.mockResolvedValue({
        chatId: "123",
        updatesEnabled: true,
        telegramUsername: null,
      } as any);
      // Even if getCustomerFrequency returns disabled, the reminderConfig override should win
      // But scheduleReminders prefers customer.reminderConfig.frequency
      const stats = await scheduleReminders(1, [
        makeCustomer({
          reminderConfig: {
            id: "cfg-1",
            shopId: 1,
            customerId: 1,
            frequency: "weekly",
            lastReminderSentAt: null,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        }),
      ]);

      expect(stats.remindersQueued).toBe(1);
      expect(mockGetCustomerFrequency).not.toHaveBeenCalled();
    });
  });

  describe("runRemindersForShop", () => {
    it("schedules and sends queued reminders", async () => {
      mockGetSessionByChatId.mockResolvedValue({
        chatId: "123",
        updatesEnabled: true,
        telegramUsername: null,
      } as any);
      mockGetCustomerFrequency.mockResolvedValue("daily");
      mockSendBatchReminders.mockResolvedValue({ sent: 1, failed: 0, results: [] });

      const customers = [
        makeCustomer({
          customerId: 1,
          customerCreatedAt: Date.now() - 86400000,
          reminderConfig: {
            id: "cfg-1",
            shopId: 1,
            customerId: 1,
            frequency: "daily",
            lastReminderSentAt: null,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        }),
      ];

      const stats = await runRemindersForShop(1, customers);
      expect(stats.remindersSent).toBe(1);
      expect(stats.remindersFailed).toBe(0);
      expect(mockSendBatchReminders).toHaveBeenCalledTimes(1);
    });
  });
});
