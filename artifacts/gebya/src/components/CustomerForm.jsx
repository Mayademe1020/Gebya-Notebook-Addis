import { useState } from 'react';
import { ChevronDown, ChevronUp, Save, X } from 'lucide-react';

function normalizeTelegram(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('@')) return trimmed;
  if (/^https?:\/\/t\.me\//i.test(trimmed)) return trimmed;
  if (/^t\.me\//i.test(trimmed)) return `https://${trimmed}`;
  return `@${trimmed.replace(/^@+/, '')}`;
}

function CustomerForm({ onSave, onDone }) {
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = displayName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave?.({
        display_name: displayName.trim(),
        note: note.trim() || null,
        phone_number: phoneNumber.trim() || null,
        telegram_username: normalizeTelegram(telegramUsername) || null,
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
              <h2 className="text-xl font-black text-gray-900">Add Customer</h2>
              <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Use any label you recognize later.</p>
            </div>
            <button onClick={onDone} aria-label="Close" className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Customer identifier <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Name, nickname, relation, place, or vehicle clue"
              autoFocus
              className="w-full p-4 border-2 focus:outline-none text-base min-h-[52px]"
              style={{ borderRadius: 'var(--radius-md)', borderColor: displayName.trim() ? '#1B4332' : '#e8e2d8' }}
            />
          </div>

          <div>
            <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1 text-sm font-semibold py-1 min-h-[44px]" style={{ color: '#C4883A' }}>
              {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              More (optional)
            </button>

            {showMore && (
              <div className="mt-2 p-4 border animate-slide-up space-y-3" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm">Note</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything that helps you recognize this customer" rows={3} className="w-full p-3 border-2 focus:outline-none text-sm resize-none" style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm">Phone (optional)</label>
                  <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Phone number" className="w-full p-3 border-2 focus:outline-none text-sm" style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2 text-sm">Telegram (optional)</label>
                  <input type="text" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value)} placeholder="@username or t.me/link" className="w-full p-3 border-2 focus:outline-none text-sm" style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-8 pt-2">
          <button onClick={handleSave} disabled={!canSave || saving} className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale" style={{ background: canSave ? '#1B4332' : '#e5e7eb', color: canSave ? '#fff' : '#9ca3af', borderRadius: 'var(--radius-md)', boxShadow: canSave ? '0 4px 0 #0f2b20, var(--shadow-sm)' : 'none' }}>
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : 'Save customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomerForm;

