import { useState } from 'react';
import { Users, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { getCreditStatus, formatEthiopianShort } from '../utils/ethiopianCalendar';
import { fmt } from '../utils/numformat';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MerroList({ creditRecords, onSelectCredit }) {
  const { t } = useLang();
  const [showPaid, setShowPaid] = useState(false);

  const active = creditRecords.filter(r => r.status !== 'paid');
  const paid = creditRecords.filter(r => r.status === 'paid');
  const list = (showPaid ? paid : active).sort(
    (a, b) => (a.due_date || a.created_at || 0) - (b.due_date || b.created_at || 0)
  );

  const owedToMeRecords = active.filter(r => !r.direction || r.direction === 'owes_me');
  const iOweRecords = active.filter(r => r.direction === 'i_owe');
  const owedToMe = owedToMeRecords.reduce((s, r) => s + (r.remaining_amount || 0), 0);
  const iOwe = iOweRecords.reduce((s, r) => s + (r.remaining_amount || 0), 0);

  function getStatusDisplay(status) {
    if (status.label === 'Overdue') {
      return { key: 'overdue', text: t.statusOverdue };
    }
    if (status.color === 'green') {
      return { key: 'ok', text: t.statusOk };
    }
    return { key: 'due_soon', text: t.statusDueSoon };
  }

  if (active.length === 0 && paid.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="w-16 h-16 mb-4" style={{ color: '#e5e7eb' }} />
        <p className="text-lg font-medium" style={{ color: '#9ca3af' }}>{t.noCreditRecords}</p>
        <p className="text-sm mt-1" style={{ color: '#d1d5db' }}>{t.addCreditHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="flex gap-3">
        <div
          className="flex-1 p-4 animate-elastic texture-noise"
          style={{
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
            border: '1.5px solid #86efac',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#166534' }}>
            {t.owedToMe}
          </p>
          <p className="text-2xl font-black leading-tight" style={{ color: '#14532d' }}>
            {fmt(owedToMe)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: '#166534' }}>
            {t.birr} · {owedToMeRecords.length} {t.active}
          </p>
        </div>

        {iOwe > 0 && (
          <div
            className="flex-1 p-4 animate-elastic texture-noise"
            style={{
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
              border: '1.5px solid #fca5a5',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#991b1b' }}>
              {t.iOweAmount}
            </p>
            <p className="text-2xl font-black leading-tight" style={{ color: '#7f1d1d' }}>
              {fmt(iOwe)}
            </p>
            <p className="text-xs font-semibold mt-0.5" style={{ color: '#991b1b' }}>
              {t.birr} · {iOweRecords.length} {t.active}
            </p>
          </div>
        )}
      </div>

      {paid.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowPaid(false)}
            className="flex-1 py-2.5 text-sm font-bold transition-all press-scale"
            style={{ background: !showPaid ? '#1B4332' : '#f5f5f5', color: !showPaid ? '#fff' : '#6b7280', borderRadius: 'var(--radius-sm)' }}
          >
            {t.activeTab} ({active.length})
          </button>
          <button
            onClick={() => setShowPaid(true)}
            className="flex-1 py-2.5 text-sm font-bold transition-all press-scale"
            style={{ background: showPaid ? '#1B4332' : '#f5f5f5', color: showPaid ? '#fff' : '#6b7280', borderRadius: 'var(--radius-sm)' }}
          >
            {t.paidTab} ({paid.length})
          </button>
        </div>
      )}

      <div className="space-y-3">
        {list.length === 0 && (
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#d1d5db' }} />
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              {showPaid ? t.noPaidRecords : t.allCaughtUp}
            </p>
          </div>
        )}

        {list.map(record => {
          if (showPaid) {
            return (
              <div key={record.id} className="border px-4 py-3 flex items-center gap-3 animate-slide-up"
                style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}>
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-500" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800">{record.customer_name}</p>
                  <p className="text-xs text-gray-400">{t.paidInFull} · {fmt(record.original_amount)} {t.birr}</p>
                </div>
                <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">{t.paidLabel}</span>
              </div>
            );
          }

          const status = getCreditStatus(record.due_date);
          const isIOwe = record.direction === 'i_owe';
          const display = getStatusDisplay(status);

          const cardBg = isIOwe
            ? 'linear-gradient(to bottom right, #fff5f5, #fff1f1)'
            : 'linear-gradient(to bottom right, #f0fdf4, #ecfdf5)';
          const cardBorder = isIOwe ? '#fca5a5' : '#6ee7b7';
          const headerBg = isIOwe ? '#ef4444' : '#10b981';
          const headerText = '#ffffff';
          const avatarBg = isIOwe ? '#b91c1c' : '#059669';

          return (
            <button
              key={record.id}
              onClick={() => onSelectCredit(record)}
              className="w-full text-left transition-all active:scale-95 press-scale animate-slide-up overflow-hidden"
              style={{
                background: cardBg,
                border: `1.5px solid ${cardBorder}`,
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div
                className="px-4 py-2 flex items-center justify-between"
                style={{ background: headerBg }}
              >
                <span className="text-sm font-black tracking-wide" style={{ color: headerText }}>
                  {isIOwe ? t.iOweTag : t.owesMeLabel}
                </span>
                <span className="text-sm font-black" style={{ color: headerText }}>
                  {fmt(record.remaining_amount || 0)} {t.birr}
                </span>
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <div
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-sm font-black"
                  style={{
                    background: avatarBg,
                    color: '#fff',
                    borderRadius: '50%',
                    letterSpacing: '0.02em',
                  }}
                >
                  {getInitials(record.customer_name)}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-base truncate">{record.customer_name}</p>
                  <p className="text-sm text-gray-500">
                    {t.due} {record.due_date ? formatEthiopianShort(record.due_date) : '—'}
                    {record.paid_amount > 0 && (
                      <span className="ml-2 text-gray-400">· {t.paid} {fmt(record.paid_amount)}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge display={display} />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        .pulsing-dot {
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ display }) {
  if (display.key === 'overdue') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-black uppercase tracking-wide"
        style={{
          background: '#dc2626',
          color: '#fff',
          borderRadius: '6px',
          letterSpacing: '0.05em',
          fontSize: '11px',
        }}
      >
        <span
          className="pulsing-dot inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: '#fca5a5' }}
        />
        {display.text}
      </span>
    );
  }

  if (display.key === 'ok') {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold"
        style={{
          background: '#d1fae5',
          color: '#065f46',
          borderRadius: '6px',
          fontSize: '11px',
        }}
      >
        {display.text}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold"
      style={{
        background: 'rgba(196,136,58,0.18)',
        color: '#7c4f0a',
        borderRadius: '6px',
        fontSize: '11px',
      }}
    >
      {display.text}
    </span>
  );
}

export default MerroList;
