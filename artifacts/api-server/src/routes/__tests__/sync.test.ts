/**
 * @vitest-environment node
 */
process.env.JWT_SECRET = "test-secret-for-unit-tests";
process.env.APP_BASE_URL = "http://localhost:3000";

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbTransaction, mockDb } = vi.hoisted(() => {
  const mockDbSelect = vi.fn();
  const mockDbInsert = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockDbTransaction = vi.fn((fn: any) => fn(mockDb));
  const mockDb = {
    select: (...a: any[]) => mockDbSelect(...a),
    insert: (...a: any[]) => mockDbInsert(...a),
    update: (...a: any[]) => mockDbUpdate(...a),
    transaction: mockDbTransaction,
  };
  return { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbTransaction, mockDb };
});

vi.mock("@workspace/db", () => ({ db: mockDb, requireDb: vi.fn(() => mockDb), customerBalanceExpression: vi.fn() }));

vi.mock("@workspace/db/schema", () => ({
  transactions: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id" },
  customers: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id", name: "name", displayName: "displayName", telegramChatId: "telegramChatId" },
  customerTransactions: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id", customerId: "customer_id", type: "type", amount: "amount" },
  catalogEntries: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id" },
  suppliers: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id" },
  supplierTransactions: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id" },
  staffMembers: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id", displayName: "displayName", role: "role" },
  settings: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", key: "key", syncVersion: "syncVersion" },
  analytics: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", key: "key", syncVersion: "syncVersion" },
  devices: { userId: "userId", deviceId: "deviceId", tokenHash: "tokenHash", staffId: "staffId" },
  businessMembers: { userId: "userId", businessId: "businessId", role: "role", active: "active" },
  auditLog: { id: "id", businessId: "businessId" },
  notifications: { id: "id", businessId: "businessId", ownerUserId: "ownerUserId", type: "type", title: "title", body: "body", entityType: "entityType", entityId: "entityId", actorName: "actorName", read: "read" },
  settlements: { businessId: "businessId", updatedAt: "updatedAt", deviceId: "deviceId", localId: "localId", syncVersion: "syncVersion", id: "id", staffId: "staffId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

vi.mock("jsonwebtoken", () => ({
  default: { sign: vi.fn(), verify: vi.fn() },
}));

vi.mock("../auth.js", () => ({
  verifyJwt: vi.fn().mockReturnValue({ userId: 1 }),
}));

vi.mock("../rateLimits.js", () => ({
  syncRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../rbac.js", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  // /sync/pull is gated on membership, not on a permission (H3). The handler
  // itself is exercised below; the gate has its own suite in
  // syncPullMembership.test.ts.
  requireMembership: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../services/pushNotificationSender.js", () => ({
  sendPushToOwner: vi.fn(),
}));

vi.mock("../services/reminderConfiguration.js", () => ({
  setLastReminderSentAt: vi.fn(),
}));

vi.mock("../services/reminderHistory.js", () => ({
  createHistoryEntry: vi.fn(),
}));

vi.mock("../services/telegramBotService.js", () => ({
  sendTelegramTextMessage: vi.fn(),
}));

import syncRouter from "../sync.js";
import { verifyJwt } from "../auth.js";

const mockVerifyJwt = verifyJwt as ReturnType<typeof vi.fn>;

function makeReq(overrides: any = {}) {
  return {
    method: "POST", url: "/push", body: {}, query: {},
    headers: { authorization: "Bearer valid-token", "x-business-id": "1" },
    params: {}, ...overrides,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = vi.fn(function (code: number) { res.statusCode = code; return res; });
  res.json = vi.fn(function (payload: any) { res.body = payload; return res; });
  return res;
}

function chainable(rows: any[]) {
  const q: any = {};
  q.from = vi.fn(() => q);
  q.where = vi.fn(() => q);
  q.orderBy = vi.fn(() => q);
  q.limit = vi.fn(() => Promise.resolve(rows));
  q.returning = vi.fn(() => Promise.resolve(rows));
  q.then = (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject);
  return q;
}

function findHandler(method: string, path: string) {
  const stack = (syncRouter as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`${method.toUpperCase()} ${path} not found`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

async function callHandler(handler: any, req: any, res: any) {
  const noop = () => {};
  await handler(req, res, noop);
}

describe("POST /api/sync/push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockDbTransaction.mockReset();
    mockDbTransaction.mockImplementation((fn: any) => fn(mockDb));
  });

  it("returns 401 when no auth token", async () => {
    mockVerifyJwt.mockReturnValue(undefined);
    const handler = findHandler("post", "/push");
    const req = makeReq({ headers: {} });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Authorization required" });
  });

  it("returns 400 when device_id is missing", async () => {
    mockVerifyJwt.mockReturnValue({ userId: 1 });
    const handler = findHandler("post", "/push");
    // validateAndLinkDevice runs FIRST (checks existing device)
    mockDbSelect.mockReturnValueOnce(chainable([{ userId: 1, tokenHash: "hash", staffId: null }]));
    mockDbUpdate.mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });
    const req = makeReq({ body: { tables: {} } });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/device_id/);
  });

  it("returns 200 with ok=true and empty tables", async () => {
    mockVerifyJwt.mockReturnValue({ userId: 1 });
    const handler = findHandler("post", "/push");
    // validateAndLinkDevice runs FIRST
    mockDbSelect.mockReturnValueOnce(chainable([{ userId: 1, tokenHash: "hash", staffId: null }]));
    mockDbUpdate.mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });
    // getBusinessForUser runs SECOND
    mockDbSelect.mockReturnValueOnce(chainable([{ businessId: 1 }]));
    const req = makeReq({ body: { device_id: "test-device-1", tables: {} } });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.body.ok).toBe(true);
    expect(res.body.device_id).toBe("test-device-1");
    expect(res.body.business_id).toBe(1);
  });
});

