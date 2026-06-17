import { pgTable, serial, text, integer, boolean, bigint, varchar, timestamp, unique, real } from "drizzle-orm/pg-core";
import { z } from "zod";

export const supplierTransactions = pgTable("supplier_transactions", {
  id: serial("id").primaryKey(),
  localId: bigint("local_id", { mode: "number" }),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  transactionId: varchar("transaction_id", { length: 128 }).notNull(),

  supplierId: integer("supplier_id").notNull(),
  amount: real("amount").notNull().default(0),
  type: varchar("type", { length: 32 }).notNull().default("payment"),
  note: text("note"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),

  schemaVersion: integer("schema_version").default(1),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("supp_txn_device_local").on(t.deviceId, t.localId),
  unique("supp_txn_device_txn").on(t.deviceId, t.transactionId),
]);

export const insertSupplierTransactionSchema = z.object({
  localId: z.number().optional(),
  deviceId: z.string().max(128),
  transactionId: z.string().max(128),
  supplierId: z.number(),
  amount: z.number().optional(),
  type: z.string().max(32).optional(),
  note: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  schemaVersion: z.number().optional(),
});

export type InsertSupplierTransaction = z.infer<typeof insertSupplierTransactionSchema>;
export type SupplierTransaction = typeof supplierTransactions.$inferSelect;
