import { Router } from "express";
import { db } from "@workspace/db";
import { businesses, businessMembers, invites, users } from "@workspace/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import crypto from "crypto";
import { requireRole } from "../middlewares/requireRole.js";
import { verifyJwt } from "./auth.js";
import { resolvePermissions, getRoleDefault } from "@workspace/db/schema/permission-defaults";

const router = Router();
const APP_BASE_URL = process.env.APP_BASE_URL || "https://gebya.app";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getUserIdFromRequest(req: any): number | null {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return verifyJwt(token)?.userId || null;
}

async function getBusinessForUser(userId: number, businessId?: number) {
    const filters: any[] = [eq(businessMembers.userId, userId)];
    if (businessId) filters.push(eq(businessMembers.businessId, businessId));
    const rows = await db
      .select({ businessId: businessMembers.businessId, displayName: businessMembers.displayName })
      .from(businessMembers)
      .where(and(...filters))
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
        staffName: invites.staffName,
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

  const { phone_number, role, staff_name } = req.body;
  if (!phone_number || typeof phone_number !== "string" || phone_number.trim().length < 6) {
    return res.status(400).json({ error: "phone_number is required" });
  }
  if (!["cashier", "viewer", "manager", "trusted_staff"].includes(role)) {
    return res.status(400).json({ error: "role must be 'cashier', 'viewer', 'manager', or 'trusted_staff'" });
  }

  const businessId = await getBusinessForUser(userId);
  if (!businessId) return res.status(403).json({ error: "No business found" });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.insert(invites).values({
    businessId,
    invitedByUserId: userId,
    phoneNumber: phone_number.trim(),
    staffName: staff_name?.trim() || null,
    role,
    token,
    expiresAt,
  });

  return res.json({
    ok: true,
    invite_link: `${APP_BASE_URL}/join/${token}`,
    invite_token: token,
    expires_at: expiresAt.toISOString(),
  });
});

router.get("/invites/pending", requireRole("owner", "manager"), async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });
  const businessId = await getBusinessForUser(userId);
  if (!businessId) return res.status(403).json({ error: "No business found" });
  const rows = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.businessId, businessId),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date())
      )
    )
    .orderBy(invites.createdAt);
  return res.json({ ok: true, pending: rows });
});

router.get("/invites/pending-for-me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.json({ ok: true, pending: [] });
  const userRows = await db
    .select({ phone: users.phoneNumber })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRows.length) return res.json({ ok: true, pending: [] });
  const phone = userRows[0].phone;
  const rows = await db
    .select({
      id: invites.id,
      businessId: invites.businessId,
      staffName: invites.staffName,
      token: invites.token,
      role: invites.role,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.phoneNumber, phone),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        isNull(invites.declinedAt),
        gt(invites.expiresAt, new Date())
      )
    )
    .limit(5);
  const enriched = await Promise.all(
    rows.map(async (inv) => {
      const biz = await db
        .select({ name: businesses.name })
        .from(businesses)
        .where(eq(businesses.id, inv.businessId))
        .limit(1);
      return { ...inv, business_name: biz[0]?.name || "a shop" };
    })
  );
  return res.json({ ok: true, pending: enriched });
});

