import { useMemo, useState } from 'react';
import { Bell, Search, Users, X } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { getCustomerCollectionStatus } from '../utils/customerLedger';
import { buildCustomerReminderMessage } from '../utils/customerReminder';

const RETURN_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'due_today', label: 'Due today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'follow_up', label: 'Follow-up', labelKey: 'followUp' },
];

function getCustomerName(customer) {
  return customer.display_name || customer.displayName || '';
}

function getCustomerPhone(customer) {
  return customer.phone_number || customer.phoneNumber || '';
}

function getCustomerTelegram(customer) {
  return customer.telegram_username || customer.telegramUsername || '';
}

function getCustomerBalance(customer) {
  return Number(customer.balance ?? customer.currentBalance ?? 0);
}

function getCustomerStatus(customer) {
  return customer.collection_status || getCustomerCollectionStatus(customer);
}

function getCollectionStatusText(customer, t) {
  const balance = getCustomerBalance(customer);
  const status = getCustomerStatus(customer);

  if (!status.hasBalance) return '';
  if (status.key === 'due_today') return t.dueToday || 'Due today';
  if (status.key === 'overdue') {
    const dayLabel = status.days === 1 ? (t.day || 'day') : (t.days || 'days');
    return `${t.overdueBy || 'Overdue by'} ${status.days} ${dayLabel}`;
  }
  if (status.key === 'due_in') {
    const dayLabel = status.days === 1 ? (t.day || 'day') : (t.days || 'days');
    return `${t.dueIn || 'Due in'} ${status.days} ${dayLabel}`;
  }
  if (status.key === 'no_due_date' && customer.needs_follow_up) {
    const days = customer.days_since_activity || 0;
    return (t.openForDays || 'Open for {days} days').replace('{days}', String(days));
  }
  return '';
}

function matchesCustomer(customer, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = getCustomerName(customer).toLowerCase();
  const phone = getCustomerPhone(customer).toLowerCase();
  return name.includes(q) || phone.includes(q);
}

