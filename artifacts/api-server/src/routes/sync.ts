import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactions, customers, customerTransactions, catalogEntries,
  suppliers, supplierTransactions, staffMembers, settings, analytics,
  devices, businessMembers,
} from "@workspace/db/schema";
import { eq, and, gt, inArray, asc } from "drizzle-orm";
import { verifyJwt } from "./auth.js";
import { syncRateLimiter } from "../app.js";

// ─── Limits ───
const MAX_ROWS_PER_TABLE_PUSH = 500;   // cap push payload per table
const DEFAULT_PULL_LIMIT = 200;        // rows per table per pull page
const MAX_PULL_LIMIT = 1000;

const router = Router();

// Apply sync-specific rate limit to all routes in this router
router.use(syncRateLimiter);

// ─── Auth middleware for sync routes ───
function getUserIdFromRequest(req: any): number | null {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const decoded = verifyJwt(token);
  return decoded?.userId || null;
}

async function getUserDevices(userId: number): Promise<string[]> {
  const rows = await db.select({ deviceId: devices.deviceId }).from(devices).where(eq(devices.userId, userId));
  return rows.map((r) => r.deviceId);
}

/**
 * Validates that `deviceId` is already linked to `userId`, OR links it if
 * this is the first push from a newly registered device.
 * Returns false if the device is registered to a *different* user — push is rejected.
 */
async function validateAndLinkDevice(userId: number, deviceId: string): Promise<boolean> {
  const existing = await db.select({ userId: devices.userId })
    .from(devices).where(eq(devices.deviceId, deviceId)).limit(1);

  if (existing.length === 0) {
    await db.insert(devices).values({ userId, deviceId }).onConflictDoUpdate({
      target: devices.deviceId,
      set: { userId, lastSeenAt: new Date() },
    });
    return true;
  }

  if (existing[0].userId !== userId) return false;

  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.deviceId, deviceId));
  return true;
}

/**
 * Returns the business_id for a user. UNIQUE(user_id) on business_members
 * guarantees exactly one row. Returns null if the user has no business
 * (shouldn't happen post-migration, but guarded for safety).
 */
async function getBusinessForUser(userId: number): Promise<number | null> {
  const rows = await db
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(eq(businessMembers.userId, userId))
    .limit(1);
  return rows.length > 0 ? rows[0].businessId : null;
}

