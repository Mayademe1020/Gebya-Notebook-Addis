import { pgTable, serial, text, integer, boolean, bigint, varchar, timestamp, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  localId: bigint("local_id", { mode: "number" }),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  transactionId: varchar("transaction_id", { length: 128 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),

  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  active: boolean("active").default(true),
  creditBalance: integer("credit_balance").default(0),
  totalPurchases: integer("total_purchases").default(0),
  lastPurchaseAt: bigint("last_purchase_at", { mode: "number" }),
  note: text("note"),
  telegramChatId: text("telegram_chat_id"),
  telegramLinkRequestedAt: bigint("telegram_link_requested_at", { mode: "number" }),
  displayName: text("display_name"),
  phoneNumber: text("phone_number"),
  telegramUsername: text("telegram_username"),
  telegramNotifyEnabled: boolean("telegram_notify_enabled").default(false),
  telegramLinkToken: text("telegram_link_token"),
  telegramLinkedAt: bigint("telegram_linked_at", { mode: "number" }),

  businessId: integer("business_id").references(() => businesses.id, { onDelete: "restrict" }),
  schemaVersion: integer("schema_version").default(1),
  syncVersion: integer("sync_version").default(1),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("customers_device_local").on(t.deviceId, t.localId),
  unique("customers_device_txn").on(t.deviceId, t.transactionId),
  index("customers_business_idx").on(t.businessId),
]);

export const insertCustomerSchema = z.object({
  localId: z.number().optional(),
  deviceId: z.string().max(128),
  transactionId: z.string().max(128),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  active: z.boolean().optional(),
  creditBalance: z.number().optional(),
  totalPurchases: z.number().optional(),
  lastPurchaseAt: z.number().optional(),
  note: z.string().nullable().optional(),
  telegramChatId: z.string().nullable().optional(),
  telegramLinkRequestedAt: z.number().optional(),
  displayName: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  telegramUsername: z.string().nullable().optional(),
  telegramNotifyEnabled: z.boolean().optional(),
  telegramLinkToken: z.string().nullable().optional(),
  telegramLinkedAt: z.number().optional(),
  schemaVersion: z.number().optional(),
  syncVersion: z.number().optional(),
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
