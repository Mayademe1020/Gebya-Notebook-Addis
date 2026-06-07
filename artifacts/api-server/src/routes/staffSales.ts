import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  DatabaseNotConfiguredError,
  StaffSaleEventConflictError,
  persistStaffSaleEvent,
  type PersistedStaffSaleEvent,
  type StaffSaleEventInput,
} from "../services/staffSaleEventStore.js";

export const staffSaleEventSchema = z.object({
  event_id: z.string().min(8),
  transaction_id: z.string().min(8),
  shop_id: z.string().min(1),
  staff_id: z.string().min(1),
  staff_name_snapshot: z.string().min(1),
  device_id: z.string().min(6),
  amount: z.number().finite().nonnegative(),
  item_note: z.string().nullable().optional(),
  item_code: z.string().nullable().optional(),
  payment_type: z.string().nullable().optional(),
  created_at_device: z.number().finite().positive(),
  event_type: z.enum(["sale_created", "sale_voided", "correction"]).default("sale_created"),
  sync_status: z.enum(["pending_sync", "synced", "failed"]),
  schema_version: z.number().int().positive(),
});

export type StaffSaleEventStore = {
  persist(event: StaffSaleEventInput): Promise<PersistedStaffSaleEvent>;
};

function validationError(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({
    accepted: false,
    error: "Invalid staff sale event payload",
    issues: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export function createStaffSalesRouter(store: StaffSaleEventStore = { persist: persistStaffSaleEvent }) {
  const router = Router();

  router.post("/events", async (req: Request, res: Response) => {
    const parsed = staffSaleEventSchema.safeParse(req.body);

    if (!parsed.success) {
      return validationError(res, parsed.error.issues);
    }

    try {
      const result = await store.persist(parsed.data);
      return res.status(result.duplicate ? 200 : 202).json({
        accepted: true,
        event_id: result.event_id,
        transaction_id: result.transaction_id,
        status: "persisted",
        duplicate: result.duplicate,
        received_at_server: result.received_at_server,
      });
    } catch (error) {
      if (error instanceof DatabaseNotConfiguredError) {
        return res.status(503).json({
          accepted: false,
          error: error.message,
          required_env: "DATABASE_URL",
        });
      }

      if (error instanceof StaffSaleEventConflictError) {
        return res.status(409).json({
          accepted: false,
          error: error.message,
        });
      }

      console.error("[staff-sales:persist]", error);
      return res.status(500).json({
        accepted: false,
        error: "Staff sale event persistence failed.",
      });
    }
  });

  return router;
}

export default createStaffSalesRouter();
