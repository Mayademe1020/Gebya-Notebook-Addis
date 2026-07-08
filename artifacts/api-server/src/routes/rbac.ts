import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { businessMembers } from "@workspace/db/schema";
import { auditLog } from "@workspace/db/schema/audit_log";
import { eq, and, sql } from "drizzle-orm";

type PermissionKey = "can_add_records" | "can_delete_records" | "can_edit_settings" | "can_view_reports";

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

  const memberRows = await db
    .select({
      role: businessMembers.role,
      permissions: businessMembers.permissions,
      businessId: businessMembers.businessId,
    })
    .from(businessMembers)
    .where(and(
      eq(businessMembers.userId, decoded.userId),
      eq(businessMembers.active, true)
    ))
    .limit(1);

  const member = memberRows[0];
  if (!member) return null;

  const perms = member.permissions || {};
  const defaults: Record<string, boolean> = {
    can_manage_team: member.role === "owner",
    can_delete_records: member.role === "owner",
    can_edit_settings: member.role === "owner",
    can_add_records: false,
    can_view_reports: true,
  };

  return {
    userId: decoded.userId,
    businessId: member.businessId,
    role: member.role,
    permissions: { ...defaults, ...perms },
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
      await db.insert(auditLog).values({
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