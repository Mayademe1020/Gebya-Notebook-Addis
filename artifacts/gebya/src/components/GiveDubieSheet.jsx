import { useMemo, useState } from 'react';
import { CalendarDays, Save, Search, X } from 'lucide-react';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import { formatEthiopian, getDueDateOptions } from '../utils/ethiopianCalendar';
import { normalizeTelegram } from '../utils/customerTelegram';
import { useLang } from '../context/LangContext';

function getCustomerName(c) {
  return c.display_name || c.displayName || '';
}

function getCustomerBalance(c) {
  return Number(c.balance ?? 0);
}

function matchesCustomer(c, q) {
  if (!q) return true;
  const name = getCustomerName(c).toLowerCase();
  const phone = (c.phone_number || '').toLowerCase();
  return name.includes(q) || phone.includes(q);
}

function sortCustomers(customers) {
  return [...customers].sort((a, b) => {
    const aBal = Number(a.balance || 0);
    const bBal = Number(b.balance || 0);
    if ((aBal > 0) !== (bBal > 0)) return aBal > 0 ? -1 : 1;
    if (aBal > 0 && bBal > 0 && aBal !== bBal) return bBal - aBal;
    return Number(b.last_activity_at || b.updated_at || 0) - Number(a.last_activity_at || a.updated_at || 0);
  });
}

