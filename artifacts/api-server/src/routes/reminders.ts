import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireRole } from "../middlewares/requireRole.js";
import {
  getShopDefault,
  setShopDefault,
  getCustomerFrequency,
  setCustomerFrequency,
  isRemindersEnabled,
} from "../services/reminderConfiguration.js";
import {
  getHistoryByShop,
  getHistoryByCustomer,
  getStats,
} from "../services/reminderHistory.js";
import { sendQueuedReminders } from "../services/reminderSender.js";
import { scheduleReminders } from "../services/reminderScheduler.js";
import { getTelegramLinkSession } from "../services/telegramStore.js";
import type { ReminderFrequency, ReminderBatchStats } from "../types/reminders.js";

const router = Router();

// ─── validation schemas ───────────────────────────────────────────────

const frequencySchema = z.enum(["daily", "weekly", "disabled"]);

const setConfigSchema = z.object({
  frequency: frequencySchema,
});

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// ─── helper functions ───────────────────────────────────────────────

/**
 * Extract shop ID from the authenticated user
 * For now, we'll require shopId to be passed in headers or inferred from context
 * In production, this would come from the JWT token
 */
function getShopIdFromRequest(req: Request): number | null {
  // Check for shopId in headers (for testing/direct API calls)
  const headerShopId = req.headers["x-shop-id"];
  const shopIdStr = Array.isArray(headerShopId) ? headerShopId[0] : headerShopId;
  
  if (shopIdStr && typeof shopIdStr === "string") {
    const parsed = parseInt(shopIdStr, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // TODO: In production, extract from JWT token in req.user or similar
  return null;
}

/**
 * Validate that a customer ID is a positive integer
 */
function validateCustomerId(customerId: unknown): asserts customerId is number {
  if (!Number.isInteger(customerId) || (customerId as number) <= 0) {
    throw new Error("Invalid customer ID: must be a positive integer");
  }
}

// ─── endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/telegram/reminders/config
 * 
 * Get the shop's default reminder frequency
 * 
 * Response:
 * {
 *   frequency: "daily" | "weekly" | "disabled"
 * }
 * 
 * Auth: Owner only
 */
router.get("/config", requireRole("owner"), async (req: Request, res: Response) => {
  try {
    const shopId = getShopIdFromRequest(req);
    if (!shopId) {
      return res.status(400).json({
        error: "Missing shop ID in headers (x-shop-id)",
      });
    }

    const frequency = await getShopDefault(shopId);

    return res.json({
      frequency,
    });
  } catch (error) {
    console.error("[reminders:get-config]", {
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: "Failed to get reminder configuration",
    });
  }
});

/**
 * POST /api/telegram/reminders/config
 * 
 * Set the shop's default reminder frequency
 * 
 * Body:
 * {
 *   frequency: "daily" | "weekly" | "disabled"
 * }
 * 
 * Response:
 * {
 *   frequency: "daily" | "weekly" | "disabled"
 * }
 * 
 * Auth: Owner only
 */
router.post("/config", requireRole("owner"), async (req: Request, res: Response) => {
  try {
    const shopId = getShopIdFromRequest(req);
    if (!shopId) {
      return res.status(400).json({
        error: "Missing shop ID in headers (x-shop-id)",
      });
    }

    const parsed = setConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.errors,
      });
    }

    const { frequency } = parsed.data;

    await setShopDefault(shopId, frequency as ReminderFrequency);

    console.log("[reminders:set-config]", {
      shopId,
      frequency,
    });

    return res.json({
      frequency,
    });
  } catch (error) {
    console.error("[reminders:set-config]", {
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: "Failed to set reminder configuration",
    });
  }
});

/**
 * GET /api/telegram/reminders/config/:customerId
 * 
 * Get customer-specific reminder frequency override (or shop default if not overridden)
 * 
 * Response:
 * {
 *   frequency: "daily" | "weekly" | "disabled",
 *   override: true | false  // true if customer has an override
 * }
 * 
 * Auth: Owner only
 */
router.get(
  "/config/:customerId",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    try {
      const shopId = getShopIdFromRequest(req);
      if (!shopId) {
        return res.status(400).json({
          error: "Missing shop ID in headers (x-shop-id)",
        });
      }

      const customerId = parseInt(String(req.params.customerId || ""), 10);
      validateCustomerId(customerId);

      const frequency = await getCustomerFrequency(shopId, customerId);

      // To determine if there's an override, we'd need to check if a customer-specific
      // config exists. For now, we just return the effective frequency.
      // In production, you might want to fetch both shop default and customer config
      // to determine if it's an override.

      return res.json({
        frequency,
        override: false, // Placeholder: would check if customer has specific override
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid customer ID")) {
        return res.status(400).json({
          error: error.message,
        });
      }

      console.error("[reminders:get-customer-config]", {
        customerId: req.params.customerId,
        requestId: res.locals.requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        error: "Failed to get customer reminder configuration",
      });
    }
  }
);

