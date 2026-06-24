import db from '../db';
import { CUSTOMER_TRANSACTION_TYPES } from './customerTransactionTypes';
import { SUPPLIER_TRANSACTION_TYPES } from './supplierLedger';

export const CLOUD_PROOF_DEVICE_ID_KEY = 'cloud_proof_device_id';
export const CLOUD_PROOF_SCHEMA_VERSION = 1;
export const CLOUD_PROOF_UPSERT = 'cloud_proof_upsert';
export const CLOUD_PROOF_PENDING = 'pending';
export const CLOUD_PROOF_UPLOAD_ENABLED = import.meta.env.VITE_CLOUD_PROOF_UPLOAD_ENABLED === 'true';

function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

export function createTransactionId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `txn_${Date.now().toString(36)}_${randomHex(16)}`;
}

export function createDeviceId() {
  return `device_${createTransactionId()}`;
}

export function buildIdempotencyKey(deviceId, transactionId) {
  return `${deviceId}:${transactionId}`;
}

export async function getOrCreateCloudProofDeviceId() {
  const existing = await db.settings.get(CLOUD_PROOF_DEVICE_ID_KEY);
  if (existing?.value) return existing.value;

  const deviceId = createDeviceId();
  await db.settings.put({
    key: CLOUD_PROOF_DEVICE_ID_KEY,
    value: deviceId,
  });
  return deviceId;
}

export async function createCloudProofFields() {
  const deviceId = await getOrCreateCloudProofDeviceId();
  return {
    device_id: deviceId,
    transaction_id: createTransactionId(),
    schema_version: CLOUD_PROOF_SCHEMA_VERSION,
  };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function actorStaffReference(record) {
  return record?.actor_staff_member_id == null ? null : record.actor_staff_member_id;
}

export function buildCloudProofPayload({ recordTable, recordType, record }) {
  const base = {
    transaction_id: record.transaction_id,
    device_id: record.device_id,
    local_id: record.id,
    record_type: recordType,
    amount: numberOrNull(record.amount),
    quantity: numberOrNull(record.quantity),
    created_at: timestampOrNull(record.created_at),
    updated_at: timestampOrNull(record.updated_at),
    actor_staff_member_id: actorStaffReference(record),
    schema_version: record.schema_version || CLOUD_PROOF_SCHEMA_VERSION,
  };

  if (recordTable === 'transactions') {
    return {
      ...base,
      payment_type: record.payment_type || null,
      ethiopian_date: record.ethiopian_date || null,
    };
  }

  if (recordTable === 'customer_transactions') {
    return {
      ...base,
      customer_local_id: record.customer_id ?? null,
    };
  }

  if (recordTable === 'supplier_transactions') {
    return {
      ...base,
      supplier_local_id: record.supplier_id ?? null,
    };
  }

  return base;
}

export async function enqueueCloudProofUpsert({ recordTable, recordId, recordType, record }) {
  try {
    if (!recordTable || recordId == null || !recordType || !record?.transaction_id) return null;
    if (typeof window !== 'undefined' && window.__gebyaTestCloudProofQueueFailure === true) {
      throw new Error('Cloud proof queue failure requested by test');
    }

    const deviceId = record.device_id || await getOrCreateCloudProofDeviceId();
    const now = Date.now();
    const idempotencyKey = buildIdempotencyKey(deviceId, record.transaction_id);
    const payload = buildCloudProofPayload({
      recordTable,
      recordType,
      record: {
        ...record,
        id: recordId,
        device_id: deviceId,
      },
    });

    return await db.sync_queue.put({
      kind: CLOUD_PROOF_UPSERT,
      status: CLOUD_PROOF_PENDING,
      device_id: deviceId,
      transaction_id: record.transaction_id,
      idempotency_key: idempotencyKey,
      record_table: recordTable,
      record_id: recordId,
      record_type: recordType,
      payload,
      attempts: 0,
      error: null,
      created_at: now,
      updated_at: now,
      next_attempt_at: now,
      upload_enabled: CLOUD_PROOF_UPLOAD_ENABLED,
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Cloud proof queue failed:', error);
    return null;
  }
}

export function getTransactionCloudProofRecordType(transaction) {
  if (transaction?.type === 'sale') return 'sale';
  if (transaction?.type === 'expense') return 'expense';
  return null;
}

export function getCustomerCloudProofRecordType(transaction) {
  if (transaction?.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) return 'customer_payment';
  if (transaction?.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) return 'customer_credit';
  return null;
}

export function getSupplierCloudProofRecordType(transaction) {
  if (transaction?.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT) return 'supplier_payment';
  if (transaction?.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD) return 'supplier_purchase';
  return null;
}
