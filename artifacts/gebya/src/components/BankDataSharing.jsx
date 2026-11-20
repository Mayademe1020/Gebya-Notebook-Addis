/**
 * BankDataSharing — merchant-side consent panel.
 * Shows which banks have access, lets merchant grant/revoke.
 */
import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/shared-ui.jsx';
import { label } from '../labels/index.js';

const BANKS = [
  { id: 'cbe', name: 'Commercial Bank of Ethiopia', nameAm: 'የኢትዮጵያ ንግድ ባንክ' },
  { id: 'dashen', name: 'Dashen Bank', nameAm: 'ዳሸን ባንክ' },
  { id: 'awash', name: 'Awash Bank', nameAm: 'አዋሽ ባንክ' },
  { id: 'wegagen', name: 'Wegagen Bank', nameAm: 'ወጋገን ባንክ' },
  { id: 'nbe', name: 'National Bank of Ethiopia (NBE)', nameAm: 'የኢትዮጵያ ብሔራዊ ባንክ' },
];

export default function BankDataSharing({ shopId, lang }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/analytics/shares')
      .then((d) => setShares(d.shares || []))
      .catch(() => setShares([]))
      .finally(() => setLoading(false));
  }, [shopId]);
  const [showGrant, setShowGrant] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [opts, setOpts] = useState({ sales: true, credit: true, customer: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleGrant = async () => {
    if (!selectedBank) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/analytics/share', {
        method: 'POST',
        body: JSON.stringify({
          bankName: selectedBank,
          shareSalesData: opts.sales,
          shareCreditData: opts.credit,
          shareCustomerData: opts.customer,
        }),
      });
      // Refresh
      const d = await apiFetch('/analytics/shares');
      setShares(d.shares || []);
      setShowGrant(false);
      setSelectedBank('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (shareId) => {
    if (!confirm(label('common.revoke-access-for-this-bank', lang))) return;
    try {
      await apiFetch(`/analytics/share/${shareId}`, { method: 'DELETE' });
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (e) {
      setError(e.message);
    }
  };

  const t = {
    title: label('common.bank-data-sharing', lang),
    subtitle: label('common.share-your-business-data-with-banks-for', lang),
    noShares: label('common.no-banks-have-access-yet', lang),
    grantAccess: label('common.grant-access', lang),
    revoke: label('common.revoke', lang),
    active: label('common.active', lang),
    selectBank: label('common.select-a-bank', lang),
    shareOptions: label('common.what-to-share', lang),
    salesData: label('common.sales-data', lang),
    creditData: label('common.credit-dubie-data', lang),
    customerData: label('common.customer-info-name-phone', lang),
    customerDataHint: label('common.includes-pii-opt-in-only', lang),
    confirm: label('common.confirm', lang),
    cancel: label('common.cancel', lang),
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 py-4">
        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>{t.title}</p>
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{t.subtitle}</p>
      </div>

      {error && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="px-5 pb-4 text-xs text-gray-400">Loading...</div>
      ) : shares.length === 0 && !showGrant ? (
        <div className="px-5 pb-4">
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginBottom: 12 }}>{t.noShares}</p>
          <button
            type="button"
            onClick={() => setShowGrant(true)}
            className="press-scale"
            style={{
              width: '100%', padding: '10px 0', borderRadius: 12, border: '1px dashed var(--color-primary)',
              background: 'rgba(27,67,50,0.04)', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + {t.grantAccess}
          </button>
        </div>
      ) : (
        <div className="px-5 pb-4 space-y-2">
          {shares.map((share) => {
            const bank = BANKS.find((b) => b.id === share.bankName || b.name === share.bankName);
            return (
              <div key={share.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
                    {bank ? (lang === 'am' ? bank.nameAm : bank.name) : share.bankName}
                  </p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--color-text-soft)' }}>
                    {t.active} · {share.shareCreditData ? 'Dubie' : ''}
                    {share.shareSalesData ? ' · Sales' : ''}
                    {share.shareCustomerData ? ' · PII' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(share.id)}
                  style={{
                    fontSize: '0.7rem', color: 'var(--color-danger)', background: 'none',
                    border: '1px solid var(--color-danger-border)', borderRadius: 6, padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {t.revoke}
                </button>
              </div>
            );
          })}

          {!showGrant && (
            <button
              type="button"
              onClick={() => setShowGrant(true)}
              className="press-scale"
              style={{
                width: '100%', padding: '10px 0', borderRadius: 12, border: '1px dashed var(--color-primary)',
                background: 'rgba(27,67,50,0.04)', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', marginTop: 8,
              }}
            >
              + {t.grantAccess}
            </button>
          )}
        </div>
      )}

      {showGrant && (
        <div className="px-5 pb-4 space-y-3">
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{t.selectBank}</label>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              style={{
                width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--color-text-soft)', fontSize: '0.8rem',
              }}
            >
              <option value="">{t.selectBank}</option>
              {BANKS.filter((b) => b.id !== 'nbe').map((b) => (
                <option key={b.id} value={b.id}>{lang === 'am' ? b.nameAm : b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
              {t.shareOptions}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--color-text)', marginBottom: 4 }}>
              <input type="checkbox" checked={opts.sales} onChange={(e) => setOpts({ ...opts, sales: e.target.checked })} />
              {t.salesData}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--color-text)', marginBottom: 4 }}>
              <input type="checkbox" checked={opts.credit} onChange={(e) => setOpts({ ...opts, credit: e.target.checked })} />
              {t.creditData}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--color-text)', marginBottom: 4 }}>
              <input type="checkbox" checked={opts.customer} onChange={(e) => setOpts({ ...opts, customer: e.target.checked })} />
              {t.customerData}
            </label>
            <p style={{ fontSize: '0.65rem', color: 'var(--color-text-soft)', marginTop: 4 }}>{t.customerDataHint}</p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowGrant(false)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--color-text-soft)',
                background: 'var(--color-surface)', fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleGrant}
              disabled={!selectedBank || saving}
              className="press-scale"
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                background: selectedBank ? 'var(--color-primary)' : 'var(--color-text-soft)',
                color: 'var(--color-bg-white)', fontSize: '0.8rem', fontWeight: 600,
                cursor: selectedBank ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? '...' : t.confirm}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
