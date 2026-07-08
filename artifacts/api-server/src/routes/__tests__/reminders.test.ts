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

vi.mock("../../services/reminderScheduler.js", () => ({
  runRemindersForShop: vi.fn(),
}));


vi.mock("../rbac.js", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  verifyShopOwnership: (req: any, res: any, next: any) => {
    const ctx = req.deviceContext;
    if (!ctx) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const shopId = Number(req.body?.shopId) || Number(req.query?.shopId) || Number(req.headers?.["x-shop-id"]) || 0;
    if (!Number.isInteger(shopId) || shopId <= 0) {
      res.status(400).json({ error: "Missing or invalid shopId" });
      return;
    }
    if (shopId !== ctx.businessId) {
      res.status(403).json({ error: "Forbidden: not authorized for this shop" });
      return;
    }
    next();
  },
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
import { runRemindersForShop } from "../../services/reminderScheduler.js";

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
const mockRunRemindersForShop = runRemindersForShop as ReturnType<typeof vi.fn>;

function createReq(method: string, url: string, body: any = {}, query: any = {}, headers: any = {}, deviceContext: any = { userId: 1, businessId: 1, role: "owner", permissions: { can_edit_settings: true, can_view_reports: true } }): any {
  return {
    method,
    url,
    body,
    query,
    headers,
    locals: {},
    params: {},
    deviceContext,
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
    process.env.REMINDER_CRON_SECRET = "test-cron-secret";
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

      const req = createReq("POST", "/config", { frequency: "weekly" }, {}, { "x-shop-id": "2" }, { userId: 2, businessId: 2, role: "owner", permissions: { can_edit_settings: true } });
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

      const req = createReq("POST", "/test/1", { balance: 50, token: "tok" }, {}, { "x-shop-id": "1", "x-reminder-cron-secret": "test-cron-secret" });
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

      const req = createReq("POST", "/test/1", {}, {}, { "x-shop-id": "1", "x-reminder-cron-secret": "test-cron-secret" });
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

  describe("Cross-shop access control", () => {
    it("GET /config rejects cross-shop access with 403", async () => {
      const req = createReq("GET", "/config", {}, {}, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: {} });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("POST /config rejects cross-shop access with 403", async () => {
      mockSetShopDefault.mockResolvedValue(undefined);
      const req = createReq("POST", "/config", { frequency: "daily" }, {}, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: { can_edit_settings: true } });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("GET /config/:customerId rejects cross-shop access with 403", async () => {
      const req = createReq("GET", "/config/10", {}, {}, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: {} });
      req.params = { customerId: "10" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("DELETE /config/:customerId rejects cross-shop access with 403", async () => {
      mockClearCustomerOverride.mockResolvedValue(undefined);
      const req = createReq("DELETE", "/config/10", {}, {}, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: { can_edit_settings: true } });
      req.params = { customerId: "10" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("GET /history rejects cross-shop access with 403", async () => {
      mockQueryHistory.mockResolvedValue({ total: 0, entries: [], pagination: { limit: 50, offset: 0, hasMore: false } });
      const req = createReq("GET", "/history?limit=10&offset=0", {}, { limit: "10", offset: "0" }, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: { can_view_reports: true } });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("POST /pause rejects cross-shop access with 403", async () => {
      mockSetShopDefault.mockResolvedValue(undefined);
      const req = createReq("POST", "/pause", {}, {}, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: { can_edit_settings: true } });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("POST /resume rejects cross-shop access with 403", async () => {
      mockSetShopDefault.mockResolvedValue(undefined);
      const req = createReq("POST", "/resume", {}, {}, { "x-shop-id": "2" }, { userId: 1, businessId: 1, role: "owner", permissions: { can_edit_settings: true } });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("POST /test/:customerId rejects cross-shop access with 403", async () => {
      mockGetTelegramLinkSession.mockResolvedValue({
        token: "tok",
        customerName: "Test",
        chatId: "123",
        currentBalance: 50,
        createdAt: Date.now() - 86400000,
      });
      mockSendTelegramTextMessage.mockResolvedValue({ message_id: "test-1" });
      const req = createReq("POST", "/test/1", { balance: 50, token: "tok" }, {}, { "x-shop-id": "2", "x-reminder-cron-secret": "test-cron-secret" }, { userId: 1, businessId: 1, role: "owner", permissions: {} });
      req.params = { customerId: "1" };
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: not authorized for this shop" });
    });

    it("returns 401 when no deviceContext is present", async () => {
      const req = createReq("GET", "/config", {}, {}, { "x-shop-id": "1" }, undefined);
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });
  });

  describe("POST /run", () => {
    it("returns 401 when REMINDER_CRON_SECRET is missing from request", async () => {
      const req = createReq("POST", "/run", { shopId: 1 }, {}, { "x-shop-id": "1" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "unauthorized" });
    });

    it("returns 401 when REMINDER_CRON_SECRET is mismatched", async () => {
      const req = createReq("POST", "/run", { shopId: 1 }, {}, { "x-shop-id": "1", "x-reminder-cron-secret": "wrong-secret" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "unauthorized" });
    });

    it("returns 200 and processes reminders when secret is correct", async () => {
      mockRunRemindersForShop.mockResolvedValue({
        startedAt: Date.now(),
        completedAt: Date.now(),
        customersScanned: 1,
        customersWithBalance: 1,
        remindersQueued: 1,
        remindersSent: 1,
        remindersFailed: 0,
        remindersSkipped: 0,
        errors: [],
        shopsProcessed: 1,
        success: true,
      });

      const req = createReq("POST", "/run", {
        shopId: 1,
        customers: [
          {
            customerId: 1,
            customerName: "Test",
            balance: 100,
            customerCreatedAt: Date.now() - 86400000,
            chatId: "123",
          },
        ],
      }, {}, { "x-shop-id": "1", "x-reminder-cron-secret": "test-cron-secret" });
      const res = createRes();

      await new Promise((resolve, reject) => {
        reminders.handle(req, res, (err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockRunRemindersForShop).toHaveBeenCalledWith(1, expect.any(Array), undefined);
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        stats: {
          scanned: 1,
          withBalance: 1,
          queued: 1,
          sent: 1,
          failed: 0,
          skipped: 0,
          errors: 0,
          completedIn: expect.any(Number),
        },
      });
    });

    it("returns 500 when REMINDER_CRON_SECRET env var is not set", async () => {
      const originalSecret = process.env.REMINDER_CRON_SECRET;
      delete process.env.REMINDER_CRON_SECRET;

      const req = createReq("POST", "/run", { shopId: 1 }, {}, { "x-shop-id": "1" });
      const res = createRes();

      try {
        await new Promise((resolve, reject) => {
          reminders.handle(req, res, (err: any) => {
            if (err) reject(err);
            else resolve(undefined);
          });
        });

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: "Server misconfigured: REMINDER_CRON_SECRET environment variable is not set",
        });
      } finally {
        if (originalSecret !== undefined) {
          process.env.REMINDER_CRON_SECRET = originalSecret;
        }
      }
    });
  });
});
