import db from '../db';
import { sendTelegramLedgerUpdate, syncTelegramCustomerState } from './telegramBotClient';

const TELEGRAM_LEDGER_UPDATE = 'telegram_ledger_update';
const PENDING = 'pending';
const RUNNING = 'running';
const FAILED = 'failed';
const SENT = 'sent';

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gebya:sync-queue-changed'));
  }
}

function nextRetryAt(attempts) {
  const delay = Math.min(5 * 60_000, Math.max(5_000, attempts * 15_000));
  return Date.now() + delay;
}

export async function enqueueTelegramLedgerUpdate({ recordTable, recordId, payload }) {
  if (!recordTable || recordId == null || !payload?.ledgerUpdate?.token) return null;

  const now = Date.now();
  const existing = await db.sync_queue
    .toArray()
    .then((rows) => rows.find((row) => (
      row.kind === TELEGRAM_LEDGER_UPDATE
      && row.record_table === recordTable
      && row.record_id === recordId
      && row.status !== SENT
    )));

  const entry = {
    kind: TELEGRAM_LEDGER_UPDATE,
    status: PENDING,
    attempts: existing?.attempts || 0,
    payload,
    record_table: recordTable,
    record_id: recordId,
    error: null,
    next_attempt_at: now,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing?.id) {
    await db.sync_queue.update(existing.id, entry);
    notifyQueueChanged();
    return existing.id;
  }

  const id = await db.sync_queue.add(entry);
  notifyQueueChanged();
  return id;
}

async function markCustomerTransactionDelivery(recordId, updates) {
  if (recordId == null) return null;
  await db.customer_transactions.update(recordId, {
    ...updates,
    telegram_delivery_attempted_at: Date.now(),
  });
  return db.customer_transactions.get(recordId);
}

export async function countPendingTelegramSync() {
  const rows = await db.sync_queue.toArray();
  return rows.filter((row) => (
    row.kind === TELEGRAM_LEDGER_UPDATE
    && [PENDING, RUNNING, FAILED].includes(row.status)
    && row.status !== SENT
  )).length;
}

async function processTelegramLedgerUpdate(row) {
  const attempts = Number(row.attempts || 0) + 1;
  await db.sync_queue.update(row.id, {
    status: RUNNING,
    attempts,
    updated_at: Date.now(),
  });

  try {
    if (row.payload?.customerState?.token) {
      await syncTelegramCustomerState(row.payload.customerState);
    }

    const result = await sendTelegramLedgerUpdate(row.payload.ledgerUpdate);
    const delivered = !!result?.delivered;
    const deliveryState = delivered ? 'bot_sent' : 'bot_pending';

    await db.sync_queue.update(row.id, {
      status: delivered ? SENT : PENDING,
      error: null,
      next_attempt_at: delivered ? null : nextRetryAt(attempts),
      updated_at: Date.now(),
    });
    notifyQueueChanged();

    const record = row.record_table === 'customer_transactions'
      ? await markCustomerTransactionDelivery(row.record_id, {
        telegram_delivery_state: deliveryState,
        telegram_delivery_error: null,
      })
      : null;

    return { id: row.id, status: deliveryState, record };
  } catch (error) {
    const message = error?.message || 'Telegram sync failed';
    await db.sync_queue.update(row.id, {
      status: FAILED,
      error: message,
      next_attempt_at: nextRetryAt(attempts),
      updated_at: Date.now(),
    });
    notifyQueueChanged();

    const record = row.record_table === 'customer_transactions'
      ? await markCustomerTransactionDelivery(row.record_id, {
        telegram_delivery_state: 'bot_failed',
        telegram_delivery_error: message,
      })
      : null;

    return { id: row.id, status: FAILED, error: message, record };
  }
}

export async function drainTelegramSyncQueue({ limit = 5 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { processed: 0, records: [] };
  }

  const now = Date.now();
  const rows = await db.sync_queue.toArray();
  const due = rows
    .filter((row) => (
      row.kind === TELEGRAM_LEDGER_UPDATE
      && [PENDING, FAILED].includes(row.status)
      && Number(row.next_attempt_at || 0) <= now
    ))
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))
    .slice(0, limit);

  const records = [];
  for (const row of due) {
    const result = await processTelegramLedgerUpdate(row);
    if (result?.record) records.push(result.record);
  }

  return { processed: due.length, records };
}
