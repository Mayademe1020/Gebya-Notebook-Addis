import { pgTable, serial, integer, text, bigint, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";

export const snapshots = pgTable("snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  sizeBytes: integer("size_bytes"),
  tables: text("tables").notNull(), // JSON array of table names included
  recordCount: integer("record_count").default(0),
  checksum: varchar("checksum", { length: 64 }), // SHA-256 of payload
  payload: text("payload"), // JSON snapshot of all tables
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
}, (t) => [
  index("snapshots_user_idx").on(t.userId),
  index("snapshots_device_idx").on(t.deviceId),
]);

export const insertSnapshotSchema = z.object({
  userId: z.number(),
  deviceId: z.string().max(128),
  name: z.string().max(256),
  description: z.string().nullable().optional(),
  sizeBytes: z.number().optional(),
  tables: z.string(),
  recordCount: z.number().optional(),
  checksum: z.string().max(64).nullable().optional(),
  payload: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
});

export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshots.$inferSelect;
