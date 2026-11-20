import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, User, Calendar, Filter, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePermissionsStore } from '../stores/permissionsStore';
import { useSyncStore } from '../stores/syncStore';
import { useSyncRefresh } from '../hooks/useSyncRefresh';
import { fmt } from '../utils/numformat';
import { formatEthiopianTime } from '../utils/ethiopianCalendar';
import { apiFetch } from '../utils/shared-ui.jsx';
import { label } from '../labels/index.js';

const ACTION_LABELS = {
  CREATE: { en: 'Recorded', am: 'ተመዝግቧል' },
  UPDATE: { en: 'Updated', am: 'ተሻሽሏል' },
  DELETE: { en: 'Deleted', am: 'ጥሷል' },
  ATTEMPTED_VIOLATION: { en: 'Blocked attempt', am: 'የጣሰ ሙከራ' },
};

function formatTime(ts, lang) {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = formatEthiopianTime(ts);
  if (isToday) return time;
  if (isYesterday) return (label('admin.yesterday', lang)) + time;
  return d.toLocaleDateString(label('admin.en-us', lang), { month: 'short', day: 'numeric' }) + ' ' + time;
}

function relativeDayLabel(ts, lang) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return label('admin.today', lang);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return label('admin.yesterday-2', lang);
  return '';
}

function entityAmount(entityType, row) {
  if (!row) return null;
  if (entityType === 'transactions' || entityType === 'supplier_transactions') return Number(row.amount || 0);
  if (entityType === 'customer_transactions') return Number(row.amount || 0);
  return null;
}

function entityDescription(entityType, row) {
  if (!row) return '';
  if (entityType === 'transactions') return row.item_name || row.type || 'Transaction';
  if (entityType === 'customers') return row.display_name || 'Customer';
  if (entityType === 'customer_transactions') return row.item_note || row.type || 'Customer transaction';
  if (entityType === 'catalog_entries') return row.name || 'Catalog item';
  if (entityType === 'suppliers') return row.display_name || 'Supplier';
  if (entityType === 'supplier_transactions') return row.item_name || row.note || 'Supplier transaction';
  if (entityType === 'staff_members') return row.display_name || 'Staff';
  return entityType;
}

function summaryLabel(action, entityType, lang) {
  const base = ACTION_LABELS[action] || ACTION_LABELS.CREATE;
  const verb = base[lang] || base.en;
  if (entityType === 'transactions') return verb + ' ' + (label('admin.sale-expense', lang));
  if (entityType === 'customers') return verb + ' ' + (label('admin.customer', lang));
  if (entityType === 'customer_transactions') return verb + ' ' + (label('admin.customer-ledger', lang));
  if (entityType === 'suppliers') return verb + ' ' + (label('admin.supplier', lang));
  if (entityType === 'supplier_transactions') return verb + ' ' + (label('admin.supplier-ledger', lang));
  if (entityType === 'staff_members') return verb + ' ' + (label('admin.staff-2', lang));
  return verb;
}

function todayStartMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function ConflictsCard({ lang }) {
  const lastConflicts = useSyncStore(s => s.lastConflicts);
  const clearConflicts = useSyncStore(s => s.setLastConflicts);

  if (!lastConflicts || lastConflicts.length === 0) return null;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-bg)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-warning-border)', background: 'var(--color-warning-bg)' }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-black text-amber-800">
            {label('admin.conflicts', lang)}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
            {lastConflicts.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => clearConflicts([])}
          className="press-scale flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-lg px-2 py-1"
        >
          <RefreshCw className="w-3 h-3" />
          {label('admin.dismiss-2', lang)}
        </button>
      </div>
      <div className="px-4 py-3 space-y-2">
        {lastConflicts.map((conflict, idx) => (
          <div key={idx} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-warning-border)', background: 'var(--color-surface)' }}>
            <div className="text-xs font-bold text-amber-900">
              {conflict.table} · localId {conflict.localId}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              Server version: {conflict.serverVersion ? `v${conflict.serverVersion}` : '—'} · {conflict.serverUpdatedAt ? new Date(conflict.serverUpdatedAt).toLocaleString() : '—'}
            </div>
          </div>
        ))}
        <div className="text-[10px] text-amber-700 mt-1">
          {label('admin.latest-version-kept-staff-changes-were', lang)}
        </div>
      </div>
    </div>
  );
}

