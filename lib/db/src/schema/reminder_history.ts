import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  bigint,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { z } from "zod";

export const reminderHistory = pgTable(
  "reminder_history",
  {
    id: serial("id").primaryKey(),
    shopId: integer("shop_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    customerId: integer("customer_id").notNull(),
    chatId: text("chat_id").notNull(),

    balanceAtSendTime: numeric("balance_at_send_time", { precision: 10, scale: 2 }).notNull(),
    dueDate: bigint("due_date", { mode: "number" }), // null if no due date
    daysHeld: integer("days_held"),

    sentAt: bigint("sent_at", { mode: "number" }).notNull(), // unix ms
    status: varchar("status", { length: 20 }).notNull(), // 'sent', 'failed', 'queued', 'skipped'
    language: varchar("language", { length: 2 }).notNull(), // 'am' or 'en'

    messageId: text("message_id"), // Telegram message_id if sent
    failureReason: text("failure_reason"), // if failed
    retryCount: integer("retry_count").default(0),
    lastAttemptAt: bigint("last_attempt_at", { mode: "number" }),

    customerNameSnapshot: text("customer_name_snapshot"), // audit trail
    shopNameSnapshot: text("shop_name_snapshot"), // audit trail

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    shopCustomerIdx: index("idx_reminder_history_shop_customer").on(table.shopId, table.customerId),
    shopDateIdx: index("idx_reminder_history_shop_date").on(table.shopId, table.sentAt),
    statusIdx: index("idx_reminder_history_status").on(table.status),
    createdAtIdx: index("idx_reminder_history_created_at").on(table.createdAt),
  })
);

export const insertReminderHistorySchema = z.object({
  shopId: z.number(),
  customerId: z.number(),
  chatId: z.string(),
  balanceAtSendTime: z.string().or(z.number()),
  dueDate: z.number().nullable().optional(),
  daysHeld: z.number().nullable().optional(),
  sentAt: z.number(),
  status: z.enum(["sent", "failed", "queued", "skipped"]),
  language: z.enum(["am", "en"]),
  messageId: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  retryCount: z.number().optional(),
  lastAttemptAt: z.number().nullable().optional(),
  customerNameSnapshot: z.string().nullable().optional(),
  shopNameSnapshot: z.string().nullable().optional(),
});

export type InsertReminderHistory = z.infer<typeof insertReminderHistorySchema>;
export type ReminderHistory = typeof reminderHistory.$inferSelect;
