import { pgTable, serial, text, integer, real, boolean, bigint, varchar, timestamp, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { z } from "zod";

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  localId: bigint("local_id", { mode: "number" }),
  deviceId: varchar("device_id", { length: 128 }).notNull(),
  transactionId: varchar("transaction_id", { length: 128 }).notNull(),

  type: varchar("type", { length: 32 }).notNull(),
  amount: real("amount").notNull().default(0),
  itemName: text("item_name"),
  costPrice: real("cost_price"),
  quantity: integer("quantity").default(1),
  profit: real("profit"),
  isCredit: boolean("is_credit").default(false),
  customerId: integer("customer_id"),
  customerName: text("customer_name"),

  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
  ethiopianDate: text("ethiopian_date"),

  paymentType: varchar("payment_type", { length: 64 }),
  paymentProvider: varchar("payment_provider", { length: 64 }),

  source: varchar("source", { length: 32 }),
  rawTranscript: text("raw_transcript"),
  detectedTotal: real("detected_total"),
  wasEdited: boolean("was_edited").default(false),
  transcriptionProvider: varchar("transcription_provider", { length: 64 }),
  parsingConfidence: real("parsing_confidence"),
  voiceNote: text("voice_note"),
  rawAudioRef: text("raw_audio_ref"),

  actorRole: varchar("actor_role", { length: 32 }),
  actorStaffMemberId: integer("actor_staff_member_id"),
  actorNameSnapshot: text("actor_name_snapshot"),

  businessId: integer("business_id").references(() => businesses.id, { onDelete: "restrict" }),
  schemaVersion: integer("schema_version").default(1),
  syncVersion: integer("sync_version").default(1),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("transactions_device_local").on(t.deviceId, t.localId),
  unique("transactions_device_txn").on(t.deviceId, t.transactionId),
  index("transactions_business_idx").on(t.businessId),
]);

export const insertTransactionSchema = z.object({
  localId: z.number().optional(),
  deviceId: z.string().max(128),
  transactionId: z.string().max(128),
  type: z.string().max(32),
  amount: z.number().optional(),
  itemName: z.string().nullable().optional(),
  costPrice: z.number().nullable().optional(),
  quantity: z.number().optional(),
  profit: z.number().nullable().optional(),
  isCredit: z.boolean().optional(),
  customerId: z.number().nullable().optional(),
  customerName: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  ethiopianDate: z.string().nullable().optional(),
  paymentType: z.string().max(64).nullable().optional(),
  paymentProvider: z.string().max(64).nullable().optional(),
  source: z.string().max(32).nullable().optional(),
  rawTranscript: z.string().nullable().optional(),
  detectedTotal: z.number().nullable().optional(),
  wasEdited: z.boolean().optional(),
  transcriptionProvider: z.string().max(64).nullable().optional(),
  parsingConfidence: z.number().nullable().optional(),
  voiceNote: z.string().nullable().optional(),
  rawAudioRef: z.string().nullable().optional(),
  actorRole: z.string().max(32).nullable().optional(),
  actorStaffMemberId: z.number().nullable().optional(),
  actorNameSnapshot: z.string().nullable().optional(),
  schemaVersion: z.number().optional(),
  syncVersion: z.number().optional(),
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