export default function OwnerActivityDashboard({ shopProfile, staffMembers }) {
  const { lang } = useLang();
  const canManageTeam = usePermissionsStore(s => s.hasPermission('can_manage_team'));

  const [activity, setActivity] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [staffFilter, setStaffFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [actionFilter, setActionFilter] = useState('all');
  const [showBlocked, setShowBlocked] = useState(true);

  const loadData = useCallback(async () => {
    if (!canManageTeam) return;
    setLoading(true); setError(null);
    try {
      const today = todayStartMs();
      const [actRes, violRes] = await Promise.all([
        apiFetch('/audit/activity?date_from=' + encodeURIComponent(new Date(today).toISOString())),
        apiFetch('/audit/violations'),
      ]);
      setActivity(Array.isArray(actRes.activity) ? actRes.activity : []);
      setViolations(Array.isArray(violRes.violations) ? violRes.violations : []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [canManageTeam]);

  useEffect(() => { loadData(); }, [loadData]);

  // Re-fetch activity feed after each sync cycle so owner sees staff data promptly
  useSyncRefresh(useCallback(() => { loadData(); }, [loadData]));

  const staffOptions = useMemo(() => {
    const map = new Map();
    (staffMembers || []).forEach(m => {
      if (m.active !== false) map.set(m.id, m.display_name || 'Staff');
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [staffMembers]);

  const todayTotalsByStaff = useMemo(() => {
    const totals = new Map();
    (activity || []).forEach(row => {
      if (!row.actorStaffMemberId) return;
      if (row.action === 'ATTEMPTED_VIOLATION') return;
      const id = row.actorStaffMemberId;
      const name = row.actorStaffMemberId ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name || 'Staff' : 'Owner';
      const existing = totals.get(id) || { name, transactions: 0, amount: 0 };
      existing.transactions += 1;
      existing.amount += entityAmount(row.entityType, row) || 0;
      totals.set(id, existing);
    });
    return Array.from(totals.values()).sort((a, b) => b.amount - a.amount);
  }, [activity, staffOptions]);

  const filteredActivity = useMemo(() => {
    return (activity || []).filter(row => {
      if (row.action === 'ATTEMPTED_VIOLATION') return false;
      if (staffFilter !== 'all' && String(row.actorStaffMemberId) !== staffFilter) return false;
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;
      if (dateFilter === 'today') {
        const base = todayStartMs();
        return row.createdAt >= base;
      }
      return true;
    });
  }, [activity, staffFilter, actionFilter, dateFilter]);

  const filteredViolations = useMemo(() => {
    return (violations || []).filter(row => {
      if (staffFilter !== 'all' && String(row.actorStaffMemberId) !== staffFilter) return false;
      if (dateFilter === 'today') {
        const base = todayStartMs();
        return row.createdAt >= base;
      }
      return true;
    });
  }, [violations, staffFilter, dateFilter]);

  // ─── NEW: Staff Performance Metrics ─────────────────────────────────────
  const performanceByStaff = useMemo(() => {
    const map = new Map();
    (activity || []).forEach(row => {
      if (row.action === 'ATTEMPTED_VIOLATION') return;
      const id = row.actorStaffMemberId;
      if (!id) return;
      const name = staffOptions.find(o => o.id === id)?.name || 'Staff';
      const existing = map.get(id) || { name, transactions: 0, sales: 0, payments: 0, credits: 0, amount: 0 };
      existing.transactions += 1;
      existing.amount += entityAmount(row.entityType, row) || 0;
      if (row.entityType === 'transactions') existing.sales += 1;
      if (row.entityType === 'customer_payment') existing.payments += 1;
      if (row.entityType === 'customer_credit') existing.credits += 1;
      map.set(id, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [activity, staffOptions]);

  const totalSalesAmount = useMemo(() => performanceByStaff.reduce((s, r) => s + r.amount, 0), [performanceByStaff]);

  if (!canManageTeam) return null;

  return (
    <div className="space-y-4 pb-4">
      {/* Summary bar */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border-light)', background: 'var(--color-surface-subtle)' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {label('admin.today-s-activity', lang)}
          </span>
          <Calendar className="w-4 h-4 text-gray-400" />
        </div>
        {todayTotalsByStaff.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">
            {label('admin.no-activity-recorded-yet-today', lang)}
          </div>
        ) : (
          <div className="px-4 py-3 space-y-2">
            {todayTotalsByStaff.map(row => (
              <div key={row.name + row.id} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-border-light)', background: 'var(--color-surface-subtle)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: 'var(--color-primary)' }}>
                    {row.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-bold text-gray-900">{row.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-gray-700">
                    {row.transactions} {label('admin.records', lang)} · {fmt(row.amount)} {label('admin.birr', lang)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW: Performance Metrics */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border-light)', background: 'var(--color-surface-subtle)' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {label('admin.performance-metrics', lang)}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
            {label('admin.total', lang)} {fmt(totalSalesAmount)} {label('admin.etb', lang)}
          </span>
        </div>
        {performanceByStaff.length === 0 ? (
          <div className="px-4 py-3 text-xs text-gray-400">
            {label('admin.no-performance-data-yet', lang)}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border-light)' }}>
            {performanceByStaff.slice(0, 10).map((row, idx) => (
              <div key={row.name + row.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: idx === 0 ? 'var(--color-warning)' : 'var(--color-primary)' }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">{row.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {row.sales} {label('admin.sales-3', lang)} · {row.payments} {label('admin.payments', lang)} · {row.credits} {label('admin.credits', lang)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black" style={{ color: 'var(--color-primary)' }}>{fmt(row.amount)}</div>
                  <div className="text-[10px] text-gray-500">{label('admin.etb', lang)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conflicts */}
      <ConflictsCard lang={lang} />

      {/* Blocked actions */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-surface)' }}>
        <button
          type="button"
          onClick={() => setShowBlocked(!showBlocked)}
          className="w-full px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-danger-bg)' }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-black text-red-700">
              {label('admin.blocked-actions', lang)}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {filteredViolations.length}
            </span>
          </div>
          {showBlocked ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
        </button>
        {showBlocked && (
          <div className="px-4 py-3 space-y-2">
            {filteredViolations.length === 0 ? (
              <div className="text-xs text-gray-400">
                {label('admin.no-blocked-actions', lang)}
              </div>
            ) : (
              filteredViolations.map(row => (
                <div key={row.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-surface)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: 'var(--color-danger-text)' }}>
                        {row.actorStaffMemberId ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name?.charAt(0) || 'S' : 'D'}
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        {row.actorStaffMemberId ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name || (label('admin.staff-3', lang)) : (label('admin.device', lang))}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(row.createdAt, lang)}</span>
                  </div>
                  <div className="text-xs text-red-700 mt-1 font-semibold">
                    {label('admin.attempted', lang)} {row.blockedPermission || row.entityType || ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {row.details || ''}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {label('admin.filters', lang)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white" style={{ borderColor: 'var(--color-border)' }}>
            <option value="all">{label('admin.all-staff', lang)}</option>
            {staffOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white" style={{ borderColor: 'var(--color-border)' }}>
            <option value="today">{label('admin.today', lang)}</option>
            <option value="all">{label('admin.all', lang)}</option>
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white" style={{ borderColor: 'var(--color-border)' }}>
            <option value="all">{label('admin.all', lang)}</option>
            <option value="CREATE">{label('admin.created', lang)}</option>
            <option value="UPDATE">{label('admin.updated-2', lang)}</option>
            <option value="DELETE">{label('admin.deleted', lang)}</option>
          </select>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-light)', background: 'var(--color-surface-subtle)' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {label('admin.recent-activity', lang)}
          </span>
        </div>
        {filteredActivity.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">
            {label('admin.no-matching-activity', lang)}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border-light)' }}>
            {filteredActivity.slice(0, 100).map(row => {
              const dayLabel = relativeDayLabel(row.createdAt, lang);
              const timeStr = formatTime(row.createdAt, lang);
              const amount = entityAmount(row.entityType, row);
              const desc = entityDescription(row.entityType, row);
              const verb = ACTION_LABELS[row.action]?.[lang] || ACTION_LABELS[row.action]?.en || row.action;
              const actorName = row.actorStaffMemberId
                ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name || (label('admin.staff-3', lang))
                : (label('admin.owner', lang));

              return (
                <div key={row.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: 'var(--color-primary)' }}>
                        {actorName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-gray-700">{actorName}</span>
                    </div>
                    <span className="text-xs text-gray-400">{dayLabel ? dayLabel + ' ' : ''}{timeStr}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-gray-900 pl-8">
                    <span className="font-semibold">{verb}</span>
                    <span className="text-gray-500"> — {desc}</span>
                  </div>
                  {typeof amount === 'number' && (
                    <div className="mt-0.5 pl-8 text-xs font-bold text-gray-600">
                      {fmt(amount)} {label('admin.birr', lang)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}