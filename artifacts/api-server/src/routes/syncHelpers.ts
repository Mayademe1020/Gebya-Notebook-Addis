import { requireDb } from "@workspace/db";
import { devices, businessMembers } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyJwt } from "./auth.js";

export function getUserIdFromRequest(req: any): number | null {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const decoded = verifyJwt(token);
  return decoded?.userId || null;
}

export async function validateAndLinkDevice(
  userId: number,
  deviceId: string,
  tokenHash: string
): Promise<{ success: boolean; staffId: number | null }> {
  const existing = await requireDb()
    .select({ userId: devices.userId, tokenHash: devices.tokenHash, staffId: devices.staffId })
    .from(devices)
    .where(eq(devices.deviceId, deviceId))
    .limit(1);

  if (existing.length === 0) {
    await requireDb().insert(devices).values({ userId, deviceId, tokenHash }).onConflictDoUpdate({
      target: devices.deviceId,
      set: { userId, tokenHash, lastSeenAt: new Date() },
    });
    return { success: true, staffId: null };
  }

  if (existing[0].userId !== userId) return { success: false, staffId: null };

  await requireDb().update(devices).set({ lastSeenAt: new Date(), tokenHash }).where(eq(devices.deviceId, deviceId));
  return { success: true, staffId: existing[0].staffId ?? null };
}

export async function getBusinessForUser(userId: number, businessId?: number): Promise<number | null> {
  const filters: any[] = [eq(businessMembers.userId, userId)];
  if (businessId) filters.push(eq(businessMembers.businessId, businessId));
  const rows = await requireDb()
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(...filters))
    .limit(1);
  return rows.length > 0 ? rows[0].businessId : null;
}

