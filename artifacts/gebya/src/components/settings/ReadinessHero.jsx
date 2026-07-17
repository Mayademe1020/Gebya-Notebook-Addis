import { useState } from 'react';
import { useLang } from '../../context/LangContext';

export default function ReadinessHero({ shopProfile, paymentChannels = [], catalogEntries = [], recurring = [], lang, onAction }) {
  const [expanded, setExpanded] = useState(true);

  const name = shopProfile?.name || '';
  const initials = (() => {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  })();

  const checks = [
    {
      key: 'profile',
      done: !!shopProfile?.name,
      label: lang === 'am' ? 'የሱቅ ስም ያስገቡ' : 'Set shop name',
      cta: lang === 'am' ? 'ያስገቡ ›' : 'Add ›',
    },
    {
      key: 'profile',
      done: !!shopProfile?.phone,
      label: lang === 'am' ? 'የስልክ ቁጥር ያስገቡ' : 'Add shop phone number',
      cta: lang === 'am' ? 'ያስገቡ ›' : 'Add ›',
    },
    {
      key: 'channels',
      done: (paymentChannels || []).some(c => c.enabled && (c.usePhoneFromShop || c.phone || c.account)),
      label: lang === 'am' ? 'የክፍያ መንገድ ያዋቅሩ' : 'Set up a payment channel',
      cta: lang === 'am' ? 'ያዋቅሩ ›' : 'Setup ›',
      tab: 'money',
    },
    {
      key: 'items',
      done: (catalogEntries || []).filter(e => e.active !== false).length > 0,
      label: lang === 'am' ? 'እቃዎች ያስገቡ' : 'Add items to catalog',
      cta: lang === 'am' ? 'ያስገቡ ›' : 'Add ›',
    },
    {
      key: 'recurring',
      done: (recurring || []).length > 0,
      label: lang === 'am' ? 'ወርሃዊ ወጪ ይመዝግቡ' : 'Add recurring expenses',
      cta: lang === 'am' ? 'ይመዝግቡ ›' : 'Add ›',
    },
  ];

  const doneCount = checks.filter(c => c.done).length;
  const totalCount = checks.length;
  const allDone = doneCount === totalCount;

  if (allDone) {
    return (
      <div
        className="rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer"
        style={{ background: '#d1fae5', color: '#065f46' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ fontSize: '1.2rem' }}>✓</div>
        <div className="text-sm font-bold">
          {lang === 'am' ? 'ሁሉም ተዋቅሯል' : 'All set up'}
        </div>
        <div className="text-xs ml-auto opacity-70">
          {lang === 'am' ? 'ተጨማሪ' : 'Details'} ›
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2d6a4f 100%)', color: '#fff' }}
    >
      <div
        className="px-4 py-3.5 flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
          style={{ background: '#C4883A', border: '2px solid rgba(255,255,255,0.25)' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black">{name || (lang === 'am' ? 'ሱቅ' : 'Shop')}</div>
          <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
            {lang === 'am' ? `${doneCount} ከ ${totalCount} ተዋቅሯል` : `${doneCount} of ${totalCount} set up`}
          </div>
        </div>
        <div className="text-xs font-bold" style={{ opacity: 0.6 }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-1.5">
          {checks.filter(c => !c.done).map((check, idx) => (
            <div
              key={`${check.key}-${idx}`}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#fbbf24' }} />
              <span className="text-xs font-bold flex-1">{check.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(check.key, check.tab);
                }}
                className="text-xs font-black px-2.5 py-1 rounded-full"
                style={{ background: '#fde68a', color: '#1B4332', border: 'none', cursor: 'pointer' }}
              >
                {check.cta}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
