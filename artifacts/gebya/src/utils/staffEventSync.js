import db, { getIdentity } from '../db';
import eventsApi from '../api/events';

export const STAFF_EVENT_PUSH = 'staff_event_push';
export const STAFF_EVENT_SCHEMA_VERSION = 1;
export const STAFF_EVENT_STATUSES = {
  localOnly: 'local_only',
  pending: 'pending',
  syncing: 'syncing',
  synced: 'synced',
  failed: 'failed',
};

function nowIsoFromMs(ms) {
  const parsed = Number(ms);
  return new Date(Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now()).toISOString();
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function paymentLabel(record) {
  return textOrNull(record.payment_provider) || textOrNull(record.payment_type) || null;
}

function eventTypeFor({ recordTable, record }) {
  if (recordTable === 'transactions' && record?.type === 'sale') return 'sale';
  if (recordTable === 'customer_transactions' && record?.type === 'payment') return 'customer_payment';
  if (recordTable === 'customer_transactions' && record?.type === 'credit_add') return 'customer_credit';
  return null;
}

function payloadFor({ eventType, record }) {
  if (eventType === 'sale') {
    return {
      amount: numberOrNull(record.amount),
      payment_method_label: paymentLabel(record),
      item_name: textOrNull(record.item_name),
      item_code: textOrNull(record.item_code),
      customer_id: record.customer_id == null ? null : String(record.customer_id),
      note: textOrNull(record.note || record.voice_note),
    };
  }

  if (eventType === 'customer_payment') {
    return {
      customer_id: record.customer_id == null ? null : String(record.customer_id),
      amount: numberOrNull(record.amount),
      payment_method_label: paymentLabel(record),
      note: textOrNull(record.item_note),
    };
  }

  if (eventType === 'customer_credit') {
    return {
      customer_id: record.customer_id == null ? null : String(record.customer_id),
      amount: numberOrNull(record.amount),
      item_name: textOrNull(record.item_note),
      item_code: textOrNull(record.item_code),
      note: textOrNull(record.note),
    };
  }

  return {};
}

function clientEventId({ identity, record }) {
  const deviceId = identity?.device_id || record.device_id || 'local-device';
  const transactionId = record.transaction_id || `${record.id}-${record.created_at || Date.now()}`;
  return `${deviceId}:${transactionId}`;
}

export function buildStaffEventEnvelope({ identity, recordTable, record, eventType: explicitEventType }) {
  const eventType = explicitEventType || eventTypeFor({ recordTable, record });
  if (!eventType || !record?.id) return null;
  const shopId = identity?.shop_id;
  const deviceId = identity?.device_id;
  const actorStaffMemberId = record.actor_staff_member_id ?? identity?.staff_id ?? null;
  if (!shopId || !deviceId) return null;

  return {
    event_id: null,
    client_event_id: clientEventId({ identity, record }),
    record_id: String(record.id),
    shop_id: shopId,
    device_id: deviceId,
    actor_staff_member_id: actorStaffMemberId == null ? null : String(actorStaffMemberId),
    actor_name_snapshot: textOrNull(record.actor_name_snapshot) || textOrNull(identity?.display_name) || 'Owner',
    actor_role_at_event: textOrNull(record.actor_role) || textOrNull(identity?.role) || 'owner',
    event_type: eventType,
    occurred_at_device: nowIsoFromMs(record.created_at),
    created_at_server: null,
    payload: payloadFor({ eventType, record }),
    schema_version: STAFF_EVENT_SCHEMA_VERSION,
  };
}

function nextRetryAt(attempts) {
  const delay = Math.min(5 * 60_000, Math.max(5_000, attempts * 15_000));
  return Date.now() + delay;
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gebya:sync-queue-changed'));
  }
}

function queueIdempotencyKey(clientEventId) {
  return `${STAFF_EVENT_PUSH}:${clientEventId}`;
}

