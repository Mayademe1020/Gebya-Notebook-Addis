import { Router } from "express";
import { db } from "@workspace/db";
import { businesses, businessMembers, invites, users } from "@workspace/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import crypto from "crypto";
import { requireRole } from "../middlewares/requireRole.js";
import { verifyJwt } from "./auth.js";

const router = Router();
const APP_BASE_URL = process.env.APP_BASE_URL || "https://gebya.app";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Default permission maps per role ───
const DEFAULT_PERMISSIONS = {
  owner:   { can_manage_team: true, can_delete_records: true, can_edit_settings: true, can_add_records: true, can_view_reports: true },
  cashier: { can_manage_team: false, can_delete_records: false, can_edit_settings: false, can_add_records: true, can_view_reports: true },
  viewer:  { can_manage_team: false, can_delete_records: false, can_edit_settings: false, can_add_records: false, can_view_reports: true },
};

function getRoleDefault(role: string) {
  return DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS] || DEFAULT_PERMISSIONS.viewer;
}

/**
 * Merge user's JSONB permissions over role defaults.
 * If permissions is null/undefined, return role defaults.
 */
function resolvePermissions(role: string, storedPermissions: any) {
  const base = getRoleDefault(role);
  if (!storedPermissions || typeof storedPermissions !== "object") return base;
  return { ...base, ...storedPermissions };
}

function getUserIdFromRequest(req: any): number | null {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return verifyJwt(token)?.userId || null;
}

async function getBusinessForUser(userId: number) {
  const rows = await db
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(eq(businessMembers.userId, userId))
    .limit(1);

  return rows[0]?.businessId ?? null;
}

async function findValidInvite(tx: any, token: string) {
  const rows = await tx
    .select({
      id: invites.id,
      businessId: invites.businessId,
      role: invites.role,
      invitedByUserId: invites.invitedByUserId,
      acceptedAt: invites.acceptedAt,
      revokedAt: invites.revokedAt,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.token, token),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date())
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

router.post("/invite", requireRole("owner"), async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const { phone_number, role } = req.body;
  if (!phone_number || typeof phone_number !== "string" || phone_number.trim().length < 6) {
    return res.status(400).json({ error: "phone_number is required" });
  }
  if (role !== "cashier" && role !== "viewer") {
    return res.status(400).json({ error: "role must be 'cashier' or 'viewer'" });
  }

  const businessId = await getBusinessForUser(userId);
  if (!businessId) return res.status(403).json({ error: "No business found" });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.insert(invites).values({
    businessId,
    invitedByUserId: userId,
    phoneNumber: phone_number.trim(),
    role,
    token,
    expiresAt,
  });

  return res.json({
    ok: true,
    invite_link: `${APP_BASE_URL}/join/${token}`,
    expires_at: expiresAt.toISOString(),
  });
});

router.post("/join/:token", async (req, res) => {
  const { token } = req.params;
  const userId = getUserIdFromRequest(req);

  const result = await db.transaction(async (tx) => {
    const invite = await findValidInvite(tx, token);
    if (!invite) {
      const existing = await tx
        .select({ acceptedAt: invites.acceptedAt, revokedAt: invites.revokedAt, expiresAt: invites.expiresAt })
        .from(invites)
        .where(eq(invites.token, token))
        .limit(1);

      if (!existing.length) return { kind: "not_found" as const };
      if (existing[0].acceptedAt) return { kind: "already_used" as const };
      if (existing[0].revokedAt) return { kind: "revoked" as const };
      if (existing[0].expiresAt && existing[0].expiresAt <= new Date()) return { kind: "expired" as const };
      return { kind: "not_found" as const };
    }

    const bizRows = await tx
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, invite.businessId))
      .limit(1);
    const businessName = bizRows[0]?.name ?? "a shop";

    if (!userId) {
      return {
        kind: "requires_auth" as const,
        businessName,
        role: invite.role,
      };
    }

    const existingMembership = await tx
      .select({ businessId: businessMembers.businessId })
      .from(businessMembers)
      .where(eq(businessMembers.userId, userId))
      .limit(1);

    if (existingMembership.length > 0) {
      if (existingMembership[0].businessId === invite.businessId) {
        await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.token, token));
        return {
          kind: "already_member" as const,
          businessName,
          role: invite.role,
        };
      }

      return { kind: "different_business" as const };
    }

    await tx.insert(businessMembers).values({
      businessId: invite.businessId,
      userId,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
      joinedAt: new Date(),
      active: true,
    });
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.token, token));

    return {
      kind: "joined" as const,
      businessName,
      role: invite.role,
    };
  });

  switch (result.kind) {
    case "not_found":
      return res.status(404).json({ error: "Invite not found" });
    case "already_used":
      return res.status(410).json({ error: "Invite already used" });
    case "revoked":
      return res.status(410).json({ error: "Invite has been revoked" });
    case "expired":
      return res.status(410).json({ error: "Invite has expired" });
    case "different_business":
      return res.status(409).json({ error: "You already belong to a different business" });
    case "requires_auth":
      return res.json({ ok: true, requires_auth: true, business_name: result.businessName, role: result.role });
    case "already_member":
      return res.json({ ok: true, already_member: true, business_name: result.businessName, role: result.role });
    case "joined":
      return res.json({ ok: true, joined: true, business_name: result.businessName, role: result.role });
  }
});

