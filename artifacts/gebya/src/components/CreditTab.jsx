import { Suspense, useState } from 'react';
import { useLang } from '../context/LangContext';
import { useAppStore } from '../stores/appStore';
import { PanelFallback } from './Fallbacks';
import { CustomerList, CustomerDetail, SupplierList, SupplierDetail } from '../utils/lazyImports';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { SUPPLIER_TRANSACTION_TYPES, buildSupplierReport, exportSupplierReportCsv } from '../utils/supplierLedger';
import { buildCreditReport, exportCreditReportCsv, exportCreditReportPdf } from '../utils/customerMetrics';
import { fireToast } from './Toast';
import DownloadMenuSheet from './DownloadMenuSheet';
import OverdueCustomerFlags from './OverdueCustomerFlags';
import { label } from '../labels/index';

export default function CreditTab({
  selectedCustomer,
  selectedSupplier,
  shopProfile,
  enrichedCustomerSummaries,
  creditMetrics,
  supplierSummaries,
  customerTransactions,
  onToggleTelegramNotify,
  onResendTelegramUpdate,
  onSelectTransaction,
  onSelectSupplierTransaction,
  onSetReminderDefaultChannel,
  onTransfer,
  onArchiveCustomer,
  onRecordPromise,
  onClearPromise,
}) {
  const { t, lang } = useLang();
  const creditView = useAppStore(s => s.creditView);
  const setCreditView = useAppStore(s => s.setCreditView);
  const setSelectedCustomerId = useAppStore(s => s.setSelectedCustomerId);
  const setSelectedSupplierId = useAppStore(s => s.setSelectedSupplierId);
  const setCustomerTransactionModal = useAppStore(s => s.setCustomerTransactionModal);
  const setShowCustomerForm = useAppStore(s => s.setShowCustomerForm);
  const setShowSupplierForm = useAppStore(s => s.setShowSupplierForm);
  const setCustomerEditTarget = useAppStore(s => s.setCustomerEditTarget);
  const setTelegramConnectCustomerId = useAppStore(s => s.setTelegramConnectCustomerId);
  const setReminderTarget = useAppStore(s => s.setReminderTarget);
  const setSupplierTransactionModal = useAppStore(s => s.setSupplierTransactionModal);
  const setSupplierEditTarget = useAppStore(s => s.setSupplierEditTarget);
  const setBulkReminderQueue = useAppStore(s => s.setBulkReminderQueue);

  const [downloadOpen, setDownloadOpen] = useState(false);

  const handleBulkRemind = () => {
    const overdueCustomers = enrichedCustomerSummaries.filter((c) => c.has_overdue);
    const remindable = overdueCustomers.filter((c) =>
      c.telegram_chat_id || c.telegram_username || c.phone_number);
    const skipped = overdueCustomers.length - remindable.length;
    if (remindable.length === 0) {
      fireToast(skipped > 0
        ? (label('credit.overdue-no-contact-info-to-remind', lang, skipped))
        : (label('credit.no-overdue-customers', lang)), 3000);
      return;
    }
    if (skipped > 0) {
      fireToast(label('credit.reminding-skipped-no-contact', lang, remindable.length, skipped), 3000);
    }
    const queue = remindable.map((c) => c.id);
    setBulkReminderQueue(queue.slice(1));
    setReminderTarget(enrichedCustomerSummaries.find((c) => c.id === queue[0]));
  };

  const downloadOptions = creditView === 'customers'
    ? [
        {
          key: 'csv', label: t.exportCsv, format: 'csv',
          onSelect: () => {
            try {
              const report = buildCreditReport({
                shopName: shopProfile?.name || 'Shop',
                shopPhone: shopProfile?.phone || '',
                enrichedSummaries: enrichedCustomerSummaries,
                customerTransactions: customerTransactions || [],
              });
              exportCreditReportCsv(report, customerTransactions || []);
            } catch (err) {
              fireToast(t.exportFailed || 'Export failed', 2600);
              if (import.meta.env.DEV) console.error('CSV Export failed:', err);
            }
          },
        },
        {
          key: 'pdf', label: t.exportPdf, format: 'pdf',
          onSelect: () => {
            try {
              const report = buildCreditReport({
                shopName: shopProfile?.name || 'Shop',
                shopPhone: shopProfile?.phone || '',
                enrichedSummaries: enrichedCustomerSummaries,
                customerTransactions: customerTransactions || [],
              });
              exportCreditReportPdf(report, lang);
            } catch (err) {
              fireToast(t.exportFailed || 'Export failed', 2600);
              if (import.meta.env.DEV) console.error('PDF Export failed:', err);
            }
          },
        },
      ]
    : [
        {
          key: 'csv', label: t.exportCsv, format: 'csv',
          onSelect: () => {
            try {
              const report = buildSupplierReport({
                shopName: shopProfile?.name || 'Shop',
                suppliers: supplierSummaries,
                supplierTransactions: supplierSummaries.flatMap(s => s.transactions || []),
              });
              exportSupplierReportCsv(report, supplierSummaries.flatMap(s => s.transactions || []));
            } catch (err) {
              fireToast(t.exportFailed || 'Export failed', 2600);
              if (import.meta.env.DEV) console.error('Supplier CSV Export failed:', err);
            }
          },
        },
      ];

  return (
    <>
      {!selectedCustomer && !selectedSupplier && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{
            display: 'flex', width: '100%', maxWidth: 420,
            background: 'var(--color-bg-hover)', borderRadius: 14, padding: 4, gap: 4,
          }}>
            <button
              type="button"
              onClick={() => setCreditView('customers')}
              className="press-scale"
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10,
                fontSize: '0.9rem', fontWeight: 800, border: 'none', cursor: 'pointer',
                background: creditView === 'customers' ? 'var(--color-surface)' : 'transparent',
                color: creditView === 'customers' ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow: creditView === 'customers' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {t.customersLabel}
            </button>
            <button
              type="button"
              onClick={() => setCreditView('suppliers')}
              className="press-scale"
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10,
                fontSize: '0.9rem', fontWeight: 800, border: 'none', cursor: 'pointer',
                background: creditView === 'suppliers' ? 'var(--color-surface)' : 'transparent',
                color: creditView === 'suppliers' ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow: creditView === 'suppliers' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {t.suppliersLabel}
            </button>
          </div>
        </div>
      )}

      {creditView === 'customers' && (
        selectedCustomer ? (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
             <CustomerDetail
               customer={selectedCustomer}
               shopName={shopProfile?.name}
               shopPlan={shopProfile?.plan || 'free'}
               onBack={() => setSelectedCustomerId(null)}
              onAddCredit={() => setCustomerTransactionModal({
                mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
                customerId: selectedCustomer.id,
              })}
              onRecordPayment={() => setCustomerTransactionModal({
                mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
                customerId: selectedCustomer.id,
              })}
              onMarkFullyPaid={(c) => setCustomerTransactionModal({
                mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
                customerId: c.id,
                initialAmount: Number(c.balance || 0),
              })}
              onToggleTelegramNotify={() => onToggleTelegramNotify(selectedCustomer)}
              onOpenTelegramConnect={() => setTelegramConnectCustomerId(selectedCustomer.id)}
              onResendTelegramUpdate={() => onResendTelegramUpdate(selectedCustomer)}
              onRemind={(c) => setReminderTarget(c)}
              onSmsCustomer={(c) => { onSetReminderDefaultChannel('sms'); setReminderTarget(c); }}
              onEditCustomer={(c) => setCustomerEditTarget(c)}
              onSelectTransaction={(tx) => onSelectTransaction(tx)}
              onTransfer={onTransfer}
              onArchiveCustomer={onArchiveCustomer}
              onRecordPromise={onRecordPromise}
              onClearPromise={onClearPromise}
            />
          </Suspense>
        ) : (
          <>
            <OverdueCustomerFlags />
            <Suspense fallback={<PanelFallback label={t.loading} />}>
              <CustomerList
                customers={enrichedCustomerSummaries}
                metrics={creditMetrics}
                onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
                onAddCustomer={() => setShowCustomerForm(true)}
                onRemind={handleBulkRemind}
                onDownloadClick={() => setDownloadOpen(true)}
              />
            </Suspense>
          </>
        )
      )}

      {creditView === 'suppliers' && (
        selectedSupplier ? (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SupplierDetail
              supplier={selectedSupplier}
              onBack={() => setSelectedSupplierId(null)}
              onAddPurchase={() => setSupplierTransactionModal({
                mode: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
                supplierId: selectedSupplier.id,
              })}
              onPaySupplier={() => setSupplierTransactionModal({
                mode: SUPPLIER_TRANSACTION_TYPES.PAYMENT,
                supplierId: selectedSupplier.id,
              })}
              onMarkFullyPaid={(s) => setSupplierTransactionModal({
                mode: SUPPLIER_TRANSACTION_TYPES.PAYMENT,
                supplierId: s.id,
                initialAmount: Number(s.balance || 0),
              })}
              onEditSupplier={(s) => setSupplierEditTarget(s)}
              onSelectTransaction={(tx) => onSelectSupplierTransaction(tx)}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SupplierList
              suppliers={supplierSummaries}
              onSelectSupplier={(s) => setSelectedSupplierId(s.id)}
              onAddSupplier={() => setShowSupplierForm(true)}
              onDownloadClick={() => setDownloadOpen(true)}
            />
          </Suspense>
        )
      )}

      <DownloadMenuSheet open={downloadOpen} onClose={() => setDownloadOpen(false)} title={t.download} options={downloadOptions} />
    </>
  );
}
