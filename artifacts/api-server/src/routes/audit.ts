import { Router } from "express";
import { db } from "@workspace/db";
import { auditLog, businessMembers } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { verifyJwt } from "./auth.js";

const router = Router();

/**
 * GET /api/audit/violations
 * Owner can query violation attempts for their business.
 */
router.get("/violations", async (req, res) => {
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization || "";
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = String(headerValue).replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }

  const decoded = verifyJwt(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });

  // Verify requester is an owner
  const memberRows = await db
    .select({ role: businessMembers.role, businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(
      eq(businessMembers.userId, decoded.userId),
      eq(businessMembers.active, true)
    ))
    .limit(1);

  const role = memberRows[0]?.role;
  if (role !== "owner") {
    return res.status(403).json({ error: "Owner only" });
  }

  const businessIdValue = memberRows[0]?.businessId ?? null;
  if (!Number.isInteger(businessIdValue)) {
    return res.status(403).json({ error: "Business not found" });
  }
  const businessIdNum = businessIdValue as number;

  const violations = await db
    .select()
    .from(auditLog)
    .where(and(
      eq(auditLog.action, "ATTEMPTED_VIOLATION"),
      eq(auditLog.businessId, businessIdNum)
    ))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return res.json({ violations });
});

/**
 * GET /api/audit/activity
 * Owner can query business mutation activity with filters.
 * Query params:
 *   staff_member_id (optional) — filter by actor
 *   entity_type (optional) — filter by entity type (transaction, customer, credit, supplier, etc.)
 *   date_from (optional) — ISO date, defaults to start of today
 *   date_to (optional) — ISO date, defaults to now
 */
router.get("/activity", async (req, res) => {
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization || "";
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = String(headerValue).replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }

  const decoded = verifyJwt(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });

  // Verify requester is an owner
  const memberRows = await db
    .select({ role: businessMembers.role, businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(
      eq(businessMembers.userId, decoded.userId),
      eq(businessMembers.active, true)
    ))
    .limit(1);

  const role = memberRows[0]?.role;
  if (role !== "owner") {
    return res.status(403).json({ error: "Owner only" });
  }

  const businessIdValue = memberRows[0]?.businessId ?? null;
  if (!Number.isInteger(businessIdValue)) {
    return res.status(403).json({ error: "Business not found" });
  }
  const businessIdNum = businessIdValue as number;

  // Build filters
  const staffMemberIdRaw = typeof req.query.staff_member_id === "string" ? req.query.staff_member_id : undefined;
  const entityTypeRaw = typeof req.query.entity_type === "string" ? req.query.entity_type : undefined;
  const dateFromRaw = typeof req.query.date_from === "string" ? req.query.date_from : undefined;
  const dateToRaw = typeof req.query.date_to === "string" ? req.query.date_to : undefined;

  const staffMemberId = staffMemberIdRaw ? Number(staffMemberIdRaw) : null;
  const entityType = entityTypeRaw || null;

  // Default date_from to start of today in local time
  const now = new Date();
  let dateFrom: Date;
  if (dateFromRaw) {
    const parsed = new Date(dateFromRaw);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: "Invalid date_from" });
    }
    dateFrom = parsed;
  } else {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  let dateTo: Date | null = null;
  if (dateToRaw) {
    const parsed = new Date(dateToRaw);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: "Invalid date_to" });
    }
    dateTo = parsed;
  }

  const conditions: any[] = [
    eq(auditLog.businessId, businessIdNum),
    gte(auditLog.createdAt, dateFrom),
    sql`${auditLog.action} <> 'ATTEMPTED_VIOLATION'`,
  ];

  if (Number.isInteger(staffMemberId) && staffMemberId !== null) {
    conditions.push(eq(auditLog.actorStaffMemberId, staffMemberId as number));
  }
  if (entityType) {
    conditions.push(eq(auditLog.entityType, entityType));
  }
  if (dateTo) {
    conditions.push(lte(auditLog.createdAt, dateTo));
  }

  const activity = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return res.json({ activity });
});

export default router;