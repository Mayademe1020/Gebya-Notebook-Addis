import { useState, useEffect } from 'react';

export default function TabCard({ icon, title, subtitle, badge, badgeTone, children, open: openProp, onToggle, id, defaultOpen }) {
  const [internalOpen, setInternalOpen] = useState(!!defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const handleToggle = () => {
    if (isControlled) onToggle?.(!open);
    else setInternalOpen(!open);
  };

  const toneStyles = {
    ok: { bg: '#d1fae5', color: '#065f46' },
    warn: { bg: '#fef3c7', color: '#92400e' },
    neutral: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const tone = toneStyles[badgeTone] || toneStyles.neutral;

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden mb-2.5">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style={{ background: '#fafaf5' }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-gray-900 truncate">{title}</div>
          {subtitle && <div className="text-[11px] mt-0.5 truncate" style={{ color: '#9ca3af' }}>{subtitle}</div>}
        </div>
        {badge && (
          <span className="flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: tone.bg, color: tone.color }}>
            {badge}
          </span>
        )}
        <span style={{ color: '#9ca3af', fontSize: '1.1rem', flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ›
        </span>
      </button>
      {open && <div className="px-1 pb-2">{children}</div>}
    </div>
  );
}
