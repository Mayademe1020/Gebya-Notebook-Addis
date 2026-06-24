import { Suspense } from 'react';
import { useLang } from '../context/LangContext';
import { PanelFallback } from './Fallbacks';
import { ReportView } from '../utils/lazyImports';

export default function HistoryTab({
  transactions,
  ledgerTransactions,
  enrichedCustomerSummaries,
  customerSummaries,
  staffMembers,
  currentActorLabel,
  activeCatalogEntries,
}) {
  const { t } = useLang();
  return (
    <Suspense fallback={<PanelFallback label={t.loading} />}>
      <ReportView
        transactions={transactions}
        ledgerTransactions={ledgerTransactions}
        enrichedCustomerSummaries={enrichedCustomerSummaries}
        customerSummaries={customerSummaries}
        staffMembers={staffMembers}
        actorLabel={currentActorLabel}
        catalogEntries={activeCatalogEntries}
      />
    </Suspense>
  );
}