// NOTE (Gate B): the transactions ingest path intentionally does NOT map
// labelCode/categoryCode — the transactions table carries a labelCode column
// (historical bootstrap) but no client payload field feeds it. If a mapping
// is ever added here, it MUST route through normalizeLegacyCode:
// re-pollution into "transactions" after the migration = Gate B failed.
export function mapTx(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    type: body.type, amount: body.amount, itemName: body.item_name,
    costPrice: body.cost_price, quantity: body.quantity, profit: body.profit,
    isCredit: body.is_credit, customerId: body.customer_id, customerName: body.customer_name,
    createdAt: body.created_at, updatedAt: body.updated_at, ethiopianDate: body.ethiopian_date,
    paymentType: body.payment_type, paymentProvider: body.payment_provider,
    saleSettlementMode: body.sale_settlement_mode,
    paidAmount: body.paid_amount,
    remainingAmount: body.remaining_amount,
    deletedAt: body.deleted_at ?? null,
    settlementDueDate: body.settlement_due_date,
    source: body.source,
    wasEdited: body.was_edited,
    actorRole: body.actor_role, actorStaffMemberId: body.actor_staff_member_id,
    actorNameSnapshot: body.actor_name_snapshot, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
export function mapCustomer(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    displayName: body.display_name, note: body.note, phoneNumber: body.phone_number,
    telegramUsername: body.telegram_username, telegramChatId: body.telegram_chat_id,
    telegramNotifyEnabled: body.telegram_notify_enabled, telegramLinkToken: body.telegram_link_token,
    telegramLinkedAt: body.telegram_linked_at, telegramLinkRequestedAt: body.telegram_link_requested_at,
    createdAt: body.created_at, updatedAt: body.updated_at, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
// ---------------------------------------------------------------------------
// Gate B: legacy Armenian structured codes were written by historical client
// versions and are read by NOTHING (Gate B readers report). The ensureSchema
// data-fix NULLs them in bulk; this normalizer keeps old offline devices from
// re-polluting the mirror on re-sync. Removal review anchored to R2.4 — a few
// weeks after the SW cache bump + flag flip, all devices run new writers;
// that is the dated checkpoint to declare zero legacy writers and remove
// this guard.
const LEGACY_CODE_VALUES = new Set([
  // Represents the literal categoryCode '2 \u0555\u054F\u0551\u0546'
  // (Armenian capitals, U+0555 U+054F U+0551 U+0546) and labelCode
  // '\u0533.\u0546' — DO NOT simplify: must match the exact persisted bytes
  // or the purge silently matches nothing. See the Gate B readers report in
  // R2-PLAN.md.
  "2 " + String.fromCharCode(0x0555, 0x054f, 0x0551, 0x0546), // U+0555 U+054F U+0551 U+0546
  String.fromCharCode(0x0533, 0x2e, 0x0546), // U+0533 '.' U+0546
]);

export function normalizeLegacyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return LEGACY_CODE_VALUES.has(value) ? null : value;
}

export function mapCustomerTx(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    customerId: body.customer_id, type: body.type, amount: body.amount,
    itemNote: body.item_note, dueDate: body.due_date, referenceCode: body.reference_code,
    telegramDeliveryState: body.telegram_delivery_state, telegramDeliveryError: body.telegram_delivery_error,
    telegramDeliveryAttemptedAt: body.telegram_delivery_attempted_at,
    createdAt: body.created_at, updatedAt: body.updated_at,
    actorRole: body.actor_role, actorStaffMemberId: body.actor_staff_member_id,
    actorNameSnapshot: body.actor_name_snapshot, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
    year: body.year, categoryCode: normalizeLegacyCode(body.category_code), labelCode: normalizeLegacyCode(body.label_code),
  };
}
export function mapCatalog(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    name: body.name, kind: body.kind, active: body.active,
    defaultPrice: body.default_price, defaultCost: body.default_cost, note: body.note,
    createdAt: body.created_at, updatedAt: body.updated_at, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
export function mapSupplier(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    displayName: body.display_name, phoneNumber: body.phone_number, note: body.note,
    active: body.active, createdAt: body.created_at, updatedAt: body.updated_at,
    schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
export function mapSupplierTx(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    supplierId: body.supplier_id, type: body.type, catalogEntryId: body.catalog_entry_id,
    itemName: body.item_name, itemKind: body.item_kind, quantity: body.quantity,
    amount: body.amount, note: body.note, createdAt: body.created_at, updatedAt: body.updated_at,
    actorRole: body.actor_role, actorStaffMemberId: body.actor_staff_member_id,
    actorNameSnapshot: body.actor_name_snapshot, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
export function mapStaff(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, transactionId: body.transaction_id,
    displayName: body.display_name, role: body.role, active: body.active,
    createdAt: body.created_at, updatedAt: body.updated_at, deactivatedAt: body.deactivated_at,
    schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
export function mapSetting(body: any, deviceId: string) {
  return { deviceId, key: body.key, value: body.value, createdAt: body.created_at, updatedAt: body.updated_at, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1 };
}
export function mapAnalytics(body: any, deviceId: string) {
  return { deviceId, key: body.key, value: body.value, numericValue: body.numeric_value, count: body.count, lastSeenAt: body.last_seen_at, createdAt: body.created_at, updatedAt: body.updated_at, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1 };
}
export function mapSettlement(body: any) {
  return {
    localId: body.id, deviceId: body.device_id, settlementId: body.settlement_id,
    staffId: body.staff_id,
    periodStart: body.period_start, periodEnd: body.period_end,
    expectedCash: body.expected_cash, actualCash: body.actual_cash, cashVariance: body.cash_variance,
    expectedTransfer: body.expected_transfer, actualTransfer: body.actual_transfer, transferVariance: body.transfer_variance,
    expectedTotal: body.expected_total, actualTotal: body.actual_total, totalVariance: body.total_variance,
    adjustments: body.adjustments || [],
    finalExpectedCash: body.final_expected_cash, finalExpectedTotal: body.final_expected_total, finalVariance: body.final_variance,
    status: body.status || "checked", notes: body.notes || null,
    settledAt: body.settled_at, settledBy: body.settled_by,
    reconciledAt: body.reconciled_at || null, reconciledBy: body.reconciled_by || null, reconciliationNote: body.reconciliation_note || null,
    reconciliationStatus: body.reconciliation_status || "checked",
    staffReportedCash: body.staff_reported_cash ?? null, staffReportedTransfer: body.staff_reported_transfer ?? null,
    staffSubmittedAt: body.staff_submitted_at ?? null, staffNote: body.staff_note ?? null,
    ownerConfirmedCash: body.owner_confirmed_cash ?? null, ownerConfirmedTransfer: body.owner_confirmed_transfer ?? null,
    ownerNote: body.owner_note ?? null,
    reconciliationLog: body.reconciliation_log ?? [],
    carryForward: body.carry_forward ?? null,
    createdAt: body.created_at, updatedAt: body.updated_at, schemaVersion: body.schema_version || 1, syncVersion: body.sync_version || 1,
  };
}
