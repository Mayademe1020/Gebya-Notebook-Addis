import {
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const staffSaleEvents = pgTable("staff_sale_events", {
  eventId: text("event_id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  shopId: text("shop_id").notNull(),
  staffId: text("staff_id").notNull(),
  staffNameSnapshot: text("staff_name_snapshot").notNull(),
  deviceId: text("device_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  itemNote: text("item_note"),
  itemCode: text("item_code"),
  paymentType: text("payment_type"),
  createdAtDevice: bigint("created_at_device", { mode: "number" }).notNull(),
  receivedAtServer: timestamp("received_at_server", { withTimezone: true }).notNull(),
  eventType: text("event_type").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffSaleEventRow = typeof staffSaleEvents.$inferSelect;
export type NewStaffSaleEventRow = typeof staffSaleEvents.$inferInsert;
