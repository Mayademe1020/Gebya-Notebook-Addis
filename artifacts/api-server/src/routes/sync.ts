import { Router } from "express";
import { requireDb, customerBalanceExpression } from "@workspace/db";
import {
  transactions, customers, customerTransactions, catalogEntries,
  suppliers, supplierTransactions, staffMembers, settings, analytics,
  devices, businessMembers, auditLog, notifications, settlements,
} from "@workspace/db/schema";
import { eq, and, gt, inArray, asc, sql } from "drizzle-orm";
import { verifyJwt } from "./auth.js";
import { syncRateLimiter } from "../rateLimits.js";
import { requirePermission, requireMembership } from "./rbac.js";
import { sendPushToOwner } from "../services/pushNotificationSender.js";
import { getPreferencesForBusiness, shouldNotify, isInQuietHours } from "../services/notificationPreferences.js";
import { setLastReminderSentAt } from "../services/reminderConfiguration.js";
import { createHistoryEntry } from "../services/reminderHistory.js";
import { sendTelegramTextMessage } from "../services/telegramBotService.js";
import { getUserIdFromRequest, validateAndLinkDevice, getBusinessForUser, mapTx, mapCustomer, mapCustomerTx, mapCatalog, mapSupplier, mapSupplierTx, mapStaff, mapSetting, mapAnalytics, mapSettlement } from "./syncHelpers.js";
export { getBusinessForUser };

const MAX_ROWS_PER_TABLE_PUSH = 500;
const DEFAULT_PULL_LIMIT = 200;
const MAX_PULL_LIMIT = 1000;

const router = Router();
router.use(syncRateLimiter);


interface ConflictRecord { table: string; localId: number; serverRecord: any; }
interface MutationRecord { action: "CREATE" | "UPDATE" | "DELETE"; entityType: string; entityId: string; details?: string; }

function isSameRecord(incoming: any, stored: any): boolean {
  for (const [key, value] of Object.entries(incoming)) {
    const other = stored[key];
    if (value === undefined || value === null) {
      if (other !== null && other !== undefined) return false;
      continue;
    }
    if (typeof value === "object") {
      if (JSON.stringify(value) !== JSON.stringify(other ?? null)) return false;
      continue;
    }
    if (String(value) !== String(other)) return false;
  }
  return true;
}

