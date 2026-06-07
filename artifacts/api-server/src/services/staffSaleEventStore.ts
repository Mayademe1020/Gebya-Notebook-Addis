import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { DatabaseNotConfiguredError, getDb } from "../db/client.js";
import { staffSaleEvents, type StaffSaleEventRow } from "../db/schema.js";

export { DatabaseNotConfiguredError };

export type StaffSaleEventInput = {
  event_id: string;
  transaction_id: string;
  shop_id: string;
  staff_id: string;
  staff_name_snapshot: string;
  device_id: string;
  amount: number;
  item_note?: string | null;
  item_code?: string | null;
  payment_type?: string | null;
  created_at_device: number;
  event_type: "sale_created" | "sale_voided" | "correction";
  sync_status: "pending_sync" | "synced" | "failed";
  schema_version: number;
};

export type PersistedStaffSaleEvent = {
  event_id: string;
  transaction_id: string;
  received_at_server: string;
  duplicate: boolean;
};

export class StaffSaleEventConflictError extends Error {
  constructor(eventId: string) {
    super(`Staff sale event ${eventId} already exists with different data.`);
    this.name = "StaffSaleEventConflictError";
  }
}

let ensured = false;

function toApiRow(row: StaffSaleEventRow, duplicate: boolean): PersistedStaffSaleEvent {
  return {
    event_id: row.eventId,
    transaction_id: row.transactionId,
    received_at_server: row.receivedAtServer.toISOString(),
    duplicate,
  };
}

function fieldsMatch(existing: StaffSaleEventRow, event: StaffSaleEventInput) {
  return existing.transactionId === event.transaction_id
    && existing.shopId === event.shop_id
    && existing.staffId === event.staff_id
    && existing.staffNameSnapshot === event.staff_name_snapshot
    && existing.deviceId === event.device_id
    && Number(existing.amount) === Number(event.amount)
    && (existing.itemNote || null) === (event.item_note || null)
    && (existing.itemCode || null) === (event.item_code || null)
    && (existing.paymentType || null) === (event.payment_type || null)
    && Number(existing.createdAtDevice) === Number(event.created_at_device)
    && existing.eventType === event.event_type
    && Number(existing.schemaVersion) === Number(event.schema_version);
}

export async function ensureStaffSaleEventsTable() {
  if (ensured) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS staff_sale_events (
      event_id text PRIMARY KEY,
      transaction_id text NOT NULL,
      shop_id text NOT NULL,
      staff_id text NOT NULL,
      staff_name_snapshot text NOT NULL,
      device_id text NOT NULL,
      amount numeric(14, 2) NOT NULL,
      item_note text,
      item_code text,
      payment_type text,
      created_at_device bigint NOT NULL,
      received_at_server timestamptz NOT NULL,
      event_type text NOT NULL,
      schema_version integer NOT NULL,
      raw_payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS staff_sale_events_shop_received_idx ON staff_sale_events (shop_id, received_at_server DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS staff_sale_events_transaction_idx ON staff_sale_events (transaction_id)`);
  ensured = true;
}

export async function persistStaffSaleEvent(event: StaffSaleEventInput): Promise<PersistedStaffSaleEvent> {
  await ensureStaffSaleEventsTable();
  const db = getDb();
  const receivedAtServer = new Date();

  const inserted = await db
    .insert(staffSaleEvents)
    .values({
      eventId: event.event_id,
      transactionId: event.transaction_id,
      shopId: event.shop_id,
      staffId: event.staff_id,
      staffNameSnapshot: event.staff_name_snapshot,
      deviceId: event.device_id,
      amount: String(event.amount),
      itemNote: event.item_note || null,
      itemCode: event.item_code || null,
      paymentType: event.payment_type || null,
      createdAtDevice: event.created_at_device,
      receivedAtServer,
      eventType: event.event_type,
      schemaVersion: event.schema_version,
      rawPayload: event,
      createdAt: receivedAtServer,
      updatedAt: receivedAtServer,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) {
    return toApiRow(inserted[0], false);
  }

  const existing = await db.query.staffSaleEvents.findFirst({
    where: eq(staffSaleEvents.eventId, event.event_id),
  });

  if (!existing || !fieldsMatch(existing, event)) {
    throw new StaffSaleEventConflictError(event.event_id);
  }

  return toApiRow(existing, true);
}
