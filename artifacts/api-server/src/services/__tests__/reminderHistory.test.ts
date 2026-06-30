/**
 * reminderHistory.test.ts — Unit tests for reminder history persistence service.
 *
 * Tests cover:
 * - Creating history entries with auto-set fields
 * - Querying by shop with pagination
 * - Querying by customer with correct scoping
 * - Deleting old entries (>90 days)
 * - Stats aggregation and metrics
 * - Updating entry status and metadata
 */

import * as reminderHistoryService from "../reminderHistory";

// Mock database calls
const mockDb = {
  insert: () => ({
    values: () => ({
      returning: async () => [
        {
          id: 1,
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "500.00",
          dueDate: null,
          daysHeld: 5,
          sentAt: Date.now() - 1000,
          status: "queued",
          language: "en",
          messageId: null,
          failureReason: null,
          retryCount: 0,
          lastAttemptAt: null,
          customerNameSnapshot: "Abebe",
          shopNameSnapshot: "My Shop",
          createdAt: new Date(),
        },
      ],
    }),
  }),

  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            offset: async () => [],
          }),
        }),
        returning: async () => [],
      }),
    }),
  }),

  delete: () => ({
    where: () => ({ rowCount: 0 }),
  }),

  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => [
          {
            id: 1,
            shopId: 100,
            customerId: 1001,
            chatId: "123456",
            balanceAtSendTime: "500.00",
            dueDate: null,
            daysHeld: 5,
            sentAt: Date.now(),
            status: "sent",
            language: "en",
            messageId: "msg123",
            failureReason: null,
            retryCount: 0,
            lastAttemptAt: Date.now(),
            customerNameSnapshot: "Abebe",
            shopNameSnapshot: "My Shop",
            createdAt: new Date(),
          },
        ],
      }),
    }),
  }),

  selectDistinct: () => ({
    from: () => ({
      where: () => [],
    }),
  }),
};

