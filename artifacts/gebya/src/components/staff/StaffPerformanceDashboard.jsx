import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useMemo } from 'react';
import { fmt } from '../../utils/numformat';
import { label } from '../../labels/index';

const StatCard = React.memo(function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '10px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color, marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
    </div>
  );
});

const StaffRankingRow = React.memo(function StaffRankingRow({ staff, isFirst }) {
  const t = useTranslation();
  const medal = staff.rank === 1 ? '🥇' : staff.rank === 2 ? '🥈' : staff.rank === 3 ? '🥉' : null;
  const growthColor = staff.growth >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
  const avgColor = staff.avgPerTx > 2000 ? 'var(--color-success)' : staff.avgPerTx > 1000 ? 'var(--color-primary)' : 'var(--color-text-muted)';
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderBottom: '1px solid var(--color-border-light)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {medal && (
          <span style={{ fontSize: '1rem' }}>{medal}</span>
        )}
        {isFirst && !medal && (
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>#1</span>
        )}
        <span style={{ fontWeight: 500 }}>{staff.name}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 600 }}>{fmt(staff.total)} {t('birr', 'ብር')}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          {staff.count} {t('txns', 'ግብት')} · {t('Avg', 'ጨርሳ')} {fmt(staff.avgPerTx)}
          {staff.growth && (
            <span style={{ 
              color: growthColor, 
              fontWeight: staff.growth >= 0 ? 600 : 400,
              marginLeft: 4
            }}>
              ({staff.growth >= 0 ? '+' : ''}{staff.growth}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default function StaffPerformanceDashboard({ 
  activeStaff, 
  todayStaffSales, 
  yesterdayStaffSales = {},
  lang 
}) {
  const t = useTranslation();
  
  const performanceData = useMemo(() => {
    if (!activeStaff || activeStaff.length === 0) {
      return { rankedStaff: [], topPerformer: null, stats: {}, teamAvg: {} };
    }

    const staffWithSales = activeStaff.map(staff => {
      const today = todayStaffSales[staff.id] || { count: 0, total: 0, cashTotal: 0, transferTotal: 0 };
      const yesterday = yesterdayStaffSales[staff.id] || { total: 0 };
      
      const avgPerTx = today.count > 0 ? today.total / today.count : 0;
      const growth = yesterday.total > 0 ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100) : (today.total > 0 ? 100 : 0);
      
      return {
        id: staff.id,
        name: staff.display_name || staff.name || (label('staff.staff', lang)),
        ...today,
        yesterdayTotal: yesterday.total,
        avgPerTx,
        growth,
        isTop: false
      };
    });

    staffWithSales.sort((a, b) => b.total - a.total);
    staffWithSales.forEach((staff, index) => {
      staff.isTop = index === 0 && staff.total > 0;
      staff.rank = index + 1;
    });

    const topPerformer = staffWithSales[0]?.total > 0 ? staffWithSales[0] : null;
    
    const totalTransactions = staffWithSales.reduce((sum, s) => sum + s.count, 0);
    const totalSales = staffWithSales.reduce((sum, s) => sum + s.total, 0);
    const totalCash = staffWithSales.reduce((sum, s) => sum + s.cashTotal, 0);
    const totalTransfer = staffWithSales.reduce((sum, s) => sum + s.transferTotal, 0);
    const teamAvgTx = totalTransactions > 0 ? Math.round(totalSales / totalTransactions) : 0;

    return {
      rankedStaff: staffWithSales,
      topPerformer,
      stats: {
        totalTransactions,
        totalSales,
        totalCash,
        totalTransfer,
        activeCount: activeStaff.length,
        teamAvgTx
      }
    };
  }, [activeStaff, todayStaffSales, yesterdayStaffSales, lang]);

  if (!activeStaff || activeStaff.length === 0) {
    return (
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div className="px-4 py-3 text-center text-gray-500">
          <div className="text-3xl mb-2">📊</div>
          {t('No staff data available', 'የሰራተኛ ዝርዝር የለም')}
          <p className="text-xs mt-1 opacity-60">{t('Staff performance data appears here once sales are recorded', 'የሰራተኛ አለም ምክንያት ብወጋል ለጠቅም ተመልከቱ')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border-light)', background: 'var(--color-surface-alt)' }}>
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
          {t('Staff Performance', 'የሰራተኞች አለም')}
        </span>
        <span className="text-[10px] font-bold" style={{ color: 'var(--color-primary)' }}>
          {t('Team Avg', 'ቡድን ጨርሳ')}: {fmt(performanceData.stats.teamAvgTx)} {t('birr', 'ብር')}
        </span>
      </div>

      {/* Top Performer Banner */}
      {performanceData.topPerformer && (
        <div style={{
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent-amber))',
          color: 'var(--color-bg-white)',
          padding: '12px 16px'
        }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--color-bg-white)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              fontWeight: 800,
              flexShrink: 0
            }}>
              {(performanceData.topPerformer.name?.charAt(0) || '?').toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.9 }}>
                {label('staff.top-performer', lang)}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {performanceData.topPerformer.name}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                {fmt(performanceData.topPerformer.total)} {t('birr', 'ብር')}
              </div>
              <div style={{ fontSize: '0.65rem', opacity: 0.9 }}>
                {performanceData.topPerformer.count} {t('txns', 'ግብት')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ padding: '12px', background: 'var(--color-bg)' }}>
        <div className="grid grid-cols-2 gap-2">
          <StatCard 
            label={t('Transactions', 'መዝገብ')} 
            value={performanceData.stats.totalTransactions} 
            color="var(--color-primary)"
          />
          <StatCard 
            label={t('Total Sales', 'አጠቃ ብር')} 
            value={fmt(performanceData.stats.totalSales)} 
            color="var(--color-primary)"
          />
          <StatCard 
            label={t('Cash', 'ጥሬ')} 
            value={fmt(performanceData.stats.totalCash)} 
            color="var(--color-success)"
          />
          <StatCard 
            label={t('Transfer', 'ዝውውር')} 
            value={fmt(performanceData.stats.totalTransfer)} 
            color="var(--color-info)"
          />
        </div>
      </div>

      {/* Staff Rankings */}
      <div style={{ borderTop: '1px solid var(--color-border-light)' }}>
        {performanceData.rankedStaff.map(staff => (
          <StaffRankingRow 
            key={staff.id}
            staff={staff}
            isFirst={staff.rank === 1}
          />
        ))}
      </div>

      {/* Footer Summary */}
      <div style={{
        borderTop: '1px solid var(--color-border-light)',
        padding: '8px 12px',
        background: 'var(--color-surface-alt)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.7rem',
        color: 'var(--color-text-muted)'
      }}>
        <span>{t('Active Staff', 'ንቁ ሰራተኞች')}: {performanceData.stats.activeCount}</span>
        <span>{t('Team Total', 'ቡድን ጥሬ')}: {fmt(performanceData.stats.totalSales)} {t('birr', 'ብር')}</span>
      </div>
    </div>
  );
}