function GiveDubieSheet({ customers = [], onSave, onDone, catalogEntries = [] }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTelegram, setNewTelegram] = useState('');
  const [amount, setAmount] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [catalogEntryId, setCatalogEntryId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmedQuery = query.trim().toLowerCase();
  const visibleCustomers = useMemo(() => {
    const filtered = customers.filter(c => matchesCustomer(c, trimmedQuery));
    return sortCustomers(filtered).slice(0, trimmedQuery ? 12 : 8);
  }, [customers, trimmedQuery]);

  const selectedCatalogEntry = catalogEntries.find(e => String(e.id) === String(catalogEntryId)) || null;
  const parsedAmount = parseFloat(parseInput(amount)) || 0;
  const canSave = parsedAmount > 0 && (selectedCustomer || newName.trim().length > 0);

  const dueDateOptions = useMemo(() => getDueDateOptions(), []);

  const handleNumericInput = (e) => {
    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    setAmount(raw);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload = {
        amount: parsedAmount,
        item_note: itemNote.trim() || selectedCatalogEntry?.name || null,
        catalog_entry_id: catalogEntryId ? Number(catalogEntryId) : null,
        item_kind: selectedCatalogEntry?.kind || null,
        due_date: dueDate ? new Date(dueDate).getTime() : null,
      };

      if (showNewCustomer) {
        const phoneDigits = newPhone.replace(/\D/g, '');
        const fullPhone = phoneDigits.length === 9 && /^[79]/.test(phoneDigits) ? '+251' + phoneDigits : null;
        const normalizedTg = normalizeTelegram(newTelegram);
        payload.customer = {
          display_name: newName.trim(),
          phone_number: fullPhone,
          telegram_username: normalizedTg || null,
        };
      } else {
        payload.customer_id = selectedCustomer.id;
      }

      const ok = await onSave?.(payload);
      if (ok) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const hasSelection = selectedCustomer || showNewCustomer;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="sticky top-0 bg-white z-10 px-4 pt-3 pb-2 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t.giveDubie || 'Give Dubie'}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{t.recordCustomerDubie || 'Record amount a customer owes'}</p>
            </div>
            <button onClick={onDone} aria-label={t.close || 'Close'} className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center press-scale">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 space-y-3">
          {!showNewCustomer && !selectedCustomer && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchCustomerPlaceholder || 'Search customer...'} autoCapitalize="words" autoFocus className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border outline-none" style={{ borderColor: trimmedQuery ? '#1B4332' : 'var(--color-border)', borderRadius: 'var(--radius-md)' }} />
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--color-border)', maxHeight: '200px', overflowY: 'auto' }}>
                {visibleCustomers.map(c => (
                  <button key={c.id} type="button" onClick={() => setSelectedCustomer(c)} className="w-full text-left py-2.5 px-1 press-scale">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{getCustomerName(c)}</p>
                      {getCustomerBalance(c) > 0 && (
                        <p className="text-xs font-bold flex-shrink-0" style={{ color: '#92400e' }}>{fmt(getCustomerBalance(c))}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {visibleCustomers.length === 0 && (
                <p className="text-center text-xs py-4" style={{ color: '#9ca3af' }}>{t.noCustomerFound || 'No customer found'}</p>
              )}

              <button type="button" onClick={() => setShowNewCustomer(true)} className="w-full py-2.5 text-sm font-bold text-center press-scale" style={{ color: '#1B4332', borderTop: '1px solid var(--color-border)' }}>
                + {t.newCustomerInline || 'New customer'}
              </button>
            </>
          )}

          {showNewCustomer && (
            <div className="space-y-2 p-3" style={{ background: '#f9fafb', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: '#1B4332' }}>{t.newCustomer || 'New customer'}</p>
                <button type="button" onClick={() => { setShowNewCustomer(false); setNewName(''); setNewPhone(''); setNewTelegram(''); }} className="text-xs press-scale" style={{ color: '#6b7280' }}>{t.cancel || 'Cancel'}</button>
              </div>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.customerName || 'Customer name'} className="w-full p-2.5 border text-sm focus:outline-none" style={{ borderRadius: 'var(--radius-sm)', borderColor: newName.trim() ? '#1B4332' : 'var(--color-border)' }} autoFocus />
              <div className="flex gap-0">
                <div className="flex items-center justify-center px-2 border border-r-0 text-xs font-bold" style={{ background: 'rgba(27,67,50,0.06)', borderColor: 'var(--color-border)', color: '#1B4332', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}>+251</div>
                <input type="tel" inputMode="numeric" value={newPhone} onChange={(e) => { let raw = e.target.value.replace(/\D/g, ''); if (raw.length <= 9) setNewPhone(raw); }} placeholder="9XXXXXXXX" className="flex-1 p-2.5 border text-sm focus:outline-none" style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', borderColor: 'var(--color-border)' }} />
              </div>
              <input type="text" value={newTelegram} onChange={(e) => setNewTelegram(e.target.value)} placeholder="@username or t.me/name" className="w-full p-2.5 border text-sm focus:outline-none" style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)' }} />
              <p className="text-xs" style={{ color: '#9ca3af' }}>{t.contactOptional || 'Contact info optional - add later for reminders'}</p>
            </div>
          )}

          {selectedCustomer && !showNewCustomer && (
            <div className="flex items-center justify-between p-2.5" style={{ background: '#f0fdf4', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0' }}>
              <p className="text-sm font-semibold text-gray-900">{getCustomerName(selectedCustomer)}</p>
              <button type="button" onClick={() => setSelectedCustomer(null)} className="text-xs press-scale" style={{ color: '#6b7280' }}>{t.change || 'Change'}</button>
            </div>
          )}

          {hasSelection && (
            <>
              <div>
                <label className="block text-gray-700 font-semibold mb-1.5 text-sm">
                  {t.amount} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input type="text" inputMode="decimal" value={fmtInput(amount)} onChange={handleNumericInput} placeholder="0" className="w-full p-3 pr-14 border-2 focus:outline-none text-base min-h-[48px]" style={{ borderRadius: 'var(--radius-md)', borderColor: parsedAmount > 0 ? '#1B4332' : '#e8e2d8' }} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">{t.birr || 'birr'}</span>
                </div>
              </div>

              {catalogEntries.length > 0 && (
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5 text-sm">{t.savedCatalogLabel || 'Item'}</label>
                  <select value={catalogEntryId} onChange={(e) => { setCatalogEntryId(e.target.value); const entry = catalogEntries.find(item => String(item.id) === String(e.target.value)); if (entry && !itemNote.trim()) setItemNote(entry.name || ''); }} className="w-full p-2.5 border focus:outline-none text-sm bg-white" style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)' }}>
                    <option value="">{t.typeNoteManually || 'Type manually'}</option>
                    {catalogEntries.map(entry => (<option key={entry.id} value={entry.id}>{entry.name}</option>))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-semibold mb-1.5 text-sm">{t.itemNoteOptional || 'Item / note'}</label>
                <textarea value={itemNote} onChange={(e) => setItemNote(e.target.value)} placeholder={t.creditItemPlaceholder || 'What was taken'} rows={2} className="w-full p-2.5 border focus:outline-none text-sm resize-none" style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)' }} />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1.5 text-sm">{t.dueDateOptional || 'Return date'}</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-1.5">
                  {dueDateOptions.map(option => {
                    const optionDate = new Date(option.value).toISOString().slice(0, 10);
                    const active = dueDate === optionDate;
                    return (
                      <button key={option.value} type="button" onClick={() => setDueDate(optionDate)} className="px-2.5 py-1.5 text-left border min-h-[36px] whitespace-nowrap text-xs" style={{ background: active ? '#1B4332' : '#fff', color: active ? '#fff' : '#374151', borderColor: active ? '#1B4332' : 'var(--color-border)', borderRadius: '999px' }}>
                        <span className="block font-bold">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9ca3af' }} />
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="flex-1 p-2 border text-sm focus:outline-none" style={{ borderRadius: 'var(--radius-sm)', borderColor: 'var(--color-border)' }} />
                </div>
                {dueDate && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{formatEthiopian(new Date(dueDate))}</p>}
              </div>

              <button onClick={handleSave} disabled={!canSave || saving} className="w-full p-3.5 font-bold text-white text-sm flex items-center justify-center gap-2 min-h-[52px] press-scale" style={{ background: '#C4883A', opacity: canSave ? 1 : 0.45, borderRadius: 'var(--radius-md)', boxShadow: canSave ? '0 4px 0 #96662b, var(--shadow-sm)' : 'none' }}>
                <Save className="w-4 h-4" />
                {saving ? (t.saving || 'Saving...') : (t.saveDubie || 'Save Dubie')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GiveDubieSheet;
