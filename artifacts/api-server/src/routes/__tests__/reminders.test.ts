/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import reminders from "../../routes/reminders.js";

vi.mock("../../services/reminderConfiguration.js", () => ({
  getShopDefault: vi.fn(),
  setShopDefault: vi.fn(),
  getCustomerFrequency: vi.fn(),
  setCustomerFrequency: vi.fn(),
  clearCustomerOverride: vi.fn(),
  isRemindersEnabled: vi.fn(),
}));

vi.mock("../../services/reminderSender.js", () => ({
  queryHistory: vi.fn(),
}));

vi.mock("../../services/telegramStore.js", () => ({
  getSessionByChatId: vi.fn(),
  getTelegramLinkSession: vi.fn(),
}));

vi.mock("../../services/reminderMessageBuilder.js", () => ({
  buildReminderMessage: vi.fn(() => "mocked message"),
}));

vi.mock("../../services/telegramBotService.js", () => ({
  sendTelegramTextMessage: vi.fn(),
}));

vi.mock("drizzle-orm/expressions", () => ({
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  sql: () => ({}),
}));

vi.mock("../rbac.js", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

import {
  getShopDefault,
  setShopDefault,
  getCustomerFrequency,
  setCustomerFrequency,
  clearCustomerOverride,
  isRemindersEnabled,
} from "../../services/reminderConfiguration.js";
import { queryHistory } from "../../services/reminderSender.js";
import { getSessionByChatId, getTelegramLinkSession } from "../../services/telegramStore.js";
import { sendTelegramTextMessage } from "../../services/telegramBotService.js";

const mockGetShopDefault = getShopDefault as ReturnType<typeof vi.fn>;
const mockSetShopDefault = setShopDefault as ReturnType<typeof vi.fn>;
const mockGetCustomerFrequency = getCustomerFrequency as ReturnType<typeof vi.fn>;
const mockSetCustomerFrequency = setCustomerFrequency as ReturnType<typeof vi.fn>;
const mockClearCustomerOverride = clearCustomerOverride as ReturnType<typeof vi.fn>;
const mockIsRemindersEnabled = isRemindersEnabled as ReturnType<typeof vi.fn>;
const mockQueryHistory = queryHistory as ReturnType<typeof vi.fn>;
const mockGetSessionByChatId = getSessionByChatId as ReturnType<typeof vi.fn>;
const mockGetTelegramLinkSession = getTelegramLinkSession as ReturnType<typeof vi.fn>;
const mockSendTelegramTextMessage = sendTelegramTextMessage as ReturnType<typeof vi.fn>;

function createReq(method: string, url: string, body: any = {}, query: any = {}, headers: any = {}): any {
  return {
    method,
    url,
    body,
    query,
    headers,
    locals: {},
    params: {},
  };
}

function createRes() {
  const res: any = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res;
}

describe("reminders routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /config", () => {
    it("returns shop default frequency", async () => {
      mockGetShopDefault.mockResolvedValue("daily");

      const req = createReq("GET", "/config", {}, {}, { "x-shop-id": "1" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ shopId: 1, frequency: "daily", enabled: true });
    });
  });

  describe("POST /config", () => {
    it("sets shop default frequency", async () => {
      mockSetShopDefault.mockResolvedValue(undefined);

      const req = createReq("POST", "/config", { frequency: "weekly" }, {}, { "x-shop-id": "2" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockSetShopDefault).toHaveBeenCalledWith(2, "weekly");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, shopId: 2, frequency: "weekly" });
    });
  });

  describe("GET /config/:customerId", () => {
    it("returns customer frequency override", async () => {
      mockGetCustomerFrequency.mockResolvedValue("weekly");
      mockIsRemindersEnabled.mockResolvedValue(true);

      const req = createReq("GET", "/config/10", {}, {}, { "x-shop-id": "1" });
      req.params = { customerId: "10" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockGetCustomerFrequency).toHaveBeenCalledWith(1, 10);
      expect(res.json).toHaveBeenCalledWith({ shopId: 1, customerId: 10, frequency: "weekly", enabled: true });
    });
  });

  describe("DELETE /config/:customerId", () => {
    it("clears customer override", async () => {
      mockClearCustomerOverride.mockResolvedValue(undefined);

      const req = createReq("DELETE", "/config/10", {}, {}, { "x-shop-id": "1" });
      req.params = { customerId: "10" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockClearCustomerOverride).toHaveBeenCalledWith(1, 10);
      expect(res.json).toHaveBeenCalledWith({ ok: true, shopId: 1, customerId: 10, message: "Override cleared, reverting to shop default" });
    });
  });

  describe("GET /history", () => {
    it("queries and returns history", async () => {
      mockQueryHistory.mockResolvedValue({ total: 2, entries: [], pagination: { limit: 50, offset: 0, hasMore: false } });

      const req = createReq("GET", "/history?limit=10&offset=0", {}, { limit: "10", offset: "0" }, { "x-shop-id": "1" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockQueryHistory).toHaveBeenCalledWith(1, { limit: 10, offset: 0, customerId: undefined });
    });
  });

  describe("POST /pause", () => {
    it("sets shop default to disabled", async () => {
      mockSetShopDefault.mockResolvedValue(undefined);

      const req = createReq("POST", "/pause", {}, {}, { "x-shop-id": "1" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockSetShopDefault).toHaveBeenCalledWith(1, "disabled");
      expect(res.json).toHaveBeenCalledWith({ ok: true, shopId: 1, paused: true, message: "All reminders paused for this shop" });
    });
  });

  describe("POST /resume", () => {
    it("sets shop default back to daily", async () => {
      mockSetShopDefault.mockResolvedValue(undefined);

      const req = createReq("POST", "/resume", {}, {}, { "x-shop-id": "1" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockSetShopDefault).toHaveBeenCalledWith(1, "daily");
      expect(res.json).toHaveBeenCalledWith({ ok: true, shopId: 1, paused: false, message: "Reminders resumed for this shop" });
    });
  });

  describe("POST /test/:customerId", () => {
    it("sends test reminder when session found", async () => {
      mockGetTelegramLinkSession.mockResolvedValue({
        token: "tok",
        customerName: "Test",
        chatId: "123",
        currentBalance: 50,
        createdAt: Date.now() - 86400000,
      });
      mockSendTelegramTextMessage.mockResolvedValue({ message_id: "test-1" });

      const req = createReq("POST", "/test/1", { balance: 50, token: "tok" }, {}, { "x-shop-id": "1" });
      req.params = { customerId: "1" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(mockSendTelegramTextMessage).toHaveBeenCalledWith("123", expect.stringContaining("Test"));
      expect(res.json).toHaveBeenCalledWith({ sent: true, messageId: "test-1", message: expect.any(String) });
    });

    it("returns 404 when session not found", async () => {
      mockGetTelegramLinkSession.mockResolvedValue(null);

      const req = createReq("POST", "/test/1", {}, {}, { "x-shop-id": "1" });
      req.params = { customerId: "1" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
