import { useState, useEffect } from 'react';
import { useLang } from '../../context/LangContext';
import db from '../../db';

export default function DubieRulesPanel({ onChange }) {
  const { lang, t } = useLang();
  const [overdueDays, setOverdueDays] = useState(7);
  const [autoSms, setAutoSms] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    db.settings.get('dubie_rules').then(row => {
      if (row?.value) {
        setOverdueDays(row.value.overdue_threshold_days ?? 7);
        setAutoSms(row.value.auto_sms ?? false);
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    await db.settings.put({ key: 'dubie_rules', value: { overdue_threshold_days: overdueDays, auto_sms: autoSms } });
    setDirty(false);
    onChange?.({ overdue_threshold_days: overdueDays, auto_sms: autoSms });
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 pt-4 pb-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            {lang === 'am' ? 'ዱቤ ጊዜ ማብቂያ (ቀናት)' : 'Dubie overdue threshold (days)'}
          </label>
          <div className="flex gap-2">
            {[3, 7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => { setOverdueDays(d); setDirty(true); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold border-2 min-h-[40px]"
                style={{
                  borderColor: overdueDays === d ? '#1B4332' : '#e8e2d8',
                  background: overdueDays === d ? '#1B4332' : '#fff',
                  color: overdueDays === d ? '#fff' : '#6b7280',
                }}
              >
                {d} {lang === 'am' ? 'ቀን' : 'days'}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-bold text-gray-800">{lang === 'am' ? 'ራስ-ሰር SMS ማስታወቂያ' : 'Auto-SMS reminder'}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {lang === 'am' ? 'ዱቤ ሲያበቃ ደንበኞችን በራስ-ሰር ያሳውቁ' : 'Notify customers automatically when overdue'}
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={autoSms} onChange={(e) => { setAutoSms(e.target.checked); setDirty(true); }} />
            <span className="slider" />
          </label>
        </label>

        {dirty && (
          <button
            onClick={save}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-green-700 min-h-[44px]"
          >
            {lang === 'am' ? 'አስቀምጥ' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
