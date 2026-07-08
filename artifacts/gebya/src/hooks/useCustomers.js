import { useState, useEffect, useCallback, useMemo } from 'react';
import db from '../db';
import { fireToast } from '../components/Toast';
import { useLang } from '../context/LangContext';
import { useShopStore } from '../stores/shopStore';
import {
  buildCustomerSummaries,
  getCustomerBalance,
  insertCustomerTransaction,
  sortCustomerTransactions,
} from '../utils/customerLedger';
import {
  normalizeCustomerDraft,
  normalizeCustomerTransactionDraft,
  fifoAllocatePayment,
} from '../utils/customerLedgerMutations';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import {
  buildCustomerLedgerTelegramMessage,
  buildTelegramMessageUrl,
  createCustomerTelegramLinkToken,
  createCustomerTransactionReference,
} from '../utils/customerTelegram';
import { buildPhotoFields, normalizePhotos } from '../utils/photoProof';
import {
  createCloudProofFields,
  enqueueCloudProofUpsert,
  getCustomerCloudProofRecordType,
} from '../utils/cloudProof';
import { enqueueTelegramLedgerUpdate, drainTelegramSyncQueue } from '../utils/syncQueue';
import { syncTelegramCustomerState } from '../utils/telegramBotClient';
import { isBrowserOnline } from '../utils/browser';
import { enrichCustomerSummaries } from '../utils/customerMetrics';

/**
 * useCustomers hook — manages customers, customer transactions (ledger),
 * Telegram integration, reminders, and derived metrics.
 *
 * Save functions accept an actorSnapshot object so the hook stays
 * decoupled from shopProfile / staffMembers state.
 */

