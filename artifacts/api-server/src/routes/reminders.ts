/**
 * Telegram Automated Reminders — API Routes
 *
 * Endpoints:
 *   POST /run              — Cron trigger to execute daily reminders
 *   GET  /config           — Get shop default reminder frequency
 *   POST /config           — Set shop default reminder frequency
 *   GET  /config/:customerId — Get customer-specific override
 *   POST /config/:customerId — Set customer-specific override
 *   GET  /history          — Query reminder history
 *   POST /test/:customerId — Send manual test reminder
 *   POST /pause            — Pause all reminders
 *   POST /resume           — Resume all reminders
 *   POST /manual           — Send manual SMS reminder
 *   GET  /quota            — Get SMS quota info
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  getShopDefault,
  setShopDefault,
  getCustomerFrequency,
  setCustomerFrequency,
  clearCustomerOverride,
  isRemindersEnabled,
} from "../services/reminderConfiguration.js";
import { runRemindersForShop } from "../services/reminderScheduler.js";
import { queryHistory } from "../services/reminderSender.js";
import { getTelegramLinkSession } from "../services/telegramStore.js";
import { buildReminderMessage } from "../services/reminderMessageBuilder.js";
import { sendTelegramTextMessage } from "../services/telegramBotService.js";
import { sendSms, isSmsEnabled } from "../services/smsSender.js";
import { getQuotaInfo, canSendSms } from "../services/smsQuota.js";
import { requirePermission, verifyShopOwnership } from "./rbac.js";
import type {
  EligibleCustomer,
  ReminderLanguage,
} from "../types/reminders.js";

const router = Router();

// ─── validation schemas ────────────────────────────────────────────────

const runSchema = z.object({
  shopId: z.number(),
  customers: z.array(z.object({
    customerId: z.number(),
    customerName: z.string(),
    balance: z.number(),
    dueDate: z.number().nullable().optional(),
    customerCreatedAt: z.number(),
    chatId: z.string(),
    updatesEnabled: z.boolean().optional(),
    telegramLanguage: z.enum(["am", "en"]).optional(),
  })).optional(),
  shopName: z.string().optional(),
});

const frequencySchema = z.object({
  frequency: z.enum(["daily", "weekly", "disabled"]),
});

// ─── secret verification ────────────────────────────────────────────────

function verifyReminderCronSecret(req: Request, res: Response, next: Function) {
  const expectedSecret = process.env.REMINDER_CRON_SECRET?.trim();
  if (!expectedSecret) {
    console.error("[security] REMINDER_CRON_SECRET is not set — refusing cron-triggered /run and /test requests");
    return res.status(500).json({
      error: "Server misconfigured: REMINDER_CRON_SECRET environment variable is not set",
    });
  }

  const receivedSecret =
    (req.headers["x-reminder-cron-secret"] as string | undefined) ||
    (req.query?.secret as string | undefined) ||
    null;

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  return next();
}

// ─── validation schemas ────────────────────────────────────────────────

function getShopId(req: Request): number {
  // Try from body, then query, then header
  const shopId =
    Number(req.body?.shopId) ||
    Number(req.query?.shopId) ||
    Number(req.headers?.["x-shop-id"]) ||
    0;
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new Error("Missing or invalid shopId");
  }
  return shopId;
}

// ─── endpoints ─────────────────────────────────────────────────────────

/**
  * POST /run — Cron trigger: execute daily reminders for a shop.
  * Callable by Vercel Cron Jobs or external scheduler.
  *
  * Body: { shopId, customers?: [...], shopName?: string }
  *
  * If `customers` is omitted, the handler falls back to querying the
  * transaction ledger (`customer_transactions`) directly to compute
  * outstanding balances. This makes the endpoint self-sufficient for
  * production cron jobs that don't pre-build the customer array.
  */
