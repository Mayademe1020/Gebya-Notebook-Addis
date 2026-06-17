import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactions, customers, customerTransactions, catalogEntries,
  suppliers, supplierTransactions, staffMembers, settings, analytics,
  devices,
} from "@workspace/db/schema";
import { eq, and, gt, inArray } from "drizzle-orm";
import { verifyJwt } from "./auth.js";

const router = Router();

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

async function ensureDeviceLinked(userId: number, deviceId: string) {
  await db
    .insert(devices)
    .values({ userId, deviceId })
    .onConflictDoUpdate({
      target: devices.deviceId,
      set: { userId, lastSeenAt: new Date() },
    });
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
  };
}

function mapSetting(body: any, deviceId: string) {
  return {
    deviceId,
    key: body.key,
    value: body.value,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
  };
}

function mapAnalytics(body: any, deviceId: string) {
  return {
    deviceId,
    key: body.key,
    value: body.value,
    numericValue: body.numeric_value,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
  };
}

// ─── PUSH ───
router.post("/push", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Authorization required" });
  }

  const { device_id, tables } = req.body;
  if (!device_id || typeof device_id !== "string") {
    return res.status(400).json({ error: "device_id is required" });
  }

  // Ensure this device is linked to the authenticated user
  await ensureDeviceLinked(userId, device_id);

  const results: Record<string, { count: number }> = {};

  if (tables?.transactions?.length) {
    let count = 0;
    for (const row of tables.transactions) {
      const data = mapTx({ ...row, device_id });
      await db.insert(transactions).values(data).onConflictDoUpdate({
        target: [transactions.deviceId, transactions.localId],
        set: data,
      });
      count++;
    }
    results.transactions = { count };
  }

  if (tables?.customers?.length) {
    let count = 0;
    for (const row of tables.customers) {
      const data = mapCustomer({ ...row, device_id });
      await db.insert(customers).values(data).onConflictDoUpdate({
        target: [customers.deviceId, customers.localId],
        set: data,
      });
      count++;
    }
    results.customers = { count };
  }

  if (tables?.customer_transactions?.length) {
    let count = 0;
    for (const row of tables.customer_transactions) {
      const data = mapCustomerTx({ ...row, device_id });
      await db.insert(customerTransactions).values(data).onConflictDoUpdate({
        target: [customerTransactions.deviceId, customerTransactions.localId],
        set: data,
      });
      count++;
    }
    results.customer_transactions = { count };
  }

  if (tables?.catalog_entries?.length) {
    let count = 0;
    for (const row of tables.catalog_entries) {
      const data = mapCatalog({ ...row, device_id });
      await db.insert(catalogEntries).values(data).onConflictDoUpdate({
        target: [catalogEntries.deviceId, catalogEntries.localId],
        set: data,
      });
      count++;
    }
    results.catalog_entries = { count };
  }

  if (tables?.suppliers?.length) {
    let count = 0;
    for (const row of tables.suppliers) {
      const data = mapSupplier({ ...row, device_id });
      await db.insert(suppliers).values(data).onConflictDoUpdate({
        target: [suppliers.deviceId, suppliers.localId],
        set: data,
      });
      count++;
    }
    results.suppliers = { count };
  }

  if (tables?.supplier_transactions?.length) {
    let count = 0;
    for (const row of tables.supplier_transactions) {
      const data = mapSupplierTx({ ...row, device_id });
      await db.insert(supplierTransactions).values(data).onConflictDoUpdate({
        target: [supplierTransactions.deviceId, supplierTransactions.localId],
        set: data,
      });
      count++;
    }
    results.supplier_transactions = { count };
  }

  if (tables?.staff_members?.length) {
    let count = 0;
    for (const row of tables.staff_members) {
      const data = mapStaff({ ...row, device_id });
      await db.insert(staffMembers).values(data).onConflictDoUpdate({
        target: [staffMembers.deviceId, staffMembers.localId],
        set: data,
      });
      count++;
    }
    results.staff_members = { count };
  }

  if (tables?.settings?.length) {
    let count = 0;
    for (const row of tables.settings) {
      const data = mapSetting(row, device_id);
      await db.insert(settings).values(data).onConflictDoUpdate({
        target: [settings.deviceId, settings.key],
        set: data,
      });
      count++;
    }
    results.settings = { count };
  }

  if (tables?.analytics?.length) {
    let count = 0;
    for (const row of tables.analytics) {
      const data = mapAnalytics(row, device_id);
      await db.insert(analytics).values(data).onConflictDoUpdate({
        target: [analytics.deviceId, analytics.key],
        set: data,
      });
      count++;
    }
    results.analytics = { count };
  }

  return res.json({ ok: true, device_id, results });
});

// ─── PULL ───
router.get("/pull", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Authorization required" });
  }

  const { since } = req.query;
  const sinceMs = since ? Number(since) : 0;

  // Get all devices for this user
  const deviceIds = await getUserDevices(userId);
  if (deviceIds.length === 0) {
    return res.json({ ok: true, user_id: userId, since: sinceMs, pulled_at: Date.now(), tables: {} });
  }

  const [txRows, custRows, custTxRows, catRows, supRows, supTxRows, staffRows, setRows, anaRows] = await Promise.all([
    db.select().from(transactions).where(and(inArray(transactions.deviceId, deviceIds), gt(transactions.updatedAt, sinceMs))),
    db.select().from(customers).where(and(inArray(customers.deviceId, deviceIds), gt(customers.updatedAt, sinceMs))),
    db.select().from(customerTransactions).where(and(inArray(customerTransactions.deviceId, deviceIds), gt(customerTransactions.updatedAt, sinceMs))),
    db.select().from(catalogEntries).where(and(inArray(catalogEntries.deviceId, deviceIds), gt(catalogEntries.updatedAt, sinceMs))),
    db.select().from(suppliers).where(and(inArray(suppliers.deviceId, deviceIds), gt(suppliers.updatedAt, sinceMs))),
    db.select().from(supplierTransactions).where(and(inArray(supplierTransactions.deviceId, deviceIds), gt(supplierTransactions.updatedAt, sinceMs))),
    db.select().from(staffMembers).where(and(inArray(staffMembers.deviceId, deviceIds), gt(staffMembers.updatedAt, sinceMs))),
    db.select().from(settings).where(and(inArray(settings.deviceId, deviceIds), gt(settings.updatedAt, sinceMs))),
    db.select().from(analytics).where(and(inArray(analytics.deviceId, deviceIds), gt(analytics.updatedAt, sinceMs))),
  ]);

  return res.json({
    ok: true,
    user_id: userId,
    since: sinceMs,
    pulled_at: Date.now(),
    tables: {
      transactions: txRows,
      customers: custRows,
      customer_transactions: custTxRows,
      catalog_entries: catRows,
      suppliers: supRows,
      supplier_transactions: supTxRows,
      staff_members: staffRows,
      settings: setRows,
      analytics: anaRows,
    },
  });
});

export default router;