/**
 * POST /api/telegram/reminders/config/:customerId
 * 
 * Set customer-specific reminder frequency override
 * 
 * Body:
 * {
 *   frequency: "daily" | "weekly" | "disabled"
 * }
 * 
 * Response:
 * {
 *   frequency: "daily" | "weekly" | "disabled"
 * }
 * 
 * Auth: Owner only
 */
router.post(
  "/config/:customerId",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    try {
      const shopId = getShopIdFromRequest(req);
      if (!shopId) {
        return res.status(400).json({
          error: "Missing shop ID in headers (x-shop-id)",
        });
      }

      const customerId = parseInt(String(req.params.customerId || ""), 10);
      validateCustomerId(customerId);

      const parsed = setConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parsed.error.errors,
        });
      }

      const { frequency } = parsed.data;

      await setCustomerFrequency(shopId, customerId, frequency as ReminderFrequency);

      console.log("[reminders:set-customer-config]", {
        shopId,
        customerId,
        frequency,
      });

      return res.json({
        frequency,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid customer ID")) {
        return res.status(400).json({
          error: error.message,
        });
      }

      console.error("[reminders:set-customer-config]", {
        customerId: req.params.customerId,
        requestId: res.locals.requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        error: "Failed to set customer reminder configuration",
      });
    }
  }
);

/**
 * GET /api/telegram/reminders/history
 * 
 * Get paginated reminder history for a shop
 * 
 * Query Parameters:
 * - limit: Results per page (default 50, max 100)
 * - offset: Pagination offset (default 0)
 * 
 * Response:
 * {
 *   total: number,
 *   entries: [
 *     {
 *       id: number,
 *       customerId: number,
 *       chatId: string,
 *       balanceAtSendTime: string,
 *       dueDate: number | null,
 *       sentAt: number,
 *       status: "sent" | "failed" | "queued" | "skipped",
 *       language: "am" | "en",
 *       messageId?: string,
 *       failureReason?: string,
 *       retryCount: number
 *     }
 *   ],
 *   pagination: {
 *     limit: number,
 *     offset: number,
 *     hasMore: boolean
 *   }
 * }
 * 
 * Auth: Owner only
 */
router.get("/history", requireRole("owner"), async (req: Request, res: Response) => {
  try {
    const shopId = getShopIdFromRequest(req);
    if (!shopId) {
      return res.status(400).json({
        error: "Missing shop ID in headers (x-shop-id)",
      });
    }

    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid pagination parameters",
        details: parsed.error.errors,
      });
    }

    const { limit, offset } = parsed.data;

    const result = await getHistoryByShop(shopId, limit, offset);

    console.log("[reminders:get-history]", {
      shopId,
      limit,
      offset,
      total: result.total,
      returned: result.entries.length,
    });

    return res.json({
      total: result.total,
      entries: result.entries,
      pagination: {
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("[reminders:get-history]", {
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: "Failed to retrieve reminder history",
    });
  }
});

/**
 * POST /api/telegram/reminders/test/:customerId
 * 
 * Send a test reminder to a customer (manual send)
 * 
 * This endpoint:
 * - Validates the customer is linked to Telegram
 * - Fetches current balance and due date
 * - Sends the reminder message
 * - Records in history
 * 
 * Response:
 * {
 *   sent: true,
 *   messageId?: string,
 *   error?: string
 * }
 * 
 * Auth: Owner only
 */
router.post(
  "/test/:customerId",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    try {
      const shopId = getShopIdFromRequest(req);
      if (!shopId) {
        return res.status(400).json({
          error: "Missing shop ID in headers (x-shop-id)",
        });
      }

      const customerId = parseInt(String(req.params.customerId || ""), 10);
      validateCustomerId(customerId);

      // TODO: Fetch customer and their Telegram session
      // For now, return a placeholder response
      console.log("[reminders:test]", {
        shopId,
        customerId,
      });

      return res.json({
        sent: true,
        message: "Test reminder sent (implementation pending)",
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid customer ID")) {
        return res.status(400).json({
          error: error.message,
        });
      }

      console.error("[reminders:test]", {
        customerId: req.params.customerId,
        requestId: res.locals.requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        error: "Failed to send test reminder",
      });
    }
  }
);

/**
 * POST /api/telegram/reminders/pause
 * 
 * Pause all reminders for a shop (globally)
 * 
 * Response:
 * {
 *   paused: true
 * }
 * 
 * Auth: Owner only
 */
router.post("/pause", requireRole("owner"), async (req: Request, res: Response) => {
  try {
    const shopId = getShopIdFromRequest(req);
    if (!shopId) {
      return res.status(400).json({
        error: "Missing shop ID in headers (x-shop-id)",
      });
    }

    // TODO: Implement pause mechanism (e.g., set a flag in shop config)
    console.log("[reminders:pause]", {
      shopId,
    });

    return res.json({
      paused: true,
      message: "Reminders paused for this shop (implementation pending)",
    });
  } catch (error) {
    console.error("[reminders:pause]", {
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: "Failed to pause reminders",
    });
  }
});

/**
 * POST /api/telegram/reminders/resume
 * 
 * Resume reminders for a shop (globally)
 * 
 * Response:
 * {
 *   resumed: true
 * }
 * 
 * Auth: Owner only
 */