async function pushTable(
  key: string, table: any, conflictTarget: any[], deviceId: string, rows: any[],
  mapper: (row: any) => any, localIdCol: any, deviceIdCol: any,
  syncVersionCol: any, updatedAtCol: any, businessId: number, actorStaffMemberId: number | null,
  tx?: any
): Promise<{ count: number; conflicts: ConflictRecord[]; mutations: MutationRecord[] }> {
  const capped = (rows || []).slice(0, MAX_ROWS_PER_TABLE_PUSH);
  let count = 0;
  const conflicts: ConflictRecord[] = [];
  const mutations: MutationRecord[] = [];
  const CHUNK_SIZE = 100;

  const exec = tx || requireDb();

  for (let i = 0; i < capped.length; i += CHUNK_SIZE) {
    const chunk = capped.slice(i, i + CHUNK_SIZE);

    const chunkResult = await requireDb().transaction(async (innerTx) => {
      const chunkConflicts: ConflictRecord[] = [];
      const chunkMutations: MutationRecord[] = [];
      let chunkCount = 0;
      const d = tx || innerTx;

      for (const row of chunk) {
        // Honor per-row provenance (device_id set by a different device whose
        // record this row belongs to) so edits like an owner's settlement review
        // re-key to the original server row instead of creating a duplicate.
        const data = mapper({ ...row, device_id: row.device_id || deviceId });
        data.businessId = data.businessId ?? businessId;
        // A row pulled from another phone keeps its origin device id, and the
        // client re-keys the push to that origin (see syncEngine's
        // remote_local_id handling). Key the lookup and the update by the row's
        // own device, not the device sending the request: keying by the caller
        // misses the row entirely and inserts a second copy under its owner's
        // device id — or, once the unique pair exists, fails the whole push.
        const rowDeviceId = data.deviceId || deviceId;
        const incomingVersion = data.syncVersion || 1;
        const incomingUpdatedAt = data.updatedAt || 0;
        const existing = await d.select().from(table).where(and(eq(deviceIdCol, rowDeviceId), eq(localIdCol, data.localId))).limit(1);

        if (existing.length === 0) {
          await d.insert(table).values({ ...data, syncVersion: 1 });
          chunkCount++;
          chunkMutations.push({ action: "CREATE", entityType: key, entityId: String(data.localId) });
        } else {
          const stored = existing[0];
          const storedVersion = stored.syncVersion || 1;
          const storedUpdatedAt = stored.updatedAt || 0;
          const incomingActive = typeof data.active === "boolean" ? data.active : null;
          const storedActive = typeof stored.active === "boolean" ? stored.active : true;
          const isSoftDelete = incomingActive === false && storedActive === true;

          const isSettlementReconcile = key === "settlements" && data.status === "reconciled" && stored.status !== "reconciled";
          const reconcileNote = isSettlementReconcile && data.reconciliationNote ? data.reconciliationNote : null;

          if (incomingVersion > storedVersion) {
            await d.update(table).set({ ...data, syncVersion: incomingVersion + 1 }).where(and(eq(deviceIdCol, rowDeviceId), eq(localIdCol, data.localId)));
            chunkCount++;
            const detail = reconcileNote ? `settlement reconciled: ${reconcileNote}` : undefined;
            chunkMutations.push({ action: isSoftDelete ? "DELETE" : "UPDATE", entityType: key, entityId: String(data.localId), details: detail });
          } else if (incomingVersion === storedVersion && incomingUpdatedAt > storedUpdatedAt) {
            await d.update(table).set({ ...data, syncVersion: storedVersion + 1 }).where(and(eq(deviceIdCol, rowDeviceId), eq(localIdCol, data.localId)));
            chunkCount++;
            const detail = reconcileNote ? `settlement reconciled: ${reconcileNote}` : undefined;
            chunkMutations.push({ action: isSoftDelete ? "DELETE" : "UPDATE", entityType: key, entityId: String(data.localId), details: detail });
          } else if (incomingVersion === storedVersion && incomingUpdatedAt === storedUpdatedAt && isSameRecord(data, stored)) {
            // Same version, same timestamp, same values: the client is
            // re-delivering a row this server already applied (its previous
            // acknowledgement was lost). Acknowledge it as applied instead of
            // reporting a conflict — otherwise the client retries it forever
            // and the shop never leaves "Pending sync".
            chunkCount++;
          } else {
            chunkConflicts.push({ table: key, localId: data.localId, serverRecord: stored });
          }
        }
      }

      return { count: chunkCount, conflicts: chunkConflicts, mutations: chunkMutations };
    });

    count += chunkResult.count;
    conflicts.push(...chunkResult.conflicts);
    mutations.push(...chunkResult.mutations);
  }

  return { count, conflicts, mutations };
}

