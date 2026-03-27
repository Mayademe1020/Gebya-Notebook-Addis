import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { fmt } from '../utils/numformat';

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

function CustomerList({ customers = [], onSelectCustomer, onAddCustomer }) {
  const [query, setQuery] = useState('');

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => matchesCustomer(customer, query)),
    [customers, query]
  );

  const outstanding = useMemo(
    () => filteredCustomers.reduce((sum, customer) => sum + (customer.balance || 0), 0),
    [filteredCustomers]
  );

  return (
    <div className="space-y-4">
      <div
        className="p-4 border"
        style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide font-bold" style={{ color: '#9ca3af' }}>
              Total Balance
            </p>
            <p className="text-xl font-black" style={{ color: '#92400e' }}>
              {fmt(outstanding)} birr
            </p>
          </div>
          <button
            onClick={onAddCustomer}
            className="px-3 py-2 text-sm font-black text-white min-h-[44px] press-scale"
            style={{ background: '#1B4332', borderRadius: 'var(--radius-sm)' }}
            type="button"
          >
            <span className="inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add Customer
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
          placeholder="Search customer or note..."
          className="w-full pl-9 pr-4 py-3 text-sm bg-white border outline-none"
          style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
        />
      </div>

      <div className="space-y-3">
        {filteredCustomers.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelectCustomer?.(customer)}
            className="w-full text-left p-4 border press-scale"
            style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-gray-900 truncate">{customer.display_name}</p>
                {customer.note && (
                  <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
                    {customer.note}
                  </p>
                )}
                <p className="text-xs mt-2" style={{ color: '#9ca3af' }}>
                  {(customer.transaction_count || 0)} entries
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                  Balance
                </p>
                <p className="text-lg font-black" style={{ color: '#92400e' }}>
                  {fmt(customer.balance || 0)} birr
                </p>
              </div>
            </div>
          </button>
        ))}

        {filteredCustomers.length === 0 && (
          <div
            className="flex flex-col items-center justify-center text-center py-10 border"
            style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
          >
            <Users className="w-8 h-8 mb-2" style={{ color: '#d1d5db' }} />
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              No customers found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerList;

