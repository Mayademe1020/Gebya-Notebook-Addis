import { useState, useEffect, useCallback } from 'react';
import db from '../db';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import {
  createCloudProofFields,
  enqueueCloudProofUpsert,
  getTransactionCloudProofRecordType,
} from '../utils/cloudProof';
import { buildPhotoFields, normalizePhotos } from '../utils/photoProof';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { createCustomerTransactionReference } from '../utils/customerTelegram';
import { getCustomerBalance, insertCustomerTransaction } from '../utils/customerLedger';
import { buildCustomerLedgerTelegramMessage } from '../utils/customerTelegram';
import { enqueueTelegramLedgerUpdate, drainTelegramSyncQueue } from '../utils/syncQueue';
import { useLang } from '../context/LangContext';
import { useShopStore } from '../stores/shopStore';
import { fireToast } from '../components/Toast';
import { isBrowserOnline } from '../utils/browser';

function buildSavedOnDeviceMessage(message, isOnline) {
  const baseMessage = String(message || 'Saved').trim() || 'Saved';
  return isOnline ? baseMessage : (baseMessage + ' - saved on this phone');
}

/**
 * useTransactions hook — handles the core transaction list, add/update/delete,
 * last-saved snapshot, and the customer-ledger side effects for credit sales.
 *
 * Returns:
 *   transactions        — array of transaction records (newest first)
 *   lastSavedSnapshot   — { type, label, amount, created_at } | null
 *   addTransaction      — async (transaction) => { saved, customerTx }
 *   updateTransaction   — async (id, updates) => saved
 *   deleteTransaction   — async (id) => boolean
 *   rememberLastSave    — async (snapshot) => void
 *   clearLastSavedSnapshot — async () => void
 */
