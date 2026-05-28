import { useMemo, useState } from 'react';
import { Plus, Search, Users, Bell } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { daysAgoLabel } from '../utils/reminders';

function matchesCustomer(customer, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    customer.display_name,
    customer.note,
    customer.phone_number,
    customer.telegram_username,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function CustomerList({ customers = [], onSelectCustomer, onAddCustomer, onRemindCustomer }) {
  const [query, setQuery] = useState('');
  const { t, lang } = useLang();
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => matchesCustomer(customer, query)),
    [customers, query]
  );

  const outstanding = useMemo(
    () => filteredCustomers.reduce((sum, customer) => sum + (customer.balance || 0), 0),
    [filteredCustomers]
  );

  const customersWithBalance = useMemo(
    () => filteredCustomers.filter((customer) => Number(customer.balance || 0) > 0).length,
    [filteredCustomers]
  );

  const searchSummary = t.customerSearchResults
    .replace('{shown}', String(filteredCustomers.length))
    .replace('{total}', String(customers.length));

  return (
    <div className="space-y-4">
      <div
        className="p-4 border"
        style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide font-bold" style={{ color: '#9ca3af' }}>
              {t.customerTotalBalance}
            </p>
            <p className="text-xl font-black" style={{ color: '#92400e' }}>
              {fmt(outstanding)} birr
            </p>
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              {customersWithBalance} {t.customerBalance.toLowerCase()}
            </p>
          </div>
          <button
            onClick={onAddCustomer}
            className="px-3 py-2 text-sm font-black text-white min-h-[44px] press-scale"
            style={{ background: '#1B4332', borderRadius: 'var(--radius-sm)' }}
            type="button"
          >
            <span className="inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> {t.addCustomer}
            </span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchCustomerPlaceholder}
          autoCapitalize="words"
          className="w-full pl-9 pr-4 py-3 text-sm bg-white border outline-none"
          style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs" style={{ color: '#6b7280' }}>
          {hasQuery ? searchSummary : t.customerSearchHint}
        </p>
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-xs font-bold min-h-[32px] px-2"
            style={{ color: '#1B4332' }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filteredCustomers.map((customer) => {
          const hasBalance = Number(customer.balance || 0) > 0;
          const canRemind = hasBalance
            && (customer.telegram_username || customer.telegram_chat_id || customer.phone_number);
          const lastReminded = daysAgoLabel(customer.last_reminded_at, lang);
          return (
            <div
              key={customer.id}
              className="w-full p-4 border"
              style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelectCustomer?.(customer)}
                  className="flex-1 min-w-0 text-left press-scale"
                >
                  <p className="font-black text-gray-900 truncate">{customer.display_name}</p>
                  {customer.note && (
                    <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
                      {customer.note}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: '#9ca3af' }}>
                    <span>{(customer.transaction_count || 0)} {t.entries}</span>
                    {customer.phone_number && <span>{customer.phone_number}</span>}
                    {customer.telegram_username && <span>{customer.telegram_username}</span>}
                    {lastReminded && hasBalance && (
                      <span style={{ color: '#C4883A' }}>
                        🔔 {lang === 'am' ? 'መጨረሻ' : 'last'} {lastReminded}
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectCustomer?.(customer)}
                    className="text-right press-scale"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                      {t.customerBalance}
                    </p>
                    <p className="text-lg font-black" style={{ color: hasBalance ? '#92400e' : '#9ca3af' }}>
                      {fmt(customer.balance || 0)} birr
                    </p>
                  </button>
                  {canRemind && onRemindCustomer && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemindCustomer(customer); }}
                      className="press-scale flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-bold border"
                      style={{
                        borderColor: '#C4883A',
                        background: 'rgba(196,136,58,0.08)',
                        color: '#6b4f1d',
                        borderRadius: 'var(--radius-sm)',
                        minHeight: '32px',
                      }}
                      aria-label={lang === 'am' ? 'አስታውስ' : 'Remind'}
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {lang === 'am' ? 'አስታውስ' : 'Remind'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredCustomers.length === 0 && (
          <div
            className="flex flex-col items-center justify-center text-center py-10 border"
            style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
          >
            <Users className="w-8 h-8 mb-2" style={{ color: '#d1d5db' }} />
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              {customers.length === 0 ? t.noCustomersYet : (hasQuery ? t.noCustomerSearchResults : t.noCustomersFound)}
            </p>
            <p className="text-xs mt-2 max-w-xs" style={{ color: '#6b7280' }}>
              {customers.length === 0 ? t.customerHelperText : t.customerSearchHint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerList;

