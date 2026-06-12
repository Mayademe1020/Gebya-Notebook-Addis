import { useState, useEffect } from 'react';
import { ChevronDown, Shield, Info } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { getIdentity } from '../db';

const ROLE_COLORS = {
  owner: { bg: 'rgba(27,67,50,0.15)', text: '#bbf7d0', label: 'Owner' },
  manager: { bg: 'rgba(196,136,58,0.15)', text: '#fcd34d', label: 'Manager' },
  trusted_staff: { bg: 'rgba(196,136,58,0.15)', text: '#fcd34d', label: 'Trusted' },
  basic_staff: { bg: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.6)', label: 'Staff' },
};

const PERM_LABELS = {
  can_create_sale: 'Sales',
  can_create_customer_credit: 'Dubie',
  can_create_customer_payment: 'Payments',
  can_create_expense: 'Expenses',
  can_create_note: 'Notes',
  can_create_supplier_transaction: 'Suppliers',
};

export default function TopbarIdentity({ className = '' }) {
  const { t } = useLang();
  const [ident, setIdent] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getIdentity().then((id) => {
      setIdent(id);
      setLoading(false);
    });
  }, []);

  if (loading || !ident) return null;

  const roleInfo = ROLE_COLORS[ident.role] || ROLE_COLORS.basic_staff;
  const allowedActions = ident.permissions
    ? Object.entries(ident.permissions)
        .filter(([, v]) => v === true)
        .map(([k]) => PERM_LABELS[k] || k)
    : [];

  const isOwner = ident.role === 'owner';
  const isPending = ident.device_status === 'pending';

  return (
    <div className={`relative ${className}`}>
      {/* Main chip row */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer select-none"
        style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        aria-label="Identity details"
      >
        {/* Shop initial */}
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
        >
          {(ident.shop_name || 'S').charAt(0).toUpperCase()}
        </div>

        {/* Recording as */}
        <span className="text-xs font-semibold text-white/80">
          {t.topbarRecordingAs || 'Recording as'}
        </span>
        <span className="text-xs font-black text-white truncate max-w-[80px]">
          {ident.display_name || '—'}
        </span>

        {/* Role badge */}
        <span
          className="text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0"
          style={{ background: roleInfo.bg, color: roleInfo.text }}
        >
          {roleInfo.label}
        </span>

        {/* Chevron */}
        <ChevronDown
          className="w-3 h-3 flex-shrink-0 transition-transform"
          style={{ color: 'rgba(255,255,255,0.5)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div
          className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-slide-up"
          style={{ minWidth: '280px' }}
        >
          {/* Shop name header */}
          <div
            className="px-4 py-3"
            style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2d6a4f 100%)' }}
          >
            <p className="text-xs font-semibold text-white/60 mb-0.5">
              {t.topbarShop || 'Shop'}
            </p>
            <p className="text-base font-black text-white truncate">
              {ident.shop_name || '—'}
            </p>
            {isPending && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {t.topbarPending || 'Pending approval'}
              </span>
            )}
          </div>

          {/* Identity details */}
          <div className="px-4 py-3 space-y-2.5 border-t border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-gray-500">{t.topbarYouAre || 'You are'}</span>
              <span className="font-bold text-gray-900">{ident.display_name || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-gray-500">{t.topbarRole || 'Role'}</span>
              <span
                className="font-bold px-2 py-0.5 rounded-full text-xs uppercase tracking-wider"
                style={{ background: roleInfo.bg, color: roleInfo.text }}
              >
                {roleInfo.label}
              </span>
            </div>
            {!isOwner && allowedActions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                  {t.topbarAllowedActions || 'Allowed actions'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {allowedActions.map((action) => (
                    <span
                      key={action}
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(27,67,50,0.08)', color: '#1B4332' }}
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bank trust note */}
          {!isOwner && (
            <div
              className="mx-3 mb-3 px-3 py-2 rounded-xl text-xs font-medium leading-relaxed"
              style={{ background: 'rgba(27,67,50,0.05)', color: '#6b7280' }}
            >
              <div className="flex items-start gap-1.5">
                <Shield className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>{t.topbarBankNote || 'Gebya never asks for bank details. Payment is only a label.'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}