router.post("/push",
  requirePermission("can_add_records"),
  async (req, res) => {
    (req as any).rbacEntityType = "transactions";
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const authHeader2 = req.headers.authorization || req.headers.Authorization || "";
  const headerValue2 = Array.isArray(authHeader2) ? authHeader2[0] : authHeader2;
  const tokenForHash = String(headerValue2).replace(/^Bearer\s+/i, "");
  const tokenHash = await import("node:crypto").then((c) => c.createHash("sha256").update(tokenForHash).digest("hex"));

  const { device_id, tables } = req.body;
  if (!device_id || typeof device_id !== "string" || device_id.length > 128) {
    return res.status(400).json({ error: "device_id is required and must be a string ≤ 128 chars" });
  }

  const deviceResult = await validateAndLinkDevice(userId, device_id, tokenHash);
  if (!deviceResult.success) return res.status(403).json({ error: "Device is registered to a different account" });

  if (tables !== undefined && (typeof tables !== "object" || Array.isArray(tables))) {
    return res.status(400).json({ error: "tables must be an object" });
  }

  const requestedBizId = Number(req.headers["x-business-id"]) || undefined;
  const businessId = await getBusinessForUser(userId, requestedBizId);
  if (!businessId) return res.status(403).json({ error: "No business associated with this account" });

  const results: Record<string, { count: number; conflicts: number }> = {};
  const allConflicts: ConflictRecord[] = [];

  await requireDb().transaction(async (tx) => {
    const pushResults = await Promise.all([
      pushTable("transactions", transactions, [transactions.deviceId, transactions.localId], device_id, tables?.transactions, mapTx, transactions.localId, transactions.deviceId, transactions.syncVersion, transactions.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("customers", customers, [customers.deviceId, customers.localId], device_id, tables?.customers, mapCustomer, customers.localId, customers.deviceId, customers.syncVersion, customers.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("customer_transactions", customerTransactions, [customerTransactions.deviceId, customerTransactions.localId], device_id, tables?.customer_transactions, mapCustomerTx, customerTransactions.localId, customerTransactions.deviceId, customerTransactions.syncVersion, customerTransactions.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("catalog_entries", catalogEntries, [catalogEntries.deviceId, catalogEntries.localId], device_id, tables?.catalog_entries, mapCatalog, catalogEntries.localId, catalogEntries.deviceId, catalogEntries.syncVersion, catalogEntries.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("suppliers", suppliers, [suppliers.deviceId, suppliers.localId], device_id, tables?.suppliers, mapSupplier, suppliers.localId, suppliers.deviceId, suppliers.syncVersion, suppliers.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("supplier_transactions", supplierTransactions, [supplierTransactions.deviceId, supplierTransactions.localId], device_id, tables?.supplier_transactions, mapSupplierTx, supplierTransactions.localId, supplierTransactions.deviceId, supplierTransactions.syncVersion, supplierTransactions.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("staff_members", staffMembers, [staffMembers.deviceId, staffMembers.localId], device_id, tables?.staff_members, mapStaff, staffMembers.localId, staffMembers.deviceId, staffMembers.syncVersion, staffMembers.updatedAt, businessId, deviceResult.staffId, tx),
      pushTable("settlements", settlements, [settlements.deviceId, settlements.localId], device_id, tables?.settlements, mapSettlement, settlements.localId, settlements.deviceId, settlements.syncVersion, settlements.updatedAt, businessId, deviceResult.staffId, tx),
    ]);

    const allMutations: MutationRecord[] = [];
    for (const result of pushResults as any[]) allMutations.push(...(result.mutations || []));

    if (allMutations.length > 0) {
      const auditRows = allMutations.map((m) => ({
        businessId,
        actorStaffMemberId: deviceResult.staffId ?? sql`NULL`,
        actorDeviceId: device_id,
        action: m.action,
        entityType: m.entityType,
        entityId: m.entityId,
        details: m.details || `sync push via ${device_id}`,
      }));
      await tx.insert(auditLog).values(auditRows as any);

      // --- Create notifications for owner from financial + staff mutations ---
      try {
        const notifiableTypes: Record<string, { type: string; title: string }> = {
          transactions: { type: "sale", title: "Sale recorded" },
          customer_transactions: { type: "credit", title: "Credit activity" },
          supplier_transactions: { type: "supplier_payment", title: "Supplier activity" },
          staff_members: { type: "staff_joined", title: "Staff activity" },
          settlements: { type: "settlement", title: "Staff settlement" },
        };
        const notifiable = allMutations.filter(
          (m) => m.action === "CREATE" && notifiableTypes[m.entityType]
        );
        if (notifiable.length > 0) {
          const ownerRows = await tx
            .select({ userId: businessMembers.userId })
            .from(businessMembers)
            .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner"), eq(businessMembers.active, true)))
            .limit(1);
          const ownerUserId = ownerRows[0]?.userId;
          if (ownerUserId && deviceResult.staffId) {
            const actorRows = await tx
              .select({ name: staffMembers.displayName })
              .from(staffMembers)
              .where(eq(staffMembers.id, deviceResult.staffId))
              .limit(1);
            const actorName = actorRows[0]?.name || "Staff";
            const notifRows = notifiable.map((m) => {
              const meta = notifiableTypes[m.entityType];
              let body = `${actorName} recorded activity`;
              if (m.entityType === "transactions") body = `${actorName} recorded a sale`;
              else if (m.entityType === "customer_transactions") body = `${actorName} recorded credit activity`;
              else if (m.entityType === "supplier_transactions") body = `${actorName} recorded supplier activity`;
              else if (m.entityType === "staff_members") body = `${actorName} joined the shop`;
              else if (m.entityType === "settlements") {
                const isReconcile = m.details?.startsWith("settlement reconciled");
                body = isReconcile
                  ? `${actorName} reconciled a settlement`
                  : `${actorName} completed a settlement`;
              }
              return {
                businessId,
                ownerUserId,
                type: meta.type,
                title: meta.title,
                body,
                entityType: m.entityType,
                entityId: m.entityId,
                actorName,
                amount: null,
                read: false,
              };
            });
            const createdNotifs = await tx.insert(notifications).values(notifRows as any).returning({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body });
            // Check owner preferences before sending push
            let pushPrefs: Record<string, { inApp: boolean; push: boolean }> = {};
            let quietHours = false;
            try {
              const prefs = await getPreferencesForBusiness(businessId, ownerUserId);
              if (prefs) {
                pushPrefs = prefs.preferences;
                quietHours = isInQuietHours(prefs);
              }
            } catch { /* allow push on prefs failure */ }

            for (const notif of createdNotifs) {
              const typePrefs = pushPrefs[notif.type];
              const pushAllowed = !typePrefs || typePrefs.push;
              if (!pushAllowed || quietHours) continue;

              sendPushToOwner(businessId, { title: notif.title, body: notif.body, type: notif.type, id: notif.id }).catch((pushErr) => {
                console.error("[sync] push notification failed:", pushErr);
              });
            }
          }
        }
      } catch (notifErr) {
        console.error("[sync] notification creation failed:", notifErr);
      }

      try {
        const paymentRows = (tables?.customer_transactions || [])
          .filter((row: any) => row.type === "payment" && row.customer_id);

        if (paymentRows.length > 0) {
          const customerIds = [...new Set(paymentRows.map((r: any) => Number(r.customer_id)))] as number[];
          const customerInfo = await tx
            .select({ id: customers.id, name: customers.name, displayName: customers.displayName, telegramChatId: customers.telegramChatId })
            .from(customers)
            .where(and(eq(customers.businessId, businessId), inArray(customers.id, customerIds)));

          const infoMap = new Map(customerInfo.map((c: any) => [c.id, c]));

          for (const payment of paymentRows) {
            const customerId = Number(payment.customer_id);
            const amount = Number(payment.amount) || 0;
            if (!customerId || customerId <= 0 || amount <= 0) continue;

            const cust = infoMap.get(customerId);
            const customerName = cust?.displayName || cust?.name || `Customer ${customerId}`;
            const chatId = cust?.telegramChatId || "";

            await setLastReminderSentAt(businessId, customerId, Date.now());
            await createHistoryEntry({
              shopId: businessId, customerId, chatId, balanceAtSendTime: String(amount),
              sentAt: Date.now(), status: "sent", language: "en", messageId: "payment_confirmed",
              retryCount: 0, lastAttemptAt: Date.now(), customerNameSnapshot: customerName,
            });

            if (chatId) {
              const formattedAmt = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const msg = `🏪 Gebya\n\n${customerName}, your payment of ${formattedAmt} ETB has been confirmed. Thank you! 🙏\n\nType /balance to check your account.`;
              sendTelegramTextMessage(chatId, msg).catch(() => {});
            }

            const formattedAmt = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            // Check preferences before sending push
            let pushAllowed = true;
            try {
              const prefs = await getPreferencesForBusiness(businessId);
              pushAllowed = shouldNotify(prefs, "payment_confirmed", "push") && !isInQuietHours(prefs);
            } catch { /* allow push on prefs failure */ }
            if (pushAllowed) {
              sendPushToOwner(businessId, {
                title: "Payment confirmed",
                body: `${customerName} — ${formattedAmt} ETB payment recorded and reminders stopped.`,
                type: "payment_confirmed", id: Date.now(),
              }).catch((pushErr) => {
                console.error("[sync] payment push notification failed:", pushErr);
              });
            }
          }
        }
      } catch (paymentErr) {
        console.error("[sync] payment reminder callback failed:", paymentErr);
      }
    }

    const tableKeys = ["transactions", "customers", "customer_transactions", "catalog_entries", "suppliers", "supplier_transactions", "staff_members", "settlements"];
    for (let i = 0; i < tableKeys.length; i++) {
      const key = tableKeys[i];
      const result = pushResults[i];
      if (result.count > 0 || result.conflicts.length > 0) {
        results[key] = { count: result.count, conflicts: result.conflicts.length };
        allConflicts.push(...result.conflicts);
      }
    }

    for (const key of ["settings", "analytics"] as const) {
      const rows: any[] = tables?.[key];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const capped = rows.slice(0, MAX_ROWS_PER_TABLE_PUSH);
      const mapper = key === "settings" ? mapSetting : mapAnalytics;
      const table = key === "settings" ? settings : analytics;
      // Two businesses on one phone are separate rows: keying by device+key
      // alone made the second business overwrite the first one's settings.
      const conflictCols = key === "settings" ? [settings.businessId, settings.deviceId, settings.key] : [analytics.businessId, analytics.deviceId, analytics.key];
      let count = 0;
      for (const row of capped) {
        const data: any = mapper(row, device_id);
        data.businessId = data.businessId ?? businessId;
        await tx.insert(table).values(data).onConflictDoUpdate({ target: conflictCols, set: data });
        count++;
      }
      if (count > 0) results[key] = { count, conflicts: 0 };
    }
  });

  return res.json({ ok: true, device_id, business_id: businessId, results, conflicts: allConflicts.length > 0 ? allConflicts.map((c) => ({ table: c.table, localId: c.localId, serverVersion: c.serverRecord.syncVersion, serverUpdatedAt: c.serverRecord.updatedAt })) : undefined });
});

/**
 * The single cursor the client echoes back on the next /pull.
 *
 * Every table is paged independently and each reports its own next cursor.
 * Collapsing them with Math.max() — which is what this did — silently starves
 * any table whose next page starts below the fastest table's cursor: its
 * remaining rows are never returned, and two phones end up with different
 * balances. The slowest pending cursor is the only one that is safe to advance
 * to, because every table with rows left has at most that cursor.
 *
 * Re-delivering rows from the faster tables is cheap: the client merges by
 * (device, local_id) and version, so duplicates are no-ops.
 */
export function nextPullCursor(cursors: (number | null)[], hasMore: boolean): number | null {
  if (!hasMore) return null;
  const pending = cursors.filter((c): c is number => c !== null && c !== undefined);
  if (pending.length === 0) return null;
  return Math.min(...pending);
}

/**
 * Pull is gated on membership, not on a permission: every active member may
 * download the shop's own data. See requireMembership in rbac.ts for why
 * `can_view_reports` here was a bug (revoking reports signed staff phones out
 * and stopped their sync).
 */
router.get("/pull",
  requireMembership,
  async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const { since, limit } = req.query;
  const sinceMs = since ? Number(since) : 0;
  const pullLimit = Math.min(Math.max(Number(limit) || DEFAULT_PULL_LIMIT, 1), MAX_PULL_LIMIT);

  const requestedBizId = Number(req.headers["x-business-id"]) || undefined;
  const businessId = await getBusinessForUser(userId, requestedBizId);
  if (!businessId) return res.status(403).json({ error: "No business associated with this account" });

  async function pullTable(table: any, businessIdCol: any, updatedAtCol: any) {
    const rows = await requireDb().select().from(table).where(and(eq(businessIdCol, businessId), gt(updatedAtCol, sinceMs))).orderBy(asc(updatedAtCol)).limit(pullLimit + 1);
    const hasMore = rows.length > pullLimit;
    const returnedRows = hasMore ? rows.slice(0, pullLimit) : rows;
    const nextCursor = hasMore && returnedRows.length > 0 ? returnedRows[returnedRows.length - 1].updatedAt : null;
    return { rows: returnedRows, hasMore, nextCursor };
  }

  const [txResult, custResult, custTxResult, catResult, supResult, supTxResult, staffResult, settleResult, setResult, anaResult] = await Promise.all([
    pullTable(transactions, transactions.businessId, transactions.updatedAt),
    pullTable(customers, customers.businessId, customers.updatedAt),
    pullTable(customerTransactions, customerTransactions.businessId, customerTransactions.updatedAt),
    pullTable(catalogEntries, catalogEntries.businessId, catalogEntries.updatedAt),
    pullTable(suppliers, suppliers.businessId, suppliers.updatedAt),
    pullTable(supplierTransactions, supplierTransactions.businessId, supplierTransactions.updatedAt),
    pullTable(staffMembers, staffMembers.businessId, staffMembers.updatedAt),
    pullTable(settlements, settlements.businessId, settlements.updatedAt),
    pullTable(settings, settings.businessId, settings.updatedAt),
    pullTable(analytics, analytics.businessId, analytics.updatedAt),
  ]);

  const tables = {
    transactions: txResult.rows, customers: custResult.rows, customer_transactions: custTxResult.rows,
    catalog_entries: catResult.rows, suppliers: supResult.rows, supplier_transactions: supTxResult.rows, staff_members: staffResult.rows, settlements: settleResult.rows, settings: setResult.rows, analytics: anaResult.rows,
  };

  const hasMore = txResult.hasMore || custResult.hasMore || custTxResult.hasMore || catResult.hasMore || supResult.hasMore || supTxResult.hasMore || staffResult.hasMore || settleResult.hasMore || setResult.hasMore || anaResult.hasMore;
  const nextCursor = nextPullCursor([
    txResult.nextCursor, custResult.nextCursor, custTxResult.nextCursor, catResult.nextCursor,
    supResult.nextCursor, supTxResult.nextCursor, staffResult.nextCursor, settleResult.nextCursor,
    setResult.nextCursor, anaResult.nextCursor,
  ], hasMore);

  return res.json({ ok: true, user_id: userId, business_id: businessId, since: sinceMs, pulled_at: Date.now(), tables, hasMore, nextCursor });
});

/**
 * GET /api/sync/balance-check/:customerId
 * Server-side integrity check: independently recomputes a customer's balance
 * from the immutable transaction log. Used by the client to validate that
 * the local balance matches the authoritative server-side computation.
 */
router.get("/balance-check/:customerId",
  requirePermission("can_view_reports"),
  async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Authorization required" });

  const requestedBizId = Number(req.headers["x-business-id"]) || undefined;
  const businessId = await getBusinessForUser(userId, requestedBizId);
    if (!businessId) return res.status(403).json({ error: "No business associated with this account" });

    const customerId = Number(req.params.customerId);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    // Recompute balance from immutable transaction log using shared expression
    const [result] = await requireDb()
      .select({
        balance: customerBalanceExpression(),
        transactionCount: sql<number>`COUNT(*)`,
      })
      .from(customerTransactions)
      .where(
        and(
          eq(customerTransactions.customerId, customerId),
          eq(customerTransactions.businessId, businessId)
        )
      );

    const balance = result ? Math.max(Number(result.balance) || 0, 0) : 0;
    const transactionCount = result ? Number(result.transactionCount) || 0 : 0;

    return res.json({
      ok: true,
      customer_id: customerId,
      balance,
      transaction_count: transactionCount,
      computed_at: Date.now(),
    });
  }
);

export default router;