router.get("/members", requireRole("owner"), async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const businessId = await getBusinessForUser(userId);
  if (!businessId) return res.status(403).json({ error: "No business found" });

  const rows = await db
    .select({
      id: businessMembers.id,
      userId: businessMembers.userId,
      name: users.phoneNumber,
      phone: users.phoneNumber,
      phoneNumber: users.phoneNumber,
      role: businessMembers.role,
      permissions: businessMembers.permissions,
      joined_at: businessMembers.joinedAt,
      joinedAt: businessMembers.joinedAt,
      active: businessMembers.active,
    })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, businessId));

  const members = rows.map((m) => ({
    ...m,
    resolved_permissions: resolvePermissions(m.role, m.permissions),
  }));

  return res.json({ ok: true, members });
});

router.patch("/members/:userId/permissions", requireRole("owner"), async (req, res) => {
  const ownerId = getUserIdFromRequest(req);
  if (!ownerId) return res.status(401).json({ error: "Authorization required" });

  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  // Don't let owner edit their own permissions (owner is always full access)
  if (targetUserId === ownerId) {
    return res.status(403).json({ error: "Cannot modify owner permissions" });
  }

  const businessId = await getBusinessForUser(ownerId);
  if (!businessId) return res.status(403).json({ error: "No business found" });

  // Verify target is a member of this business
  const targetRows = await db
    .select({ id: businessMembers.id, role: businessMembers.role, permissions: businessMembers.permissions })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, targetUserId)))
    .limit(1);

  if (!targetRows.length) {
    return res.status(404).json({ error: "Member not found in this business" });
  }

  const { role, permissions: existingPermissions } = targetRows[0];
  const current = resolvePermissions(role, existingPermissions);
  const incoming = req.body as Record<string, unknown>;

  // Normalize existing permissions to a record for safe indexing
  const existingPerms = (existingPermissions ?? {}) as Record<string, boolean>;

  // Only accept known permission keys
  const allowedKeys = Object.keys(current);
  const nextPermissions: Record<string, boolean> = {};
  for (const key of allowedKeys) {
    if (incoming[key] !== undefined && typeof incoming[key] === "boolean") {
      nextPermissions[key] = incoming[key] as boolean;
    } else if (existingPerms[key] !== undefined) {
      nextPermissions[key] = existingPerms[key];
    }
  }

  // Upsert: if next matches role defaults, store NULL (clean state)
  const defaults = getRoleDefault(role);
  let permissionsToStore: any = nextPermissions;
  const matchesDefaults = Object.keys(nextPermissions).every(
    (k) => nextPermissions[k] === (defaults as any)[k]
  );
  if (matchesDefaults) {
    permissionsToStore = null;
  }

  await db
    .update(businessMembers)
    .set({ permissions: permissionsToStore })
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, targetUserId)));

  return res.json({ ok: true, permissions: nextPermissions });
});

export default router;
