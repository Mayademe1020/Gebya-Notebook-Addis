import { useState, useMemo } from 'react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import CustomerList from './CustomerList';
import CustomerDetail from './CustomerDetail';
import SupplierList from './SupplierList';
import SupplierForm from './SupplierForm';
import SupplierTransactionSheet from './SupplierTransactionSheet';

const DUBIE_TABS = [
  { id: 'collect', label: 'To Collect' },
  { id: 'pay', label: 'To Pay' },
];

function DubiePage({
  customerSummaries = [],
  selectedCustomerId,
  onSelectCustomer,
  onAddCustomer,
  onBackToCustomerList,
  onAddCredit,
  onRecordPayment,
  onToggleTelegramNotify,
  onOpenTelegramConnect,
  onResendTelegramUpdate,
  onEditCustomerTransaction,
  supplierSummaries = [],
  onSaveSupplier,
  onSaveSupplierTransaction,
  onUpdateSupplierTransaction,
  onDeleteSupplierTransaction,
  shopName,
  catalogEntries = [],
}) {
  const { t, lang } = useLang();
  const [activeDubieTab, setActiveDubieTab] = useState('collect');
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierTxModal, setSupplierTxModal] = useState(null);
  const [supplierTxEditTarget, setSupplierTxEditTarget] = useState(null);
  const [supplierSaveError, setSupplierSaveError] = useState(false);

  const selectedCustomer = useMemo(
    () => customerSummaries.find(c => c.id === selectedCustomerId) || null,
    [customerSummaries, selectedCustomerId]
  );

  const totalToCollect = useMemo(
    () => customerSummaries.reduce((sum, c) => sum + Math.max(c.balance || 0, 0), 0),
    [customerSummaries]
  );

  const totalToPay = useMemo(
    () => supplierSummaries.reduce((sum, s) => sum + Math.max(s.balance || 0, 0), 0),
    [supplierSummaries]
  );

  const handleAddSupplier = async (payload) => {
    setSupplierSaveError(false);
    const saved = await onSaveSupplier?.(payload);
    if (saved) {
      setShowSupplierForm(false);
      return true;
    }
    setSupplierSaveError(true);
    return false;
  };

  const handleSaveSupplierTx = async (payload) => {
    const ok = await onSaveSupplierTransaction?.(payload);
    if (ok) {
      setSupplierTxModal(null);
    }
  };

  const handleUpdateSupplierTx = async (id, payload) => {
    const ok = await onUpdateSupplierTransaction?.(id, payload);
    if (ok) {
      setSupplierTxEditTarget(null);
    }
  };

  const activeSupplierTxSupplier = useMemo(() => {
    if (!supplierTxModal?.supplierId) return null;
    return supplierSummaries.find(s => s.id === supplierTxModal.supplierId) || null;
  }, [supplierSummaries, supplierTxModal]);

  return (
    <div className="space-y-0">
      {/* Tab switch */}
      <div className="flex items-center gap-1 mb-3" style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: '3px', border: '1px solid var(--color-border)' }}>
        {DUBIE_TABS.map(tab => {
          const isActive = activeDubieTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveDubieTab(tab.id)}
              className="flex-1 py-2 text-sm font-bold min-h-[40px] press-scale"
              style={{
                background: isActive ? '#1B4332' : 'transparent',
                color: isActive ? '#fff' : '#6b7280',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {tab.id === 'collect' ? (t.toCollect || 'To Collect') : (t.toPay || 'To Pay')}
            </button>
          );
        })}
      </div>

      {/* To Collect */}
      {activeDubieTab === 'collect' && (
        selectedCustomer ? (
          <CustomerDetail
            customer={selectedCustomer}
            onBack={onBackToCustomerList}
            onAddCredit={onAddCredit}
            onRecordPayment={onRecordPayment}
            onToggleTelegramNotify={onToggleTelegramNotify}
            onOpenTelegramConnect={onOpenTelegramConnect}
            onResendTelegramUpdate={onResendTelegramUpdate}
            onEditTransaction={onEditCustomerTransaction}
            shopName={shopName}
          />
        ) : (
          <CustomerList
            customers={customerSummaries}
            totalOutstanding={totalToCollect}
            onSelectCustomer={onSelectCustomer}
            onAddCustomer={onAddCustomer}
            shopName={shopName}
          />
        )
      )}

      {/* To Pay */}
      {activeDubieTab === 'pay' && (
        <>
          <SupplierList
            suppliers={supplierSummaries}
            totalOutstanding={totalToPay}
            onSelectSupplier={(supplier) => setSupplierTxModal({
              supplierId: supplier.id,
              mode: 'purchase_add',
            })}
            onAddSupplier={() => setShowSupplierForm(true)}
          />

          {showSupplierForm && (
            <SupplierForm
              onSave={handleAddSupplier}
              onDone={() => setShowSupplierForm(false)}
            />
          )}

          {supplierSaveError && (
            <p className="text-center text-xs font-bold" style={{ color: '#dc2626' }}>
              {t.supplierSaveFailed || 'Could not save supplier. Please try again.'}
            </p>
          )}

          {supplierTxModal && activeSupplierTxSupplier && (
            <SupplierTransactionSheet
              supplier={activeSupplierTxSupplier}
              mode={supplierTxModal.mode}
              onSave={handleSaveSupplierTx}
              catalogEntries={catalogEntries}
              onDone={() => setSupplierTxModal(null)}
            />
          )}

          {supplierTxEditTarget && (
            <SupplierTransactionSheet
              supplier={supplierSummaries.find(s => s.id === supplierTxEditTarget.supplier_id)}
              existingTransaction={supplierTxEditTarget}
              onUpdate={handleUpdateSupplierTx}
              catalogEntries={catalogEntries}
              onDone={() => setSupplierTxEditTarget(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default DubiePage;