function sendReminderDirect(customer, shopName, lang) {
  const message = buildCustomerReminderMessage({ customer, shopName, lang });
  const hasPhone = Boolean(getCustomerPhone(customer));
  const hasTelegram = Boolean(getCustomerTelegram(customer));

  if (hasPhone && !hasTelegram) {
    window.open(`sms:?body=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    return 'sms';
  }
  if (hasTelegram && !hasPhone) {
    const telegram = getCustomerTelegram(customer);
    const normalized = telegram.startsWith('@') ? telegram.slice(1) : telegram;
    window.open(`https://t.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    return 'telegram';
  }
  return 'multiple';
}

function CustomerList({ customers = [], onSelectCustomer, shopName }) {
  const [query, setQuery] = useState('');
  const [returnFilter, setReturnFilter] = useState('all');
  const [reminderChannels, setReminderChannels] = useState(null);
  const [copied, setCopied] = useState(false);
  const { t, lang } = useLang();

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => {
      if (!matchesCustomer(customer, query)) return false;
      const status = getCustomerStatus(customer);
      if (returnFilter === 'open') return status.hasBalance;
      if (returnFilter === 'due_today') return status.key === 'due_today';
      if (returnFilter === 'overdue') return status.key === 'overdue';
      if (returnFilter === 'follow_up') return customer.needs_follow_up === true;
      return true;
    }),
    [returnFilter, customers, query]
  );

  const customersWithBalance = useMemo(
    () => filteredCustomers.filter((customer) => getCustomerBalance(customer) > 0).length,
    [filteredCustomers]
  );

  const customersWithBalanceTotal = useMemo(
    () => filteredCustomers.reduce((sum, c) => sum + Math.max(getCustomerBalance(c), 0), 0),
    [filteredCustomers]
  );

  const customersNeedingFollowUp = useMemo(
    () => filteredCustomers.filter((customer) => customer.needs_follow_up === true).length,
    [filteredCustomers]
  );

  const handleReminderTap = (customer) => {
    const hasPhone = Boolean(getCustomerPhone(customer));
    const hasTelegram = Boolean(getCustomerTelegram(customer));
    const hasShare = typeof navigator !== 'undefined' && navigator.share;

    if (!hasPhone && !hasTelegram) {
      const message = buildCustomerReminderMessage({ customer, shopName, lang });
      navigator.clipboard?.writeText(message).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }

    if (!hasPhone || !hasTelegram) {
      sendReminderDirect(customer, shopName, lang);
      return;
    }

    setReminderChannels({ customer, hasPhone, hasTelegram, hasShare });
  };

  const handleChannelSend = async (channel) => {
    if (!reminderChannels) return;
    const { customer } = reminderChannels;
    const message = buildCustomerReminderMessage({ customer, shopName, lang });

    if (channel === 'sms') {
      window.open(`sms:?body=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } else if (channel === 'telegram') {
      const telegram = getCustomerTelegram(customer);
      const normalized = telegram.startsWith('@') ? telegram.slice(1) : telegram;
      window.open(`https://t.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } else if (channel === 'share') {
      try {
        await navigator.share({ title: `Reminder from ${shopName || 'shop'}`, text: message });
      } catch { /* dismissed */ }
    } else if (channel === 'copy') {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* failed */ }
    }
    setReminderChannels(null);
  };

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="px-1 pb-1">
        <p className="text-xs font-semibold" style={{ color: '#9ca3af' }}>
          {t.customerTotalBalance || 'Total to collect'}
        </p>
        <p className="text-lg font-bold" style={{ color: '#92400e' }}>
          {fmt(customersWithBalanceTotal)} <span className="text-sm font-semibold" style={{ color: '#b45309' }}>birr</span>
        </p>
        <p className="text-xs" style={{ color: '#6b7280' }}>
          {customersWithBalance} {t.customerBalance || 'with balance'}
        </p>
        {customersNeedingFollowUp > 0 && (
          <p className="text-xs mt-0.5 font-medium" style={{ color: '#b45309' }}>
            {customersNeedingFollowUp} {t.mayNeedFollowUp || 'may need follow-up'}
          </p>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchCustomerPlaceholder || 'Search customers...'}
          autoCapitalize="words"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border outline-none"
          style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {RETURN_FILTERS.map((filter) => {
          const active = returnFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setReturnFilter(filter.id)}
              className="px-3 py-1.5 text-xs font-bold min-h-[36px] whitespace-nowrap border press-scale"
              style={{
                background: active ? '#1B4332' : '#fff',
                color: active ? '#fff' : '#374151',
                borderColor: active ? '#1B4332' : 'var(--color-border)',
                borderRadius: '999px',
              }}
            >
              {filter.labelKey ? (t[filter.labelKey] || filter.label) : filter.label}
            </button>
          );
        })}
      </div>

      {/* Customer rows */}
      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {filteredCustomers.map((customer) => {
          const balance = getCustomerBalance(customer);
          const hasBalance = balance > 0;
          const statusText = getCollectionStatusText(customer, t);
          const hasPhone = Boolean(getCustomerPhone(customer));
          const hasTelegram = Boolean(getCustomerTelegram(customer));

          return (
            <div
              key={customer.id}
              onClick={() => onSelectCustomer?.(customer)}
              className="flex items-center gap-3 py-3 px-1 cursor-pointer press-scale"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCustomer?.(customer); } }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-gray-900 truncate">{getCustomerName(customer)}</p>
                {hasBalance && statusText && (
                  <p className="text-xs mt-0.5" style={{ color: statusText.includes('Overdue') ? '#b45309' : '#6b7280' }}>
                    {statusText}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: hasBalance ? '#92400e' : '#9ca3af' }}>
                  {fmt(balance)}
                </p>
                {hasBalance && (hasPhone || hasTelegram) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleReminderTap(customer); }}
                    className="mt-0.5 p-1 press-scale"
                    style={{ minWidth: '28px', minHeight: '28px' }}
                    aria-label="Send reminder"
                  >
                    <Bell className="w-3.5 h-3.5" style={{ color: '#C4883A' }} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredCustomers.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <Users className="w-8 h-8 mb-2" style={{ color: '#d1d5db' }} />
          <p className="text-sm font-semibold" style={{ color: '#374151' }}>
            {customers.length === 0
              ? (t.noCustomerDubieYet || 'No customer Dubie yet')
              : (query.trim() ? (t.noCustomerSearchResults || 'No matches found') : (t.noCustomersFound || 'No customers'))}
          </p>
          <p className="text-xs mt-2 max-w-xs" style={{ color: '#6b7280' }}>
            {customers.length === 0
              ? (t.customerDubieEmptyHint || 'When someone takes goods without paying now, record their name and amount here.')
              : (returnFilter === 'due_today'
                ? (t.noReturnTodayHint || 'No customers are due today')
                : (returnFilter === 'overdue'
                  ? (t.noOverdueHint || 'No overdue customers')
                  : (t.customerSearchHint || 'Try a different search term')))}
          </p>
        </div>
      )}

      {/* Reminder channel picker — only when multiple channels available */}
      {reminderChannels && !copied && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 animate-fade"
          onClick={(e) => { if (e.target === e.currentTarget) setReminderChannels(null); }}
        >
          <div
            className="bg-white w-full max-w-md animate-slide-up"
            style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">
                  Send reminder to {getCustomerName(reminderChannels.customer)}
                </p>
                <button
                  type="button"
                  onClick={() => setReminderChannels(null)}
                  aria-label="Close"
                  className="p-1.5 press-scale"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="px-5 py-3 space-y-1">
              {reminderChannels.hasPhone && (
                <button
                  type="button"
                  onClick={() => handleChannelSend('sms')}
                  className="w-full py-3 text-sm font-bold text-left px-3 min-h-[48px] press-scale"
                  style={{ borderRadius: 'var(--radius-sm)', color: '#374151' }}
                >
                  SMS
                </button>
              )}
              {reminderChannels.hasTelegram && (
                <button
                  type="button"
                  onClick={() => handleChannelSend('telegram')}
                  className="w-full py-3 text-sm font-bold text-left px-3 min-h-[48px] press-scale"
                  style={{ borderRadius: 'var(--radius-sm)', color: '#2481cc' }}
                >
                  Telegram
                </button>
              )}
              {reminderChannels.hasShare && (
                <button
                  type="button"
                  onClick={() => handleChannelSend('share')}
                  className="w-full py-3 text-sm font-bold text-left px-3 min-h-[48px] press-scale"
                  style={{ borderRadius: 'var(--radius-sm)', color: '#374151' }}
                >
                  Share
                </button>
              )}
              <button
                type="button"
                onClick={() => handleChannelSend('copy')}
                className="w-full py-3 text-sm font-bold text-left px-3 min-h-[48px] press-scale"
                style={{ borderRadius: 'var(--radius-sm)', color: '#6b7280' }}
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                onClick={() => setReminderChannels(null)}
                className="w-full py-3 text-sm text-center min-h-[44px] press-scale"
                style={{ color: '#9ca3af' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copied confirmation */}
      {copied && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-sm font-bold text-white animate-fade" style={{ background: '#1B4332', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)' }}>
          Copied to clipboard
        </div>
      )}
    </div>
  );
}

export default CustomerList;
