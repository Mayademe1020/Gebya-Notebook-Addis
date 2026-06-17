import { pgTable, text, integer, boolean, bigint, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { z } from "zod";

export const analytics = pgTable("analytics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  key: varchar("key", { length: 128 }).notNull(),
  value: text("value"),
  count: integer("count").default(0),
  lastSeenAt: bigint("last_seen_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
  schemaVersion: integer("schema_version").default(1),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("analytics_device_key").on(t.deviceId, t.key),
]);

export const insertAnalyticsSchema = z.object({
  deviceId: z.string().max(128),
  key: z.string().max(128),
  value: z.string().nullable().optional(),
  count: z.number().optional(),
  lastSeenAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  schemaVersion: z.number().optional(),
});

export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type Analytics = typeof analytics.$inferSelect;
