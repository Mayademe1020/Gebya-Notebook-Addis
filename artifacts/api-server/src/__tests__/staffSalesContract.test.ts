import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createStaffSalesRouter, type StaffSaleEventStore } from "../routes/staffSales.js";
import type { StaffSaleEventInput } from "../services/staffSaleEventStore.js";

let server: http.Server;
let baseUrl = "";

function validSaleEvent() {
  return {
    event_id: "evt_staff_sale_123456",
    transaction_id: "txn_staff_sale_123456",
    shop_id: "local_demo_shop",
    staff_id: "1",
    staff_name_snapshot: "Abel",
    device_id: "device_staff_sale_123456",
    amount: 1500,
    item_note: "charger CH-25",
    item_code: "CH-25",
    payment_type: "cash",
    created_at_device: Date.now(),
    event_type: "sale_created",
    sync_status: "pending_sync",
    schema_version: 1,
  } as const;
}

function matchingStore(): StaffSaleEventStore {
  const rows = new Map<string, StaffSaleEventInput>();
  return {
    async persist(event) {
      const existing = rows.get(event.event_id);
      if (!existing) {
        rows.set(event.event_id, event);
        return {
          event_id: event.event_id,
          transaction_id: event.transaction_id,
          received_at_server: "2026-06-07T00:00:00.000Z",
          duplicate: false,
        };
      }

      assert.deepEqual({ ...existing, created_at_device: event.created_at_device }, event);
      return {
        event_id: event.event_id,
        transaction_id: event.transaction_id,
        received_at_server: "2026-06-07T00:00:00.000Z",
        duplicate: true,
      };
    },
  };
}

async function startServer(store: StaffSaleEventStore) {
  const app = express();
  app.use(express.json());
  app.use("/api/staff-sales", createStaffSalesRouter(store));
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

before(async () => {
  await startServer(matchingStore());
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

test("staff sale API persists a valid sale_created event", async () => {
  const response = await fetch(`${baseUrl}/api/staff-sales/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validSaleEvent()),
  });
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 202);
  assert.equal(body.accepted, true);
  assert.equal(body.event_id, "evt_staff_sale_123456");
  assert.equal(body.transaction_id, "txn_staff_sale_123456");
  assert.equal(body.status, "persisted");
  assert.equal(body.duplicate, false);
  assert.equal(typeof body.received_at_server, "string");
});

test("staff sale API rejects invalid payloads", async () => {
  const response = await fetch(`${baseUrl}/api/staff-sales/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...validSaleEvent(),
      event_id: "evt_invalid_123456",
      amount: "1500",
      event_type: "inventory_adjusted",
    }),
  });
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.equal(body.accepted, false);
  assert.equal(body.error, "Invalid staff sale event payload");
  assert.ok(Array.isArray(body.issues));
});

test("duplicate event_id retry returns success without creating a new row", async () => {
  const response = await fetch(`${baseUrl}/api/staff-sales/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validSaleEvent()),
  });
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.status, "persisted");
  assert.equal(body.duplicate, true);
});

test("missing database config gives clear non-fake failure", async () => {
  const oldDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const app = express();
  app.use(express.json());
  app.use("/api/staff-sales", createStaffSalesRouter());
  const localServer = http.createServer(app);
  const localBaseUrl = await new Promise<string>((resolve) => {
    localServer.listen(0, "127.0.0.1", () => {
      const address = localServer.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

  try {
    const response = await fetch(`${localBaseUrl}/api/staff-sales/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validSaleEvent(), event_id: "evt_no_database_123456" }),
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.equal(body.accepted, false);
    assert.equal(body.required_env, "DATABASE_URL");
  } finally {
    await new Promise<void>((resolve, reject) => {
      localServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    if (oldDatabaseUrl) process.env.DATABASE_URL = oldDatabaseUrl;
  }
});