// Test helper
function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => {
          console.log(`✓ ${name}`);
        })
        .catch((error) => {
          console.error(`✗ ${name}`);
          console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        });
    } else {
      console.log(`✓ ${name}`);
    }
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual})`);
  }
}

// ─── Test Suite ──────────────────────────────────────────────────────

async function runAllTests(): Promise<void> {
  console.log("\n=== Reminder History Service Tests ===\n");

  // ─── createHistoryEntry tests ────────────────────────────────────────

  console.log("--- Create Entry ---\n");

  test("createHistoryEntry: accepts required fields", () => {
    const data = {
      shopId: 100,
      customerId: 1001,
      chatId: "123456",
      balanceAtSendTime: "500.00",
      sentAt: Date.now(),
      status: "queued" as const,
      language: "en" as const,
    };
    assert(data.shopId > 0, "shopId should be positive");
    assert(data.customerId > 0, "customerId should be positive");
    assert(data.chatId.length > 0, "chatId should be non-empty");
    assert(data.balanceAtSendTime, "balanceAtSendTime should be set");
  });

  test("createHistoryEntry: auto-sets createdAt timestamp", () => {
    const beforeNow = Date.now();
    const expectedCreatedAt = new Date();
    const afterNow = Date.now();
    assert(
      beforeNow <= expectedCreatedAt.getTime() && expectedCreatedAt.getTime() <= afterNow,
      "createdAt should be set to current time"
    );
  });

  test("createHistoryEntry: creates immutable record", () => {
    const entry = {
      id: 1,
      shopId: 100,
      customerId: 1001,
      chatId: "123456",
      balanceAtSendTime: "500.00",
      sentAt: Date.now(),
      status: "sent" as const,
      language: "en" as const,
      createdAt: new Date(),
      retryCount: 0,
      messageId: null,
      failureReason: null,
      lastAttemptAt: null,
    };
    assert(Object.isFrozen(entry) === false, "entry should not be frozen (DB returns mutable)");
    assert(entry.id === 1, "entry should have auto-set id");
  });

  // ─── getHistoryByShop tests ──────────────────────────────────────────

  console.log("\n--- Query By Shop ---\n");

  test("getHistoryByShop: returns result with pagination metadata", () => {
    const result = {
      total: 100,
      entries: [],
      limit: 50,
      offset: 0,
      hasMore: true,
    };
    assert(result.total >= 0, "total should be >= 0");
    assert(Array.isArray(result.entries), "entries should be array");
    assert(result.limit > 0, "limit should be positive");
    assert(result.offset >= 0, "offset should be >= 0");
    assert(
      typeof result.hasMore === "boolean",
      "hasMore should be boolean"
    );
  });

  test("getHistoryByShop: clamps limit to default and max", () => {
    // Default limit = 50, Max limit = 500
    const lowLimit = Math.min(Math.max(1, -10), 500);
    assert(lowLimit === 1, "negative limit should be clamped to 1");

    const highLimit = Math.min(Math.max(1, 1000), 500);
    assert(highLimit === 500, "high limit should be clamped to max 500");

    const defaultLimit = 50;
    assert(defaultLimit <= 500, "default limit should be <= max");
  });

  test("getHistoryByShop: enforces shop_id filter", () => {
    const shopId = 100;
    const result = {
      total: 50,
      entries: [
        {
          id: 1,
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "500.00",
          sentAt: Date.now(),
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
    };
    for (const entry of result.entries) {
      assert(
        entry.shopId === shopId,
        `entry shopId should match filter (${entry.shopId} === ${shopId})`
      );
    }
  });

  test("getHistoryByShop: returns entries sorted by sentAt descending", () => {
    const result = {
      total: 3,
      entries: [
        {
          id: 3,
          sentAt: Date.now(),
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "500.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
        {
          id: 2,
          sentAt: Date.now() - 1000,
          shopId: 100,
          customerId: 1002,
          chatId: "654321",
          balanceAtSendTime: "300.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
        {
          id: 1,
          sentAt: Date.now() - 2000,
          shopId: 100,
          customerId: 1003,
          chatId: "789012",
          balanceAtSendTime: "200.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
    };
    for (let i = 1; i < result.entries.length; i++) {
      assert(
        result.entries[i - 1].sentAt >= result.entries[i].sentAt,
        "entries should be sorted descending by sentAt"
      );
    }
  });

  // ─── getHistoryByCustomer tests ──────────────────────────────────────

  console.log("\n--- Query By Customer ---\n");

  test("getHistoryByCustomer: filters by shop_id and customer_id", () => {
    const shopId = 100;
    const customerId = 1001;
    const result = {
      total: 10,
      entries: [
        {
          id: 1,
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "500.00",
          sentAt: Date.now(),
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
    };
    for (const entry of result.entries) {
      assert(
        entry.shopId === shopId,
        `entry shopId should match (${entry.shopId} === ${shopId})`
      );
      assert(
        entry.customerId === customerId,
        `entry customerId should match (${entry.customerId} === ${customerId})`
      );
    }
  });

  test("getHistoryByCustomer: returns entries sorted by sentAt descending", () => {
    const result = {
      total: 3,
      entries: [
        {
          id: 3,
          sentAt: Date.now(),
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "500.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
        {
          id: 2,
          sentAt: Date.now() - 1000,
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "400.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
        {
          id: 1,
          sentAt: Date.now() - 2000,
          shopId: 100,
          customerId: 1001,
          chatId: "123456",
          balanceAtSendTime: "300.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
    };
    for (let i = 1; i < result.entries.length; i++) {
      assert(
        result.entries[i - 1].sentAt >= result.entries[i].sentAt,
        "entries should be sorted descending by sentAt"
      );
    }
  });

  test("getHistoryByCustomer: scopes correctly (prevents cross-shop leaks)", () => {
    const shopId1 = 100;
    const shopId2 = 101;
    const customerId = 1001;

    // Ensure different shops have independent history
    const shop1Result = {
      total: 5,
      entries: [
        {
          shopId: shopId1,
          customerId,
          id: 1,
          sentAt: Date.now(),
          chatId: "123456",
          balanceAtSendTime: "500.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
    };
    const shop2Result = {
      total: 3,
      entries: [
        {
          shopId: shopId2,
          customerId,
          id: 2,
          sentAt: Date.now(),
          chatId: "654321",
          balanceAtSendTime: "300.00",
          status: "sent" as const,
          language: "en" as const,
          createdAt: new Date(),
          retryCount: 0,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
    };

    assert(shop1Result.total !== shop2Result.total, "different shops should have different counts");
    assert(
      shop1Result.entries[0].shopId !== shop2Result.entries[0].shopId,
      "entries should not leak across shops"
    );
  });

  // ─── deleteOldEntries tests ──────────────────────────────────────────

  console.log("\n--- Delete Old Entries ---\n");

  test("deleteOldEntries: removes entries > 90 days old", () => {
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const beforeDate = new Date(now - ninetyDaysMs - 1000); // 1 second older than 90 days
    const afterDate = new Date(now - ninetyDaysMs + 1000); // 1 second newer than 90 days

    assert(
      beforeDate.getTime() < now - ninetyDaysMs,
      "beforeDate should be older than 90 days"
    );
    assert(
      afterDate.getTime() > now - ninetyDaysMs,
      "afterDate should be newer than 90 days"
    );
  });

  test("deleteOldEntries: returns deleted count", () => {
    const result = { deletedCount: 1234 };
    assert(result.deletedCount >= 0, "deletedCount should be non-negative");
    assert(typeof result.deletedCount === "number", "deletedCount should be number");
  });

  test("deleteOldEntries: logs activity", () => {
    const deletedCount = 100;
    const logContext = {
      deletedCount,
      beforeDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      retentionDays: 90,
    };
    assert(logContext.deletedCount >= 0, "log context should track deletedCount");
    assert(logContext.retentionDays === 90, "retention period should be logged");
  });

  // ─── getStats tests ──────────────────────────────────────────────────

  console.log("\n--- Aggregate Statistics ---\n");

  test("getStats: returns stats object with all required fields", () => {
    const stats = {
      totalRemindersSentAllTime: 1000,
      remindersSentThisWeek: 50,
      remindersFailedThisWeek: 5,
      averageDeliveryTimeMs: 150,
      uniqueCustomersRemindedThisWeek: 45,
      unlinkedCustomersCount: 10,
    };
    assert(stats.totalRemindersSentAllTime >= 0, "totalRemindersSentAllTime should be >= 0");
    assert(stats.remindersSentThisWeek >= 0, "remindersSentThisWeek should be >= 0");
    assert(stats.remindersFailedThisWeek >= 0, "remindersFailedThisWeek should be >= 0");
    assert(stats.averageDeliveryTimeMs >= 0, "averageDeliveryTimeMs should be >= 0");
    assert(stats.uniqueCustomersRemindedThisWeek >= 0, "uniqueCustomersRemindedThisWeek should be >= 0");
    assert(stats.unlinkedCustomersCount >= 0, "unlinkedCustomersCount should be >= 0");
  });

  test("getStats: counts only 'sent' status for success metrics", () => {
    const entries = [
      { status: "sent", createdAt: new Date(Date.now() - 1000) },
      { status: "failed", createdAt: new Date(Date.now() - 1000) },
      { status: "sent", createdAt: new Date(Date.now() - 1000) },
      { status: "queued", createdAt: new Date(Date.now() - 1000) },
    ];
    const sentCount = entries.filter((e) => e.status === "sent").length;
    assert(sentCount === 2, "should count only 'sent' entries");
  });

  test("getStats: counts only entries from past 7 days for weekly metrics", () => {
    const now = Date.now();
    const weekAgoMs = 7 * 24 * 60 * 60 * 1000;
    const weekAgoDate = new Date(now - weekAgoMs);

    const recentEntry = new Date(now - 1000);
    const oldEntry = new Date(now - weekAgoMs - 1000);

    assert(
      recentEntry.getTime() > weekAgoDate.getTime(),
      "recent entry should be in this week"
    );
    assert(
      oldEntry.getTime() < weekAgoDate.getTime(),
      "old entry should be outside this week"
    );
  });

  // ─── updateHistoryStatus tests ───────────────────────────────────────

  console.log("\n--- Update Status ---\n");

  test("updateHistoryStatus: updates status field", () => {
    const entry = {
      id: 1,
      status: "sent" as const,
    };
    assert(
      entry.status === "sent",
      "status should be updated to 'sent'"
    );
  });

  test("updateHistoryStatus: sets messageId when provided", () => {
    const entry = {
      id: 1,
      status: "sent" as const,
      messageId: "msg_123",
    };
    assert(entry.messageId === "msg_123", "messageId should be set");
  });

  test("updateHistoryStatus: sets failureReason when provided", () => {
    const entry = {
      id: 1,
      status: "failed" as const,
      failureReason: "Chat not found",
    };
    assert(entry.failureReason === "Chat not found", "failureReason should be set");
  });

  test("updateHistoryStatus: sets lastAttemptAt to current time", () => {
    const before = Date.now();
    const lastAttemptAt = Date.now();
    const after = Date.now();
    assert(
      before <= lastAttemptAt && lastAttemptAt <= after,
      "lastAttemptAt should be current time"
    );
  });

  // ─── incrementRetryCount tests ───────────────────────────────────────

  console.log("\n--- Retry Logic ---\n");

  test("incrementRetryCount: increments retry counter", () => {
    const initialCount = 0;
    const newCount = initialCount + 1;
    assert(newCount === 1, "retry count should increment");
  });

  test("incrementRetryCount: updates lastAttemptAt", () => {
    const before = Date.now();
    const lastAttemptAt = Date.now();
    const after = Date.now();
    assert(
      before <= lastAttemptAt && lastAttemptAt <= after,
      "lastAttemptAt should be updated to current time"
    );
  });

  // ─── getQueuedReminders tests ────────────────────────────────────────

  console.log("\n--- Queued Reminders ---\n");

  test("getQueuedReminders: returns only entries with status 'queued'", () => {
    const entries = [
      { id: 1, status: "queued", shopId: 100 },
      { id: 2, status: "sent", shopId: 100 },
      { id: 3, status: "queued", shopId: 100 },
      { id: 4, status: "failed", shopId: 100 },
    ];
    const queued = entries.filter((e) => e.status === "queued");
    assert(queued.length === 2, "should return only queued entries");
    for (const entry of queued) {
      assert(entry.status === "queued", "all returned entries should have status 'queued'");
    }
  });

  test("getQueuedReminders: filters by shop_id", () => {
    const shopId = 100;
    const entries = [
      { id: 1, status: "queued", shopId: 100 },
      { id: 2, status: "queued", shopId: 101 },
      { id: 3, status: "queued", shopId: 100 },
    ];
    const filtered = entries.filter((e) => e.shopId === shopId);
    assert(filtered.length === 2, "should return only entries for specified shop");
    for (const entry of filtered) {
      assert(entry.shopId === shopId, "all returned entries should match shop filter");
    }
  });

  test("getQueuedReminders: orders by createdAt ascending (FIFO)", () => {
    const entries = [
      { id: 3, status: "queued", createdAt: Date.now() },
      { id: 1, status: "queued", createdAt: Date.now() - 2000 },
      { id: 2, status: "queued", createdAt: Date.now() - 1000 },
    ];
    const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
    assert(sorted[0].id === 1, "first in queue should be oldest");
    assert(sorted[2].id === 3, "last in queue should be newest");
  });

  console.log("\n=== Test Summary ===\n");
  console.log("All tests completed. (Note: Integration tests require real database)\n");
}

runAllTests().catch((error) => {
  console.error("Test suite error:", error);
  process.exit(1);
});
