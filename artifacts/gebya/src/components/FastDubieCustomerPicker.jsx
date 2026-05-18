import { useMemo, useState } from 'react';
import { Plus, Search, UserRound, X } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';

function matchesCustomer(customer, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    customer.display_name,
    customer.note,
    customer.phone_number,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function sortNotebookCustomers(customers) {
  return [...customers].sort((a, b) => {
    const aBalance = Number(a.balance || 0);
    const bBalance = Number(b.balance || 0);
    const aOpen = aBalance > 0;
    const bOpen = bBalance > 0;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen && aBalance !== bBalance) return bBalance - aBalance;
    return Number(b.last_activity_at || b.updated_at || 0) - Number(a.last_activity_at || a.updated_at || 0);
  });
}

function FastDubieCustomerPicker({ customers = [], onSelectCustomer, onNewCustomer, onDone }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  const visibleCustomers = useMemo(() => {
    const filtered = customers.filter((customer) => matchesCustomer(customer, query));
    return sortNotebookCustomers(filtered).slice(0, trimmedQuery ? 12 : 8);
  }, [customers, query, trimmedQuery]);

  const openBalanceCount = useMemo(
    () => customers.filter((customer) => Number(customer.balance || 0) > 0).length,
    [customers]
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div
        className="bg-white w-full max-w-md max-h-[82vh] overflow-y-auto animate-slide-up"
        style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}
      >
        <div
          className="sticky top-0 bg-white z-10 px-5 pt-5 pb-4 border-b"
          style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide font-black" style={{ color: '#C4883A' }}>
                {t.dubieExistingCustomer}
              </p>
              <h2 className="text-xl font-black text-gray-900 leading-tight">{t.dubieAddTitle}</h2>
              <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
                {t.dubieSearchHint}
              </p>
            </div>
            <button
              type="button"
              onClick={onDone}
              aria-label="Close"
              className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
                placeholder={t.dubieSearchPlaceholder}
              autoCapitalize="words"
              autoFocus
              className="w-full pl-9 pr-4 py-3 text-sm bg-white border-2 outline-none min-h-[48px]"
              style={{ borderColor: trimmedQuery ? '#1B4332' : '#e8e2d8', borderRadius: 'var(--radius-md)' }}
            />
          </div>

          <button
            type="button"
            onClick={onNewCustomer}
            className="w-full p-3 font-black text-white min-h-[52px] flex items-center justify-center gap-2 press-scale"
            style={{ background: '#1B4332', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 0 #0f2b20' }}
          >
            <Plus className="w-5 h-5" />
            {t.dubieNewCustomer}
          </button>

          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
              {openBalanceCount > 0 ? t.dubieOpenBalanceCustomers : t.dubieRecentCustomers}
            </p>
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {visibleCustomers.length} {t.dubieShown}
            </p>
          </div>

          <div className="space-y-2">
            {visibleCustomers.map((customer) => {
              const balance = Number(customer.balance || 0);
              const hasOpenBalance = balance > 0;

              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelectCustomer?.(customer)}
                  className="w-full text-left p-3 border press-scale"
                  style={{
                    background: hasOpenBalance ? '#fffbeb' : '#fff',
                    borderColor: hasOpenBalance ? '#fde68a' : 'var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: hasOpenBalance ? 'rgba(196,136,58,0.14)' : 'var(--color-surface-muted)', color: hasOpenBalance ? '#92400e' : '#6b7280' }}
                      >
                        <UserRound className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 truncate">{customer.display_name}</p>
                        {(customer.note || customer.phone_number) && (
                          <p className="text-xs mt-1 truncate" style={{ color: '#6b7280' }}>
                            {customer.note || customer.phone_number}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                        {t.dubieRemainingBalance}
                      </p>
                      <p className="text-sm font-black" style={{ color: hasOpenBalance ? '#92400e' : '#6b7280' }}>
                        {fmt(balance)} {t.birr}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            {visibleCustomers.length === 0 && (
              <div
                className="text-center py-8 px-4 border"
                style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
              >
                <p className="text-sm font-bold text-gray-800">{t.dubieNoCustomerFound}</p>
                <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
                  {t.dubieTryAnother}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FastDubieCustomerPicker;