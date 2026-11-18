import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import { setPlanTier } from '../../utils/entitlements';
import { fireToast } from '../Toast';
import { X, Check, Sparkles } from 'lucide-react';

const PLUS_FEATURES = [
  { key: 'staff', en: 'Unlimited staff members', am: 'ያልተገደበ ሰራተኞች' },
  { key: 'tx', en: 'Unlimited monthly transactions', am: 'ያልተገደበ ወርሃዊ ግብይቶች' },
  { key: 'reports', en: 'Advanced reports & analytics', am: 'የላቀ ሪፖርቶች እና ትንታኔ' },
  { key: 'multi', en: 'Multi-shop management', am: 'ባለብዙ ሱቅ አስተዳደር' },
  { key: 'support', en: 'Priority support', am: 'ቅድሚያ ድጋፍ' },
];

export default function PlanPanel({ tier, entitlements, staffCount, transactionCount }) {
  const { lang } = useLang();
  const [showModal, setShowModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  if (tier === 'plus') {
    return (
      <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm" style={{ background: 'var(--color-warning)', color: 'var(--color-primary)' }}>
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

  // Gate D (R1 leftover): staff seats are NOT enforced anywhere yet — nothing
  // blocks adding a 4th member — so a "0/3" meter advertises a limit the app
  // doesn't apply. Show the transaction meter only, until seat enforcement
  // ships; then flip this flag and the meter comes back with real meaning.
  const STAFF_LIMIT_ENFORCED = false;

  const showStaffMeter = STAFF_LIMIT_ENFORCED && entitlements.max_staff !== Infinity;
  const staffPct = entitlements.max_staff === Infinity ? 0 : Math.round((staffCount / entitlements.max_staff) * 100);
  const txPct = entitlements.max_transactions_per_month === Infinity ? 0 : Math.round((transactionCount / entitlements.max_transactions_per_month) * 100);
  const nearLimit = (showStaffMeter && staffPct >= 80) || txPct >= 80;

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await setPlanTier('plus');
      fireToast(lang === 'am' ? 'ወደ Gebya Plus ተሻሽሏል! 🎉' : 'Upgraded to Gebya Plus! 🎉', 2500);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      fireToast(lang === 'am' ? 'እባክዎ እንደገና ይሞክሩ' : 'Something went wrong', 2000);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl border overflow-hidden px-5 py-4" style={{ borderColor: nearLimit ? 'var(--color-danger-border)' : 'var(--color-warning-border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm" style={{ background: 'var(--color-warning)', color: 'var(--color-primary)' }}>
            ★
          </div>
          <div className="flex-1">
            <div className="text-sm font-black text-gray-800">{lang === 'am' ? 'ነፃ ፕላን' : 'Free Plan'}</div>
            <div className="text-xs text-gray-500">{lang === 'am' ? 'የሰራተኞች እና የሪፖርት ገደቦች አሉ' : 'Limited staff and reports'}</div>
          </div>
        </div>

        {showStaffMeter && (
          <div className="mb-2">
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span style={{ color: 'var(--color-text-muted)' }}>{lang === 'am' ? 'ሰራተኞች' : 'Staff'}</span>
              <span style={{ color: 'var(--color-text)' }}>{staffCount}/{entitlements.max_staff}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--color-bg-hover)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(staffPct || 0, 100)}%`, background: (staffPct || 0) >= 100 ? 'var(--color-danger)' : 'var(--color-warning)' }} />
            </div>
          </div>
        )}

        {entitlements.max_transactions_per_month !== Infinity && (
          <div className="mb-3">
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span style={{ color: 'var(--color-text-muted)' }}>{lang === 'am' ? 'ወርሃዊ ግብይቶች' : 'Monthly tx'}</span>
              <span style={{ color: 'var(--color-text)' }}>{transactionCount}/{entitlements.max_transactions_per_month}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--color-bg-hover)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(txPct || 0, 100)}%`, background: (txPct || 0) >= 100 ? 'var(--color-danger)' : 'var(--color-warning)' }} />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full mt-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all press-scale"
          style={{ background: 'var(--color-accent-amber)', color: 'var(--color-bg-white)' }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {lang === 'am' ? 'ወደ Plus አሻሽል' : 'Upgrade to Plus'}
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm animate-slide-up p-6"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm" style={{ background: 'var(--color-warning)', color: 'var(--color-primary)' }}>
                  ★
                </div>
                <span className="text-lg font-black text-gray-900">Gebya Plus</span>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-full press-scale"
                style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {lang === 'am' ? 'ሁሉንም ገደቦች ይክፈቱ እና የንግድዎን አቅም ይጨምሩ' : 'Unlock everything and scale your business'}
            </p>

            <div className="space-y-2 mb-5">
              {PLUS_FEATURES.map(f => (
                <div key={f.key} className="flex items-center gap-2.5 text-sm">
                  <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
                  <span className="font-medium text-gray-800">{lang === 'am' ? f.am : f.en}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleUpgrade}
              disabled={upgrading}
              className="w-full py-3 rounded-xl text-sm font-black text-white transition-all press-scale disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {upgrading
                ? (lang === 'am' ? 'በመስራት ላይ...' : 'Upgrading...')
                : (lang === 'am' ? 'ወደ Plus አሻሽል' : 'Upgrade Now')}
            </button>

            <p className="text-[10px] text-center mt-3" style={{ color: 'var(--color-text-muted)' }}>
              {lang === 'am' ? 'ከዚህ ስልክ ጋር የተያያዘ ነው። ምንም ክፍያ አይጠየቅም።' : 'Tied to this device. No payment is taken.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
