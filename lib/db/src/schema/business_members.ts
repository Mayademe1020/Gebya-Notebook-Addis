import { pgTable, serial, integer, varchar, boolean, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";
import { businesses } from "./businesses";

export const businessMembers = pgTable("business_members", {
  id:                 serial("id").primaryKey(),
  businessId:         integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId:             integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role:               varchar("role", { length: 32 }).notNull().default("cashier"),
  permissions:        jsonb("permissions"), // JSONB overrides for role defaults; NULL means use role defaults
  invitedByUserId:    integer("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  joinedAt:           timestamp("joined_at", { withTimezone: true }),
  active:             boolean("active").notNull().default(true),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("biz_members_user_unique").on(t.userId),   // V1: one user = one business
  index("biz_members_business_idx").on(t.businessId),
]);

export const insertBusinessMemberSchema = z.object({
  businessId:      z.number(),
  userId:          z.number(),
  role:            z.enum(["owner", "cashier", "viewer"]).default("cashier"),
  permissions:     z.record(z.string(), z.boolean()).nullable().optional(),
  invitedByUserId: z.number().nullable().optional(),
  joinedAt:        z.date().nullable().optional(),
  active:          z.boolean().optional(),
});

export type InsertBusinessMember = z.infer<typeof insertBusinessMemberSchema>;
export type BusinessMember = typeof businessMembers.$inferSelect;