router.post("/resume", requireRole("owner"), async (req: Request, res: Response) => {
  try {
    const shopId = getShopIdFromRequest(req);
    if (!shopId) {
      return res.status(400).json({
        error: "Missing shop ID in headers (x-shop-id)",
      });
    }

    // TODO: Implement resume mechanism
    console.log("[reminders:resume]", {
      shopId,
    });

    return res.json({
      resumed: true,
      message: "Reminders resumed for this shop (implementation pending)",
    });
  } catch (error) {
    console.error("[reminders:resume]", {
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: "Failed to resume reminders",
    });
  }
});

/**
 * POST /api/telegram/reminders/run
 *
 * Execute the daily reminder pipeline for one or more shops.
 * Called by Vercel Cron or external scheduler.
 *
 * Body (optional):
 * {
 *   shopIds?: number[]  // If omitted, uses x-shop-id header (single shop)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   overallStats: {
 *     shopsProcessed: number,
 *     totalQueued: number,
 *     totalSent: number,
 *     totalFailed: number,
 *     totalSkipped: number,
 *     errors: string[]
 *   },
 *   shopResults: Array<{
 *     shopId: number,
 *     queued: number,
 *     sent: number,
 *     failed: number,
 *     skipped: number
 *   }>
 * }
 *
 * Auth: Owner only
 */
router.post("/run", requireRole("owner"), async (req: Request, res: Response) => {
  try {
    const bodyShopIds = Array.isArray(req.body?.shopIds)
      ? (req.body.shopIds as number[]).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    const shopIds = bodyShopIds.length > 0
      ? bodyShopIds
      : (() => {
          const headerShopId = getShopIdFromRequest(req);
          return headerShopId ? [headerShopId] : [];
        })();

    if (shopIds.length === 0) {
      return res.status(400).json({
        error: "No shop IDs provided. Include shopIds in body or x-shop-id header.",
      });
    }

    console.log("[reminders:run] Starting reminder run for shops:", shopIds);

    const overallStats: ReminderBatchStats = {
      startedAt: Date.now(),
      completedAt: 0,
      customersScanned: 0,
      customersWithBalance: 0,
      remindersQueued: 0,
      remindersSent: 0,
      remindersFailed: 0,
      remindersSkipped: 0,
      errors: [],
      shopsProcessed: shopIds.length,
      success: true,
    };

    const shopResults: Array<{
      shopId: number;
      queued: number;
      sent: number;
      failed: number;
      skipped: number;
      error?: string;
    }> = [];

    for (const shopId of shopIds) {
      try {
        // Phase 1: Schedule — identify eligible customers and queue reminders
        const scheduleStats = await scheduleReminders(shopId);
        overallStats.customersScanned += scheduleStats.customersScanned;
        overallStats.customersWithBalance += scheduleStats.customersWithBalance;
        overallStats.remindersQueued += scheduleStats.remindersQueued;
        overallStats.remindersSkipped += scheduleStats.remindersSkipped;

        // Phase 2: Send — process the queue immediately
        // In production, the sender would normally read from a persistent queue.
        // Here we send immediately after scheduling for simplicity.
        const sendStats = await sendQueuedReminders(shopId, []);
        overallStats.remindersSent += sendStats.remindersSent;
        overallStats.remindersFailed += sendStats.remindersFailed;
        overallStats.errors.push(...sendStats.errors);

        if (!sendStats.success) {
          overallStats.success = false;
        }

        shopResults.push({
          shopId,
          queued: scheduleStats.remindersQueued,
          sent: sendStats.remindersSent,
          failed: sendStats.remindersFailed,
          skipped: scheduleStats.remindersSkipped,
        });

        console.log("[reminders:run] Shop result:", {
          shopId,
          queued: scheduleStats.remindersQueued,
          sent: sendStats.remindersSent,
          failed: sendStats.remindersFailed,
        });
      } catch (shopError) {
        const errorMsg = shopError instanceof Error ? shopError.message : String(shopError);
        overallStats.errors.push({ shopId, error: errorMsg });
        overallStats.success = false;

        shopResults.push({
          shopId,
          queued: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          error: errorMsg,
        });

        console.error("[reminders:run] Error processing shop", shopId, ":", shopError);
      }
    }

    overallStats.completedAt = Date.now();

    console.log("[reminders:run] Run complete.", {
      shopsProcessed: shopResults.length,
      totalQueued: overallStats.remindersQueued,
      totalSent: overallStats.remindersSent,
      totalFailed: overallStats.remindersFailed,
      totalSkipped: overallStats.remindersSkipped,
    });

    return res.json({
      success: overallStats.success,
      overallStats: {
        shopsProcessed: overallStats.shopsProcessed,
        totalQueued: overallStats.remindersQueued,
        totalSent: overallStats.remindersSent,
        totalFailed: overallStats.remindersFailed,
        totalSkipped: overallStats.remindersSkipped,
        errors: overallStats.errors.map((e) => (e as any).error || String(e)),
      },
      shopResults,
    });
  } catch (error) {
    console.error("[reminders:run] Fatal error:", error);

    return res.status(500).json({
      error: "Failed to execute reminder run",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
