import app from "../app";
import { createServer } from "node:http";
import { store } from "@workspace/db/schema";

const server = createServer(app);
let base = "";

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    process.stdout.write("ok\n");
  } catch (e) {
    process.stdout.write("FAIL\n");
    console.error(e);
    process.exitCode = 1;
  }
}

async function req(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function event(input: {
  clientId: string;
  shopId: string;
  deviceId: string;
  staffId: string | null;
  actorName?: string;
  actorRole?: string;
  eventType?: "sale" | "customer_payment" | "customer_credit";
  recordId?: string;
  payload?: Record<string, unknown>;
}) {
  return {
    event_id: null,
    client_event_id: input.clientId,
    record_id: input.recordId || input.clientId.replace("client-", "record-"),
    shop_id: input.shopId,
    device_id: input.deviceId,
    actor_staff_member_id: input.staffId,
    actor_name_snapshot: input.actorName || "Tigist",
    actor_role_at_event: input.actorRole || "staff",
    event_type: input.eventType || "sale",
    occurred_at_device: new Date("2026-06-12T08:00:00.000Z").toISOString(),
    created_at_server: null,
    payload: input.payload || { amount: 120, payment_method_label: "Cash" },
    schema_version: 1,
  };
}

(async () => {
  store.reset();
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const port = (server.address() as any).port;
  base = `http://127.0.0.1:${port}`;

  let shopId = "";
  let ownerToken = "";
  let ownerDeviceId = "";
  let ownerStaffId = "";
  let joinCode = "";
  let staffToken = "";
  let staffDeviceId = "";
  let staffId = "";
  let otherShopId = "";

  try {
    await step("owner creates shop and receives event identity ids", async () => {
      const r = await req("POST", "/api/shops", { display_name: "Event Shop" });
      if (r.status !== 201) throw new Error(`status=${r.status} body=${JSON.stringify(r.json)}`);
      shopId = r.json.shop_id;
      ownerToken = r.json.device_token;
      ownerDeviceId = r.json.device_id;
      ownerStaffId = r.json.staff_id;
      joinCode = r.json.join_code;
      if (!ownerDeviceId || !ownerStaffId) throw new Error("missing device/staff identity");
    });

    await step("staff joins as basic staff", async () => {
      const r = await req("POST", "/api/shops/join", {
        join_code: joinCode,
        display_name: "Basic Staff",
      });
      if (r.status !== 201) throw new Error(`status=${r.status} body=${JSON.stringify(r.json)}`);
      staffToken = r.json.device_token;
      staffDeviceId = r.json.device_id;
      staffId = r.json.staff_id;
    });

    await step("owner sale event is accepted", async () => {
      const r = await req("POST", "/api/events/push", {
        events: [event({
          clientId: "client-owner-sale-1",
          shopId,
          deviceId: ownerDeviceId,
          staffId: ownerStaffId,
          actorName: "Original Owner Name",
          actorRole: "owner",
          eventType: "sale",
        })],
      }, ownerToken);
      if (r.status !== 200) throw new Error(`status=${r.status}`);
      const [result] = r.json.results;
      if (result.status !== "accepted" || !result.event_id) throw new Error(JSON.stringify(result));
    });

    await step("duplicate client_event_id returns original server event", async () => {
      const body = {
        events: [event({
          clientId: "client-owner-sale-duplicate",
          shopId,
          deviceId: ownerDeviceId,
          staffId: ownerStaffId,
          actorName: "Owner Duplicate",
          actorRole: "owner",
        })],
      };
      const first = await req("POST", "/api/events/push", body, ownerToken);
      const second = await req("POST", "/api/events/push", body, ownerToken);
      const a = first.json.results[0];
      const b = second.json.results[0];
      if (a.status !== "accepted") throw new Error(JSON.stringify(a));
      if (b.status !== "duplicate") throw new Error(JSON.stringify(b));
      if (a.event_id !== b.event_id) throw new Error("duplicate did not return original event id");
    });

    await step("basic staff can push sale and customer payment", async () => {
      const r = await req("POST", "/api/events/push", {
        events: [
          event({ clientId: "client-staff-sale-1", shopId, deviceId: staffDeviceId, staffId, eventType: "sale" }),
          event({ clientId: "client-staff-payment-1", shopId, deviceId: staffDeviceId, staffId, eventType: "customer_payment" }),
        ],
      }, staffToken);
      if (r.status !== 200) throw new Error(`status=${r.status}`);
      const statuses = r.json.results.map((item: any) => item.status);
      if (statuses.join(",") !== "accepted,accepted") throw new Error(JSON.stringify(r.json));
    });

    await step("unauthorized basic-staff customer credit is rejected", async () => {
      const r = await req("POST", "/api/events/push", {
        events: [event({
          clientId: "client-basic-credit-1",
          shopId,
          deviceId: staffDeviceId,
          staffId,
          eventType: "customer_credit",
        })],
      }, staffToken);
      if (r.status !== 200) throw new Error(`status=${r.status}`);
      const [result] = r.json.results;
      if (result.status !== "rejected" || !/can_create_customer_credit/.test(result.error)) {
        throw new Error(JSON.stringify(result));
      }
    });

    await step("authorized customer credit is accepted after owner permission", async () => {
      const perm = await req("POST", `/api/staff/${staffId}/permissions`, {
        can_create_customer_credit: true,
      }, ownerToken);
      if (perm.status !== 200) throw new Error(`permission status=${perm.status}`);
      const r = await req("POST", "/api/events/push", {
        events: [event({
          clientId: "client-authorized-credit-1",
          shopId,
          deviceId: staffDeviceId,
          staffId,
          eventType: "customer_credit",
        })],
      }, staffToken);
      const [result] = r.json.results;
      if (r.status !== 200 || result.status !== "accepted") throw new Error(JSON.stringify(r.json));
    });

    await step("event from another shop is rejected", async () => {
      const other = await req("POST", "/api/shops", { display_name: "Other Shop" });
      otherShopId = other.json.shop_id;
      const r = await req("POST", "/api/events/push", {
        events: [event({
          clientId: "client-cross-shop-1",
          shopId: otherShopId,
          deviceId: staffDeviceId,
          staffId,
        })],
      }, staffToken);
      const [result] = r.json.results;
      if (r.status !== 200 || result.status !== "rejected") throw new Error(JSON.stringify(r.json));
    });

    await step("staff phone fields are rejected from event payload", async () => {
      const r = await req("POST", "/api/events/push", {
        events: [event({
          clientId: "client-phone-leak-1",
          shopId,
          deviceId: staffDeviceId,
          staffId,
          payload: { amount: 10, staff_phone_number: "+251911111111" },
        })],
      }, staffToken);
      const [result] = r.json.results;
      if (r.status !== 200 || result.status !== "rejected" || !/phone/i.test(result.error)) {
        throw new Error(JSON.stringify(r.json));
      }
    });

    await step("actor snapshots remain historical", async () => {
      const pushed = store.findEventByClientEventId(shopId, "client-owner-sale-1");
      if (!pushed) throw new Error("missing stored event");
      const owner = store.findStaffById(ownerStaffId);
      const ownerUser = owner ? store.findUserById(owner.userId) : null;
      if (!owner || !ownerUser) throw new Error("missing owner");
      owner.role = "staff";
      ownerUser.displayName = "Changed Owner Name";
      const again = store.findEventByClientEventId(shopId, "client-owner-sale-1");
      if (again?.actorNameSnapshot !== "Original Owner Name") throw new Error("actor name snapshot changed");
      if (again?.actorRoleAtEvent !== "owner") throw new Error("actor role snapshot changed");
      owner.role = "owner";
      ownerUser.displayName = "Original Owner Name";
    });

    await step("revoked device cannot push", async () => {
      const revoke = await req("POST", `/api/devices/${staffDeviceId}/revoke`, { reason: "owner_revoke" }, ownerToken);
      if (revoke.status !== 200) throw new Error(`revoke status=${revoke.status}`);
      const r = await req("POST", "/api/events/push", {
        events: [event({ clientId: "client-revoked-1", shopId, deviceId: staffDeviceId, staffId })],
      }, staffToken);
      if (r.status !== 401) throw new Error(`status=${r.status}, expected 401`);
    });

    await step("inactive staff cannot push", async () => {
      const join = await req("POST", "/api/shops/join", {
        join_code: joinCode,
        display_name: "Inactive Staff",
      });
      const inactiveToken = join.json.device_token;
      const inactiveDeviceId = join.json.device_id;
      const inactiveStaffId = join.json.staff_id;
      const deactivate = await req("POST", `/api/staff/${inactiveStaffId}/deactivate`, {}, ownerToken);
      if (deactivate.status !== 200) throw new Error(`deactivate status=${deactivate.status}`);
      const r = await req("POST", "/api/events/push", {
        events: [event({
          clientId: "client-inactive-1",
          shopId,
          deviceId: inactiveDeviceId,
          staffId: inactiveStaffId,
        })],
      }, inactiveToken);
      if (r.status !== 401) throw new Error(`status=${r.status}, expected 401`);
    });

    console.log("\nevent sync smoke tests passed.");
  } finally {
    server.close();
  }
})();
