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
import { requirePermission } from "./rbac.js";
import type {
  ReminderFrequency,
  EligibleCustomer,
  ReminderLanguage,
  ReminderBatchStats,
} from "../types/reminders.js";

const router = Router();

// ─── validation schemas ────────────────────────────────────────────────

const frequencySchema = z.object({
  frequency: z.enum(["daily", "weekly", "disabled"]),
});

const runSchema = z.object({
  shopId: z.number().int().positive(),
  customers: z.array(
    z.object({
      customerId: z.number().int().positive(),
      customerName: z.string().min(1),
      balance: z.number().finite(),
      dueDate: z.number().nullable().optional(),
      customerCreatedAt: z.number().positive(),
      chatId: z.string().min(1),
      updatesEnabled: z.boolean().optional(),
      telegramLanguage: z.enum(["am", "en"]).optional(),
    }),
  ).optional(),
  shopName: z.string().optional(),
});

// ─── middleware: parse shopId from request ─────────────────────────────

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
  requirePermission("can_add_records"),
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
        const { db, getCustomerBalances, enrichWithTelegram } = await import("@workspace/db");
        const { eq } = await import("drizzle-orm/expressions");

        const ledgerRows = await getCustomerBalances(db, { businessId: shopId, onlyPositiveBalance: true });
        const customerIds = ledgerRows.map((row) => row.customerId);

        // Enrich with Telegram data from the customers table.
        const { customers: customersTable } = await import("@workspace/db");
        const shopCustomers = await db
          .select({
            customerId: customersTable.id,
            name: customersTable.displayName,
            chatId: customersTable.telegramChatId,
            telegramUsername: customersTable.telegramUsername,
            telegramNotifyEnabled: customersTable.telegramNotifyEnabled,
          })
          .from(customersTable)
          .where(eq(customersTable.businessId, shopId));

        const customerMap = new Map(
          shopCustomers.map((c) => [c.customerId, c]),
        );

        eligibleCustomers = ledgerRows
          .map((row) => {
            const customer = customerMap.get(row.customerId);
            if (!customer) return null;
            return enrichWithTelegram(row, {
              customerId: customer.customerId,
              name: customer.name,
              balance: row.balance,
              dueDate: row.dueDate,
              createdAt: row.createdAt,
              chatId: customer.chatId,
              telegramUsername: customer.telegramUsername,
              telegramNotifyEnabled: customer.telegramNotifyEnabled,
            });
          })
          .filter((c): c is EligibleCustomer => c !== null);
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
router.get("/config", async (req: Request, res: Response) => {
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
router.get("/config/:customerId", async (req: Request, res: Response) => {
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
  async (req: Request, res: Response) => {
    (req as any).rbacEntityType = "reminders_history";
  try {
    const shopId = getShopId(req);
    const limit = parseInt(String(req.query?.limit ?? "50"), 10);
    const offset = parseInt(String(req.query?.offset ?? "0"), 10);
    const customerId = req.query?.customerId
      ? parseInt(String(req.query.customerId), 10)
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
router.post("/test/:customerId", async (req: Request, res: Response) => {
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

export default router;