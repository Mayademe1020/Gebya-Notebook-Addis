import { z } from "zod";

export const SyncEventType = z.enum(["sale", "customer_payment", "customer_credit"]);
export type SyncEventTypeT = z.infer<typeof SyncEventType>;

export const SyncEventPayload = z.record(z.string(), z.unknown()).default({});

export const SyncEventEnvelope = z.object({
  event_id: z.string().uuid().nullable().optional(),
  client_event_id: z.string().trim().min(8).max(160),
  record_id: z.coerce.string().trim().min(1),
  shop_id: z.string().uuid(),
  device_id: z.string().uuid(),
  actor_staff_member_id: z.union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value == null ? null : String(value))),
  actor_name_snapshot: z.string().trim().min(1).max(80),
  actor_role_at_event: z.string().trim().min(1).max(40),
  event_type: SyncEventType,
  occurred_at_device: z.string().datetime(),
  created_at_server: z.string().datetime().nullable().optional(),
  payload: SyncEventPayload,
  schema_version: z.literal(1),
});

export type SyncEventEnvelopeT = z.infer<typeof SyncEventEnvelope>;

export const PushEventsBody = z.object({
  events: z.array(SyncEventEnvelope).min(1).max(25),
});

export type PushEventsBodyT = z.infer<typeof PushEventsBody>;

export const PushEventResult = z.object({
  client_event_id: z.string(),
  status: z.enum(["accepted", "duplicate", "rejected"]),
  event_id: z.string().uuid().optional(),
  created_at_server: z.string().datetime().optional(),
  error: z.string().optional(),
});

export const PushEventsResponse = z.object({
  results: z.array(PushEventResult),
});