router.post("/run",
  verifyReminderCronSecret,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_run";
  try {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    const { shopId, customers, shopName } = parsed.data;

    let eligibleCustomers: EligibleCustomer[];

    if (customers && customers.length > 0) {
      // Fast path: caller supplied the full customer list.
      eligibleCustomers = customers.map((c) => ({
        customerId: c.customerId,
        customerName: c.customerName,
        balance: c.balance,
        dueDate: c.dueDate ?? null,
        customerCreatedAt: c.customerCreatedAt,
        chatId: c.chatId,
        updatesEnabled: c.updatesEnabled ?? true,
        telegramLanguage: c.telegramLanguage ?? "en",
        reminderConfig: {
          id: `${shopId}-${c.customerId}-cfg`,
          shopId,
          customerId: c.customerId,
          frequency: "daily",
          lastReminderSentAt: null,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }));
    } else {
      // Slow path: compute from the ledger and enrich with Telegram data.
      try {
        const { db } = await import("@workspace/db");
        const { eq, and } = await import("drizzle-orm");
        const { customers: customersTable, customerTransactions } = await import("@workspace/db");

        // Query customers with outstanding balance
        // This queries the transaction ledger to compute balance
        const shopCustomers = await db
          .select({
            customerId: customersTable.id,
            name: customersTable.displayName,
            chatId: customersTable.telegramChatId,
            telegramUsername: customersTable.telegramUsername,
            telegramNotifyEnabled: customersTable.telegramNotifyEnabled,
            createdAt: customersTable.createdAt,
          })
          .from(customersTable)
          .where(
            and(
              eq(customersTable.businessId, shopId),
              // Only customers with Telegram linked
              // @ts-ignore
              customersTable.telegramChatId !== null
            )
          );

        // For each customer, compute balance from transaction ledger
        const eligibleList: EligibleCustomer[] = [];
        
        for (const customer of shopCustomers) {
          if (!customer.chatId) continue;

          // Query transactions for this customer
          const transactions = await db
            .select()
            .from(customerTransactions)
            .where(
              and(
                eq(customerTransactions.customerId, customer.customerId),
                eq(customerTransactions.businessId, shopId)
              )
            );

          // Calculate balance from transactions
          let balance = 0;
          let latestDueDate: number | null = null;

          for (const tx of transactions) {
            if (tx.type === "credit") {
              balance += Number(tx.amount);
              if (tx.dueDate) {
                latestDueDate = new Date(tx.dueDate).getTime();
              }
            } else if (tx.type === "payment") {
              balance -= Number(tx.amount);
            }
          }

          // Only include customers with positive balance
          if (balance > 0) {
            eligibleList.push({
              customerId: customer.customerId,
              customerName: customer.name || "Customer",
              balance,
              dueDate: latestDueDate,
              customerCreatedAt: customer.createdAt ? new Date(customer.createdAt).getTime() : Date.now(),
              chatId: customer.chatId,
              updatesEnabled: Boolean(customer.telegramNotifyEnabled),
              telegramLanguage: "en", // Default, will be detected from session
              reminderConfig: {
                id: `${shopId}-${customer.customerId}-cfg`,
                shopId,
                customerId: customer.customerId,
                frequency: "daily",
                lastReminderSentAt: null,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            });
          }
        }

        eligibleCustomers = eligibleList;

      } catch (dbError) {
        console.error("[reminders:run:db]", {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          shopId,
        });
        return res.status(500).json({
          error: "Failed to query customer balances from ledger",
        });
      }
    }

    console.log(`[reminders:run] Processing ${eligibleCustomers.length} eligible customers for shop ${shopId}`);

    const stats = await runRemindersForShop(shopId, eligibleCustomers, shopName);

    return res.json({
      ok: true,
      stats: {
        scanned: stats.customersScanned,
        withBalance: stats.customersWithBalance,
        queued: stats.remindersQueued,
        sent: stats.remindersSent,
        failed: stats.remindersFailed,
        skipped: stats.remindersSkipped,
        errors: stats.errors.length,
        completedIn: stats.completedAt - stats.startedAt,
      },
    });
  } catch (error) {
    console.error("[reminders:run]", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /config — Get shop default reminder frequency.
 * Query: ?shopId=123
 */
router.get("/config",
  verifyShopOwnership,
  async (req: Request, res: Response) => {
  try {
    const shopId = getShopId(req);
    const frequency = await getShopDefault(shopId);
    const enabled = frequency !== "disabled";

    return res.json({ shopId, frequency, enabled });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid request",
    });
  }
});

/**
 * POST /config — Set shop default reminder frequency.
 * Body: { shopId, frequency }
 */
router.post("/config",
  requirePermission("can_edit_settings"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_settings";
  try {
    const shopId = getShopId(req);
    const parsed = frequencySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid frequency. Must be 'daily', 'weekly', or 'disabled'.",
        details: parsed.error.flatten(),
      });
    }

    await setShopDefault(shopId, parsed.data.frequency);
    return res.json({
      ok: true,
      shopId,
      frequency: parsed.data.frequency,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /config/:customerId — Get customer-specific frequency override.
 */
router.get("/config/:customerId",
  verifyShopOwnership,
  async (req: Request, res: Response) => {
  try {
    const shopId = getShopId(req);
    const customerId = parseInt(String(req.params.customerId), 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Invalid customerId" });
    }

    const frequency = await getCustomerFrequency(shopId, customerId);
    const enabled = await isRemindersEnabled(shopId, customerId);

    return res.json({
      shopId,
      customerId,
      frequency,
      enabled,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /config/:customerId — Set customer-specific override.
 * Body: { frequency, shopId }
 */
router.post("/config/:customerId",
  requirePermission("can_edit_settings"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_customer_config";
  try {
    const shopId = getShopId(req);
    const customerId = parseInt(String(req.params.customerId), 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Invalid customerId" });
    }

    const parsed = frequencySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid frequency. Must be 'daily', 'weekly', or 'disabled'.",
        details: parsed.error.flatten(),
      });
    }

    await setCustomerFrequency(shopId, customerId, parsed.data.frequency);
    return res.json({
      ok: true,
      shopId,
      customerId,
      frequency: parsed.data.frequency,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * DELETE /config/:customerId — Clear customer override (revert to shop default).
 */
router.delete("/config/:customerId",
  requirePermission("can_edit_settings"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_customer_config";
  try {
    const shopId = getShopId(req);
    const customerId = parseInt(String(req.params.customerId), 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Invalid customerId" });
    }

    await clearCustomerOverride(shopId, customerId);
    return res.json({
      ok: true,
      shopId,
      customerId,
      message: "Override cleared, reverting to shop default",
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /history — Query reminder history.
 * Query: ?shopId=123&limit=50&offset=0&customerId=456
 */
router.get("/history",
  requirePermission("can_view_reports"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_history";
  try {
    const shopId = getShopId(req);
    const limit = parseInt(String(req.query?.limit ?? "50"), 10);
    const offset = parseInt(String(req.query?.offset ?? "0"), 10);
    const customerId = req.query?.customerId
      ? parseInt(String(req.query.customerId), 10)
      : undefined;
    const fromDate = req.query?.fromDate
      ? parseInt(String(req.query.fromDate), 10)
      : undefined;
    const toDate = req.query?.toDate
      ? parseInt(String(req.query.toDate), 10)
      : undefined;

    const result = await queryHistory(shopId, {
      limit: Math.min(Math.max(limit, 1), 200),
      offset: Math.max(offset, 0),
      customerId: customerId && customerId > 0 ? customerId : undefined,
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /test/:customerId — Send a manual test reminder to a customer.
 * Body: { shopId, balance, dueDate?, language? }
 */
router.post("/test/:customerId",
  verifyReminderCronSecret,
  verifyShopOwnership,
  async (req: Request, res: Response) => {
  try {
    const shopId = getShopId(req);
    const customerId = parseInt(String(req.params.customerId), 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Invalid customerId" });
    }

    const balance = Number(req.body?.balance || 0);
    const dueDate = req.body?.dueDate ? Number(req.body.dueDate) : null;
    const language: ReminderLanguage =
      req.body?.language === "am" ? "am" : "en";

    // Lookup customer session
    // For test, we need the customer's Telegram link session.
    // The caller can provide a token or we use customerId to find session.
    const token = String(req.body?.token || "");
    let session = token ? await getTelegramLinkSession(token) : null;

    if (!session) {
      return res.status(404).json({
        error: "Customer Telegram session not found. Provide a valid token.",
      });
    }

    if (!session.chatId) {
      return res.status(400).json({
        error: "Customer has not linked Telegram yet (no chatId).",
      });
    }

    // Build and send message
    const daysHeld = Math.floor(
      (Date.now() - (session.createdAt || Date.now())) / 86400000,
    );

    const message = buildReminderMessage(
      language,
      session.customerName,
      Number.isFinite(balance) ? balance : session.currentBalance,
      dueDate,
      daysHeld,
    );

    try {
      const result = await sendTelegramTextMessage(session.chatId, message);
      return res.json({
        sent: true,
        messageId: (result as { message_id?: string })?.message_id,
        message,
      });
    } catch (sendError) {
      return res.status(502).json({
        sent: false,
        error: sendError instanceof Error ? sendError.message : "Send failed",
        message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /pause — Pause all reminders for a shop.
 * Body: { shopId }
 * Sets shop default to 'disabled' (can be re-enabled via POST /config).
 */
router.post("/pause",
  requirePermission("can_edit_settings"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_settings";
  try {
    const shopId = getShopId(req);
    await setShopDefault(shopId, "disabled");
    return res.json({
      ok: true,
      shopId,
      paused: true,
      message: "All reminders paused for this shop",
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /resume — Resume reminders for a shop.
 * Body: { shopId }
 * Sets shop default back to 'daily'.
 */
router.post("/resume",
  requirePermission("can_edit_settings"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_settings";
  try {
    const shopId = getShopId(req);
    await setShopDefault(shopId, "daily");
    return res.json({
      ok: true,
      shopId,
      paused: false,
      message: "Reminders resumed for this shop",
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * POST /manual — Send manual SMS reminder to a customer.
 * Body: { shopId, phone, message, language? }
 *
 * This endpoint is for manual SMS sends from the shop owner.
 * Note: Manual sends are NOT quota-tracked (owner sends from their phone).
 * This endpoint is for server-side SMS sending when owner clicks SMS button.
 */
router.post("/manual",
  requirePermission("can_edit_settings"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_manual";
    try {
      const shopId = getShopId(req);
      const { phone, message, language = "en" } = req.body || {};

      if (!phone || !message) {
        return res.status(400).json({
          error: "Missing required fields: phone, message",
        });
      }

      // Check if SMS is enabled
      if (!isSmsEnabled()) {
        return res.status(503).json({
          error: "SMS sending is not enabled or configured",
        });
      }

      // Send SMS
      const result = await sendSms(phone, message, {
        shopId,
      });

      if (result.success) {
        return res.json({
          ok: true,
          sent: true,
          messageId: result.messageId,
          provider: result.provider,
        });
      } else {
        return res.status(502).json({
          ok: false,
          sent: false,
          error: result.error,
          errorClass: result.errorClass,
          provider: result.provider,
        });
      }
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

/**
 * GET /quota — Get SMS quota info for a shop.
 * Query: ?shopId=123
 *
 * Returns current month's SMS usage and remaining quota.
 */
router.get("/quota",
  requirePermission("can_view_reports"),
  verifyShopOwnership,
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_quota";
    try {
      const shopId = getShopId(req);
      const quotaInfo = await getQuotaInfo(shopId);

      return res.json({
        ok: true,
        quota: quotaInfo,
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

export default router;