router.post("/invites/:inviteId/accept", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });
  const inviteId = Number(req.params.inviteId);
  if (!Number.isFinite(inviteId)) return res.status(400).json({ error: "Invalid inviteId" });
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, inviteId))
      .limit(1);
    if (!rows.length) return { kind: "not_found" };
    const inv = rows[0];
    if (inv.acceptedAt) return { kind: "already_used" };
    if (inv.revokedAt) return { kind: "revoked" };
    if (inv.declinedAt) return { kind: "declined" };
    if (inv.expiresAt && inv.expiresAt <= new Date()) return { kind: "expired" };
    const existingBizIds = await tx
      .select({ businessId: businessMembers.businessId })
      .from(businessMembers)
      .where(eq(businessMembers.userId, userId));
    const existingInThis = existingBizIds.find((m) => m.businessId === inv.businessId);
    if (existingInThis) {
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inviteId));
      const biz = await tx
        .select({ name: businesses.name })
        .from(businesses)
        .where(eq(businesses.id, inv.businessId))
        .limit(1);
      return { kind: "already_member", businessName: biz[0]?.name || "a shop" };
    }
    await tx.insert(businessMembers).values({
      businessId: inv.businessId,
      userId,
      displayName: inv.staffName || null,
      role: inv.role,
      invitedByUserId: inv.invitedByUserId,
      joinedAt: new Date(),
      active: true,
    });
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inviteId));
    const biz = await tx
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, inv.businessId))
      .limit(1);
    return { kind: "joined", businessName: biz[0]?.name || "a shop", role: inv.role };
  });
  if (result.kind === "not_found") return res.status(404).json({ error: "Invite not found" });
  if (result.kind === "already_used") return res.status(410).json({ error: "Invite already accepted" });
  if (result.kind === "revoked") return res.status(410).json({ error: "Invite has been revoked" });
  if (result.kind === "declined") return res.status(410).json({ error: "Invite already declined" });
  if (result.kind === "expired") return res.status(410).json({ error: "Invite has expired" });
  return res.json({ ok: true, joined: true, business_name: result.businessName });
});

router.post("/invites/:inviteId/decline", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });
  const inviteId = Number(req.params.inviteId);
  if (!Number.isFinite(inviteId)) return res.status(400).json({ error: "Invalid inviteId" });
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1);
  if (!rows.length) return res.status(404).json({ error: "Invite not found" });
  const inv = rows[0];
  if (inv.acceptedAt) return res.status(410).json({ error: "Already accepted" });
  if (inv.revokedAt) return res.status(410).json({ error: "Invite was revoked" });
  if (inv.declinedAt) return res.status(410).json({ error: "Already declined" });
  await db.update(invites).set({ declinedAt: new Date() }).where(eq(invites.id, inviteId));
  return res.json({ ok: true });
});

router.delete("/invites/:inviteId", requireRole("owner", "manager"), async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });
  const inviteId = Number(req.params.inviteId);
  if (!Number.isFinite(inviteId)) return res.status(400).json({ error: "Invalid inviteId" });
  const businessId = await getBusinessForUser(userId);
  if (!businessId) return res.status(403).json({ error: "No business found" });
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.businessId, businessId)))
    .limit(1);
  if (!rows.length) return res.status(404).json({ error: "Invite not found" });
  const inv = rows[0];
  if (inv.acceptedAt) return res.status(410).json({ error: "Invite already accepted" });
  if (inv.revokedAt) return res.status(410).json({ error: "Invite already revoked" });
  await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, inviteId));
  return res.json({ ok: true });
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
      .where(eq(businessMembers.userId, userId));

    const alreadyInThisBiz = existingMembership.some((m) => m.businessId === invite.businessId);
    if (alreadyInThisBiz) {
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.token, token));
      return {
        kind: "already_member" as const,
        businessName,
        role: invite.role,
      };
    }

    await tx.insert(businessMembers).values({
      businessId: invite.businessId,
      userId,
      displayName: invite.staffName || null,
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
    case "requires_auth":
      return res.json({ ok: true, requires_auth: true, business_name: result.businessName, role: result.role });
    case "already_member":
      return res.json({ ok: true, already_member: true, business_name: result.businessName, role: result.role });
    case "joined":
      return res.json({ ok: true, joined: true, business_name: result.businessName, role: result.role });
  }
});

router.get("/members", requireRole("owner", "manager"), async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const businessId = await getBusinessForUser(userId);
  if (!businessId) return res.status(403).json({ error: "No business found" });

  const rows = await db
    .select({
      id: businessMembers.id,
      userId: businessMembers.userId,
      displayName: businessMembers.displayName,
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
    name: m.displayName || m.phoneNumber,
    resolved_permissions: resolvePermissions(m.role, m.permissions),
  }));

  return res.json({ ok: true, members });
});

router.patch("/members/:userId/permissions", requireRole("owner", "manager"), async (req, res) => {
  const ownerId = getUserIdFromRequest(req);
  if (!ownerId) return res.status(401).json({ error: "Authorization required" });

    const targetUserId = Number(String(req.params.userId));
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
