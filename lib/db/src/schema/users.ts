import { pgTable, serial, text, integer, boolean, bigint, varchar, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  active: boolean("active").default(true),
  preferredLang: varchar("preferred_lang", { length: 8 }).default("am"),
  telegramChatId: text("telegram_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: varchar("device_id", { length: 128 }).notNull().unique(),
  name: text("name"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
});

export const insertUserSchema = z.object({
  phoneNumber: z.string(),
  active: z.boolean().optional(),
  preferredLang: z.string().max(8).optional(),
  telegramChatId: z.string().nullable().optional(),
});

export const insertDeviceSchema = z.object({
  userId: z.number(),
  deviceId: z.string().max(128),
  name: z.string().nullable().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;
