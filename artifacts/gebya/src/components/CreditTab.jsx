import { Suspense } from 'react';
import { useLang } from '../context/LangContext';
import { useAppStore } from '../stores/appStore';
import { PanelFallback } from './Fallbacks';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';
import {
  CustomerList, CustomerDetail, CustomerForm, CustomerTransactionSheet,
  CustomerTelegramConnectSheet, SupplierList, SupplierDetail, SupplierForm,
  SupplierTransactionSheet,
} from '../utils/lazyImports';

export default function CreditTab({
  enrichedCustomerSummaries,
  customerSummaries,
  creditMetrics,
  supplierSummaries,
  activeCatalogEntries,
  currentActorLabel,
  handleToggleCustomerTelegramNotify,
  handleResendCustomerTelegramUpdate,
  handleSaveCustomerTransaction,
  handleDeleteCustomerTransaction,
  handleSaveSupplier,
  handleSaveSupplierTransaction,
  handleDeleteSupplierTransaction,
  handleCustomerReminderSent,
}) {
  const { lang, t } = useLang();
  const creditView = useAppStore(s => s.creditView);
  const setCreditView = useAppStore(s => s.setCreditView);
  const selectedCustomerId = useAppStore(s => s.selectedCustomerId);
  const setSelectedCustomerId = useAppStore(s => s.setSelectedCustomerId);
  const selectedSupplierId = useAppStore(s => s.selectedSupplierId);
  const setSelectedSupplierId = useAppStore(s => s.setSelectedSupplierId);
  const setCustomerTransactionModal = useAppStore(s => s.setCustomerTransactionModal);
  const setTelegramConnectCustomerId = useAppStore(s => s.setTelegramConnectCustomerId);
  const setReminderTarget = useAppStore(s => s.setReminderTarget);
  const setCustomerEditTarget = useAppStore(s => s.setCustomerEditTarget);
  const setCustomerTransactionEditTarget = useAppStore(s => s.setCustomerTransactionEditTarget);
  const setBulkReminderQueue = useAppStore(s => s.setBulkReminderQueue);
  const setSupplierTransactionModal = useAppStore(s => s.setSupplierTransactionModal);
  const setSupplierEditTarget = useAppStore(s => s.setSupplierEditTarget);
  const setSupplierTransactionEditTarget = useAppStore(s => s.setSupplierTransactionEditTarget);
  const setShowCustomerForm = useAppStore(s => s.setShowCustomerForm);
  const setShowSupplierForm = useAppStore(s => s.setShowSupplierForm);

  const selectedCustomer = enrichedCustomerSummaries.find(c => c.id === selectedCustomerId) || null;
  const selectedSupplier = supplierSummaries.find(s => s.id === selectedSupplierId) || null;

  return (
    <>
      {/* Segmented control */}
      {!selectedCustomer && !selectedSupplier && (
        <div className="flex gap-1.5 p-1 mb-4" style={{ background: '#f5f1ea', borderRadius: 'var(--radius-md)' }}>
          {[
            { id: 'customers', label: lang === 'am' ? 'ደንበኞች (ያለባቸው)' : 'Customers (owe me)', accent: '#C4883A' },
            { id: 'suppliers', label: lang === 'am' ? 'አቅራቢዎች (ያለብኝ)' : 'Suppliers (I owe)', accent: '#dc2626' },
          ].map((view) => {
            const active = creditView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setCreditView(view.id)}
                className="flex-1 py-2 px-3 text-xs font-bold transition-all min-h-[40px] press-scale"
                style={{ borderRadius: 'var(--radius-sm)', background: active ? '#fff' : 'transparent', color: active ? view.accent : '#6b7280', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Customers */}
      {creditView === 'customers' && (
        selectedCustomer ? (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <CustomerDetail
              customer={selectedCustomer}
              onBack={() => setSelectedCustomerId(null)}
              onAddCredit={() => setCustomerTransactionModal({ mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD, customerId: selectedCustomer.id })}
              onRecordPayment={() => setCustomerTransactionModal({ mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT, customerId: selectedCustomer.id })}
              onMarkFullyPaid={(c) => setCustomerTransactionModal({ mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT, customerId: c.id, initialAmount: Number(c.balance || 0) })}
              onToggleTelegramNotify={() => handleToggleCustomerTelegramNotify(selectedCustomer)}
              onOpenTelegramConnect={() => setTelegramConnectCustomerId(selectedCustomer.id)}
              onResendTelegramUpdate={() => handleResendCustomerTelegramUpdate(selectedCustomer)}
              onRemind={(c) => setReminderTarget(c)}
              onEditCustomer={(c) => setCustomerEditTarget(c)}
              onEditCustomerTransaction={(tx) => setCustomerTransactionEditTarget({ transaction: tx, customerId: selectedCustomer.id })}
              onDeleteCustomerTransaction={handleDeleteCustomerTransaction}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <CustomerList
              customers={enrichedCustomerSummaries}
              metrics={creditMetrics}
              onSelectCustomer={(c) => setSelectedCustomerId(c.id)}
              onAddCustomer={() => setShowCustomerForm(true)}
              onRemindCustomer={(c) => setReminderTarget(c)}
              onBulkRemind={() => {
                const queue = enrichedCustomerSummaries
                  .filter(c => c.has_overdue && (c.telegram_chat_id || c.telegram_username || c.phone_number))
                  .map(c => c.id);
                if (!queue.length) return;
                setBulkReminderQueue(queue.slice(1));
                setReminderTarget(enrichedCustomerSummaries.find(c => c.id === queue[0]));
              }}
            />
          </Suspense>
        )
      )}

      {/* Suppliers */}
      {creditView === 'suppliers' && (
        selectedSupplier ? (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SupplierDetail
              supplier={selectedSupplier}
              onBack={() => setSelectedSupplierId(null)}
              onAddPurchase={() => setSupplierTransactionModal({ mode: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD, supplierId: selectedSupplier.id })}
              onPaySupplier={() => setSupplierTransactionModal({ mode: SUPPLIER_TRANSACTION_TYPES.PAYMENT, supplierId: selectedSupplier.id })}
              onMarkFullyPaid={(s) => setSupplierTransactionModal({ mode: SUPPLIER_TRANSACTION_TYPES.PAYMENT, supplierId: s.id, initialAmount: Number(s.balance || 0) })}
              onEditSupplier={(s) => setSupplierEditTarget(s)}
              onEditSupplierTransaction={(tx) => setSupplierTransactionEditTarget({ transaction: tx, supplierId: selectedSupplier.id })}
              onDeleteSupplierTransaction={handleDeleteSupplierTransaction}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SupplierList
              suppliers={supplierSummaries}
              onSelectSupplier={(s) => setSelectedSupplierId(s.id)}
              onAddSupplier={() => setShowSupplierForm(true)}
            />
          </Suspense>
        )
      )}
    </>
  );
}
