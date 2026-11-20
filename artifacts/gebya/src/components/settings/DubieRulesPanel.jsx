import { useState, useEffect } from 'react';
import { useLang } from '../../context/LangContext';
import db from '../../db';
import { label } from '../../labels/index.js';

export default function DubieRulesPanel({ onChange, onNavigate }) {
  const { lang, t } = useLang();
    const [overdueDays, setOverdueDays] = useState(7);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    db.settings.get('dubie_rules').then(row => {
      if (row?.value) {
        setOverdueDays(row.value.overdue_threshold_days ?? 7);
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    // NOTE: the old auto_sms toggle was removed deliberately. Reminder delivery
    // is configured in exactly one place — Settings → Data (see the note
    // rendered below) — so a second switch here would silently disagree with
    // the real scheduler setting and break trust.
    await db.settings.put({ key: 'dubie_rules', value: { overdue_threshold_days: overdueDays } });
    setDirty(false);
    onChange?.({ overdue_threshold_days: overdueDays });
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 pt-4 pb-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            {label('settings-money.dubie-overdue-threshold-days', lang)}
          </label>
          <div className="flex gap-2">
            {[0, 3, 7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => { setOverdueDays(d); setDirty(true); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold border-2 min-h-[40px]"
                style={{
                  borderColor: overdueDays === d ? 'var(--color-primary)' : 'var(--color-border)',
                  background: overdueDays === d ? 'var(--color-primary)' : 'var(--color-bg-white)',
                  color: overdueDays === d ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                }}
              >
                {d === 0 ? (label('settings-money.none', lang)) : `${d} ${label('settings-money.days', lang)}`}
              </button>
            ))}
          </div>
        </div>

        {dirty && (
          <button
            onClick={save}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-green-700 min-h-[44px]"
          >
            {label('settings-money.save', lang)}
          </button>
        )}

        {/* Pointer to the single source of truth for reminder delivery.
            A real button — tapping it switches to Settings → Data. */}
        <button
          type="button"
          onClick={() => onNavigate?.('reminders', 'data')}
          className="text-[0.7rem] leading-snug text-left underline underline-offset-2"
          style={{ color: 'var(--color-primary)', background: 'transparent', border: 'none', padding: 0 }}
        >
          {label('settings-money.automatic-reminders-are-managed-in-settings', lang)}
        </button>
      </div>
    </div>
  );
}
