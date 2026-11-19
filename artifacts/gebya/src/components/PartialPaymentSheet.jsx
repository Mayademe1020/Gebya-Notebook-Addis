// PartialPaymentSheet.jsx — Dedicated full-screen sheet for partial payments.
//
// Opens when user clicks "Partial" on any money-exchange form.
// Keeps the main form clean by moving all partial-specific fields here.
//
// Props:
//   open          — boolean, controls visibility
//   totalAmount   — number, the full sale/expense amount
//   onSave        — (data) => void, called with partial payment data
//   onClose       — () => void
//   customers     — array of { id, display_name, name, balance, last_activity_at }
//   onAddCustomerInline — (partialCustomer) => Promise<customer>
//   enabledProviders — { banks: string[], wallets: string[] }
//   onAddProvider — (kind, name) => void
//   lang          — 'en' | 'am'
//   t             — translation object

import { useState, useMemo } from 'react';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import InlineDatePicker from './InlineDatePicker';
import { getDueDateOptions } from '../utils/ethiopianCalendar';
import { fmt, fmtInput, parseInput } from '../utils/numformat';
import PaymentTypeChips from './PaymentTypeChips';
import AddProviderButton from './AddProviderButton';
import { label } from '../labels/index';

function PartialPaymentSheet({
  open,
  totalAmount = 0,
  onSave,
  onClose,
  customers = [],
  onAddCustomerInline,
  enabledProviders,
  onAddProvider,
}) {
  const { lang, t } = useLang();

  // ─── State ──────────────────────────────────────────────────────────────
  const [partialReceived, setPartialReceived] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [paymentProvider, setPaymentProvider] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerMatch, setCustomerMatch] = useState(null);
  const [selectedDue, setSelectedDue] = useState(null);
  const [customDue, setCustomDue] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Derived ────────────────────────────────────────────────────────────
  const dueDateOptions = getDueDateOptions();
  const receivedAmount = parseFloat(parseInput(partialReceived)) || 0;
  const creditAmount = Math.max(0, totalAmount - receivedAmount);
  const isPartialValid = receivedAmount > 0 && receivedAmount < totalAmount && !!customerMatch;

  const recentCreditCustomers = useMemo(() =>
    customers
      .filter(c => c.last_activity_at)
      .sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0))
      .slice(0, 4),
    [customers]
  );

  const getEffectiveDueDate = () => {
    if (selectedDue === 'custom' && customDue) return new Date(customDue).getTime();
    return selectedDue;
  };

  // ─── Reset ──────────────────────────────────────────────────────────────
  function resetForm() {
    setPartialReceived('');
    setPaymentType('cash');
    setPaymentProvider('');
    setCustomerQuery('');
    setCustomerMatch(null);
    setSelectedDue(null);
    setCustomDue('');
    setShowDatePicker(false);
    setIsSaving(false);
  }

  // ─── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isPartialValid || isSaving) return;
    setIsSaving(true);
    try {
      const data = {
        sale_settlement_mode: 'partial',
        paid_amount: receivedAmount,
        remaining_amount: creditAmount,
        credit_amount: creditAmount,
        settlement_mode: 'partial',
        cash_received: receivedAmount,
        payment_type: paymentType,
        payment_provider: paymentType !== 'cash' ? paymentProvider || null : null,
        customer_id: customerMatch.id,
        customer_name: customerMatch.display_name || customerMatch.name,
        settlement_due_date: getEffectiveDueDate(),
        due_date: getEffectiveDueDate(),
      };
      await onSave(data);
      resetForm();
      onClose();
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white max-w-md mx-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => { resetForm(); onClose(); }} aria-label={label('credit.back', lang)} className="press-scale flex items-center justify-center" style={{ minWidth: '36px', minHeight: '36px', padding: '4px' }}>
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
        </button>
        <h2 className="text-base font-bold" style={{ color: 'var(--color-accent-amber)' }}>
          {label('credit.partial-payment', lang)}
        </h2>
        <div style={{ width: '36px' }} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">

        {/* Total amount display */}
        <div className="p-3" style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--color-success-text)' }}>
            {label('credit.total-amount', lang)}
          </p>
          <p className="text-xl font-black" style={{ color: 'var(--color-success-text)' }}>
            {fmt(totalAmount)} {label('credit.etb', lang)}
          </p>
        </div>

        {/* Amount Received */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {label('credit.amount-received', lang)} <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={fmtInput(partialReceived)}
              onChange={e => setPartialReceived(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              autoFocus
              className="w-full p-3 pr-16 border-2 focus:outline-none text-lg font-bold"
              style={{
                borderRadius: 'var(--radius-md)',
                borderColor: receivedAmount > 0 && receivedAmount < totalAmount ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--color-text-soft)' }}>
              {label('credit.birr', lang)}
            </span>
          </div>
          {receivedAmount > 0 && receivedAmount < totalAmount && (
            <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--color-accent-amber)' }}>
              {label('credit.remaining-dubie', lang)}: {fmt(creditAmount)} {label('credit.birr', lang)}
            </p>
          )}
          {receivedAmount >= totalAmount && totalAmount > 0 && (
            <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--color-danger)' }}>
              {label('credit.amount-received-equals-total-use-paid', lang)}
            </p>
          )}
        </div>

        {/* Payment method for collected amount */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {label('credit.how-was-the-amount-paid', lang)}
          </label>
          <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar">
            <PaymentTypeChips
              paymentType={paymentType}
              provider={paymentProvider}
              onTypeChange={setPaymentType}
              onProviderChange={setPaymentProvider}
              enabledProviders={enabledProviders}
            />
            <AddProviderButton onAddProvider={onAddProvider} />
          </div>
          {paymentType !== 'cash' && paymentProvider && (
            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-success-text)' }}>
              → {fmt(receivedAmount)} {label('credit.etb', lang)} {label('credit.via', lang)} {paymentProvider}
            </p>
          )}
        </div>

        {/* Customer search */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {label('credit.customer-for-remaining-dubie', lang)} <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={customerQuery}
                onChange={e => { setCustomerQuery(e.target.value); setCustomerMatch(null); }}
                placeholder={label('credit.type-customer-name', lang)}
                className="w-full px-2 py-1.5 text-[11px] border font-bold"
                style={{ borderColor: customerQuery ? 'var(--color-success)' : 'var(--color-border-light)', borderRadius: 'var(--radius-sm)', minHeight: '38px' }}
              />
              {customerQuery.trim() && !customerMatch && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border shadow-sm max-h-[160px] overflow-y-auto" style={{ borderColor: 'var(--color-border-light)', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
                  {customers.filter(c => { const q = customerQuery.trim().toLowerCase(); return !q || (c.display_name || c.name || '').toLowerCase().includes(q); }).length > 0 ? (
                    <>
                      {customers.filter(c => { const q = customerQuery.trim().toLowerCase(); return !q || (c.display_name || c.name || '').toLowerCase().includes(q); }).slice(0, 6).map(c => (
                        <button key={c.id} type="button" onClick={() => { setCustomerMatch(c); setCustomerQuery(c.display_name || c.name || ''); }}
                          className="w-full px-2.5 py-2 text-left text-[11px] font-bold border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border-light)', minHeight: '40px' }}>
                          <span>{c.display_name || c.name}</span>
                          {c.balance > 0 && <span className="text-[10px] font-bold" style={{ color: 'var(--color-accent-amber)' }}>{label('credit.bal', lang)} {fmt(c.balance)}</span>}
                        </button>
                      ))}
                      {onAddCustomerInline && (
                        <button type="button" onClick={async () => { const name = customerQuery.trim(); if (!name) return; const saved = await onAddCustomerInline({ display_name: name }); if (saved?.id) { setCustomerMatch(saved); setCustomerQuery(saved.display_name || saved.name || ''); } }}
                          className="w-full px-2.5 py-2 text-left text-[11px] font-bold border-t border-dashed" style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)', minHeight: '40px' }}>
                          + {label('credit.add-as-new-customer', lang)}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="px-2.5 py-2.5 text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                      {label('credit.no-customer-found', lang)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={async () => { const name = customerQuery.trim(); if (!name) return; if (!onAddCustomerInline) return; const saved = await onAddCustomerInline({ display_name: name }); if (saved?.id) { setCustomerMatch(saved); setCustomerQuery(saved.display_name || saved.name || ''); } }}
              className="flex-shrink-0 px-3 text-[11px] font-bold border press-scale"
              style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)', borderRadius: 'var(--radius-sm)', minHeight: '38px', background: 'rgba(22,163,74,0.06)' }}>
              <span className="text-[14px] mr-1">+</span>{label('credit.add', lang)}
            </button>
          </div>

          {/* Recent credit customers */}
          {!customerQuery && !customerMatch && recentCreditCustomers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {recentCreditCustomers.map(c => (
                <button key={c.id} type="button" onClick={() => { setCustomerMatch(c); setCustomerQuery(c.display_name || c.name || ''); }}
                  className="px-2.5 py-1.5 text-[11px] font-bold border press-scale" style={{ borderColor: 'var(--color-border-light)', borderRadius: 'var(--radius-sm)', minHeight: '34px', background: 'var(--color-surface)' }}>
                  {c.display_name || c.name}
                </button>
              ))}
            </div>
          )}

          {/* Customer summary when selected */}
          {customerMatch && (
            <div className="flex items-center gap-2 px-2.5 py-2 mt-2" style={{ background: 'rgba(22,163,74,0.06)', borderRadius: 'var(--radius-sm)', minHeight: '42px' }}>
              <span className="text-[13px] font-bold flex-1">{customerMatch.display_name || customerMatch.name}</span>
              <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                {label('credit.bal', lang)} {fmt(customerMatch.balance || 0)}
              </span>
              <button type="button" onClick={() => { setCustomerMatch(null); setCustomerQuery(''); }} className="text-[12px] font-bold press-scale px-1" style={{ color: 'var(--color-text-soft)', minHeight: '30px' }}>✕</button>
            </div>
          )}
        </div>

        {/* Due date */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {label('credit.remaining-due-date', lang)} <span style={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>({label('credit.optional', lang)})</span>
          </label>
          <div className="flex gap-2 mb-2">
            {dueDateOptions.map(opt => {
              const active = selectedDue === opt.value && !customDue;
              return (
                <button key={opt.value} type="button" onClick={() => setSelectedDue(opt.value)}
                  className="press-scale"
                  style={{
                    padding: '8px 12px', minWidth: 70, minHeight: 40,
                    border: `2px solid ${active ? 'var(--color-info)' : 'var(--color-border)'}`,
                    borderRadius: 8,
                    background: active ? 'var(--color-info)' : 'var(--color-bg-white)',
                    color: active ? 'var(--color-bg-white)' : 'var(--color-text)',
                    fontSize: '0.8rem', fontWeight: 700,
                    cursor: 'pointer', flexShrink: 0,
                  }}>
                  {opt.label}
                </button>
              );
            })}
            <button type="button" onClick={() => { setSelectedDue('custom'); setShowDatePicker(true); }}
              className="press-scale"
              style={{
                padding: '8px 12px', minWidth: 70, minHeight: 40,
                border: `2px solid ${selectedDue === 'custom' && customDue ? 'var(--color-info)' : 'var(--color-border)'}`,
                borderRadius: 8,
                background: selectedDue === 'custom' && customDue ? 'var(--color-info)' : 'var(--color-bg-white)',
                color: selectedDue === 'custom' && customDue ? 'var(--color-bg-white)' : 'var(--color-text)',
                fontSize: '0.8rem', fontWeight: 700,
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              📅 <span>{label('credit.pick', lang)}</span>
            </button>
          </div>
        </div>

        <InlineDatePicker open={showDatePicker} value={customDue} onChange={(iso) => { setCustomDue(iso); setSelectedDue('custom'); }} onClose={() => setShowDatePicker(false)} lang={lang} />
      </div>

      {/* Save button */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        {!isPartialValid && receivedAmount > 0 && !customerMatch && (
          <p className="text-xs font-semibold text-center mb-2" style={{ color: 'var(--color-warning)' }}>
            {label('credit.select-or-add-a-customer-above', lang)}
          </p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isPartialValid || isSaving}
          className="w-full p-3 font-black text-base flex items-center justify-center gap-2 transition-all press-scale"
          style={{
            background: isPartialValid && !isSaving ? 'var(--color-accent-amber)' : 'var(--color-bg-disabled)',
            color: (isPartialValid && !isSaving) ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
            cursor: isPartialValid && !isSaving ? 'pointer' : 'default',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {isSaving
            ? (label('credit.saving', lang))
            : <><Save className="w-5 h-5" />{label('credit.save-partial-payment', lang)}</>
          }
        </button>
      </div>
    </div>
  );
}

export default PartialPaymentSheet;