describe("GET /api/sync/pull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockDbTransaction.mockReset();
    mockDbTransaction.mockImplementation((fn: any) => fn(mockDb));
  });

  it("returns 401 when no auth token", async () => {
    mockVerifyJwt.mockReturnValue(undefined);
    const handler = findHandler("get", "/pull");
    const req = makeReq({ method: "GET", url: "/pull", query: {}, headers: {} });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Authorization required" });
  });

  it("returns ok=true with tables for valid request", async () => {
    mockVerifyJwt.mockReturnValue({ userId: 1 });
    const handler = findHandler("get", "/pull");
    mockDbSelect.mockReturnValueOnce(chainable([{ businessId: 1 }]));
    for (let i = 0; i < 10; i++) mockDbSelect.mockReturnValueOnce(chainable([]));
    const req = makeReq({ method: "GET", url: "/pull", query: { since: "1000", limit: "50" } });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.body.ok).toBe(true);
    expect(res.body.user_id).toBe(1);
    expect(res.body.business_id).toBe(1);
    expect(res.body.tables).toBeDefined();
    expect(res.body.hasMore).toBe(false);
  });

  it("returns 403 when user has no business", async () => {
    mockVerifyJwt.mockReturnValue({ userId: 1 });
    const handler = findHandler("get", "/pull");
    mockDbSelect.mockReturnValueOnce(chainable([]));
    const req = makeReq({ method: "GET", url: "/pull", query: {} });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/No business/);
  });
});

describe("GET /api/sync/balance-check/:customerId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockVerifyJwt.mockReturnValue({ userId: 1 });
  });

  it("returns 401 when no auth token", async () => {
    mockVerifyJwt.mockReturnValue(undefined);
    const handler = findHandler("get", "/balance-check/:customerId");
    const req = makeReq({ method: "GET", url: "/balance-check/1", params: { customerId: "1" }, headers: {} });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Authorization/);
  });

  it("returns 403 when user has no business", async () => {
    const handler = findHandler("get", "/balance-check/:customerId");
    mockDbSelect.mockReturnValueOnce(chainable([]));
    const req = makeReq({ method: "GET", url: "/balance-check/1", params: { customerId: "1" } });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/No business/);
  });

  it("returns 400 for invalid customerId", async () => {
    const handler = findHandler("get", "/balance-check/:customerId");
    mockDbSelect.mockReturnValueOnce(chainable([{ businessId: 1 }]));
    const req = makeReq({ method: "GET", url: "/balance-check/abc", params: { customerId: "abc" } });
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid customer ID/);
  });

  it("returns balance and transaction count for valid request", async () => {
    const handler = findHandler("get", "/balance-check/:customerId");
    mockDbSelect
      .mockReturnValueOnce(chainable([{ businessId: 1 }]))
      .mockReturnValueOnce(chainable([{ balance: 1500, transactionCount: 5 }]));
    const req = makeReq({ method: "GET", url: "/balance-check/42", params: { customerId: "42" } });
    req.headers["x-business-id"] = "1";
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.customer_id).toBe(42);
    expect(res.body.balance).toBe(1500);
    expect(res.body.transaction_count).toBe(5);
    expect(res.body.computed_at).toBeDefined();
  });

  it("returns zero balance when no transactions found", async () => {
    const handler = findHandler("get", "/balance-check/:customerId");
    mockDbSelect
      .mockReturnValueOnce(chainable([{ businessId: 1 }]))
      .mockReturnValueOnce(chainable([undefined]));
    const req = makeReq({ method: "GET", url: "/balance-check/99", params: { customerId: "99" } });
    req.headers["x-business-id"] = "1";
    const res = makeRes();
    await callHandler(handler, req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.balance).toBe(0);
    expect(res.body.transaction_count).toBe(0);
  });
});
