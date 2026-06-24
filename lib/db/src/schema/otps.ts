import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const otps = pgTable("otps", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(5),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumed: boolean("consumed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertOtpSchema = z.object({
  phoneNumber: z.string(),
  codeHash: z.string(),
  attempts: z.number().optional(),
  maxAttempts: z.number().optional(),
  expiresAt: z.date(),
  consumed: z.boolean().optional(),
});

export type InsertOtp = z.infer<typeof insertOtpSchema>;
export type Otp = typeof otps.$inferSelect;
