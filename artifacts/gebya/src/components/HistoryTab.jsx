import { Suspense } from 'react';
import { useLang } from '../context/LangContext';
import { PanelFallback } from './Fallbacks';
import { ReportView } from '../utils/lazyImports';

export default function HistoryTab({
  transactions,
  ledgerTransactions,
  enrichedCustomerSummaries,
  customerSummaries,
  supplierSummaries,
  customers,
  suppliers,
  shopProfile,
  onEdit,
  onChaseOverdue,
  onShareReport,
  catalogEntries,
}) {
  const { t } = useLang();
  return (
    <Suspense fallback={<PanelFallback label={t.loading} />}>
      <ReportView
        transactions={transactions}
        ledgerTransactions={ledgerTransactions}
        enrichedCustomerSummaries={enrichedCustomerSummaries}
        customerSummaries={customerSummaries}
        supplierSummaries={supplierSummaries}
        customers={customers}
        suppliers={suppliers}
        shopProfile={shopProfile}
        onEdit={onEdit}
        onChaseOverdue={onChaseOverdue}
        onShareReport={onShareReport}
        catalogEntries={catalogEntries}
      />
    </Suspense>
  );
}
