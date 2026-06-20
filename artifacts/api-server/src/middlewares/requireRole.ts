import { db } from "@workspace/db";
import { businessMembers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyJwt } from "../routes/auth.js";

function getUserIdFromRequest(req: any): number | null {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return verifyJwt(token)?.userId || null;
}

/**
 * Middleware that enforces role-based access.
 * Usage: router.delete("/something", requireRole("owner"), handler)
 *
 * Phase 3 — apply to:
 *   - DELETE /sync/record (when added)
 *   - POST /business/invite
 *   - DELETE /business/members/:id
 */
export function requireRole(...roles: string[]) {
  return async (req: any, res: any, next: any) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Authorization required" });

    const rows = await db
      .select({ role: businessMembers.role })
      .from(businessMembers)
      .where(eq(businessMembers.userId, userId))
      .limit(1);

    if (!rows.length || !roles.includes(rows[0].role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}
