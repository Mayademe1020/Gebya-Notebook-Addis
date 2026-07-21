/**
 * Platform Admin Dashboard — API Routes
 *
 * Endpoints:
 *   GET  /admin/overview    — aggregate metrics
 *   GET  /admin/shops       — shop health table
 *   GET  /admin/features    — feature adoption
 *   POST /admin/broadcast   — send notification to all shops
 *   POST /admin/push-all    — send push to all subscribed devices
 *   GET  /admin/export-shops — CSV export
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  users,
  businesses,
  businessMembers,
  devices,
  transactions,
  customers,
  customerTransactions,
  suppliers,
  supplierTransactions,
  staffMembers,
  snapshots,
  otps,
  invites,
  notifications,
  pushSubscriptions,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyJwt } from "./auth.js";

const router = Router();

async function requireAdmin(req: any) {
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization || "";
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = String(headerValue).replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const decoded = verifyJwt(token);
  if (!decoded || !decoded.userId) return null;
  const memberRows = await db
    .select({ role: businessMembers.role, businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, decoded.userId), eq(businessMembers.active, true)))
    .limit(1);
  if (!memberRows.length || memberRows[0].role !== "owner") return null;
  return { userId: decoded.userId, businessId: memberRows[0].businessId };
}

function daysAgo(n: number): number { return Date.now() - n * 24 * 60 * 60 * 1000; }
function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return "****" + digits.slice(-4);
}

// ─── GET /admin/overview ────────────────────────────────────────────────
router.get("/overview", async (req, res) => {
  const ctx = await requireAdmin(req);
  if (!ctx) return res.status(401).json({ error: "Admin access required" });
  const now = Date.now();
  const sevenDaysAgo = daysAgo(7);
  const oneDayAgo = daysAgo(1);

  const [allUsers, allBusinesses, allDevices, allTransactions, allCustomers, allCustomerTransactions, allStaffMembers, allInvites, allOtps, allSnapshots] = await Promise.all([
    db.select().from(users), db.select().from(businesses), db.select().from(devices),
    db.select().from(transactions), db.select().from(customers), db.select().from(customerTransactions),
    db.select().from(staffMembers), db.select().from(invites), db.select().from(otps), db.select().from(snapshots),
  ]);

  const totalSales = allTransactions.filter(t => t.type === "sale").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalCredit = allCustomerTransactions.filter(t => t.type === "credit_add").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const shopsWithTxn = new Set(allTransactions.map(t => t.businessId).filter(Boolean));
  const shopsActiveWeek = new Set(allTransactions.filter(t => (t.createdAt || 0) >= sevenDaysAgo).map(t => t.businessId).filter(Boolean));
  const shopsActiveToday = new Set(allTransactions.filter(t => (t.createdAt || 0) >= oneDayAgo).map(t => t.businessId).filter(Boolean));

  const otpGroups: Record<string, { attempts: number; consumed: number }> = {};
  for (const otp of allOtps) {
    const key = otp.phoneNumber;
    if (!otpGroups[key]) otpGroups[key] = { attempts: 0, consumed: 0 };
    otpGroups[key].attempts += otp.attempts || 0;
    if (otp.consumed) otpGroups[key].consumed += 1;
  }
  const avgOtpRetries = Object.values(otpGroups).length > 0
    ? (Object.values(otpGroups).reduce((s, g) => s + g.attempts, 0) / Object.values(otpGroups).length).toFixed(1) : "0";
  const inviteAccepted = allInvites.filter(i => i.acceptedAt).length;

  const totalRepaid = allCustomerTransactions.filter(t => t.type === "payment").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const customerBalances: Record<number, { credit: number; paid: number; dueDate: number | null }> = {};
  for (const ct of allCustomerTransactions) {
    const cid = ct.customerId;
    if (!cid) continue;
    if (!customerBalances[cid]) customerBalances[cid] = { credit: 0, paid: 0, dueDate: null };
    if (ct.type === "credit_add") customerBalances[cid].credit += Number(ct.amount) || 0;
    if (ct.type === "payment") customerBalances[cid].paid += Number(ct.amount) || 0;
    if (ct.dueDate && (!customerBalances[cid].dueDate || ct.dueDate > customerBalances[cid].dueDate!)) customerBalances[cid].dueDate = ct.dueDate;
  }
  const overdueExposure = Object.values(customerBalances).filter(b => b.dueDate && b.dueDate < now && b.credit - b.paid > 0).reduce((s, b) => s + (b.credit - b.paid), 0);

  const shopsWithStaff = new Set(allStaffMembers.filter(s => s.businessId).map(s => s.businessId));
  const totalActiveStaff = allStaffMembers.filter(s => s.active !== false).length;
  const telegramLinked = allCustomers.filter(c => c.telegramChatId).length;

  const latestBackups: Record<number, { sizeBytes: number; createdAt: number }> = {};
  for (const snap of allSnapshots) {
    const uid = snap.userId;
    if (!latestBackups[uid] || (snap.createdAt || 0) > latestBackups[uid].createdAt) latestBackups[uid] = { sizeBytes: snap.sizeBytes || 0, createdAt: snap.createdAt || 0 };
  }
  const staleDevices = allDevices.filter(d => { const ls = d.lastSeenAt?.getTime?.() || 0; return ls > 0 && ls < sevenDaysAgo; }).length;

  const growthTimeline: { date: string; shops: number; users: number; transactions: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - i);
    const dayMs = dayStart.getTime(); const nextDayMs = dayMs + 86400000;
    growthTimeline.push({
      date: dayStart.toISOString().split("T")[0],
      shops: allBusinesses.filter(b => { const t = b.createdAt?.getTime?.() || 0; return t >= dayMs && t < nextDayMs; }).length,
      users: allUsers.filter(u => { const t = u.createdAt?.getTime?.() || 0; return t >= dayMs && t < nextDayMs; }).length,
      transactions: allTransactions.filter(t => { const ct = t.createdAt || 0; return ct >= dayMs && ct < nextDayMs; }).length,
    });
  }

  return res.json({
    ok: true, generatedAt: new Date().toISOString(),
    platformNumbers: { shops: allBusinesses.length, users: allUsers.length, devices: allDevices.length, transactions: allTransactions.length, totalSalesBirr: totalSales, totalCreditBirr: totalCredit },
    onboardingFunnel: { registered: allUsers.length, createdShop: allBusinesses.length, madeFirstTxn: shopsWithTxn.size, activeWeek: shopsActiveWeek.size, activeToday: shopsActiveToday.size },
    onboardingQuality: { avgOtpRetries: Number(avgOtpRetries), inviteSent: allInvites.length, inviteAccepted, inviteAcceptRate: allInvites.length > 0 ? Math.round((inviteAccepted / allInvites.length) * 100) : 0, deviceTotal: allDevices.length },
    creditOverview: { totalExtended: totalCredit, totalRepaid, recoveryRate: totalCredit > 0 ? Math.round((totalRepaid / totalCredit) * 100) : 0, outstandingBalance: totalCredit - totalRepaid, overdueExposure, uniqueCreditCustomers: Object.keys(customerBalances).length },
    staffAdoption: { shopsWithMultiStaff: shopsWithStaff.size, totalActiveStaff, avgStaffPerShop: allBusinesses.length > 0 ? (totalActiveStaff / allBusinesses.length).toFixed(1) : "0" },
    deliveryHealth: { telegramLinked, telegramAdoptionRate: allCustomers.length > 0 ? Math.round((telegramLinked / allCustomers.length) * 100) : 0 },
    backupHealth: { shopsBackedUp: Object.keys(latestBackups).length, shopsNeverBackedUp: allUsers.length - Object.keys(latestBackups).length, backupRate: allUsers.length > 0 ? Math.round((Object.keys(latestBackups).length / allUsers.length) * 100) : 0 },
    systemHealth: { staleDevices, totalDevices: allDevices.length },
    growthTimeline,
  });
});

// ─── GET /admin/shops ──────────────────────────────────────────────────
router.get("/shops", async (req, res) => {
  const ctx = await requireAdmin(req);
  if (!ctx) return res.status(401).json({ error: "Admin access required" });
  const sevenDaysAgo = daysAgo(7);
  const [allBusinesses, allTransactions, allUsers, allCustomerTransactions] = await Promise.all([
    db.select().from(businesses), db.select().from(transactions), db.select().from(users), db.select().from(customerTransactions),
  ]);
  const shopStats = allBusinesses.map(biz => {
    const bizTxns = allTransactions.filter(t => t.businessId === biz.id);
    const bizCustTxns = allCustomerTransactions.filter(t => t.businessId === biz.id);
    const user = allUsers.find(u => u.id === biz.ownerUserId);
    const lastTxn = bizTxns.length > 0 ? Math.max(...bizTxns.map(t => t.createdAt || 0)) : null;
    const totalSales = bizTxns.filter(t => t.type === "sale").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalCredit = bizCustTxns.filter(t => t.type === "credit_add").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const outstanding = bizCustTxns.filter(t => t.type === "credit_add").reduce((s, t) => s + (Number(t.amount) || 0), 0) - bizCustTxns.filter(t => t.type === "payment").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    let status: "active" | "dormant" | "new" = "new";
    if (lastTxn && lastTxn >= sevenDaysAgo) status = "active"; else if (lastTxn) status = "dormant";
    return { id: biz.id, name: biz.name, ownerPhone: maskPhone(user?.phoneNumber || null), createdAt: biz.createdAt?.toISOString() || null, lastTransactionAt: lastTxn ? new Date(lastTxn).toISOString() : null, totalTransactions: bizTxns.length, totalSalesBirr: totalSales, totalCreditBirr: totalCredit, outstandingBirr: Math.max(outstanding, 0), status };
  });
  shopStats.sort((a, b) => { if (!a.lastTransactionAt && !b.lastTransactionAt) return 0; if (!a.lastTransactionAt) return 1; if (!b.lastTransactionAt) return -1; return new Date(b.lastTransactionAt).getTime() - new Date(a.lastTransactionAt).getTime(); });
  return res.json({ ok: true, shops: shopStats });
});

// ─── GET /admin/features ───────────────────────────────────────────────
router.get("/features", async (req, res) => {
  const ctx = await requireAdmin(req);
  if (!ctx) return res.status(401).json({ error: "Admin access required" });
  const [allTransactions, allCustomerTransactions, allSupplierTransactions, allCustomers] = await Promise.all([
    db.select().from(transactions), db.select().from(customerTransactions), db.select().from(supplierTransactions), db.select().from(customers),
  ]);
  const shopsUsing = {
    credit: new Set(allCustomerTransactions.map(t => t.businessId).filter(Boolean)),
    suppliers: new Set(allSupplierTransactions.map(t => t.businessId).filter(Boolean)),
    telegram: new Set(allCustomers.filter(c => c.telegramChatId).map(c => c.businessId).filter(Boolean)),
  };
  const paymentMethods: Record<string, number> = {};
  for (const t of allTransactions) { const m = t.paymentType || "cash"; paymentMethods[m] = (paymentMethods[m] || 0) + 1; }
  const txnTypes: Record<string, number> = {};
  for (const t of allTransactions) { txnTypes[t.type] = (txnTypes[t.type] || 0) + 1; }
  const sources: Record<string, number> = {};
  for (const t of allTransactions) { const s = t.source || "manual"; sources[s] = (sources[s] || 0) + 1; }
  return res.json({ ok: true, features: { shopsUsingCredit: shopsUsing.credit.size, shopsUsingSuppliers: shopsUsing.suppliers.size, shopsUsingTelegram: shopsUsing.telegram.size }, paymentMethods, transactionTypes: txnTypes, sources });
});

// ─── POST /admin/broadcast ─────────────────────────────────────────────
router.post("/broadcast", async (req, res) => {
  const ctx = await requireAdmin(req);
  if (!ctx) return res.status(401).json({ error: "Admin access required" });
  const { title, body, type } = req.body;
  if (!title || typeof title !== "string" || !body || typeof body !== "string") return res.status(400).json({ error: "title and body are required" });
  const ownerMembers = await db.select({ userId: businessMembers.userId, businessId: businessMembers.businessId }).from(businessMembers).where(and(eq(businessMembers.role, "owner"), eq(businessMembers.active, true)));
  if (ownerMembers.length === 0) return res.json({ ok: true, sent: 0, message: "No active shops found" });
  let sent = 0;
  for (const member of ownerMembers) {
    try {
      await db.insert(notifications).values({ businessId: member.businessId, ownerUserId: member.userId, type: type || "announcement", title: title.slice(0, 255), body, read: false });
      sent++;
    } catch (err) { console.error("[admin:broadcast] failed for user", member.userId, err); }
  }
  return res.json({ ok: true, sent, total: ownerMembers.length });
});

// ─── POST /admin/push-all ──────────────────────────────────────────────
router.post("/push-all", async (req, res) => {
  const ctx = await requireAdmin(req);
  if (!ctx) return res.status(401).json({ error: "Admin access required" });
  const { title, body } = req.body;
  if (!title || typeof title !== "string" || !body || typeof body !== "string") return res.status(400).json({ error: "title and body are required" });
  const { sendPushToOwner } = await import("../services/pushNotificationSender.js");
  const subs = await db.select({ businessId: pushSubscriptions.businessId }).from(pushSubscriptions);
  const uniqueBusinessIds = [...new Set(subs.map(s => s.businessId))];
  let totalSent = 0; let totalFailed = 0;
  for (const businessId of uniqueBusinessIds) {
    try { const result = await sendPushToOwner(businessId, { title, body, type: "announcement", id: 0 }); totalSent += result.sent; totalFailed += result.failed; } catch { totalFailed++; }
  }
  return res.json({ ok: true, sent: totalSent, failed: totalFailed, businesses: uniqueBusinessIds.length });
});

// ─── GET /admin/export-shops ────────────────────────────────────────────
router.get("/export-shops", async (req, res) => {
  const ctx = await requireAdmin(req);
  if (!ctx) return res.status(401).json({ error: "Admin access required" });
  const sevenDaysAgo = daysAgo(7);
  const [allBusinesses, allTransactions, allUsers, allCustomerTransactions, allStaffMembers] = await Promise.all([
    db.select().from(businesses), db.select().from(transactions), db.select().from(users), db.select().from(customerTransactions), db.select().from(staffMembers),
  ]);
  const csvRows = ["Shop Name,Owner Phone,Created,Last Transaction,Total Txns,Total Sales (birr),Total Credit (birr),Outstanding (birr),Staff Count,Status"];
  for (const biz of allBusinesses) {
    const bizTxns = allTransactions.filter(t => t.businessId === biz.id);
    const bizCustTxns = allCustomerTransactions.filter(t => t.businessId === biz.id);
    const bizStaff = allStaffMembers.filter(s => s.businessId === biz.id);
    const user = allUsers.find(u => u.id === biz.ownerUserId);
    const lastTxn = bizTxns.length > 0 ? Math.max(...bizTxns.map(t => t.createdAt || 0)) : null;
    const totalSales = bizTxns.filter(t => t.type === "sale").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalCredit = bizCustTxns.filter(t => t.type === "credit_add").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalPaid = bizCustTxns.filter(t => t.type === "payment").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    let status = "new"; if (lastTxn && lastTxn >= sevenDaysAgo) status = "active"; else if (lastTxn) status = "dormant";
    csvRows.push(`"${(biz.name || "").replace(/"/g, '""')}","${user?.phoneNumber || ""}","${biz.createdAt?.toISOString()?.split("T")[0] || ""}","${lastTxn ? new Date(lastTxn).toISOString()?.split("T")[0] : ""}",${bizTxns.length},${totalSales},${totalCredit},${Math.max(totalCredit - totalPaid, 0)},${bizStaff.length},${status}`);
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="gebya-shops-${new Date().toISOString().split("T")[0]}.csv"`);
  return res.send(csvRows.join("\n"));
});

export default router;
