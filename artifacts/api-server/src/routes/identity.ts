// Shop Sync v1 identity routes.
//
// Express router mounted at /api. The handlers depend on the in-memory
// store defined in `@workspace/db/schema/store` so the slice can be
// exercised end-to-end without a running Postgres. The shape of the
// store records matches the Drizzle row types in
// `@workspace/db/schema/shops`, so swapping the store for Drizzle
// queries in production is a one-line change per call site.
//
// Reference: spec sections D–M (PR 1A scope).

import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { z, ZodError } from "zod";
import {
  store,
  permissionsFor,
  type StoredShop,
  type StoredStaff,
  type StoredDevice,
} from "@workspace/db/schema";
import {
  CreateShopBody,
  JoinShopBody,
  UpdateShopSettingsBody,
  UpdateStaffPermissionsBody,
  RejectDeviceBody,
  RevokeDeviceBody,
  type CreateShopBodyT,
  type JoinShopBodyT,
} from "@workspace/api-zod/identity";
import { normalizePhone } from "@workspace/db/schema";

const router = Router();

/** Pull the bearer token from the Authorization header. */
function getToken(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Hash a device token to look it up in the store. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Pull a single string path param (Express 5 params can be string|string[]). */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

/** Build a deep link to the staff join screen from a code. */
function buildJoinUrl(joinCode: string): string {
  // We rely on the public host at runtime via env. For now, return a path.
  return `/join?c=${encodeURIComponent(joinCode)}`;
}

/** Convert Date to ISO string. */
function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Validate body and return parsed value, or send 400 and return null. */
function parseBody<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({
      error: "Validation failed",
      details: result.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// POST /api/shops — owner creates a shop
// ---------------------------------------------------------------------------
router.post("/shops", (req: Request, res: Response) => {
  const body = parseBody<CreateShopBodyT>(CreateShopBody, req.body, res);
  if (!body) return;

  const owner = store.createUser({
    displayName: body.display_name,
    phone: body.phone ?? null,
  });
  const shop = store.createShop({
    name: body.display_name,
    ownerUserId: owner.id,
    phoneRequired: body.phone_required ?? false,
    approvalRequired: body.approval_required ?? false,
  });
  const ownerStaff = store.createOwnerStaff({
    shopId: shop.id,
    userId: owner.id,
  });
  const { token, tokenHash } = store.issueDeviceToken();
  const device = store.createDevice({
    shopId: shop.id,
    staffId: ownerStaff.id,
    deviceLabel: "Owner's phone",
    platform: "web",
    tokenHash,
    deviceStatus: "active",
  });

  const permissions = permissionsFor(ownerStaff);
  res.status(201).json({
    shop_id: shop.id,
    shop_name: shop.name,
    join_code: shop.joinCode,
    join_url: buildJoinUrl(shop.joinCode),
    staff_id: ownerStaff.id,
    device_id: device.id,
    display_name: owner.displayName,
    role: "owner",
    permissions,
    device_token: token,
    device_status: device.deviceStatus,
    phone_required: shop.phoneRequired,
    approval_required: shop.approvalRequired,
  });
});

// ---------------------------------------------------------------------------
// POST /api/shops/join — staff joins an existing shop
// ---------------------------------------------------------------------------
router.post("/shops/join", (req: Request, res: Response) => {
  const body = parseBody<JoinShopBodyT>(JoinShopBody, req.body, res);
  if (!body) return;

  const shop = store.findShopByJoinCode(body.join_code);
  if (!shop) {
    res.status(404).json({ error: "Code not valid." });
    return;
  }

  // Enforce phone_required at the server.
  const phoneNormalized = body.phone ? normalizePhone(body.phone) : null;
  if (phoneNormalized === null && body.phone) {
    res.status(400).json({ error: "Phone number is not a valid Ethiopian mobile." });
    return;
  }
  if (shop.phoneRequired && !phoneNormalized) {
    res.status(400).json({
      error: "This shop requires staff to provide a phone number.",
    });
    return;
  }

  // Look for an existing staff row matching name (+ phone when present).
  const match = store.findStaffForRejoin({
    shopId: shop.id,
    displayName: body.display_name,
    phone: phoneNormalized,
  });

  let staff: StoredStaff;
  let user;
  let rejoined = false;
  let previousDevices = 0;

  if (match) {
    // Rejoin path: bind the new device to the existing staff_id, revoke
    // any prior active devices, and update the staff's phone snapshot
    // if a new phone is provided.
    staff = match;
    rejoined = true;
    previousDevices = store.countActiveDevicesForStaff(staff.id);
    if (previousDevices > 0) {
      // The 409 case from the spec: another device is still active.
      res.status(409).json({
        error:
          "This name is already used in this shop on another phone. Ask the owner to deactivate the other phone first.",
      });
      return;
    }
    user = store.findUserById(staff.userId);
    if (!user) {
      res.status(500).json({ error: "Internal error: user not found." });
      return;
    }
    if (phoneNormalized && !staff.phoneSnapshot) {
      staff.phoneSnapshot = phoneNormalized;
    }
  } else {
    // New staff path: create a user and a staff row.
    user = store.createUser({
      displayName: body.display_name,
      phone: phoneNormalized,
    });
    staff = store.createStaff({
      shopId: shop.id,
      userId: user.id,
      role: "staff",
      phoneSnapshot: phoneNormalized,
      permissionsOverride: {},
    });
  }

  // Decide device status: pending if approval is required, active otherwise.
  const deviceStatus = shop.approvalRequired ? "pending" : "active";
  const { token, tokenHash } = store.issueDeviceToken();
  const device = store.createDevice({
    shopId: shop.id,
    staffId: staff.id,
    deviceLabel: body.device_label || "Staff phone",
    platform: "web",
    tokenHash,
    deviceStatus,
  });

  const permissions = permissionsFor(staff);
  res.status(201).json({
    staff_id: staff.id,
    user_id: user.id,
    shop_id: shop.id,
    shop_name: shop.name,
    role: staff.role,
    permissions,
    device_id: device.id,
    device_token: token,
    device_status: device.deviceStatus,
    rejoined,
    previous_devices: rejoined ? previousDevices : undefined,
  });
});

// ---------------------------------------------------------------------------
// GET /api/me — current device + identity
// ---------------------------------------------------------------------------
router.get("/me", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device) {
    res.status(401).json({ error: "Token not recognized." });
    return;
  }
  if (device.deviceStatus === "revoked") {
    res.status(401).json({ error: "Device access ended." });
    return;
  }
  const staff = store.findStaffById(device.staffId);
  if (!staff || staff.staffStatus === "inactive") {
    res.status(401).json({ error: "Staff no longer active." });
    return;
  }
  const user = store.findUserById(staff.userId);
  const shop = store.findShopById(device.shopId);
  if (!user || !shop) {
    res.status(500).json({ error: "Internal error." });
    return;
  }
  res.json({
    user_id: user.id,
    staff_id: staff.id,
    shop_id: shop.id,
    role: staff.role,
    display_name: user.displayName,
    phone: user.phone,
    device_id: device.id,
    device_status: device.deviceStatus,
    permissions: permissionsFor(staff),
  });
});

// ---------------------------------------------------------------------------
// GET /api/shops/:shop_id/staff — owner-only list
// ---------------------------------------------------------------------------
router.get("/shops/:shop_id/staff", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  if (device.shopId !== param(req, "shop_id")) {
    res.status(403).json({ error: "Not authorized for this shop." });
    return;
  }
  const staff = store.findStaffById(device.staffId);
  if (!staff || staff.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const list = store.listStaffForShop(param(req, "shop_id")).map((s) => ({
    staff_id: s.id,
    display_name: store.findUserById(s.userId)?.displayName ?? "",
    phone_snapshot: s.phoneSnapshot,
    role: s.role,
    staff_status: s.staffStatus,
    permissions: permissionsFor(s),
    joined_at: iso(s.joinedAt) ?? "",
    last_seen_at: iso(s.lastSeenAt),
    deactivated_at: iso(s.deactivatedAt),
    devices: store.listDevicesForStaff(s.id).map((d) => ({
      device_id: d.id,
      device_label: d.deviceLabel,
      device_status: d.deviceStatus,
      last_seen_at: iso(d.lastSeenAt),
      created_at: iso(d.createdAt) ?? "",
    })),
  }));
  res.json({ staff: list });
});

// ---------------------------------------------------------------------------
// POST /api/shops/:shop_id/rotate-code — owner only
// ---------------------------------------------------------------------------
router.post("/shops/:shop_id/rotate-code", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  if (device.shopId !== param(req, "shop_id")) {
    res.status(403).json({ error: "Not authorized for this shop." });
    return;
  }
  const staff = store.findStaffById(device.staffId);
  if (!staff || staff.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const shop = store.rotateJoinCode(param(req, "shop_id"));
  if (!shop) {
    res.status(404).json({ error: "Shop not found." });
    return;
  }
  res.json({ join_code: shop.joinCode, join_url: buildJoinUrl(shop.joinCode) });
});

// ---------------------------------------------------------------------------
// POST /api/shops/:shop_id/settings — owner only
// ---------------------------------------------------------------------------
router.post("/shops/:shop_id/settings", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  if (device.shopId !== param(req, "shop_id")) {
    res.status(403).json({ error: "Not authorized for this shop." });
    return;
  }
  const staff = store.findStaffById(device.staffId);
  if (!staff || staff.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const body = parseBody(UpdateShopSettingsBody, req.body, res);
  if (!body) return;
  const shop = store.updateShopSettings(param(req, "shop_id"), {
    phoneRequired: body.phone_required,
    approvalRequired: body.approval_required,
  });
  if (!shop) {
    res.status(404).json({ error: "Shop not found." });
    return;
  }
  res.json({ phone_required: shop.phoneRequired, approval_required: shop.approvalRequired });
});

// ---------------------------------------------------------------------------
// POST /api/staff/:staff_id/permissions — owner only, v1 ships one toggle
// ---------------------------------------------------------------------------
router.post("/staff/:staff_id/permissions", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  const owner = store.findStaffById(device.staffId);
  if (!owner || owner.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const body = parseBody(UpdateStaffPermissionsBody, req.body, res);
  if (!body) return;
  const target = store.findStaffById(param(req, "staff_id"));
  if (!target || target.shopId !== device.shopId) {
    res.status(404).json({ error: "Staff not found in this shop." });
    return;
  }
  const updated = store.updateStaffPermissions(target.id, {
    can_create_customer_credit: body.can_create_customer_credit,
  });
  if (!updated) {
    res.status(404).json({ error: "Staff not found." });
    return;
  }
  res.json({
    staff_id: updated.id,
    permissions: permissionsFor(updated),
  });
});

// ---------------------------------------------------------------------------
// POST /api/staff/:staff_id/deactivate — owner only
// ---------------------------------------------------------------------------
router.post("/staff/:staff_id/deactivate", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  const owner = store.findStaffById(device.staffId);
  if (!owner || owner.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const result = store.deactivateStaff({
    staffId: param(req, "staff_id"),
    deactivatedBy: owner.userId,
  });
  if (!result) {
    res.status(404).json({ error: "Staff not found." });
    return;
  }
  res.json({ deactivated: true, devices_revoked: result.devicesRevoked });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:device_id/approve — owner only
// ---------------------------------------------------------------------------
router.post("/devices/:device_id/approve", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  const owner = store.findStaffById(device.staffId);
  if (!owner || owner.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const target = store.findDeviceById(param(req, "device_id"));
  if (!target || target.shopId !== device.shopId) {
    res.status(404).json({ error: "Device not found in this shop." });
    return;
  }
  const updated = store.approveDevice({ deviceId: target.id, approvedBy: owner.userId });
  if (!updated) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  res.json({ device_id: updated.id, device_status: "active" as const });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:device_id/reject — owner only
// ---------------------------------------------------------------------------
router.post("/devices/:device_id/reject", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  const owner = store.findStaffById(device.staffId);
  if (!owner || owner.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const body = parseBody(RejectDeviceBody, req.body ?? {}, res);
  if (!body) return;
  const target = store.findDeviceById(param(req, "device_id"));
  if (!target || target.shopId !== device.shopId) {
    res.status(404).json({ error: "Device not found in this shop." });
    return;
  }
  const updated = store.rejectDevice(target.id, body.reason ?? null);
  if (!updated) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  res.json({ device_id: updated.id, device_status: "revoked" as const });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:device_id/revoke — owner only
// ---------------------------------------------------------------------------
router.post("/devices/:device_id/revoke", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Not authorized." });
    return;
  }
  const owner = store.findStaffById(device.staffId);
  if (!owner || owner.role !== "owner") {
    res.status(403).json({ error: "Owner only." });
    return;
  }
  const body = parseBody(RevokeDeviceBody, req.body, res);
  if (!body) return;
  const target = store.findDeviceById(param(req, "device_id"));
  if (!target || target.shopId !== device.shopId) {
    res.status(404).json({ error: "Device not found in this shop." });
    return;
  }
  const updated = store.revokeDevice({ deviceId: target.id, reason: body.reason });
  if (!updated) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  res.json({ device_id: updated.id, device_status: "revoked" as const });
});

export default router;