export function useCustomers() {
  const [ledgerCustomers, setLedgerCustomers] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const { lang, t } = useLang();
  const shopProfile = useShopStore(s => s.shopProfile);
  const setUsageStats = useShopStore(s => s.setUsageStats);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [customerRows, customerTxRows] = await Promise.all([
          db.customers.toArray(),
          db.customer_transactions.toArray(),
        ]);
        if (!cancelled) {
          setLedgerCustomers(customerRows || []);
          setLedgerTransactions(sortCustomerTransactions(customerTxRows || []));
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('useCustomers load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Derived state ──────────────────────────────────────────────────────

  const customerSummaries = useMemo(
    () => buildCustomerSummaries(ledgerCustomers, ledgerTransactions),
    [ledgerCustomers, ledgerTransactions]
  );

  const enrichedCustomerSummaries = useMemo(
    () => enrichCustomerSummaries(customerSummaries),
    [customerSummaries]
  );

  // ─── Customer CRUD ──────────────────────────────────────────────────────

  const addCustomerInline = useCallback(async (payload) => {
    const draft = normalizeCustomerDraft(payload);
    if (!draft) return null;
    try {
      const now = Date.now();
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
        photo: payload?.photo || null,
        telegram_chat_id: null,
        telegram_link_token: linkToken,
        telegram_linked_at: null,
        telegram_link_requested_at: null,
        created_at: now,
        updated_at: now,
      });
      const saved = await db.customers.get(id);
      setLedgerCustomers(prev => [...prev, saved]);
      return saved;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Inline customer save failed:', err);
      return null;
    }
  }, []);

  const addCustomer = useCallback(async (payload) => {
    const draft = normalizeCustomerDraft(payload);
    if (!draft) return false;

    try {
      const now = Date.now();
      if (payload.id) {
        const updates = { ...draft, photo: payload?.photo || null, updated_at: now };
        await db.customers.update(payload.id, updates);
        const updated = await db.customers.get(payload.id);
        setLedgerCustomers(prev => prev.map(c => (c.id === payload.id ? updated : c)));
        fireToast(lang === 'am' ? 'ተስተካክሏል' : 'Customer updated', 1800);
        return true;
      }
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
        photo: payload?.photo || null,
        telegram_chat_id: null,
        telegram_link_token: linkToken,
        telegram_linked_at: null,
        telegram_link_requested_at: null,
        created_at: now,
        updated_at: now,
      });
      const saved = await db.customers.get(id);
      setLedgerCustomers(prev => [...prev, saved]);
      fireToast(t.customerSaved, 1800);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save customer:', err);
      fireToast(t.customerSaveFailed || 'Could not save customer. Please try again.', 2400);
      return false;
    }
  }, [lang, t]);

  const updateCustomerRecord = useCallback(async (customerId, updates) => {
    const now = Date.now();
    const nextUpdates = { ...updates, updated_at: now };
    await db.customers.update(customerId, nextUpdates);
    setLedgerCustomers(prev => prev.map(customer => (
      customer.id === customerId ? { ...customer, ...nextUpdates } : customer
    )));
  }, []);

  // ─── Telegram ───────────────────────────────────────────────────────────

  const toggleCustomerTelegramNotify = useCallback(async (customer) => {
    if (!customer) return;
    const hasLinkedBorrower = !!customer.telegram_chat_id;
    const hasManualTelegram = !!customer.telegram_username;

    if (!hasLinkedBorrower && !hasManualTelegram) {
      await updateCustomerRecord(customer.id, { telegram_notify_enabled: false });
      fireToast(t.telegramConnectFirstToast, 2200);
      return false;
    }
    const nextEnabled = !customer.telegram_notify_enabled;
    await updateCustomerRecord(customer.id, { telegram_notify_enabled: nextEnabled });
    if (hasLinkedBorrower) {
      await syncTelegramCustomerState({
        token: customer.telegram_link_token,
        customerName: customer.display_name,
        shopName: shopProfile?.name || 'Gebya',
        currentBalance: Number(customer.balance || 0),
        updatesEnabled: nextEnabled,
        telegramUsername: customer.telegram_username || null,
        chatId: customer.telegram_chat_id || null,
      });
    } else if (nextEnabled) {
      fireToast('Manual Telegram updates will open a drafted message after each save.', 2600);
    }
    return nextEnabled;
  }, [lang, shopProfile, t, updateCustomerRecord]);

  const confirmTelegramConnection = useCallback(async (customer, payload) => {
    if (!customer) return;
    const now = Date.now();
    const nextChatId = payload.telegram_chat_id || customer.telegram_chat_id || null;
    const nextUsername = payload.telegram_username || customer.telegram_username || null;
    await updateCustomerRecord(customer.id, {
      telegram_username: nextUsername,
      telegram_chat_id: nextChatId,
      telegram_link_token: customer.telegram_link_token || createCustomerTelegramLinkToken(customer.id),
      telegram_linked_at: nextChatId ? (payload.telegram_linked_at || customer.telegram_linked_at || now) : customer.telegram_linked_at || null,
      telegram_link_requested_at: payload.telegram_link_requested_at || customer.telegram_link_requested_at || now,
      telegram_notify_enabled: nextChatId
        ? customer.telegram_notify_enabled
        : Boolean(nextUsername && customer.telegram_notify_enabled),
    });
    if (nextChatId) {
      await syncTelegramCustomerState({
        token: customer.telegram_link_token,
        customerName: customer.display_name,
        shopName: shopProfile?.name || 'Gebya',
        currentBalance: Number(customer.balance || 0),
        updatesEnabled: !!customer.telegram_notify_enabled,
        telegramUsername: nextUsername || customer.telegram_username || null,
        chatId: nextChatId || customer.telegram_chat_id || null,
      });
    }
    if (payload.showSavedToast !== false) {
      fireToast(t.saved, 1800);
    }
  }, [shopProfile, t, updateCustomerRecord]);

  const resendTelegramUpdate = useCallback(async (customer) => {
    if (!customer?.telegram_link_token) {
      fireToast('Generate a Telegram borrower link first.', 2200);
      return false;
    }
    try {
      await syncTelegramCustomerState({
        token: customer.telegram_link_token,
        customerName: customer.display_name,
        shopName: shopProfile?.name || 'Gebya',
        currentBalance: Number(customer.balance || 0),
        updatesEnabled: !!customer.telegram_notify_enabled,
        telegramUsername: customer.telegram_username || null,
        chatId: customer.telegram_chat_id || null,
      });
      const result = await resendLatestTelegramUpdate({ token: customer.telegram_link_token });
      if (result?.delivered) {
        fireToast('Latest borrower update sent again.', 2200);
        return true;
      }
      fireToast('No borrower update is ready to resend yet.', 2200);
      return false;
    } catch (error) {
      fireToast(error?.message || 'Could not resend the borrower update.', 2600);
      return false;
    }
  }, [shopProfile]);

  // ─── Reminders ──────────────────────────────────────────────────────────

  const markReminderSent = useCallback(async (customerId) => {
    const stamp = Date.now();
    try {
      await db.customers.update(customerId, { last_reminded_at: stamp });
    } catch { /* non-critical */ }
    setLedgerCustomers(prev => prev.map(c => (
      c.id === customerId ? { ...c, last_reminded_at: stamp } : c
    )));
  }, []);

  // ─── Customer Transaction CRUD ────────────────────────────────────────

  const updateCustomerTransactionRecord = useCallback(async (editingId, draft, originalPayload) => {
    try {
      const existing = await db.customer_transactions.get(editingId);
      if (!existing) {
        fireToast(t.customerNotFound || 'Entry not found', 2200);
        return false;
      }
      const itemsToStore = Array.isArray(originalPayload?.items) && originalPayload.items.length > 0
        ? originalPayload.items
        : null;
      const proofFields = existing.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
        ? { photos: [], photo: null, photo_taken_at: null }
        : buildPhotoFields(normalizePhotos(originalPayload));
      const updates = {
        type: draft.type,
        amount: draft.amount,
        item_note: draft.item_note,
        catalog_entry_id: draft.catalog_entry_id || null,
        item_kind: draft.item_kind || null,
        due_date: draft.due_date || null,
        items: itemsToStore,
        ...proofFields,
        quantity: originalPayload?.quantity != null ? Number(originalPayload.quantity) : null,
        updated_at: Date.now(),
      };
      await db.customer_transactions.update(editingId, updates);
      const updated = await db.customer_transactions.get(editingId);
      setLedgerTransactions(prev => prev.map(t2 => (t2.id === editingId ? updated : t2)));
      fireToast(lang === 'am' ? 'ተስተካክሏል' : 'Entry updated', 1800);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Edit customer_transaction failed:', err);
      fireToast(lang === 'am' ? 'ማስተካከል አልተሳካም' : 'Could not update entry', 2400);
      return false;
    }
  }, [lang, t]);

  const deleteCustomerTransaction = useCallback(async (tx) => {
    if (!tx?.id) return false;
    const reversalAmount = Math.abs(Number(tx.amount) || 0);
    if (reversalAmount <= 0) return false;
    const reversalEntry = {
      customer_id: tx.customer_id,
      type: 'reversal',
      amount: reversalAmount,
      item_note: tx.item_note ? `Reversal of: ${tx.item_note}` : 'Reversal',
      due_date: null,
      reversal_of: tx.id,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    setLedgerTransactions(prev => {
      const without = prev.filter(t2 => t2.id !== tx.id);
      return [reversalEntry, ...without];
    });
    try {
      await db.customer_transactions.add(reversalEntry);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Reversal entry failed:', err);
      setLedgerTransactions(prev => prev.find(t2 => t2.id === tx.id) ? prev : [tx, ...prev]);
      fireToast(lang === 'am' ? 'ሰርዝ አልተሳካም' : 'Could not reverse entry', 2400);
      return false;
    }
    const msg = lang === 'am' ? 'ተሰርዟል' : 'Entry reversed';
    fireToast(msg, 4000, async () => {
      try {
        const reversals = await db.customer_transactions.where('reversal_of').equals(tx.id).toArray();
        for (const r of reversals) {
          await db.customer_transactions.delete(r.id);
        }
        const restored = { ...tx, updated_at: Date.now() };
        await db.customer_transactions.put(restored);
        setLedgerTransactions(prev => insertCustomerTransaction(prev.filter(t2 => !reversals.some(r => r.id === t2.id)), restored));
        fireToast(t.undone || 'Undone', 1800);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Undo delete customer_transaction failed:', err);
      }
    });
    return true;
  }, [lang, t]);

  const saveCustomerTransaction = useCallback(async (payload, actorSnapshot = {}) => {
    if (payload?.editing_id) {
      const draftForEdit = normalizeCustomerTransactionDraft(payload);
      if (!draftForEdit) {
        fireToast(t.validAmountRequired, 2200);
        return false;
      }
      return updateCustomerTransactionRecord(payload.editing_id, draftForEdit, payload);
    }

    const draft = normalizeCustomerTransactionDraft(payload);
    if (!draft) {
      fireToast(t.validAmountRequired, 2200);
      return false;
    }

    const customer = customerSummaries.find(c => c.id === draft.customer_id);
    if (!customer) {
      fireToast(t.customerNotFound, 2200);
      return false;
    }

    const { amount } = draft;
    if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT && amount > Math.max(customer.balance || 0, 0)) {
      fireToast(t.paymentMoreThanBalance, 2600);
      return false;
    }

    const now = Date.now();
    const isOnlineNow = isBrowserOnline();
    const cloudProofFields = await createCloudProofFields();
    let customerMissing = false;
    let staleOverPayment = false;
    let saved = null;
    let nextBalance = 0;
    let previousBalance = Math.max(customer.balance || 0, 0);
    let referenceCode = null;
    let latestCustomerRecord = null;

    await db.transaction('rw', db.customer_transactions, db.customers, async () => {
      const customerRecord = await db.customers.get(payload.customer_id);
      if (!customerRecord) {
        customerMissing = true;
        return;
      }

      const existingTx = await db.customer_transactions.where('customer_id').equals(payload.customer_id).toArray();
      previousBalance = Math.max(getCustomerBalance(existingTx), 0);

      if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT && amount > previousBalance) {
        staleOverPayment = true;
        return;
      }

      const entry = {
        ...draft,
        items: Array.isArray(payload?.items) && payload.items.length > 0 ? payload.items : null,
        ...(draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
          ? { photos: [], photo: null, photo_taken_at: null }
          : buildPhotoFields(normalizePhotos(payload))),
        quantity: payload?.quantity != null ? Number(payload.quantity) : null,
        reference_code: null,
        telegram_delivery_state: null,
        telegram_delivery_attempted_at: null,
        created_at: now,
        updated_at: now,
        ...actorSnapshot,
        ...cloudProofFields,
      };

      const id = await db.customer_transactions.add(entry);
      referenceCode = createCustomerTransactionReference(id, now);
      await db.customer_transactions.update(id, { reference_code: referenceCode });
      saved = await db.customer_transactions.get(id);
      nextBalance = getCustomerBalance([saved, ...existingTx]);

      if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) {
        const allCredits = await db.customer_transactions
          .where('customer_id').equals(payload.customer_id)
          .and(tx => tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD)
          .toArray();
        const openCredits = allCredits
          .filter(c => (Number(c.amount) || 0) - (Number(c.paid_amount) || 0) > 0)
          .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        if (openCredits.length > 0) {
          const { allocation, creditsToUpdate } = fifoAllocatePayment(amount, openCredits);
          if (creditsToUpdate.length > 0) {
            for (const update of creditsToUpdate) {
              await db.customer_transactions.update(update.id, {
                paid_amount: update.paid_amount,
                status: update.status,
              });
            }
            await db.customer_transactions.update(id, {
              allocation,
            });
            saved = await db.customer_transactions.get(id);
            nextBalance = getCustomerBalance([saved, ...existingTx]);
          }
        }
      }

      await db.customers.update(draft.customer_id, { updated_at: now });
      latestCustomerRecord = await db.customers.get(draft.customer_id);
    });

    if (customerMissing) {
      fireToast(t.customerNotFound, 2200);
      return false;
    }
    if (staleOverPayment || !saved) {
      fireToast(t.paymentMoreThanBalance, 2600);
      return false;
    }

    const settledFullBalance = (
      draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT &&
      previousBalance > 0 &&
      nextBalance <= 0
    );
    const deliveryCustomer = latestCustomerRecord
      ? { ...customer, ...latestCustomerRecord, balance: nextBalance }
      : customer;

    setLedgerTransactions(prev => insertCustomerTransaction(prev, saved));
    setLedgerCustomers(prev => prev.map(c => c.id === draft.customer_id ? { ...c, updated_at: now } : c));
    await enqueueCloudProofUpsert({
      recordTable: 'customer_transactions',
      recordId: saved.id,
      recordType: getCustomerCloudProofRecordType(saved),
      record: saved,
    });

    // Update analytics
    if (draft.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) {
      try {
        const fcRow = await db.analytics.get('feature_counts');
        let fc = { sales: 0, expenses: 0, credits: 0 };
        try { fc = fcRow ? JSON.parse(fcRow.value) : fc; } catch { /* keep default */ }
        fc.credits = (fc.credits || 0) + 1;
        await db.analytics.put({ key: 'feature_counts', value: JSON.stringify(fc) });
        setUsageStats(prev => prev ? { ...prev, featureCounts: fc } : prev);
      } catch { /* non-critical */ }
    }
    if (settledFullBalance) {
      try {
        const crRow = await db.analytics.get('credits_repaid');
        const repaidCount = (crRow?.value || 0) + 1;
        await db.analytics.put({ key: 'credits_repaid', value: repaidCount });
        setUsageStats(prev => prev ? { ...prev, creditsRepaid: repaidCount } : prev);
      } catch { /* non-critical */ }
    }

    // Telegram delivery
    let telegramDeliveryState = 'not_configured';
    let telegramDeliveryError = null;
    let shouldDrainQueuedTelegram = false;
    const message = buildCustomerLedgerTelegramMessage({
      shopName: shopProfile?.name,
      customerName: deliveryCustomer.display_name,
      type: draft.type,
      amount,
      itemNote: draft.item_note,
      previousBalance,
      updatedBalance: nextBalance,
      createdAt: now,
      referenceCode,
    });

    if (deliveryCustomer?.telegram_notify_enabled && deliveryCustomer?.telegram_chat_id && deliveryCustomer?.telegram_link_token) {
      telegramDeliveryState = isOnlineNow ? 'bot_pending' : 'bot_waiting_for_connection';
      telegramDeliveryError = isOnlineNow ? null : 'Telegram update needs internet.';
      try {
        await enqueueTelegramLedgerUpdate({
          recordTable: 'customer_transactions',
          recordId: saved.id,
          payload: {
            customerState: {
              token: deliveryCustomer.telegram_link_token,
              currentBalance: nextBalance,
              updatesEnabled: !!deliveryCustomer.telegram_notify_enabled,
              telegramUsername: deliveryCustomer.telegram_username || null,
              chatId: deliveryCustomer.telegram_chat_id || null,
            },
            ledgerUpdate: {
              token: deliveryCustomer.telegram_link_token,
              currentBalance: nextBalance,
              message,
              reference: referenceCode,
            },
          },
        });
        shouldDrainQueuedTelegram = isOnlineNow;
      } catch (error) {
        telegramDeliveryState = 'bot_failed';
        telegramDeliveryError = error?.message || 'Telegram queue failed';
      }
    } else if (deliveryCustomer?.telegram_notify_enabled && deliveryCustomer?.telegram_username) {
      if (!isOnlineNow) {
        telegramDeliveryState = 'manual_waiting_for_connection';
        telegramDeliveryError = 'Open Telegram when internet returns to send this update.';
      } else {
        const telegramUrl = buildTelegramMessageUrl(deliveryCustomer.telegram_username, message);
        if (telegramUrl) {
          window.open(telegramUrl, '_blank', 'noopener,noreferrer');
          telegramDeliveryState = 'manual_opened';
        } else {
          telegramDeliveryState = 'manual_unavailable';
          telegramDeliveryError = 'Manual Telegram contact is invalid.';
        }
      }
    } else {
      telegramDeliveryState = deliveryCustomer?.telegram_chat_id ? 'bot_linked_updates_off' : 'not_linked';
    }

    if (saved?.id) {
      const deliveryUpdates = {
        reference_code: referenceCode,
        telegram_delivery_state: telegramDeliveryState,
        telegram_delivery_error: telegramDeliveryError,
        telegram_delivery_attempted_at: Date.now(),
      };
      await db.customer_transactions.update(saved.id, deliveryUpdates);
      saved = { ...saved, ...deliveryUpdates };
      setLedgerTransactions(prev => prev.map(entry => entry.id === saved.id ? saved : entry));
    }

    if (shouldDrainQueuedTelegram) {
      drainTelegramSyncQueue().catch(() => {});
    }

    if (telegramDeliveryState === 'bot_failed') {
      fireToast(`Dubie saved. ${telegramDeliveryError || 'Telegram send failed.'}`, 2600);
    } else if (telegramDeliveryState === 'bot_waiting_for_connection') {
      fireToast('Dubie saved on this phone. Telegram will send after you reconnect and resend.', 3200);
    } else if (telegramDeliveryState === 'manual_waiting_for_connection') {
      fireToast('Dubie saved on this phone. Open Telegram after internet returns to send the drafted update.', 3200);
    }

    return true;
  }, [customerSummaries, lang, shopProfile, t, setUsageStats, updateCustomerTransactionRecord]);


  return {
    ledgerCustomers,
    setLedgerCustomers,
    ledgerTransactions,
    setLedgerTransactions,
    customerSummaries,
    enrichedCustomerSummaries,
    loading,
    addCustomer,
    addCustomerInline,
    updateCustomerRecord,
    toggleCustomerTelegramNotify,
    confirmTelegramConnection,
    resendTelegramUpdate,
    markReminderSent,
    saveCustomerTransaction,
    deleteCustomerTransaction,
  };
}
