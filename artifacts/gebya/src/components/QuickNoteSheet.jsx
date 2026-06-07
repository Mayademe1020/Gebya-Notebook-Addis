import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Save, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { QUICK_NOTE_TYPES, normalizeQuickNoteDraft, normalizeQuickNoteType, quickNoteTypeLabel } from '../utils/quickNotes';

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function QuickNoteSheet({ note, onSave, onDone }) {
  const { lang } = useLang();
  const isEditing = !!note?.id;
  const [rawText, setRawText] = useState(note?.raw_text || '');
  const [type, setType] = useState(normalizeQuickNoteType(note?.type));
  const [personName, setPersonName] = useState(note?.person_name || '');
  const [amount, setAmount] = useState(note?.amount != null ? String(note.amount) : '');
  const [dueDate, setDueDate] = useState(formatDateInput(note?.due_date));
  const [saving, setSaving] = useState(false);

  const canSave = rawText.trim().length > 0 && !saving;
  const title = isEditing ? 'Edit memory' : 'Quick memory';
  const helper = 'Write it like paper. Organize it later.';

  const typeOptions = useMemo(() => QUICK_NOTE_TYPES, []);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await onSave?.({
        id: note?.id || null,
        ...normalizeQuickNoteDraft({
          raw_text: rawText,
          type,
          status: note?.status || 'pending',
          person_name: personName,
          amount,
          due_date: dueDate ? new Date(dueDate).getTime() : null,
        }),
      });
      if (saved) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[60px] bg-white z-40 max-w-md mx-auto flex flex-col"
      style={{ background: '#ffffff' }}
    >
      <div
        className="flex-shrink-0 px-3 sm:px-4 py-3 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid #e8e2d8' }}
      >
        <button
          type="button"
          onClick={onDone}
          aria-label="Back"
          className="press-scale flex items-center justify-center"
          style={{ minWidth: 36, minHeight: 36 }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#6b7280' }} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h2 className="text-base font-bold truncate" style={{ color: '#1a1a1a' }}>{title}</h2>
          <p className="text-[11px] truncate" style={{ color: '#6b7280' }}>{helper}</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="press-scale flex items-center justify-center"
          style={{ minWidth: 36, minHeight: 36 }}
        >
          <X className="w-5 h-5" style={{ color: '#9ca3af' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
            Memory
          </label>
          <textarea
            autoFocus
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Dawit 1500 Friday"
            className="w-full p-3 border-2 focus:outline-none text-base"
            style={{
              minHeight: 132,
              borderRadius: 'var(--radius-md)',
              borderColor: rawText.trim() ? '#C4883A' : '#e8e2d8',
              resize: 'vertical',
            }}
          />
        </div>

        <div>
          <p className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
            Type
          </p>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map((option) => {
              const active = type === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className="press-scale px-3 py-2 text-xs font-bold border"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    borderColor: active ? '#1B4332' : '#e8e2d8',
                    background: active ? '#1B4332' : '#fff',
                    color: active ? '#fff' : '#374151',
                    minHeight: 36,
                  }}
                >
                  {quickNoteTypeLabel(option, lang)}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          style={{ background: '#faf9f7', border: '1px solid #ece6d6', borderRadius: 'var(--radius-md)', padding: 12 }}
        >
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              Person
            </label>
            <input
              type="text"
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Ahmed"
              className="w-full p-2.5 border focus:outline-none text-sm"
              style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              Amount
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
              placeholder="1500"
              className="w-full p-2.5 border focus:outline-none text-sm"
              style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              Due date
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <CalendarDays className="w-4 h-4" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="w-full py-2.5 pr-2 pl-9 border focus:outline-none text-sm"
                  style={{ borderRadius: 'var(--radius-sm)', borderColor: '#e8e2d8', background: '#fff' }}
                />
              </div>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  aria-label="Clear due date"
                  className="press-scale flex items-center justify-center"
                  style={{ width: 40, borderRadius: 'var(--radius-sm)', background: '#fef2f2', color: '#dc2626' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 sm:px-4 py-3" style={{ borderTop: '1px solid #e8e2d8' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full p-3 font-bold text-white text-base flex items-center justify-center gap-2 transition-all press-scale"
          style={{
            background: canSave ? '#1B4332' : '#e5e7eb',
            color: canSave ? '#fff' : '#9ca3af',
            borderRadius: 'var(--radius-md)',
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          <Save className="w-5 h-5" />
          {saving
            ? 'Saving...'
            : 'Save on this phone'}
        </button>
      </div>
    </div>
  );
}

export default QuickNoteSheet;
