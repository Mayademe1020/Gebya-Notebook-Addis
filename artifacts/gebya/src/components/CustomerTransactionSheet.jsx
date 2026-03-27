import { useMemo, useState } from 'react';
import { CalendarDays, Save, X } from 'lucide-react';
import { fmtInput, parseInput } from '../utils/numformat';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from '../utils/customerTransactionTypes';

function handleNumericInput(e, setter) {
  let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  setter(raw);
}

function CustomerTransactionSheet({ customer, mode = CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD, onSave, onDone }) {
  const [amount, setAmount] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const transactionType = useMemo(() => {
    if (mode === CUSTOMER_TRANSACTION_TYPES.PAYMENT) return CUSTOMER_TRANSACTION_TYPES.PAYMENT;
    return CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
  }, [mode]);

  const isPayment = transactionType === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const parsedAmount = parseFloat(parseInput(amount)) || 0;
  const canSave = parsedAmount > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    if (!isValidCustomerTransactionType(transactionType)) return;

    setSaving(true);
    try {
      await onSave?.({
        customer_id: customer?.id,
        type: transactionType,
        amount: parsedAmount,
        item_note: itemNote.trim() || null,
        due_date: !isPayment && dueDate ? new Date(dueDate).getTime() : null,
      });
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="sticky top-0 bg-white z-10 px-6 pt-5 pb-4 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-gray-900">{isPayment ? 'Record payment' : 'Add credit'}</h2>
              <p className="text-sm mt-1" style={{ color: '#6b7280' }}>{customer?.display_name || ''}</p>
            </div>
            <button onClick={onDone} aria-label="Close" className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={fmtInput(amount)}
                onChange={(e) => handleNumericInput(e, setAmount)}
                placeholder="0"
                className="w-full p-4 pr-16 border-2 focus:outline-none text-base min-h-[52px]"
                style={{ borderRadius: 'var(--radius-md)', borderColor: parsedAmount > 0 ? '#1B4332' : '#e8e2d8' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">birr</span>
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2 text-sm">
              {isPayment ? 'Payment note (optional)' : 'Item note (optional)'}
            </label>
            <textarea value={itemNote} onChange={(e) => setItemNote(e.target.value)} placeholder={isPayment ? 'Any note about this payment' : 'What they took'} rows={3} className="w-full p-3 border-2 focus:outline-none text-sm resize-none" style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
          </div>

          {!isPayment && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 text-sm">Due date (optional)</label>
              <div className="relative">
                <CalendarDays className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-3 pl-10 border-2 focus:outline-none text-sm" style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-8 pt-2">
          <button onClick={handleSave} disabled={!canSave || saving} className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale" style={{ background: isPayment ? '#2d6a4f' : '#C4883A', opacity: canSave ? 1 : 0.45, borderRadius: 'var(--radius-md)', boxShadow: canSave ? (isPayment ? '0 4px 0 #1B4332, var(--shadow-sm)' : '0 4px 0 #96662b, var(--shadow-sm)') : 'none' }}>
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : isPayment ? 'Save payment' : 'Save credit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomerTransactionSheet;
