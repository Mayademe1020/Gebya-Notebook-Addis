import { pgTable, serial, text, integer, boolean, bigint, varchar, timestamp, unique, real, index } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { z } from "zod";

export const customerTransactions = pgTable("customer_transactions", {
  id: serial("id").primaryKey(),
  localId: bigint("local_id", { mode: "number" }),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  transactionId: varchar("transaction_id", { length: 128 }).notNull(),

  customerId: integer("customer_id").notNull(),
  amount: real("amount").notNull().default(0),
  type: varchar("type", { length: 32 }).notNull().default("payment"),
  note: text("note"),
  itemNote: text("item_note"),
  dueDate: bigint("due_date", { mode: "number" }),
  referenceCode: text("reference_code"),
  telegramDeliveryState: varchar("telegram_delivery_state", { length: 32 }),
  telegramDeliveryError: text("telegram_delivery_error"),
  telegramDeliveryAttemptedAt: bigint("telegram_delivery_attempted_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),

  businessId: integer("business_id").references(() => businesses.id, { onDelete: "restrict" }),
  schemaVersion: integer("schema_version").default(1),
  syncVersion: integer("sync_version").default(1),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("cust_txn_device_local").on(t.deviceId, t.localId),
  unique("cust_txn_device_txn").on(t.deviceId, t.transactionId),
  index("customer_transactions_business_idx").on(t.businessId),
]);

export const insertCustomerTransactionSchema = z.object({
  localId: z.number().optional(),
  deviceId: z.string().max(128),
  transactionId: z.string().max(128),
  customerId: z.number(),
  amount: z.number().optional(),
  type: z.string().max(32).optional(),
  note: z.string().nullable().optional(),
  itemNote: z.string().nullable().optional(),
  dueDate: z.number().optional(),
  referenceCode: z.string().nullable().optional(),
  telegramDeliveryState: z.string().max(32).nullable().optional(),
  telegramDeliveryError: z.string().nullable().optional(),
  telegramDeliveryAttemptedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  schemaVersion: z.number().optional(),
  syncVersion: z.number().optional(),
});

export type InsertCustomerTransaction = z.infer<typeof insertCustomerTransactionSchema>;
export type CustomerTransaction = typeof customerTransactions.$inferSelect;
