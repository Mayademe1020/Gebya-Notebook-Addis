import { Request, Response, NextFunction } from "express";
import { requireDb } from "@workspace/db";
import { businessMembers } from "@workspace/db/schema";
import { auditLog } from "@workspace/db/schema/audit_log";
import { resolvePermissions } from "@workspace/db/schema/permission-defaults";
import { eq, and, sql } from "drizzle-orm";

type PermissionKey = "can_manage_team" | "can_delete_records" | "can_edit_settings" | "can_add_records" | "can_view_reports";

export interface DeviceContext {
  userId: number;
  businessId: number;
  role: string;
  permissions: Record<string, boolean>;
}

/**
 * Extract JWT token from Authorization header and return device context
 * or null if invalid. Works with the existing auth.ts JWT system.
 */
export async function requireDeviceContext(req: Request): Promise<DeviceContext | null> {
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization || "";
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = String(headerValue).replace(/^Bearer\s+/i, "");
  if (!token) return null;

  // Reuse verifyJwt from auth routes
  const { verifyJwt } = await import("./auth.js");
  const decoded = verifyJwt(token);
  if (!decoded || !decoded.userId) return null;

  // Optional x-business-id header: if present, verify membership for that specific business.
  // If absent, fall back to first active membership (backward compat for single-business clients).
  const bizHeader = (req.headers as any)["x-business-id"] || (req.headers as any)["X-Business-Id"];
  const requestedBizId = bizHeader ? Number(bizHeader) : null;

  const filters: any[] = [
    eq(businessMembers.userId, decoded.userId),
    eq(businessMembers.active, true),
  ];

  if (requestedBizId && Number.isInteger(requestedBizId)) {
    filters.push(eq(businessMembers.businessId, requestedBizId));
  }

  const memberRows = await requireDb().select({
      role: businessMembers.role,
      permissions: businessMembers.permissions,
      businessId: businessMembers.businessId,
    })
    .from(businessMembers)
    .where(and(...filters))
    .limit(1);

  const member = memberRows[0];
  if (!member) return null;

  const permissions = resolvePermissions(member.role, member.permissions);

  return {
    userId: decoded.userId,
    businessId: member.businessId,
    role: member.role,
    permissions,
  };
}

/**
 * RBAC middleware factory.
 * Requires `requiredPermission`. Owners always pass.
 * On violation, logs to audit_log and returns 403.
 */
export function requirePermission(requiredPermission: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = await requireDeviceContext(req);

    if (!ctx) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Owners automatically pass all checks
    if (ctx.role === "owner") {
      (req as any).deviceContext = ctx;
      next();
      return;
    }

    const allowed = ctx.permissions[requiredPermission] === true;
    if (!allowed) {
      // Log violation attempt
      await requireDb().insert(auditLog).values({
        businessId: ctx.businessId,
        actorStaffMemberId: sql`NULL`,
        actorDeviceId: sql`NULL`,
        action: "ATTEMPTED_VIOLATION",
        entityType: (req as any).rbacEntityType || "unknown",
        blockedPermission: requiredPermission,
        details: `${req.method} ${req.originalUrl || req.url}`,
      });

      res.status(403).json({ error: "Permission denied", missing_permission: requiredPermission, hint: "Contact your shop owner to grant access" });
      return;
    }

    // Attach context for downstream handlers
    (req as any).deviceContext = ctx;
    next();
  };
}

/**
 * Membership gate for routes every active member of the shop may use
 * (currently /sync/pull).
 *
 * Downloading the shop's own data is not a reporting action. Gating pull on
 * `can_view_reports` meant an owner switching that toggle off — a normal
 * privacy action — made the staff phone's pull return 403; the client read
 * every 403 as a dead session, deleted its token and stopped syncing its own
 * sales. Membership is the only requirement for receiving the data the phone
 * is already allowed to write.
 *
 * Status codes are deliberate: a missing or expired token is 401 (the client
 * refreshes once and only then may sign out), while a valid token with no
 * active membership is 403 — the session is alive, the person is simply not
 * in this shop, so the client keeps its token and its local rows.
 */
export async function requireMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = await requireDeviceContext(req);

  if (ctx) {
    (req as any).deviceContext = ctx;
    next();
    return;
  }

  // requireDeviceContext returns null both for an invalid token and for a
  // valid token with no active membership. Only the former is a session
  // problem; tell them apart so a removed staff member is not signed out
  // (and cannot mistake a network blip for a revocation).
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization || "";
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = String(headerValue).replace(/^Bearer\s+/i, "");
  const { verifyJwt } = await import("./auth.js");
  const decoded = token ? verifyJwt(token) : null;

  if (!decoded || !decoded.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // No business id, no table, no row count: nothing about the shop leaks.
  res.status(403).json({
    error: "Not a member of this business",
    hint: "Ask the shop owner to add this phone to the shop",
  });
}

/**
 * Helper: require that context is present and matches the business being accessed.
 * Use on parameterized routes like /shops/:shop_id/...
 */
export function requireShopMatch(paramName = "shop_id") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = (req as any).deviceContext as DeviceContext | undefined;
    if (!ctx) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const shopId = Number(req.params[paramName]);
    if (!Number.isInteger(shopId) || shopId !== ctx.businessId) {
      res.status(403).json({ error: "Forbidden: not authorized for this shop" });
      return;
    }
    next();
  };
}

/**
 * Verify the shopId from body / query / x-shop-id header matches the
 * authenticated user's businessId.  If req.deviceContext is already set
 * (e.g. by requirePermission) it is used directly; otherwise the function
 * calls requireDeviceContext to authenticate on-the-fly.
 */
export async function verifyShopOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  let ctx = (req as any).deviceContext as DeviceContext | null;

  if (!ctx) {
    ctx = await requireDeviceContext(req);
    if (!ctx) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const shopId =
    Number(req.body?.shopId) ||
    Number(req.query?.shopId) ||
    Number(req.headers?.["x-shop-id"]) ||
    0;

  if (!Number.isInteger(shopId) || shopId <= 0) {
    res.status(400).json({ error: "Missing or invalid shopId" });
    return;
  }

  if (shopId !== ctx.businessId) {
    res.status(403).json({ error: "Forbidden: not authorized for this shop" });
    return;
  }

  next();
}