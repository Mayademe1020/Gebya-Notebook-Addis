// PR 1B1 staff event push route.
//
// Persistence note: this route intentionally uses the same in-memory store as
// the PR 1A identity routes. It verifies the sync contract and permissions, but
// it is not production-ready multi-device persistence until swapped for
// Drizzle/Postgres event writes.

import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { PushEventsBody, type PushEventsBodyT, type SyncEventEnvelopeT } from "@workspace/api-zod/events";
import { canCreateEvent, permissionsFor, store } from "@workspace/db/schema";

const router = Router();

function getToken(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function iso(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

function parsePushEventsBody(body: unknown, res: Response): PushEventsBodyT | null {
  const result = PushEventsBody.safeParse(body);
  if (!result.success) {
    res.status(400).json({
      error: "Validation failed",
      details: result.error.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return null;
  }
  return result.data;
}

function payloadHasForbiddenStaffPhone(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(payloadHasForbiddenStaffPhone);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (
      normalized === "staff_phone"
      || normalized === "staff_phone_number"
      || normalized === "phone_number"
    ) {
      return true;
    }
    if (payloadHasForbiddenStaffPhone(child)) return true;
  }
  return false;
}

function reject(event: SyncEventEnvelopeT, error: string) {
  return {
    client_event_id: event.client_event_id,
    status: "rejected" as const,
    error,
  };
}

router.post("/events/push", (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  const device = store.findDeviceByTokenHash(hashToken(token));
  if (!device || device.deviceStatus !== "active") {
    res.status(401).json({ error: "Device is not active." });
    return;
  }

  const staff = store.findStaffById(device.staffId);
  if (!staff || staff.staffStatus !== "active") {
    res.status(401).json({ error: "Staff no longer active." });
    return;
  }

  const body = parsePushEventsBody(req.body, res);
  if (!body) return;

  const perms = permissionsFor(staff);
  const results = body.events.map((event) => {
    if (event.shop_id !== device.shopId || staff.shopId !== event.shop_id) {
      return reject(event, "Event is not for this shop.");
    }

    if (event.device_id !== device.id) {
      return reject(event, "Event device does not match authenticated device.");
    }

    const permission = canCreateEvent(perms, event.event_type);
    if (!permission.ok) {
      return reject(event, permission.capability
        ? `Missing permission: ${permission.capability}`
        : "Unsupported event type.");
    }

    if (payloadHasForbiddenStaffPhone(event.payload)) {
      return reject(event, "Staff phone number must not be included in event payload.");
    }

    const stored = store.pushStaffEvent({
      clientEventId: event.client_event_id,
      recordId: event.record_id,
      shopId: event.shop_id,
      deviceId: event.device_id,
      actorStaffMemberId: event.actor_staff_member_id ?? staff.id,
      actorNameSnapshot: event.actor_name_snapshot,
      actorRoleAtEvent: event.actor_role_at_event,
      eventType: event.event_type,
      occurredAtDevice: new Date(event.occurred_at_device),
      payload: event.payload ?? {},
      schemaVersion: event.schema_version,
    });

    return {
      client_event_id: event.client_event_id,
      status: stored.status,
      event_id: stored.event.eventId,
      created_at_server: iso(stored.event.createdAtServer),
    };
  });

  res.json({ results });
});

export default router;
