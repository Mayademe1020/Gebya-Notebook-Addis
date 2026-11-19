import { useEffect, useState } from 'react';
import { getAllSettlements } from '../db';
import { fmt } from '../utils/numformat';
import { label } from '../labels/index.js';

// HandoverStatus — owner's at-a-glance list of who has handed over today.
//
//   ⏳ pending    no settlement submitted yet
//   📤 submitted  staff reported cash+transfer, awaiting owner review
//   ⚠️ disputed   owner flagged a mismatch
//   ✅ confirmed  reconciled and finalized
//
// Tapping a row opens that person's settlement for review.

function statusFor(settlement) {
  if (!settlement) return { key: 'pending', icon: '⏳' };
  const rs = settlement.reconciliation_status;
  if (rs === 'staff_submitted') return { key: 'submitted', icon: '📤' };
  if (rs === 'disputed') return { key: 'disputed', icon: '⚠️' };
  return { key: 'confirmed', icon: '✅' };
}

export default function HandoverStatus({
  staffMembers = [],
  todayStart,
  lang = 'en',
  refreshKey = 0,
  onOpen,
}) {
  const [byStaffId, setByStaffId] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getAllSettlements(todayStart, Date.now() + 60000);
        if (cancelled) return;
        // Latest settlement per staff for today
        const map = {};
        for (const s of rows || []) {
          const id = String(s.staff_id);
          const prev = map[id];
          if (!prev || Number(s.updated_at || s.created_at || 0) >= Number(prev.updated_at || prev.created_at || 0)) {
            map[id] = s;
          }
        }
        setByStaffId(map);
      } catch {
        if (!cancelled) setByStaffId({});
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [todayStart, refreshKey]);

  if (!loaded) return null;

  const members = (staffMembers || []).filter(m => m && m.id != null);
  if (members.length === 0) return null;

  const t = (en, am) => (lang === 'am' ? am : en);
  const labels = {
    pending: t('Waiting', 'ተጠብቋል'),
    submitted: t('Submitted', 'አሳልፏል'),
    disputed: t('Disputed', 'ክርክር'),
    confirmed: t('Confirmed', 'ተረጋግጧል'),
  };

  const allPending = members.every(m => !byStaffId[String(m.id)]);

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      overflow: 'hidden',
      marginTop: 4,
    }}>
      {members.map((m, i) => {
        const settlement = byStaffId[String(m.id)];
        const st = statusFor(settlement);
        const reported = settlement
          ? (Number(settlement.staff_reported_cash ?? settlement.actual_cash) || 0)
            + (Number(settlement.staff_reported_transfer ?? settlement.actual_transfer) || 0)
          : null;
        return (
          <div
            key={String(m.id)}
            role={onOpen ? 'button' : undefined}
            onClick={onOpen ? () => onOpen(m, settlement || null) : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px', minHeight: 44, boxSizing: 'border-box',
              borderBottom: i < members.length - 1 ? '1px solid var(--color-bg-hover)' : 'none',
              cursor: onOpen ? 'pointer' : 'default',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16 }}>👤</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 14, fontWeight: 700, color: 'var(--color-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {m.display_name || m.name || '?'}
              </p>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-soft)', marginTop: 1 }}>
                {st.icon} {labels[st.key]}
              </p>
            </div>
            {reported != null && reported > 0 && (
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-success)', flexShrink: 0 }}>
                {fmt(reported)} ETB
              </span>
            )}
          </div>
        );
      })}
      {allPending && (
        <p style={{
          fontSize: 11, fontWeight: 600, color: 'var(--color-text-soft)',
          textAlign: 'center', padding: '8px 14px',
        }}>
          {label('sync.staff-haven-t-handed-over-yet-wait-or-ask', lang)}
        </p>
      )}
    </div>
  );
}
