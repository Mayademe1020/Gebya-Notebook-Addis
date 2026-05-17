import { useMemo, useState } from 'react';
import { Plus, Search, Store } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import SupplierForm from './SupplierForm';

function getSupplierName(supplier) {
  return supplier.display_name || supplier.displayName || '';
}

function getSupplierPhone(supplier) {
  return supplier.phone_number || supplier.phoneNumber || '';
}

function getSupplierBalance(supplier) {
  return Number(supplier.balance ?? 0);
}

function timeAgoLabel(timestamp, t) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - Number(timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return t.justNow || 'Just now';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return t.yesterday || 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function matchesSupplier(supplier, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = getSupplierName(supplier).toLowerCase();
  const phone = getSupplierPhone(supplier).toLowerCase();
  return name.includes(q) || phone.includes(q);
}

function SupplierList({ suppliers = [], totalOutstanding = 0, onSelectSupplier, onAddSupplier }) {
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const { t } = useLang();

  const filteredSuppliers = useMemo(
    () => suppliers.filter((s) => matchesSupplier(s, query)),
    [suppliers, query]
  );

  const suppliersWithBalance = useMemo(
    () => filteredSuppliers.filter((s) => getSupplierBalance(s) > 0).length,
    [filteredSuppliers]
  );

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold" style={{ color: '#9ca3af' }}>
            {t.totalToPay || 'Total to pay'}
          </p>
          <p className="text-xl font-bold" style={{ color: '#92400e' }}>
            {fmt(totalOutstanding)} <span className="text-sm font-semibold" style={{ color: '#b45309' }}>birr</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            {suppliersWithBalance} {t.suppliersWithBalance || 'with balance'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-2 text-sm font-bold text-white min-h-[44px] press-scale"
          style={{ background: '#1B4332', borderRadius: 'var(--radius-sm)' }}
          type="button"
        >
          <span className="inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> {t.addSupplier || 'Add'}
          </span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchSupplierPlaceholder || 'Search suppliers...'}
          autoCapitalize="words"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border outline-none"
          style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
        />
      </div>

      {/* Supplier rows */}
      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {filteredSuppliers.map((supplier) => {
          const balance = getSupplierBalance(supplier);
          const hasBalance = balance > 0;
          const lastActivity = timeAgoLabel(supplier.last_activity_at || supplier.updated_at || supplier.created_at);

          return (
            <div
              key={supplier.id}
              onClick={() => onSelectSupplier?.(supplier)}
              className="flex items-center gap-3 py-3 px-1 cursor-pointer press-scale"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSupplier?.(supplier); } }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-gray-900 truncate">{getSupplierName(supplier)}</p>
                {lastActivity && (
                  <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{lastActivity}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: hasBalance ? '#92400e' : '#9ca3af' }}>
                  {fmt(balance)}
                </p>
                {hasBalance && (
                  <p className="text-xs mt-0.5" style={{ color: '#2d6a4f' }}>
                    {t.recordPayment || 'Record'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredSuppliers.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <Store className="w-8 h-8 mb-2" style={{ color: '#d1d5db' }} />
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            {suppliers.length === 0
              ? (t.noSuppliersYet || 'No suppliers yet')
              : (query.trim() ? (t.noSupplierSearchResults || 'No matches found') : '')}
          </p>
          <p className="text-xs mt-2 max-w-xs" style={{ color: '#6b7280' }}>
            {suppliers.length === 0
              ? (t.supplierHelperText || 'Add a supplier to track what you owe')
              : ''}
          </p>
        </div>
      )}

      {showForm && (
        <SupplierForm
          onSave={async (payload) => {
            const saved = await onAddSupplier?.(payload);
            if (saved) setShowForm(false);
            return saved;
          }}
          onDone={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

export default SupplierList;
