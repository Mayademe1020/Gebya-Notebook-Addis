/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendReminder, sendBatchReminders, clearHistoryForTest, getStoredHistoryCount } from "../reminderSender.js";

vi.mock("../telegramBotService.js", () => ({
  sendTelegramTextMessage: vi.fn(),
}));

vi.mock("../telegramStore.js", () => ({
  getSessionByChatId: vi.fn(),
  syncTelegramCustomerState: vi.fn(),
}));

vi.mock("../reminderHistory.js", () => ({
  createHistoryEntry: vi.fn().mockResolvedValue({
    id: "hist-1",
    shopId: 1,
    customerId: 1,
    chatId: "123",
    balanceAtSendTime: "100",
    daysHeld: 1,
    sentAt: Date.now(),
    status: "sent",
    language: "en",
    messageId: "msg-1",
    retryCount: 0,
    lastAttemptAt: Date.now(),
    customerNameSnapshot: "Test",
    createdAt: new Date(),
  }),
  getLatestQueuedReminderForCustomer: vi.fn(),
  acknowledgeReminder: vi.fn(),
}));

const { sendTelegramTextMessage } = await import("../telegramBotService.js");
const mockSendTelegram = sendTelegramTextMessage as ReturnType<typeof vi.fn>;

describe("reminderSender", () => {
  beforeEach(() => {
    clearHistoryForTest();
    vi.clearAllMocks();
    mockSendTelegram.mockResolvedValue({ message_id: "123" });
  });

  describe("sendReminder", () => {
    it("returns success on first send", async () => {
      const reminder = {
        id: "r1",
        shopId: 1,
        customerId: 1,
        chatId: "12345",
        balance: 100,
        dueDate: null,
        daysHeld: 5,
        language: "en" as const,
        queuedAt: Date.now(),
        priority: 0,
        customerName: "Test Customer",
        shopName: "Test Shop",
      };

      const result = await sendReminder(reminder);
      expect(result.success).toBe(true);
      expect(result.messageId).toBe("123");
      expect(result.retryCount).toBe(0);
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldUnlink).toBe(false);
    });

    it("retries on transient error and eventually succeeds", async () => {
      mockSendTelegram
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({ message_id: "456" });

      const reminder = {
        id: "r2",
        shopId: 1,
        customerId: 2,
        chatId: "12345",
        balance: 50,
        dueDate: null,
        daysHeld: 2,
        language: "en" as const,
        queuedAt: Date.now(),
        priority: 0,
        customerName: "Retry Customer",
        shopName: "Shop",
      };

      const result = await sendReminder(reminder);
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(mockSendTelegram).toHaveBeenCalledTimes(2);
    });

    it("returns failure after all retries exhausted", async () => {
      mockSendTelegram.mockRejectedValue(new Error("Permanent failure"));

      const reminder = {
        id: "r3",
        shopId: 1,
        customerId: 3,
        chatId: "12345",
        balance: 50,
        dueDate: null,
        daysHeld: 2,
        language: "en" as const,
        queuedAt: Date.now(),
        priority: 0,
        customerName: "Fail Customer",
        shopName: "Shop",
      };

      const result = await sendReminder(reminder);
      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(3);
      expect(mockSendTelegram).toHaveBeenCalledTimes(4); // initial + 3 retries
    }, 15000);

    it("marks invalid_chat as shouldUnlink", async () => {
      mockSendTelegram.mockRejectedValue(new Error("400 Chat not found"));

      const reminder = {
        id: "r4",
        shopId: 1,
        customerId: 4,
        chatId: "invalidchat",
        balance: 50,
        dueDate: null,
        daysHeld: 2,
        language: "en" as const,
        queuedAt: Date.now(),
        priority: 0,
        customerName: "InvalidChat",
        shopName: "Shop",
      };

      const result = await sendReminder(reminder);
      expect(result.success).toBe(false);
      expect(result.errorClass).toBe("invalid_chat");
      expect(result.shouldUnlink).toBe(true);
      expect(result.shouldRetry).toBe(false);
    });

    it("marks invalid_token as shouldUnlink", async () => {
      mockSendTelegram.mockRejectedValue(new Error("401 Unauthorized"));

      const reminder = {
        id: "r5",
        shopId: 1,
        customerId: 5,
        chatId: "12345",
        balance: 50,
        dueDate: null,
        daysHeld: 2,
        language: "en" as const,
        queuedAt: Date.now(),
        priority: 0,
        customerName: "InvalidToken",
        shopName: "Shop",
      };

      const result = await sendReminder(reminder);
      expect(result.success).toBe(false);
      expect(result.errorClass).toBe("invalid_token");
      expect(result.shouldUnlink).toBe(true);
    });
  });

  describe("sendBatchReminders", () => {
    it("returns send/fail counts", async () => {
      mockSendTelegram
        .mockResolvedValueOnce({ message_id: "1" })
        .mockRejectedValueOnce(new Error("fail"));

      const reminders = [
        {
          id: "b1",
          shopId: 1,
          customerId: 1,
          chatId: "1",
          balance: 10,
          dueDate: null,
          daysHeld: 1,
          language: "en" as const,
          queuedAt: Date.now(),
          priority: 0,
        },
        {
          id: "b2",
          shopId: 1,
          customerId: 2,
          chatId: "2",
          balance: 20,
          dueDate: null,
          daysHeld: 2,
          language: "en" as const,
          queuedAt: Date.now(),
          priority: 0,
        },
      ];

      const result = await sendBatchReminders(reminders);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
    });
  });
});
