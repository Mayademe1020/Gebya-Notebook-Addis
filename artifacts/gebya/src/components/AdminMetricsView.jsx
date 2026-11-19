/**
 * AdminMetricsView — impact metrics for future grant/NBE/DFI conversations.
 * Read-only dashboard showing aggregate shop performance.
 */
import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { computeImpactMetrics } from '../utils/entitlements';
import { getTrustScores } from '../utils/trustScore';
import { label } from '../labels/index.js';

function fmtBirr(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('en-US');
}

export default function AdminMetricsView({ shopId }) {
  const { lang } = useLang();
  const [metrics, setMetrics] = useState(null);
  const [trustScores, setTrustScores] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      computeImpactMetrics(),
      getTrustScores(shopId),
    ]).then(([m, ts]) => {
      if (mounted) {
        setMetrics(m);
        setTrustScores(ts);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [shopId]);

  if (loading) return <div className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading metrics...</div>;
  if (!metrics) return null;

  const rows = [
    { label: label('admin.shops-onboarded', lang), value: metrics.shops_onboarded },
    { label: label('admin.months-active', lang), value: metrics.months_active },
    { label: label('admin.total-transactions', lang), value: fmtBirr(metrics.total_transactions) },
    { label: label('admin.monthly-transaction-rate', lang), value: `${fmtBirr(metrics.monthly_transaction_rate)}/mo` },
    { label: label('admin.total-sales-birr', lang), value: `${fmtBirr(metrics.total_sales_birr)} ETB` },
    { label: label('admin.total-expenses-birr', lang), value: `${fmtBirr(metrics.total_expenses_birr)} ETB` },
    { label: label('admin.credit-extended-birr', lang), value: `${fmtBirr(metrics.total_credit_extended_birr)} ETB` },
    { label: label('admin.credit-repaid-birr', lang), value: `${fmtBirr(metrics.total_credit_repaid_birr)} ETB` },
    { label: label('admin.credit-recovery-rate', lang), value: `${metrics.credit_recovery_rate}%` },
    { label: label('admin.unique-customers', lang), value: metrics.unique_customers },
    { label: label('admin.active-staff', lang), value: metrics.active_staff },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {label('admin.impact-metrics', lang)}
      </p>
      <p className="text-[10px] italic" style={{ color: 'var(--color-text-soft)' }}>
        Behavioral consistency signal, unvalidated
      </p>
      <div className="border divide-y" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between px-3 py-2">
            <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{row.label}</span>
            <span className="text-xs font-black" style={{ color: 'var(--color-text)' }}>{row.value}</span>
          </div>
        ))}
      </div>
      {trustScores && (
        <div className="border p-3" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
          <p className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {label('admin.trust-scores', lang)}
          </p>
          <div className="flex gap-4">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Data Integrity</p>
              <p className="text-lg font-black" style={{ color: 'var(--color-success-text)' }}>{trustScores.data_integrity_score}/100</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Business Health</p>
              <p className="text-lg font-black" style={{ color: 'var(--color-success-text)' }}>{trustScores.business_health_score}/100</p>
            </div>
          </div>
          <p className="text-[9px] mt-1" style={{ color: 'var(--color-text-soft)' }}>
            v{trustScores.score_version} | computed {new Date(trustScores.computed_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