export function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const { t } = useLang();
  const setLastPayment = useShopStore(s => s.setLastPayment);
  const setUsageStats = useShopStore(s => s.setUsageStats);
  const shopProfile = useShopStore(s => s.shopProfile);

  // Load transactions on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await db.transactions.toArray();
        rows.sort((a, b) => b.created_at - a.created_at);
        if (!cancelled) setTransactions(rows);
      } catch (err) {
        if (import.meta.env.DEV) console.error('useTransactions load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rememberLastSave = useCallback(async (snapshot) => {
    if (!snapshot) return;
    setLastSavedSnapshot(snapshot);
    try {
      await db.settings.put({ key: 'last_saved_snapshot', value: JSON.stringify(snapshot) });
    } catch { /* non-critical */ }
  }, []);

  const clearLastSavedSnapshot = useCallback(async () => {
    setLastSavedSnapshot(null);
    try {
      await db.settings.delete('last_saved_snapshot');
    } catch { /* non-critical */ }
  }, []);

  const addTransaction = useCallback(async (transaction, actorSnapshot = {}) => {
    const isOnlineNow = isBrowserOnline();
    const now = new Date(transaction.created_at);
    const cloudProofFields = await createCloudProofFields();
    const newTxn = {
      ...transaction,
      ethiopian_date: formatEthiopian(now),
      customer_name: transaction.customer_name || null,
      ...actorSnapshot,
      ...cloudProofFields,
    };

    const id = await db.transactions.add(newTxn);
    const saved = await db.transactions.get(id);
    const transactionRecordType = getTransactionCloudProofRecordType(saved);
    if (transactionRecordType) {
      await enqueueCloudProofUpsert({
        recordTable: 'transactions',
        recordId: id,
        recordType: transactionRecordType,
        record: saved,
      });
    }
    await rememberLastSave({
      type: transaction.type,
      label: saved?.item_name || transaction.item_name || null,
      amount: saved?.amount || transaction.amount || 0,
      created_at: saved?.created_at || transaction.created_at,
    });

    setTransactions(prev => [saved, ...prev]);

    // Customer-ledger side effect for credit sales (Pay Later / Partial)
    let customerTx = null;
    if (transaction.customer_id && Number(transaction.credit_amount) > 0) {
      try {
        const createdAt = transaction.created_at || Date.now();
        const customerCloudProofFields = await createCloudProofFields();
        const proofFields = buildPhotoFields(normalizePhotos(transaction));
        const customerTxEntry = {
          customer_id: transaction.customer_id,
          type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
          amount: Number(transaction.credit_amount),
          item_note: transaction.item_name || null,
          catalog_entry_id: transaction.catalog_entry_id || null,
          item_kind: transaction.item_kind || null,
          due_date: null,
          settlement_mode: transaction.settlement_mode || null,
          items: Array.isArray(transaction.items) && transaction.items.length > 0
            ? transaction.items
            : null,
          ...proofFields,
          source_transaction_id: id,
          source_type: 'pay_later_sale',
          reference_code: null,
          telegram_delivery_state: null,
          telegram_delivery_attempted_at: null,
          created_at: createdAt,
          updated_at: Date.now(),
          ...actorSnapshot,
          ...customerCloudProofFields,
        };
        const cid = await db.customer_transactions.add(customerTxEntry);
        const referenceCode = createCustomerTransactionReference(cid, createdAt);
        await db.customer_transactions.update(cid, { reference_code: referenceCode });
        const savedCustomerTx = await db.customer_transactions.get(cid);
        if (savedCustomerTx) {
          await enqueueCloudProofUpsert({
            recordTable: 'customer_transactions',
            recordId: cid,
            recordType: 'customer_credit',
            record: savedCustomerTx,
          });
        }
        if (savedCustomerTx) {
          customerTx = savedCustomerTx;
          const customerRecord = await db.customers.get(transaction.customer_id);
          if (customerRecord?.telegram_notify_enabled && customerRecord?.telegram_chat_id && customerRecord?.telegram_link_token) {
            const customerTxRows = await db.customer_transactions.where('customer_id').equals(transaction.customer_id).toArray();
            const nextBalance = Math.max(getCustomerBalance(customerTxRows), 0);
            const creditAmount = Number(transaction.credit_amount || 0);
            const previousBalance = Math.max(nextBalance - creditAmount, 0);
            const message = buildCustomerLedgerTelegramMessage({
              shopName: shopProfile?.name,
              customerName: customerRecord.display_name,
              type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
              amount: creditAmount,
              itemNote: transaction.item_name,
              previousBalance,
              updatedBalance: nextBalance,
              createdAt,
              referenceCode,
            });
            const deliveryUpdates = {
              reference_code: referenceCode,
              telegram_delivery_state: isOnlineNow ? 'bot_pending' : 'bot_waiting_for_connection',
              telegram_delivery_error: isOnlineNow ? null : 'Telegram update needs internet.',
              telegram_delivery_attempted_at: Date.now(),
            };
            await db.customer_transactions.update(cid, deliveryUpdates);
            customerTx = { ...savedCustomerTx, ...deliveryUpdates };
            await enqueueTelegramLedgerUpdate({
              recordTable: 'customer_transactions',
              recordId: cid,
              payload: {
                customerState: {
                  token: customerRecord.telegram_link_token,
                  currentBalance: nextBalance,
                  updatesEnabled: !!customerRecord.telegram_notify_enabled,
                  telegramUsername: customerRecord.telegram_username || null,
                  chatId: customerRecord.telegram_chat_id || null,
                },
                ledgerUpdate: {
                  token: customerRecord.telegram_link_token,
                  currentBalance: nextBalance,
                  message,
                  reference: referenceCode,
                },
              },
            });
            if (isOnlineNow) {
              drainTelegramSyncQueue().catch(() => {});
            }
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('Credit-portion save failed:', err);
      }
    }

    // Update last-payment preference
    if (transaction.type === 'sale' || transaction.type === 'expense') {
      const pType = transaction.payment_type || 'cash';
      const pProvider = transaction.payment_provider || '';
      setLastPayment(prev => {
        const prev_cat = prev[transaction.type] || {};
        return {
          ...prev,
          [transaction.type]: {
            type: pType,
            provider: pProvider,
            bankProvider: pType === 'bank' ? pProvider : (prev_cat.bankProvider || ''),
            walletProvider: pType === 'wallet' ? pProvider : (prev_cat.walletProvider || ''),
          },
        };
      });
    }

    // Update feature-count analytics
    const fcKey = { sale: 'sales', expense: 'expenses' }[transaction.type];
    if (fcKey) {
      try {
        const fcRow = await db.analytics.get('feature_counts');
        let fc = { sales: 0, expenses: 0, credits: 0 };
        try { fc = fcRow ? JSON.parse(fcRow.value) : fc; } catch { /* keep default */ }
        fc[fcKey] = (fc[fcKey] || 0) + 1;
        await db.analytics.put({ key: 'feature_counts', value: JSON.stringify(fc) });
        setUsageStats(prev => {
          if (!prev) return prev;
          return { ...prev, featureCounts: fc };
        });
      } catch { /* non-critical */ }
    }

    // Toast with undo
    const toastMsg = { sale: t.saleSaved, expense: t.expenseSaved }[transaction.type] || 'Saved';
    const safeToastMsg = buildSavedOnDeviceMessage(toastMsg, isOnlineNow);
    fireToast(safeToastMsg, isOnlineNow ? 4000 : 4500, async () => {
      try {
        await db.transactions.delete(id);
        setTransactions(prev => prev.filter(t2 => t2.id !== id));
        fireToast(t.undone, 2000);
      } catch { /* non-critical */ }
    });

    return { saved, customerTx };
  }, [t, shopProfile, setLastPayment, setUsageStats, rememberLastSave]);

  const updateTransaction = useCallback(async (id, updates) => {
    try {
      await db.transactions.update(id, { ...updates, updated_at: Date.now() });
      const updated = await db.transactions.get(id);
      setTransactions(prev => prev.map(t2 => t2.id === id ? updated : t2));
      return updated;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update:', err);
      alert('Could not update. Please try again.');
      throw err;
    }
  }, []);

  const deleteTransaction = useCallback(async (id) => {
    try {
      await db.transactions.delete(id);
      const remainingTransactions = transactions.filter(t2 => t2.id !== id);
      setTransactions(remainingTransactions);
      if (remainingTransactions.length === 0) {
        await clearLastSavedSnapshot();
      }
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to delete:', err);
      return false;
    }
  }, [transactions, clearLastSavedSnapshot]);

  return {
    transactions,
    setTransactions,
    lastSavedSnapshot,
    rememberLastSave,
    clearLastSavedSnapshot,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
