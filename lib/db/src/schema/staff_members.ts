import { pgTable, serial, text, integer, boolean, bigint, varchar, timestamp, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { z } from "zod";

export const staffMembers = pgTable("staff_members", {
  id: serial("id").primaryKey(),
  localId: bigint("local_id", { mode: "number" }),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  transactionId: varchar("transaction_id", { length: 128 }).notNull(),

  displayName: text("display_name").notNull(),
  role: varchar("role", { length: 32 }).default("staff"),
  active: boolean("active").default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
  deactivatedAt: bigint("deactivated_at", { mode: "number" }),

  businessId: integer("business_id").references(() => businesses.id, { onDelete: "restrict" }),
  schemaVersion: integer("schema_version").default(1),
  syncVersion: integer("sync_version").default(1),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("staff_device_local").on(t.deviceId, t.localId),
  unique("staff_device_txn").on(t.deviceId, t.transactionId),
  index("staff_members_business_idx").on(t.businessId),
]);

export const insertStaffMemberSchema = z.object({
  localId: z.number().optional(),
  deviceId: z.string().max(128),
  transactionId: z.string().max(128),
  displayName: z.string(),
  role: z.string().max(32).optional(),
  active: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  deactivatedAt: z.number().optional(),
  schemaVersion: z.number().optional(),
  syncVersion: z.number().optional(),
});

export type InsertStaffMember = z.infer<typeof insertStaffMemberSchema>;
export type StaffMember = typeof staffMembers.$inferSelect;
