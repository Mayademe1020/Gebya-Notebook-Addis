import { useState, useEffect, useCallback, useMemo } from 'react';
import db from '../db';
import { fireToast } from '../components/Toast';
import { buildPhotoFields, normalizePhotos } from '../utils/photoProof';
import {
  createCloudProofFields,
  enqueueCloudProofUpsert,
  getSupplierCloudProofRecordType,
} from '../utils/cloudProof';
import {
  buildSupplierSummaries,
  getSupplierBalance,
  isValidSupplierTransactionType,
  SUPPLIER_TRANSACTION_TYPES,
} from '../utils/supplierLedger';

/**
 * useSuppliers hook — manages suppliers and supplier transactions.
 * Keeps state in sync with IndexedDB.
 *
 * Save functions accept an actorSnapshot object so the hook stays
 * decoupled from shopProfile / staffMembers state.
 */

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierTransactions, setSupplierTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [supplierRows, supplierTxRows] = await Promise.all([
          db.suppliers?.toArray?.() || [],
          db.supplier_transactions?.toArray?.() || [],
        ]);
        if (!cancelled) {
          setSuppliers(supplierRows || []);
          setSupplierTransactions(supplierTxRows || []);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('useSuppliers load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Derived state (must come before handlers that use it) ───────────────

  const supplierSummaries = useMemo(
    () => buildSupplierSummaries(suppliers, supplierTransactions),
    [suppliers, supplierTransactions]
  );

  // ─── Supplier CRUD ─────────────────────────────────────────────────────

  const saveSupplier = useCallback(async (payload) => {
    const now = Date.now();
    const entry = {
      display_name: String(payload.display_name || '').trim(),
      phone_number: payload.phone_number ? String(payload.phone_number).trim() : null,
      note: payload.note ? String(payload.note).trim() : null,
      photo: payload.photo || null,
      active: payload.active !== false,
      created_at: payload.created_at || now,
      updated_at: now,
    };

    if (!entry.display_name) return null;

    if (payload.id) {
      const { created_at, ...editEntry } = entry;
      await db.suppliers.update(payload.id, editEntry);
      const saved = await db.suppliers.get(payload.id);
      setSuppliers(prev => prev.map(item => item.id === payload.id ? saved : item));
      return saved;
    }

    const id = await db.suppliers.add(entry);
    const saved = await db.suppliers.get(id);
    setSuppliers(prev => [...prev, saved]);
    return saved;
  }, []);

  // ─── Supplier Transaction CRUD ──────────────────────────────────────────

  const saveSupplierTransaction = useCallback(async (payload, actorSnapshot = {}) => {
    // EDIT branch
    if (payload?.editing_id) {
      const amount = Number(payload.amount) || 0;
      if (amount <= 0) {
        fireToast('Enter a valid amount', 2200);
        return false;
      }
      const now = Date.now();
      let updated = null;
      await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
        const existing = await db.supplier_transactions.get(payload.editing_id);
        if (!existing) return;
        const supplierTx = await db.supplier_transactions
          .where('supplier_id').equals(existing.supplier_id).toArray();
        if (existing.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT) {
          const others = supplierTx.filter(t => t.id !== existing.id);
          const otherBalance = Math.max(getSupplierBalance(others), 0);
          if (amount > otherBalance) {
            fireToast('Payment is more than remaining dubie', 2600);
            return;
          }
        }
        const nextEntry = {
          ...existing,
          amount,
          item_name: payload.item_name || existing.item_name || null,
          note: payload.note || existing.note || null,
          ...(existing.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT
            ? { photos: [], photo: null, photo_taken_at: null }
            : buildPhotoFields(normalizePhotos(payload))),
          updated_at: now,
        };
        await db.supplier_transactions.update(payload.editing_id, nextEntry);
        updated = await db.supplier_transactions.get(payload.editing_id);
        await db.suppliers.update(existing.supplier_id, { updated_at: now });
      });
      if (!updated) return false;
      setSupplierTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
      fireToast('Entry updated', 1800);
      return true;
    }

    if (!isValidSupplierTransactionType(payload.type)) return false;
    const supplier = supplierSummaries.find(item => item.id === payload.supplier_id);
    if (!supplier) {
      fireToast('Supplier not found', 2200);
      return false;
    }

    const amount = Number(payload.amount) || 0;
    if (amount <= 0) {
      fireToast('Enter a valid amount', 2200);
      return false;
    }

    const now = Date.now();
    const cloudProofFields = await createCloudProofFields();
    let supplierMissing = false;
    let staleOverPayment = false;
    let saved = null;

    await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
      const supplierRecord = await db.suppliers.get(payload.supplier_id);
      if (!supplierRecord) {
        supplierMissing = true;
        return;
      }

      const existingTx = await db.supplier_transactions.where('supplier_id').equals(payload.supplier_id).toArray();
      const previousBalance = Math.max(getSupplierBalance(existingTx), 0);

      if (payload.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT && amount > previousBalance) {
        staleOverPayment = true;
        return;
      }

      const entry = {
        supplier_id: payload.supplier_id,
        type: payload.type,
        catalog_entry_id: payload.catalog_entry_id || null,
        item_name: payload.item_name || null,
        item_kind: payload.item_kind || null,
        quantity: payload.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? (Number(payload.quantity) || 1) : null,
        amount,
        note: payload.note || null,
        ...(payload.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT
          ? { photos: [], photo: null, photo_taken_at: null }
          : buildPhotoFields(normalizePhotos(payload))),
        created_at: now,
        updated_at: now,
        ...actorSnapshot,
        ...cloudProofFields,
      };

      const id = await db.supplier_transactions.add(entry);
      saved = await db.supplier_transactions.get(id);
      await db.suppliers.update(payload.supplier_id, { updated_at: now });
    });

    if (supplierMissing) {
      fireToast('Supplier not found', 2200);
      return false;
    }
    if (staleOverPayment || !saved) {
      fireToast('Payment is more than remaining dubie', 2600);
      return false;
    }

    setSupplierTransactions(prev => [saved, ...prev]);
    setSuppliers(prev => prev.map(item => item.id === payload.supplier_id ? { ...item, updated_at: now } : item));
    await enqueueCloudProofUpsert({
      recordTable: 'supplier_transactions',
      recordId: saved.id,
      recordType: getSupplierCloudProofRecordType(saved),
      record: saved,
    });
    return true;
  }, [supplierSummaries]);

  const updateSupplierTransaction = useCallback(async (transactionId, updates, actorSnapshot = {}) => {
    if (!isValidSupplierTransactionType(updates.type)) return false;
    const amount = Number(updates.amount) || 0;
    if (amount <= 0) {
      fireToast('Enter a valid amount', 2200);
      return false;
    }

    const now = Date.now();
    let supplierMissing = false;
    let transactionMissing = false;
    let staleOverPayment = false;
    let saved = null;
    let previousSupplierId = null;
    let nextSupplierId = Number(updates.supplier_id) || null;

    await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
      const existing = await db.supplier_transactions.get(transactionId);
      if (!existing) {
        transactionMissing = true;
        return;
      }

      previousSupplierId = existing.supplier_id;
      nextSupplierId = nextSupplierId || existing.supplier_id;

      const supplierRecord = await db.suppliers.get(nextSupplierId);
      if (!supplierRecord) {
        supplierMissing = true;
        return;
      }

      const nextEntry = {
        supplier_id: nextSupplierId,
        type: updates.type,
        catalog_entry_id: updates.catalog_entry_id || null,
        item_name: updates.item_name || null,
        item_kind: updates.item_kind || null,
        quantity: updates.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? (Number(updates.quantity) || 1) : null,
        amount,
        note: updates.note || null,
        updated_at: now,
      };

      const existingSupplierTx = await db.supplier_transactions.where('supplier_id').equals(previousSupplierId).toArray();
      const previousSupplierNextTx = existingSupplierTx
        .filter(item => item.id !== transactionId)
        .concat(previousSupplierId === nextSupplierId ? [{ ...existing, ...nextEntry, id: transactionId }] : []);

      if (getSupplierBalance(previousSupplierNextTx) < 0) {
        staleOverPayment = true;
        return;
      }

      if (previousSupplierId !== nextSupplierId) {
        const nextSupplierTx = await db.supplier_transactions.where('supplier_id').equals(nextSupplierId).toArray();
        const nextSupplierNextTx = nextSupplierTx.concat({ ...existing, ...nextEntry, id: transactionId });
        if (getSupplierBalance(nextSupplierNextTx) < 0) {
          staleOverPayment = true;
          return;
        }
      }

      await db.supplier_transactions.update(transactionId, nextEntry);
      saved = await db.supplier_transactions.get(transactionId);
      await db.suppliers.update(nextSupplierId, { updated_at: now });
      if (previousSupplierId && previousSupplierId !== nextSupplierId) {
        await db.suppliers.update(previousSupplierId, { updated_at: now });
      }
    });

    if (transactionMissing) {
      fireToast('Supplier transaction not found', 2200);
      return false;
    }
    if (supplierMissing) {
      fireToast('Supplier not found', 2200);
      return false;
    }
    if (staleOverPayment || !saved) {
      fireToast('Payment is more than remaining dubie', 2600);
      return false;
    }

    setSupplierTransactions(prev => prev.map(item => item.id === transactionId ? saved : item));
    const touchedSupplierIds = new Set([previousSupplierId, saved?.supplier_id].filter(Boolean));
    setSuppliers(prev => prev.map(item => touchedSupplierIds.has(item.id) ? { ...item, updated_at: now } : item));
    return saved;
  }, []);

  const deleteSupplierTransaction = useCallback(async (transactionId) => {
    const now = Date.now();
    let existing = null;
    let transactionMissing = false;
    let staleOverPayment = false;

    await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
      existing = await db.supplier_transactions.get(transactionId);
      if (!existing) {
        transactionMissing = true;
        return;
      }

      const supplierTx = await db.supplier_transactions.where('supplier_id').equals(existing.supplier_id).toArray();
      const remainingTx = supplierTx.filter(item => item.id !== transactionId);
      if (getSupplierBalance(remainingTx) < 0) {
        staleOverPayment = true;
        return;
      }

      await db.supplier_transactions.delete(transactionId);
      await db.suppliers.update(existing.supplier_id, { updated_at: now });
    });

    if (transactionMissing) {
      fireToast('Supplier transaction not found', 2200);
      return false;
    }
    if (staleOverPayment) {
      fireToast('Payment is more than remaining dubie', 2600);
      return false;
    }

    setSupplierTransactions(prev => prev.filter(item => item.id !== transactionId));
    if (existing?.supplier_id) {
      setSuppliers(prev => prev.map(item => item.id === existing.supplier_id ? { ...item, updated_at: now } : item));
    }
    return true;
  }, []);

  return {
    suppliers,
    setSuppliers,
    supplierTransactions,
    setSupplierTransactions,
    supplierSummaries,
    loading,
    saveSupplier,
    saveSupplierTransaction,
    updateSupplierTransaction,
    deleteSupplierTransaction,
  };
}