// ─── Map frontend snake_case → Drizzle camelCase ───
function mapTx(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    type: body.type,
    amount: body.amount,
    itemName: body.item_name,
    costPrice: body.cost_price,
    quantity: body.quantity,
    profit: body.profit,
    isCredit: body.is_credit,
    customerId: body.customer_id,
    customerName: body.customer_name,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    ethiopianDate: body.ethiopian_date,
    paymentType: body.payment_type,
    paymentProvider: body.payment_provider,
    source: body.source,
    rawTranscript: body.raw_transcript,
    detectedTotal: body.detected_total,
    wasEdited: body.was_edited,
    transcriptionProvider: body.transcription_provider,
    parsingConfidence: body.parsing_confidence,
    voiceNote: body.voice_note,
    rawAudioRef: body.raw_audio_ref,
    actorRole: body.actor_role,
    actorStaffMemberId: body.actor_staff_member_id,
    actorNameSnapshot: body.actor_name_snapshot,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapCustomer(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    displayName: body.display_name,
    note: body.note,
    phoneNumber: body.phone_number,
    telegramUsername: body.telegram_username,
    telegramChatId: body.telegram_chat_id,
    telegramNotifyEnabled: body.telegram_notify_enabled,
    telegramLinkToken: body.telegram_link_token,
    telegramLinkedAt: body.telegram_linked_at,
    telegramLinkRequestedAt: body.telegram_link_requested_at,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapCustomerTx(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    customerId: body.customer_id,
    type: body.type,
    amount: body.amount,
    itemNote: body.item_note,
    dueDate: body.due_date,
    referenceCode: body.reference_code,
    telegramDeliveryState: body.telegram_delivery_state,
    telegramDeliveryError: body.telegram_delivery_error,
    telegramDeliveryAttemptedAt: body.telegram_delivery_attempted_at,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    actorRole: body.actor_role,
    actorStaffMemberId: body.actor_staff_member_id,
    actorNameSnapshot: body.actor_name_snapshot,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapCatalog(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    name: body.name,
    kind: body.kind,
    active: body.active,
    defaultPrice: body.default_price,
    defaultCost: body.default_cost,
    note: body.note,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapSupplier(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    displayName: body.display_name,
    phoneNumber: body.phone_number,
    note: body.note,
    active: body.active,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapSupplierTx(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    supplierId: body.supplier_id,
    type: body.type,
    catalogEntryId: body.catalog_entry_id,
    itemName: body.item_name,
    itemKind: body.item_kind,
    quantity: body.quantity,
    amount: body.amount,
    note: body.note,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    actorRole: body.actor_role,
    actorStaffMemberId: body.actor_staff_member_id,
    actorNameSnapshot: body.actor_name_snapshot,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapStaff(body: any) {
  return {
    localId: body.id,
    deviceId: body.device_id,
    transactionId: body.transaction_id,
    displayName: body.display_name,
    role: body.role,
    active: body.active,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    deactivatedAt: body.deactivated_at,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapSetting(body: any, deviceId: string) {
  return {
    deviceId,
    key: body.key,
    value: body.value,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

function mapAnalytics(body: any, deviceId: string) {
  return {
    deviceId,
    key: body.key,
    value: body.value,
    numericValue: body.numeric_value,
    count: body.count,
    lastSeenAt: body.last_seen_at,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    schemaVersion: body.schema_version || 1,
    syncVersion: body.sync_version || 1,
  };
}

// ─── Version-aware push helper ───
interface ConflictRecord {
  table: string;
  localId: number;
  serverRecord: any;
}

async function pushTable(
  key: string,
  table: any,
  conflictTarget: any[],
  deviceId: string,
  rows: any[],
  mapper: (row: any) => any,
  localIdCol: any,
  deviceIdCol: any,
  syncVersionCol: any,
  updatedAtCol: any,
  businessId: number
): Promise<{ count: number; conflicts: ConflictRecord[] }> {
  const capped = (rows || []).slice(0, MAX_ROWS_PER_TABLE_PUSH);
  let count = 0;
  const conflicts: ConflictRecord[] = [];

  for (const row of capped) {
    const data = mapper({ ...row, device_id: deviceId });
    // Stamp business_id if the client didn't send one (frontend doesn't know about it yet)
    data.businessId = data.businessId ?? businessId;
    const incomingVersion = data.syncVersion || 1;
    const incomingUpdatedAt = data.updatedAt || 0;

    // Check existing record by (deviceId, localId)
    const existing = await db
      .select()
      .from(table)
      .where(and(eq(deviceIdCol, deviceId), eq(localIdCol, data.localId)))
      .limit(1);

    if (existing.length === 0) {
      // New record — insert with version 1
      await db.insert(table).values({ ...data, syncVersion: 1 });
      count++;
    } else {
      const stored = existing[0];
      const storedVersion = stored.syncVersion || 1;
      const storedUpdatedAt = stored.updatedAt || 0;

      // Conflict resolution: only update if incoming is strictly newer
      if (incomingVersion > storedVersion) {
        // Client has a newer version — safe to update, server increments version
        await db
          .update(table)
          .set({ ...data, syncVersion: incomingVersion + 1 })
          .where(and(eq(deviceIdCol, deviceId), eq(localIdCol, data.localId)));
        count++;
      } else if (incomingVersion === storedVersion && incomingUpdatedAt > storedUpdatedAt) {
        // Same version but newer timestamp (client edited after last sync)
        await db
          .update(table)
          .set({ ...data, syncVersion: storedVersion + 1 })
          .where(and(eq(deviceIdCol, deviceId), eq(localIdCol, data.localId)));
        count++;
      } else {
        // Conflict: server has newer or equal version
        conflicts.push({
          table: key,
          localId: data.localId,
          serverRecord: stored,
        });
      }
    }
  }

  return { count, conflicts };
}

// ─── PUSH ───
router.post("/push", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const { device_id, tables } = req.body;
  if (!device_id || typeof device_id !== "string" || device_id.length > 128) {
    return res.status(400).json({ error: "device_id is required and must be a string ≤ 128 chars" });
  }

  const deviceOk = await validateAndLinkDevice(userId, device_id);
  if (!deviceOk) {
    return res.status(403).json({ error: "Device is registered to a different account" });
  }

  if (tables !== undefined && (typeof tables !== "object" || Array.isArray(tables))) {
    return res.status(400).json({ error: "tables must be an object" });
  }

  const businessId = await getBusinessForUser(userId);
  if (!businessId) {
    return res.status(403).json({ error: "No business associated with this account" });
  }

  const results: Record<string, { count: number; conflicts: number }> = {};
  const allConflicts: ConflictRecord[] = [];

  // Push each table with version-aware conflict resolution
  const pushResults = await Promise.all([
    pushTable("transactions", transactions, [transactions.deviceId, transactions.localId], device_id, tables?.transactions, mapTx, transactions.localId, transactions.deviceId, transactions.syncVersion, transactions.updatedAt, businessId),
    pushTable("customers", customers, [customers.deviceId, customers.localId], device_id, tables?.customers, mapCustomer, customers.localId, customers.deviceId, customers.syncVersion, customers.updatedAt, businessId),
    pushTable("customer_transactions", customerTransactions, [customerTransactions.deviceId, customerTransactions.localId], device_id, tables?.customer_transactions, mapCustomerTx, customerTransactions.localId, customerTransactions.deviceId, customerTransactions.syncVersion, customerTransactions.updatedAt, businessId),
    pushTable("catalog_entries", catalogEntries, [catalogEntries.deviceId, catalogEntries.localId], device_id, tables?.catalog_entries, mapCatalog, catalogEntries.localId, catalogEntries.deviceId, catalogEntries.syncVersion, catalogEntries.updatedAt, businessId),
    pushTable("suppliers", suppliers, [suppliers.deviceId, suppliers.localId], device_id, tables?.suppliers, mapSupplier, suppliers.localId, suppliers.deviceId, suppliers.syncVersion, suppliers.updatedAt, businessId),
    pushTable("supplier_transactions", supplierTransactions, [supplierTransactions.deviceId, supplierTransactions.localId], device_id, tables?.supplier_transactions, mapSupplierTx, supplierTransactions.localId, supplierTransactions.deviceId, supplierTransactions.syncVersion, supplierTransactions.updatedAt, businessId),
    pushTable("staff_members", staffMembers, [staffMembers.deviceId, staffMembers.localId], device_id, tables?.staff_members, mapStaff, staffMembers.localId, staffMembers.deviceId, staffMembers.syncVersion, staffMembers.updatedAt, businessId),
  ]);

  const tableKeys = [
    "transactions", "customers", "customer_transactions", "catalog_entries",
    "suppliers", "supplier_transactions", "staff_members",
  ];

  for (let i = 0; i < tableKeys.length; i++) {
    const key = tableKeys[i];
    const result = pushResults[i];
    if (result.count > 0 || result.conflicts.length > 0) {
      results[key] = { count: result.count, conflicts: result.conflicts.length };
      allConflicts.push(...result.conflicts);
    }
  }

  // Settings / analytics — simpler KV push, no version conflict resolution
  for (const key of ["settings", "analytics"] as const) {
    const rows: any[] = tables?.[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const capped = rows.slice(0, MAX_ROWS_PER_TABLE_PUSH);
    const mapper = key === "settings" ? mapSetting : mapAnalytics;
    const table = key === "settings" ? settings : analytics;
    const conflictCols = key === "settings" ? [settings.deviceId, settings.key] : [analytics.deviceId, analytics.key];
    let count = 0;
    for (const row of capped) {
      const data: any = mapper(row, device_id);
      data.businessId = data.businessId ?? businessId;
      await db.insert(table).values(data).onConflictDoUpdate({ target: conflictCols, set: data });
      count++;
    }
    if (count > 0) results[key] = { count, conflicts: 0 };
  }

  return res.json({
    ok: true,
    device_id,
    results,
    conflicts: allConflicts.length > 0 ? allConflicts.map((c) => ({
      table: c.table,
      localId: c.localId,
      serverVersion: c.serverRecord.syncVersion,
      serverUpdatedAt: c.serverRecord.updatedAt,
    })) : undefined,
  });
});

// ─── PULL ───
router.get("/pull", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Authorization required" });
  }

  const { since, limit } = req.query;
  const sinceMs = since ? Number(since) : 0;
  const pullLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_PULL_LIMIT, 1),
    MAX_PULL_LIMIT
  );

  const businessId = await getBusinessForUser(userId);
  if (!businessId) {
    return res.status(403).json({ error: "No business associated with this account" });
  }

  // Scope pull to all rows belonging to the user's business.
  // This means a new staff member on a different device will receive
  // the shop's full history on their first pull.
  async function pullTable(table: any, businessIdCol: any, updatedAtCol: any) {
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(businessIdCol, businessId), gt(updatedAtCol, sinceMs)))
      .orderBy(asc(updatedAtCol))
      .limit(pullLimit + 1);

    const hasMore = rows.length > pullLimit;
    const returnedRows = hasMore ? rows.slice(0, pullLimit) : rows;
    const nextCursor = hasMore && returnedRows.length > 0
      ? returnedRows[returnedRows.length - 1].updatedAt
      : null;

    return { rows: returnedRows, hasMore, nextCursor };
  }

  const [
    txResult, custResult, custTxResult, catResult,
    supResult, supTxResult, staffResult, setResult, anaResult,
  ] = await Promise.all([
    pullTable(transactions,          transactions.businessId,          transactions.updatedAt),
    pullTable(customers,             customers.businessId,             customers.updatedAt),
    pullTable(customerTransactions,  customerTransactions.businessId,  customerTransactions.updatedAt),
    pullTable(catalogEntries,        catalogEntries.businessId,        catalogEntries.updatedAt),
    pullTable(suppliers,             suppliers.businessId,             suppliers.updatedAt),
    pullTable(supplierTransactions,  supplierTransactions.businessId,  supplierTransactions.updatedAt),
    pullTable(staffMembers,          staffMembers.businessId,          staffMembers.updatedAt),
    pullTable(settings,              settings.businessId,              settings.updatedAt),
    pullTable(analytics,             analytics.businessId,             analytics.updatedAt),
  ]);

  const tables = {
    transactions: txResult.rows,
    customers: custResult.rows,
    customer_transactions: custTxResult.rows,
    catalog_entries: catResult.rows,
    suppliers: supResult.rows,
    supplier_transactions: supTxResult.rows,
    staff_members: staffResult.rows,
    settings: setResult.rows,
    analytics: anaResult.rows,
  };

  const hasMore =
    txResult.hasMore || custResult.hasMore || custTxResult.hasMore ||
    catResult.hasMore || supResult.hasMore || supTxResult.hasMore ||
    staffResult.hasMore || setResult.hasMore || anaResult.hasMore;

  const nextCursor = hasMore
    ? Math.max(
        txResult.nextCursor || 0,
        custResult.nextCursor || 0,
        custTxResult.nextCursor || 0,
        catResult.nextCursor || 0,
        supResult.nextCursor || 0,
        supTxResult.nextCursor || 0,
        staffResult.nextCursor || 0,
        setResult.nextCursor || 0,
        anaResult.nextCursor || 0
      )
    : null;

  return res.json({
    ok: true,
    user_id: userId,
    since: sinceMs,
    pulled_at: Date.now(),
    tables,
    hasMore,
    nextCursor,
  });
});

export default router;
