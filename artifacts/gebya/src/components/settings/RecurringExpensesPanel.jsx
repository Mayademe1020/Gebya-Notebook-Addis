import { useState } from 'react';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import { fmt } from '../../utils/numformat';

const FREQ_LABELS_EN = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQ_LABELS_AM = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

export default function RecurringExpensesPanel({ recurring, onRecurringChange }) {
  const { lang, t } = useLang();
  const FREQ_LABELS = lang === 'am' ? FREQ_LABELS_AM : FREQ_LABELS_EN;

  const [reName, setReName] = useState('');
  const [reAmount, setReAmount] = useState('');
  const [reFreq, setReFreq] = useState('monthly');
  const [showReForm, setShowReForm] = useState(false);

  const addRecurring = async () => {
    const amt = parseFloat(reAmount);
    if (!reName.trim() || !amt) return;
    const newItem = { id: Date.now(), name: reName.trim(), amount: amt, freq: reFreq };
    const updated = [...(recurring || []), newItem];
    onRecurringChange?.(updated);
    setReName('');
    setReAmount('');
    setReFreq('monthly');
    setShowReForm(false);
  };

  const removeRecurring = async (id) => {
    const updated = (recurring || []).filter(r => r.id !== id);
    onRecurringChange?.(updated);
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <p className="text-xs text-gray-500 mb-3">{t.recurringHint}</p>

        {recurring.length > 0 && (
          <div className="space-y-2 mb-3">
            {recurring.map(re => (
              <div key={re.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                <RefreshCw className="w-4 h-4 flex-shrink-0" style={{ color: '#C4883A' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{re.name}</p>
                  <p className="text-xs text-gray-500">{fmt(re.amount)} {t.birr} - {FREQ_LABELS[re.freq] || re.freq}</p>
                </div>
                <button
                  onClick={() => removeRecurring(re.id)}
                  className="p-1.5 rounded-full hover:bg-red-50 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!showReForm ? (
          <button
            onClick={() => setShowReForm(true)}
            className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 border-dashed transition-all min-h-[48px]"
            style={{ borderColor: '#e8e2d8', color: '#C4883A', background: '#FAF8F5' }}
          >
            <Plus className="w-4 h-4" /> {t.addRecurring}
          </button>
        ) : (
          <div className="space-y-2 p-3 rounded-xl border" style={{ background: '#FAF8F5', borderColor: 'var(--color-border)' }}>
            <input
              type="text"
              value={reName}
              onChange={e => setReName(e.target.value)}
              placeholder={t.expenseName}
              className="w-full px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none"
              style={{ borderColor: '#e8e2d8' }}
            />
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={reAmount}
                onChange={e => setReAmount(e.target.value)}
                placeholder={t.amount}
                className="w-full px-3 py-2.5 pr-14 border-2 rounded-xl text-sm focus:outline-none"
                style={{ borderColor: '#e8e2d8' }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{t.birr}</span>
            </div>
            <div className="flex gap-2">
              {['daily', 'weekly', 'monthly'].map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setReFreq(f)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all min-h-[40px]"
                  style={{
                    borderColor: reFreq === f ? '#C4883A' : '#e8e2d8',
                    background: reFreq === f ? 'rgba(196,136,58,0.15)' : '#fff',
                    color: reFreq === f ? '#1B4332' : '#6b7280',
                  }}
                >
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowReForm(false); setReName(''); setReAmount(''); setReFreq('monthly'); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold min-h-[44px]" style={{ background: '#f5f5f5', color: '#6b7280' }}
              >
                {t.cancel}
              </button>
              <button
                onClick={addRecurring}
                disabled={!reName.trim() || !parseFloat(reAmount)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 min-h-[44px]"
                style={{ background: '#C4883A' }}
              >
                {t.add}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="h-2" />
    </div>
  );
}
