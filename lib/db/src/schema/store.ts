// In-memory store for local dev and unit tests.
//
// In production, the route handlers in `artifacts/api-server/src/routes/identity.ts`
// will be backed by Drizzle queries against the Postgres `shops`, `users`,
// `staff`, `devices`, and `join_codes` tables defined in
// `lib/db/src/schema/shops.ts`. The shape of records returned here is
// identical to those Drizzle rows, so the route handlers can swap from
// this store to `db` without changing their logic.
//
// The store is deliberately minimal: it holds Maps, exposes the few
// operations the identity routes need, and provides no concurrency
// guarantees. That is fine for the in-process use case; in production,
// Postgres provides atomicity for the multi-step join/approve flows.

import { randomUUID, createHash } from "node:crypto";
import { generateJoinCode, normalizeJoinCode } from "./joinCode";
import { normalizePhone } from "./phone";
import {
  resolvePermissions,
  type EffectivePermissions,
  type StaffPermissionsOverride,
} from "./permissions";
import type { Role, StaffStatus, DeviceStatus } from "./shops";

export type StoredSyncEventType = "sale" | "customer_payment" | "customer_credit";

export interface StoredUser {
  id: string;
  displayName: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredShop {
  id: string;
  name: string;
  ownerUserId: string;
  joinCode: string;
  joinCodeRotatedAt: Date;
  phoneRequired: boolean;
  approvalRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredStaff {
  id: string;
  shopId: string;
  userId: string;
  role: Role;
  staffStatus: StaffStatus;
  permissionsOverride: StaffPermissionsOverride;
  phoneSnapshot: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  joinedAt: Date;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredDevice {
  id: string;
  shopId: string;
  staffId: string;
  deviceLabel: string;
  platform: string;
  deviceStatus: DeviceStatus;
  tokenHash: string;
  lastSeenAt: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface StoredStaffEvent {
  eventId: string;
  clientEventId: string;
  recordId: string;
  shopId: string;
  deviceId: string;
  actorStaffMemberId: string | null;
  actorNameSnapshot: string;
  actorRoleAtEvent: string;
  eventType: StoredSyncEventType;
  occurredAtDevice: Date;
  createdAtServer: Date;
  payload: Record<string, unknown>;
  schemaVersion: 1;
}

/**
 * In-memory store. One process; no persistence; resets on restart.
 *
 * For production, this object is replaced by Drizzle queries against
 * Postgres. The interface surface here is what the identity route
 * handlers depend on.
 */
export class InMemoryStore {
  users = new Map<string, StoredUser>();
  shops = new Map<string, StoredShop>();
  staff = new Map<string, StoredStaff>();
  devices = new Map<string, StoredDevice>();
  events = new Map<string, StoredStaffEvent>();
  eventClientIndex = new Map<string, string>();
  /** device_token (plaintext) -> device id, kept for unit tests only */
  deviceTokens = new Map<string, string>();

  // ---- users ----
  createUser(input: { displayName: string; phone: string | null }): StoredUser {
    const now = new Date();
    const user: StoredUser = {
      id: randomUUID(),
      displayName: input.displayName.trim(),
      phone: input.phone,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  findUserById(id: string): StoredUser | null {
    return this.users.get(id) ?? null;
  }

  // ---- shops ----
  createShop(input: { name: string; ownerUserId: string; phoneRequired: boolean; approvalRequired: boolean }): StoredShop {
    const now = new Date();
    const shop: StoredShop = {
      id: randomUUID(),
      name: input.name.trim(),
      ownerUserId: input.ownerUserId,
      joinCode: generateJoinCode(),
      joinCodeRotatedAt: now,
      phoneRequired: input.phoneRequired,
      approvalRequired: input.approvalRequired,
      createdAt: now,
      updatedAt: now,
    };
    this.shops.set(shop.id, shop);
    return shop;
  }

  findShopById(id: string): StoredShop | null {
    return this.shops.get(id) ?? null;
  }

  findShopByJoinCode(rawCode: string): StoredShop | null {
    const normalized = normalizeJoinCode(rawCode);
    if (!normalized) return null;
    for (const shop of this.shops.values()) {
      if (shop.joinCode === normalized) return shop;
    }
    return null;
  }

  rotateJoinCode(shopId: string): StoredShop | null {
    const shop = this.shops.get(shopId);
    if (!shop) return null;
    shop.joinCode = generateJoinCode();
    shop.joinCodeRotatedAt = new Date();
    shop.updatedAt = new Date();
    return shop;
  }

  updateShopSettings(shopId: string, patch: { phoneRequired?: boolean; approvalRequired?: boolean }): StoredShop | null {
    const shop = this.shops.get(shopId);
    if (!shop) return null;
    if (patch.phoneRequired !== undefined) shop.phoneRequired = patch.phoneRequired;
    if (patch.approvalRequired !== undefined) shop.approvalRequired = patch.approvalRequired;
    shop.updatedAt = new Date();
    return shop;
  }

  // ---- staff ----
  createOwnerStaff(input: { shopId: string; userId: string }): StoredStaff {
    const now = new Date();
    const staff: StoredStaff = {
      id: randomUUID(),
      shopId: input.shopId,
      userId: input.userId,
      role: "owner",
      staffStatus: "active",
      permissionsOverride: {},
      phoneSnapshot: null,
      deactivatedAt: null,
      deactivatedBy: null,
      joinedAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.staff.set(staff.id, staff);
    return staff;
  }

  /**
   * Find a staff row that matches a rejoin attempt: same shop, same
   * display name (case-insensitive, trimmed), and same phone (when
   * both are present).
   *
   * Returns null if no match. The caller decides whether to create a
   * new staff or reject with 409.
   */
  findStaffForRejoin(input: { shopId: string; displayName: string; phone: string | null }): StoredStaff | null {
    const name = input.displayName.trim().toLowerCase();
    for (const s of this.staff.values()) {
      if (s.shopId !== input.shopId) continue;
      if (s.userId === this.findShopById(input.shopId)?.ownerUserId) continue; // skip owner
      const existing = this.users.get(s.userId);
      if (!existing) continue;
      if (existing.displayName.trim().toLowerCase() !== name) continue;
      // Phone match: if either side is null, name match is sufficient.
      // If both are present, they must normalize to the same value.
      if (input.phone && s.phoneSnapshot) {
        if (normalizePhone(input.phone) !== s.phoneSnapshot) continue;
      }
      return s;
    }
    return null;
  }

  hasActiveDevice(staffId: string): boolean {
    for (const d of this.devices.values()) {
      if (d.staffId === staffId && d.deviceStatus === "active") return true;
    }
    return false;
  }

  countActiveDevicesForStaff(staffId: string): number {
    let n = 0;
    for (const d of this.devices.values()) {
      if (d.staffId === staffId && d.deviceStatus === "active") n++;
    }
    return n;
  }

  createStaff(input: {
    shopId: string;
    userId: string;
    role: Role;
    phoneSnapshot: string | null;
    permissionsOverride: StaffPermissionsOverride;
  }): StoredStaff {
    const now = new Date();
    const staff: StoredStaff = {
      id: randomUUID(),
      shopId: input.shopId,
      userId: input.userId,
      role: input.role,
      staffStatus: "active",
      permissionsOverride: input.permissionsOverride,
      phoneSnapshot: input.phoneSnapshot,
      deactivatedAt: null,
      deactivatedBy: null,
      joinedAt: now,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.staff.set(staff.id, staff);
    return staff;
  }

  findStaffById(id: string): StoredStaff | null {
    return this.staff.get(id) ?? null;
  }

  listStaffForShop(shopId: string): StoredStaff[] {
    return [...this.staff.values()].filter((s) => s.shopId === shopId);
  }

  updateStaffPermissions(staffId: string, override: StaffPermissionsOverride): StoredStaff | null {
    const s = this.staff.get(staffId);
    if (!s) return null;
    s.permissionsOverride = override;
    s.updatedAt = new Date();
    return s;
  }

  deactivateStaff(input: { staffId: string; deactivatedBy: string }): { staff: StoredStaff; devicesRevoked: number } | null {
    const s = this.staff.get(input.staffId);
    if (!s) return null;
    const now = new Date();
    s.staffStatus = "inactive";
    s.deactivatedAt = now;
    s.deactivatedBy = input.deactivatedBy;
    s.updatedAt = now;
    let devicesRevoked = 0;
    for (const d of this.devices.values()) {
      if (d.staffId === s.id && d.deviceStatus !== "revoked") {
        d.deviceStatus = "revoked";
        d.revokedAt = now;
        d.revokedReason = "staff_deactivated";
        devicesRevoked++;
      }
    }
    return { staff: s, devicesRevoked };
  }

  // ---- devices ----
  issueDeviceToken(): { token: string; tokenHash: string } {
    const token = randomUUID() + randomUUID().replace(/-/g, "");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return { token, tokenHash };
  }

  hashDeviceToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  findDeviceByTokenHash(tokenHash: string): StoredDevice | null {
    for (const d of this.devices.values()) {
      if (d.tokenHash === tokenHash) return d;
    }
    return null;
  }

  createDevice(input: {
    shopId: string;
    staffId: string;
    deviceLabel: string;
    platform: string;
    tokenHash: string;
    deviceStatus: DeviceStatus;
  }): StoredDevice {
    const now = new Date();
    const device: StoredDevice = {
      id: randomUUID(),
      shopId: input.shopId,
      staffId: input.staffId,
      deviceLabel: input.deviceLabel,
      platform: input.platform,
      deviceStatus: input.deviceStatus,
      tokenHash: input.tokenHash,
      lastSeenAt: now,
      createdAt: now,
      approvedAt: input.deviceStatus === "active" ? now : null,
      approvedBy: null,
      revokedAt: null,
      revokedReason: null,
    };
    this.devices.set(device.id, device);
    return device;
  }

  findDeviceById(id: string): StoredDevice | null {
    return this.devices.get(id) ?? null;
  }

  listDevicesForStaff(staffId: string): StoredDevice[] {
    return [...this.devices.values()].filter((d) => d.staffId === staffId);
  }

  listDevicesForShop(shopId: string): StoredDevice[] {
    return [...this.devices.values()].filter((d) => d.shopId === shopId);
  }

  approveDevice(input: { deviceId: string; approvedBy: string }): StoredDevice | null {
    const d = this.devices.get(input.deviceId);
    if (!d) return null;
    const now = new Date();
    d.deviceStatus = "active";
    d.approvedAt = now;
    d.approvedBy = input.approvedBy;
    d.revokedAt = null;
    d.revokedReason = null;
    return d;
  }

  rejectDevice(deviceId: string, reason: string | null): StoredDevice | null {
    const d = this.devices.get(deviceId);
    if (!d) return null;
    const now = new Date();
    d.deviceStatus = "revoked";
    d.revokedAt = now;
    d.revokedReason = reason ?? "owner_revoke";
    return d;
  }

  revokeDevice(input: { deviceId: string; reason: string }): StoredDevice | null {
    const d = this.devices.get(input.deviceId);
    if (!d) return null;
    const now = new Date();
    d.deviceStatus = "revoked";
    d.revokedAt = now;
    d.revokedReason = input.reason;
    return d;
  }

  // ---- staff events ----
  eventIdempotencyKey(shopId: string, clientEventId: string): string {
    return `${shopId}:${clientEventId}`;
  }

  findEventByClientEventId(shopId: string, clientEventId: string): StoredStaffEvent | null {
    const eventId = this.eventClientIndex.get(this.eventIdempotencyKey(shopId, clientEventId));
    return eventId ? this.events.get(eventId) ?? null : null;
  }

  pushStaffEvent(input: Omit<StoredStaffEvent, "eventId" | "createdAtServer">):
    | { status: "accepted"; event: StoredStaffEvent }
    | { status: "duplicate"; event: StoredStaffEvent } {
    const existing = this.findEventByClientEventId(input.shopId, input.clientEventId);
    if (existing) {
      return { status: "duplicate", event: existing };
    }

    const event: StoredStaffEvent = {
      ...input,
      eventId: randomUUID(),
      createdAtServer: new Date(),
    };
    this.events.set(event.eventId, event);
    this.eventClientIndex.set(this.eventIdempotencyKey(event.shopId, event.clientEventId), event.eventId);
    return { status: "accepted", event };
  }

  listEventsForShop(shopId: string): StoredStaffEvent[] {
    return [...this.events.values()].filter((event) => event.shopId === shopId);
  }

  // ---- helpers for unit tests ----
  reset(): void {
    this.users.clear();
    this.shops.clear();
    this.staff.clear();
    this.devices.clear();
    this.events.clear();
    this.eventClientIndex.clear();
    this.deviceTokens.clear();
  }
}

/** A single process-wide store. In tests, call `store.reset()` in `beforeEach`. */
export const store = new InMemoryStore();

/**
 * Compute the effective permissions for a staff row, in the shape the
 * client expects. Used by the join response and by the staff list.
 */
export function permissionsFor(staff: StoredStaff): EffectivePermissions {
  return resolvePermissions(staff.role, staff.permissionsOverride, staff.staffStatus);
}
