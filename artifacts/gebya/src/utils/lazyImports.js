import { lazy } from 'react';

function isLikelyStaleChunkError(err) {
  const message = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i.test(message);
}

export function lazyWithRetry(importer, name) {
  return lazy(async () => {
    const flag = `gebya_chunk_reload_${name}`;
    const getFlag = () => { try { return sessionStorage.getItem(flag); } catch { return null; } };
    const setFlag = (on) => { try { on ? sessionStorage.setItem(flag, '1') : sessionStorage.removeItem(flag); } catch { /* storage blocked */ } };
    try {
      const mod = await importer();
      setFlag(false);
      return mod;
    } catch (err) {
      if (isLikelyStaleChunkError(err) && !getFlag()) {
        setFlag(true);
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }
  });
}

// Stable import factories (module-level so they never re-create)
export const importTransactionForm = () => import('../components/TransactionForm');
export const importEditTransactionSheet = () => import('../components/EditTransactionSheet');
export const importReminderSheet = () => import('../components/ReminderSheet');
export const importSupplierList = () => import('../components/SupplierList');
export const importSupplierDetail = () => import('../components/SupplierDetail');
export const importSupplierForm = () => import('../components/SupplierForm');
export const importSupplierTransactionSheet = () => import('../components/SupplierTransactionSheet');
export const importCustomerList = () => import('../components/CustomerList');
export const importCustomerDetail = () => import('../components/CustomerDetail');
export const importCustomerForm = () => import('../components/CustomerForm');
export const importCustomerTransactionSheet = () => import('../components/CustomerTransactionSheet');
export const importCustomerTelegramConnectSheet = () => import('../components/CustomerTelegramConnectSheet');
export const importHistoryView = () => import('../components/HistoryView');
export const importReportView = () => import('../components/ReportView');
export const importSettingsPage = () => import('../components/SettingsPage');
export const importDailySuggestions = () => import('../components/DailySuggestions');
export const importTransactionDetailSheet = () => import('../components/TransactionDetailSheet');
export const importInlineDatePicker = () => import('../components/InlineDatePicker');

export const TransactionForm = lazyWithRetry(importTransactionForm, 'TransactionForm');
export const EditTransactionSheet = lazyWithRetry(importEditTransactionSheet, 'EditTransactionSheet');
export const ReminderSheet = lazyWithRetry(importReminderSheet, 'ReminderSheet');
export const SupplierList = lazyWithRetry(importSupplierList, 'SupplierList');
export const SupplierDetail = lazyWithRetry(importSupplierDetail, 'SupplierDetail');
export const SupplierForm = lazyWithRetry(importSupplierForm, 'SupplierForm');
export const SupplierTransactionSheet = lazyWithRetry(importSupplierTransactionSheet, 'SupplierTransactionSheet');
export const CustomerList = lazyWithRetry(importCustomerList, 'CustomerList');
export const CustomerDetail = lazyWithRetry(importCustomerDetail, 'CustomerDetail');
export const CustomerForm = lazyWithRetry(importCustomerForm, 'CustomerForm');
export const CustomerTransactionSheet = lazyWithRetry(importCustomerTransactionSheet, 'CustomerTransactionSheet');
export const CustomerTelegramConnectSheet = lazyWithRetry(importCustomerTelegramConnectSheet, 'CustomerTelegramConnectSheet');
export const HistoryView = lazyWithRetry(importHistoryView, 'HistoryView');
export const ReportView = lazyWithRetry(importReportView, 'ReportView');
export const SettingsPage = lazyWithRetry(importSettingsPage, 'SettingsPage');
export const DailySuggestions = lazyWithRetry(importDailySuggestions, 'DailySuggestions');
export const TransactionDetailSheet = lazyWithRetry(importTransactionDetailSheet, 'TransactionDetailSheet');
export const InlineDatePicker = lazyWithRetry(importInlineDatePicker, 'InlineDatePicker');


