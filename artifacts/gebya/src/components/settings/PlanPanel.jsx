import { Sparkles } from 'lucide-react';
import { useLang } from '../../context/LangContext';

export default function PlanPanel({ tier, entitlements, staffCount, transactionCount }) {
  const { lang } = useLang();

  if (tier === 'plus') {
    return (
      <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center font-black text-sm" style={{ background: '#fbbf24', color: '#1B4332' }}>
            ★
          </div>
          <div className="flex-1">
            <div className="text-sm font-black text-gray-800">Gebya Plus</div>
            <div className="text-xs text-gray-500">✓ Active</div>
          </div>
        </div>
      </div>
    );
  }

  const staffPct = entitlements.max_staff === Infinity ? 0 : Math.round((staffCount / entitlements.max_staff) * 100);
  const txPct = entitlements.max_transactions_per_month === Infinity ? 0 : Math.round((transactionCount / entitlements.max_transactions_per_month) * 100);

  return (
    <div className="bg-white rounded-2xl border overflow-hidden px-5 py-4" style={{ borderColor: '#fde68a' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm" style={{ background: '#fbbf24', color: '#1B4332' }}>
          ★
        </div>
        <div className="flex-1">
          <div className="text-sm font-black text-gray-800">{lang === 'am' ? 'ጌብያ ፕላስ' : 'Gebya Plus'}</div>
          <div className="text-xs text-gray-500">{lang === 'am' ? 'ያልተገደበ ሰራተኞች፣ የላቀ ሪፖርት' : 'Unlimited staff, advanced reports, priority credit scoring'}</div>
        </div>
      </div>

      {entitlements.max_staff !== Infinity && (
        <div className="mb-2">
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span style={{ color: '#6b7280' }}>{lang === 'am' ? 'ሰራተኞች' : 'Staff'}</span>
            <span style={{ color: '#374151' }}>{staffCount}/{entitlements.max_staff}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(staffPct, 100)}%`, background: staffPct >= 100 ? '#ef4444' : '#fbbf24' }} />
          </div>
        </div>
      )}

      {entitlements.max_transactions_per_month !== Infinity && (
        <div className="mb-3">
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span style={{ color: '#6b7280' }}>{lang === 'am' ? 'ወርሃዊ ግብይቶች' : 'Monthly tx'}</span>
            <span style={{ color: '#374151' }}>{transactionCount}/{entitlements.max_transactions_per_month}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(txPct, 100)}%`, background: txPct >= 100 ? '#ef4444' : '#fbbf24' }} />
          </div>
        </div>
      )}

      <button
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
        style={{ background: '#1B4332' }}
        onClick={() => {/* future upgrade flow */}}
      >
        {lang === 'am' ? 'አሁን ያሻሽሉ' : 'Upgrade'}
      </button>
    </div>
  );
}
