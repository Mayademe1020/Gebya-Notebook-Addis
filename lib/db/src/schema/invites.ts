import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";
import { businesses } from "./businesses";

export const invites = pgTable("invites", {
  id:                 serial("id").primaryKey(),
  businessId:         integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  invitedByUserId:    integer("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumber:        text("phone_number").notNull(),
  role:               varchar("role", { length: 32 }).notNull().default("cashier"),
  token:              varchar("token", { length: 128 }).notNull().unique(),
  expiresAt:          timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt:         timestamp("accepted_at", { withTimezone: true }),
  revokedAt:          timestamp("revoked_at", { withTimezone: true }),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("invites_business_idx").on(t.businessId),
  index("invites_token_idx").on(t.token),
  index("invites_phone_idx").on(t.phoneNumber),
]);

export const insertInviteSchema = z.object({
  businessId:      z.number(),
  invitedByUserId: z.number(),
  phoneNumber:     z.string(),
  role:            z.enum(["owner", "cashier", "viewer"]).default("cashier"),
  token:           z.string().max(128),
  expiresAt:       z.date(),
});

export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invites.$inferSelect;
