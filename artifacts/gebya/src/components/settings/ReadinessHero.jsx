import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import { buildSetupSummary } from '../../utils/setupCompletion';
import { label } from '../../labels/index.js';

/**
 * Copy + navigation for each readiness check id. The *checks themselves*
 * (what counts as done) live in utils/setupCompletion.js — the same definition
 * behind the `setup_completed_at` metric — so labels can move but the metric
 * cannot silently change meaning.
 */
const CHECK_COPY = {
  name: {
    action: 'profile',
    en: 'Set shop name',
    am: 'የሱቅ ስም ያስገቡ',
    ctaEn: 'Add ›',
    ctaAm: 'ያስገቡ ›',
  },
  phone: {
    action: 'profile',
    en: 'Add shop phone number',
    am: 'የስልክ ቁጥር ያስገቡ',
    ctaEn: 'Add ›',
    ctaAm: 'ያስገቡ ›',
  },
  channels: {
    action: 'channels',
    tab: 'money',
    en: 'Set up a payment channel',
    am: 'የክፍያ መንገድ ያዋቅሩ',
    ctaEn: 'Setup ›',
    ctaAm: 'ያዋቅሩ ›',
  },
  items: {
    action: 'items',
    en: 'Add items to catalog',
    am: 'እቃዎች ያስገቡ',
    ctaEn: 'Add ›',
    ctaAm: 'ያስገቡ ›',
  },
  recurring: {
    action: 'recurring',
    en: 'Add recurring expenses',
    am: 'ወርሃዊ ወጪ ይመዝግቡ',
    ctaEn: 'Add ›',
    ctaAm: 'ይመዝግቡ ›',
  },
};

export default function ReadinessHero({ shopProfile, paymentChannels = [], catalogEntries = [], recurring = [], lang, onAction }) {
  const [expanded, setExpanded] = useState(true);

  const name = shopProfile?.name || '';
  const initials = (() => {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  })();

  const { checks: rawChecks, doneCount, totalCount, allDone } = buildSetupSummary({
    shopProfile,
    paymentChannels,
    catalogEntries,
    recurring,
  });

  const checks = rawChecks.map((check) => {
    const copy = CHECK_COPY[check.id] || {};
    return {
      ...check,
      action: copy.action,
      tab: copy.tab,
      label: lang === 'am' ? copy.am : copy.en,
      cta: lang === 'am' ? copy.ctaAm : copy.ctaEn,
    };
  });

  if (allDone) {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}
      >
        <div
          className="px-4 py-3.5 flex items-center gap-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div style={{ fontSize: '1.2rem' }}>✓</div>
          <div className="text-sm font-bold">
            {label('settings-shop.all-set-up', lang)}
          </div>
          <div className="text-xs ml-auto opacity-70">
            {label('settings-shop.details', lang)} ›
          </div>
        </div>
        {expanded && (
          <div className="px-4 pb-3 space-y-1.5">
            {checks.map((check, idx) => (
              <div key={`done-${check.id}-${idx}`} className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-success-text)' }}>
                <span style={{ fontSize: '0.8rem' }}>✓</span>
                <span className="flex-1">{check.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)', color: 'var(--color-bg-white)' }}
    >
      <div
        className="px-4 py-3.5 flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
          style={{ background: 'var(--color-accent-amber)', border: '2px solid rgba(255,255,255,0.25)' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black">{name || (label('settings-shop.shop', lang))}</div>
          <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
            {label('settings-shop.of-set-up', lang, doneCount, totalCount)}
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
              key={`${check.id}-${idx}`}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-warning)' }} />
              <span className="text-xs font-bold flex-1">{check.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(check.action, check.tab);
                }}
                className="text-xs font-black px-2.5 py-1 rounded-full"
                style={{ background: 'var(--color-warning-border)', color: 'var(--color-primary)', border: 'none', cursor: 'pointer' }}
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