export async function enqueueStaffEventSync({ recordTable, record, eventType }) {
  try {
    if (typeof window !== 'undefined' && window.__gebyaTestStaffEventQueueFailure === true) {
      throw new Error('Staff event queue failure requested by test');
    }

    const identity = await getIdentity();
    const envelope = buildStaffEventEnvelope({ identity, recordTable, record, eventType });
    const now = Date.now();
    if (!envelope || !identity?.device_token) {
      const fallbackClientId = record?.transaction_id
        ? `${record?.device_id || 'local-device'}:${record.transaction_id}`
        : `${recordTable}:${record?.id || now}`;
      return db.sync_queue.put({
        kind: STAFF_EVENT_PUSH,
        status: STAFF_EVENT_STATUSES.localOnly,
        client_event_id: fallbackClientId,
        idempotency_key: queueIdempotencyKey(fallbackClientId),
        event_type: eventTypeFor({ recordTable, record }) || eventType || null,
        record_table: recordTable,
        record_id: record?.id ?? null,
        record_type: eventTypeFor({ recordTable, record }) || eventType || null,
        payload: envelope,
        attempts: 0,
        error: 'Missing shop identity; event kept local only.',
        created_at: now,
        updated_at: now,
        next_attempt_at: null,
      });
    }

    const existing = await db.sync_queue
      .where('idempotency_key')
      .equals(queueIdempotencyKey(envelope.client_event_id))
      .first()
      .catch(() => null);

    const row = {
      kind: STAFF_EVENT_PUSH,
      status: STAFF_EVENT_STATUSES.pending,
      shop_id: envelope.shop_id,
      device_id: envelope.device_id,
      transaction_id: record.transaction_id || null,
      client_event_id: envelope.client_event_id,
      idempotency_key: queueIdempotencyKey(envelope.client_event_id),
      event_type: envelope.event_type,
      record_table: recordTable,
      record_id: record.id,
      record_type: envelope.event_type,
      payload: envelope,
      attempts: existing?.attempts || 0,
      error: null,
      server_event_id: existing?.server_event_id || null,
      created_at: existing?.created_at || now,
      updated_at: now,
      next_attempt_at: now,
    };

    const id = existing?.id
      ? await db.sync_queue.update(existing.id, row).then(() => existing.id)
      : await db.sync_queue.add(row);
    notifyQueueChanged();
    return id;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Staff event queue failed:', error);
    return null;
  }
}

async function markSynced(row, result) {
  await db.sync_queue.update(row.id, {
    status: STAFF_EVENT_STATUSES.synced,
    server_event_id: result.event_id || row.server_event_id || null,
    error: null,
    updated_at: Date.now(),
    next_attempt_at: null,
  });
}

async function markFailed(row, attempts, error) {
  await db.sync_queue.update(row.id, {
    status: STAFF_EVENT_STATUSES.failed,
    attempts,
    error,
    updated_at: Date.now(),
    next_attempt_at: nextRetryAt(attempts),
  });
}

async function processRow(row, token) {
  const attempts = Number(row.attempts || 0) + 1;
  await db.sync_queue.update(row.id, {
    status: STAFF_EVENT_STATUSES.syncing,
    attempts,
    updated_at: Date.now(),
  });

  try {
    const response = await eventsApi.pushEvents([row.payload], token);
    const result = response?.results?.[0];
    if (result?.status === 'accepted' || result?.status === 'duplicate') {
      await markSynced(row, result);
      notifyQueueChanged();
      return { id: row.id, status: result.status, server_event_id: result.event_id };
    }
    await markFailed(row, attempts, result?.error || 'Event rejected by server.');
    notifyQueueChanged();
    return { id: row.id, status: STAFF_EVENT_STATUSES.failed, error: result?.error };
  } catch (error) {
    const message = error?.message || 'Staff event sync failed';
    await markFailed(row, attempts, message);
    notifyQueueChanged();
    return { id: row.id, status: STAFF_EVENT_STATUSES.failed, error: message };
  }
}

export async function processStaffEventQueue({ limit = 5 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { processed: 0, results: [] };
  }

  const identity = await getIdentity();
  if (!identity?.device_token) return { processed: 0, results: [] };

  const now = Date.now();
  const due = (await db.sync_queue.toArray())
    .filter((row) => (
      row.kind === STAFF_EVENT_PUSH
      && [STAFF_EVENT_STATUSES.pending, STAFF_EVENT_STATUSES.failed].includes(row.status)
      && Number(row.next_attempt_at || 0) <= now
    ))
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))
    .slice(0, limit);

  const results = [];
  for (const row of due) {
    results.push(await processRow(row, identity.device_token));
  }
  return { processed: due.length, results };
}
