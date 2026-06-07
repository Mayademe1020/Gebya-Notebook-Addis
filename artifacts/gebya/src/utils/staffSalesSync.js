import db from '../db';
import { createTransactionId, getOrCreateCloudProofDeviceId } from './cloudProof';

export const STAFF_SALE_EVENT_KIND = 'staff_sale_event';
export const STAFF_SALE_SCHEMA_VERSION = 1;
export const STAFF_SALE_EVENT_TYPES = {
  SALE_CREATED: 'sale_created',
  SALE_VOIDED: 'sale_voided',
  CORRECTION: 'correction',
};
export const STAFF_SALE_SYNC_STATUS = {
  LOCAL_ONLY: 'local_only',
  PENDING_SYNC: 'pending_sync',
  SYNCED: 'synced',
  FAILED: 'failed',
};
export const LOCAL_DEMO_SHOP_ID = 'local_demo_shop';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const STAFF_SALE_EVENT_PATH = '/api/staff-sales/events';
const PENDING = 'pending';
const RUNNING = 'running';
const FAILED = 'failed';
const SENT = 'sent';
const REQUEST_TIMEOUT_MS = 8000;

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function buildFallbackStaffId(record, deviceId) {
  if (record.actor_staff_member_id != null && record.actor_staff_member_id !== '') {
    return String(record.actor_staff_member_id);
  }
  const suffix = String(deviceId || 'device').replace(/[^a-zA-Z0-9_-]/g, '').slice(-12) || 'device';
  return `local_device_${suffix}`;
}

export async function buildStaffSaleEvent(record) {
  if (!record || record.type !== 'sale' || !record.transaction_id) return null;

  const deviceId = record.device_id || await getOrCreateCloudProofDeviceId();
  const shopSetting = await db.settings.get('shop_id').catch(() => null);
  const shopId = stringOrNull(shopSetting?.value) || LOCAL_DEMO_SHOP_ID;
  const now = Date.now();

  return {
    event_id: createTransactionId(),
    transaction_id: record.transaction_id,
    shop_id: shopId,
    staff_id: buildFallbackStaffId(record, deviceId),
    staff_name_snapshot: stringOrNull(record.actor_name_snapshot) || 'Owner',
    device_id: deviceId,
    amount: numberOrNull(record.amount),
    item_note: stringOrNull(record.item_note || record.item_name),
    item_code: stringOrNull(record.item_code),
    payment_type: stringOrNull(record.payment_type),
    created_at_device: numberOrNull(record.created_at_device) || numberOrNull(record.created_at) || now,
    event_type: STAFF_SALE_EVENT_TYPES.SALE_CREATED,
    sync_status: STAFF_SALE_SYNC_STATUS.PENDING_SYNC,
    schema_version: STAFF_SALE_SCHEMA_VERSION,
    local_transaction_id: record.id ?? null,
    queued_at: now,
    updated_at: now,
  };
}

export function buildStaffSaleQueuePayload(event) {
  return {
    event_id: event.event_id,
    transaction_id: event.transaction_id,
    shop_id: event.shop_id,
    staff_id: event.staff_id,
    staff_name_snapshot: event.staff_name_snapshot,
    device_id: event.device_id,
    amount: event.amount,
    item_note: event.item_note,
    item_code: event.item_code,
    payment_type: event.payment_type,
    created_at_device: event.created_at_device,
    event_type: event.event_type,
    sync_status: event.sync_status,
    schema_version: event.schema_version,
  };
}

export async function createAndQueueStaffSaleEvent(record) {
  try {
    if (typeof window !== 'undefined' && window.__gebyaTestStaffSaleQueueFailure === true) {
      throw new Error('Staff sale queue failure requested by test');
    }

    const event = await buildStaffSaleEvent(record);
    if (!event) return null;

    const eventId = await db.staff_sale_events.add(event);
    const savedEvent = await db.staff_sale_events.get(eventId);
    const now = Date.now();

    await db.sync_queue.put({
      kind: STAFF_SALE_EVENT_KIND,
      status: PENDING,
      device_id: savedEvent.device_id,
      transaction_id: savedEvent.transaction_id,
      idempotency_key: `${savedEvent.device_id}:${savedEvent.event_id}`,
      record_table: 'staff_sale_events',
      record_id: eventId,
      record_type: savedEvent.event_type,
      payload: buildStaffSaleQueuePayload(savedEvent),
      attempts: 0,
      error: null,
      created_at: now,
      updated_at: now,
      next_attempt_at: now,
      upload_enabled: false,
    });

    scheduleStaffSaleSyncDrain();
    return savedEvent;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Staff sale event queue failed:', error);
    return null;
  }
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gebya:sync-queue-changed'));
  }
}

function nextRetryAt(attempts) {
  const delay = Math.min(5 * 60_000, Math.max(5_000, attempts * 15_000));
  return Date.now() + delay;
}

async function postStaffSaleEvent(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${STAFF_SALE_EVENT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok || !data?.accepted) {
      const error = new Error(data?.error || `Staff sale sync failed (${response.status})`);
      error.payload = data;
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (cause) {
    const error = new Error(cause?.name === 'AbortError' ? 'Staff sale sync timed out' : (cause?.message || 'Staff sale sync unavailable'));
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function processStaffSaleQueueRow(row) {
  const attempts = Number(row.attempts || 0) + 1;
  await db.sync_queue.update(row.id, {
    status: RUNNING,
    attempts,
    updated_at: Date.now(),
  });
  notifyQueueChanged();

  try {
    const event = row.record_id != null
      ? await db.staff_sale_events.get(row.record_id)
      : null;
    const payload = row.payload || (event ? buildStaffSaleQueuePayload(event) : null);
    if (!payload?.event_id) throw new Error('Staff sale event payload missing');

    const result = await postStaffSaleEvent(payload);
    const now = Date.now();
    const receivedAtServer = result.received_at_server || null;

    if (event?.id) {
      await db.staff_sale_events.update(event.id, {
        sync_status: STAFF_SALE_SYNC_STATUS.SYNCED,
        synced_at: now,
        received_at_server: receivedAtServer,
        updated_at: now,
      });
    }

    await db.sync_queue.update(row.id, {
      status: SENT,
      error: null,
      next_attempt_at: null,
      updated_at: now,
      received_at_server: receivedAtServer,
    });
    notifyQueueChanged();

    return { id: row.id, status: SENT, event_id: payload.event_id, received_at_server: receivedAtServer };
  } catch (error) {
    const message = error?.message || 'Staff sale sync failed';
    await db.sync_queue.update(row.id, {
      status: FAILED,
      error: message,
      next_attempt_at: nextRetryAt(attempts),
      updated_at: Date.now(),
    });
    notifyQueueChanged();
    return { id: row.id, status: FAILED, error: message };
  }
}

export async function drainStaffSaleSyncQueue({ limit = 5 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { processed: 0, records: [] };
  }

  const now = Date.now();
  const rows = await db.sync_queue.toArray();
  const due = rows
    .filter((row) => (
      row.kind === STAFF_SALE_EVENT_KIND
      && [PENDING, FAILED].includes(row.status)
      && Number(row.next_attempt_at || 0) <= now
    ))
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))
    .slice(0, limit);

  const records = [];
  for (const row of due) {
    records.push(await processStaffSaleQueueRow(row));
  }

  return { processed: due.length, records };
}

let scheduledDrain = null;

export function scheduleStaffSaleSyncDrain() {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (scheduledDrain) return;

  scheduledDrain = window.setTimeout(() => {
    scheduledDrain = null;
    drainStaffSaleSyncQueue({ limit: 5 }).catch(() => {});
  }, 0);
}
