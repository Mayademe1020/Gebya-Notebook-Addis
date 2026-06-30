import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, User, Calendar, Filter, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePermissionsStore } from '../stores/permissionsStore';
import { getAuthToken } from '../utils/syncEngine';
import { useSyncStore } from '../stores/syncStore';

const API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';

async function apiFetch(path, options = {}) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

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
  const time = d.toLocaleTimeString(lang === 'am' ? 'am-ET' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return (lang === 'am' ? 'ትላንትና ' : 'Yesterday ') + time;
  return d.toLocaleDateString(lang === 'am' ? 'am-ET' : 'en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
}

function relativeDayLabel(ts, lang) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return lang === 'am' ? 'ዛሬ' : 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return lang === 'am' ? 'ትላንትና' : 'Yesterday';
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
  if (entityType === 'transactions') return verb + ' ' + (lang === 'am' ? 'ሽያጭ/ወጪ' : 'sale/expense');
  if (entityType === 'customers') return verb + ' ' + (lang === 'am' ? 'ደንበኛ' : 'customer');
  if (entityType === 'customer_transactions') return verb + ' ' + (lang === 'am' ? 'የደንበኛ ሂሳብ' : 'customer ledger');
  if (entityType === 'suppliers') return verb + ' ' + (lang === 'am' ? 'አቅራቢ' : 'supplier');
  if (entityType === 'supplier_transactions') return verb + ' ' + (lang === 'am' ? 'የአቅራቢ ሂሳብ' : 'supplier ledger');
  if (entityType === 'staff_members') return verb + ' ' + (lang === 'am' ? 'ሰራተኛ' : 'staff');
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
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#f59e0b', background: '#fffbeb' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#fcd34d', background: '#fef3c7' }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-black text-amber-800">
            {lang === 'am' ? 'የሁከት ሪኮርዶች' : 'Conflicts'}
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
          {lang === 'am' ? 'አጽዳ' : 'Dismiss'}
        </button>
      </div>
      <div className="px-4 py-3 space-y-2">
        {lastConflicts.map((conflict, idx) => (
          <div key={idx} className="rounded-xl border px-3 py-2" style={{ borderColor: '#fcd34d', background: '#fff' }}>
            <div className="text-xs font-bold text-amber-900">
              {conflict.table} · localId {conflict.localId}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              Server version: {conflict.serverVersion ? `v${conflict.serverVersion}` : '—'} · {conflict.serverUpdatedAt ? new Date(conflict.serverUpdatedAt).toLocaleString() : '—'}
            </div>
          </div>
        ))}
        <div className="text-[10px] text-amber-700 mt-1">
          {lang === 'am' ? 'የኋላ ሪኮርዱ ተቀምጧል። የሰራተኞች የላቀ ስሪት ተቀብሏል።' : 'Latest version kept. Staff changes were merged automatically.'}
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
        apiFetch('/api/audit/activity?date_from=' + encodeURIComponent(new Date(today).toISOString())),
        apiFetch('/api/audit/violations'),
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

  if (!canManageTeam) return null;

  return (
    <div className="space-y-4 pb-4">
      {/* Summary bar */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e2d8', background: '#fff' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#f0ece4', background: '#fcfbf8' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {lang === 'am' ? 'የዛሬ ሪኮርዶች' : 'Today\'s activity'}
          </span>
          <Calendar className="w-4 h-4 text-gray-400" />
        </div>
        {todayTotalsByStaff.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">
            {lang === 'am' ? 'ምንም እንቅስቃሴ አልተመዘገበም' : 'No activity recorded yet today'}
          </div>
        ) : (
          <div className="px-4 py-3 space-y-2">
            {todayTotalsByStaff.map(row => (
              <div key={row.name + row.id} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: '#f0ece4', background: '#fcfbf8' }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: '#1B4332' }}>
                    {row.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-bold text-gray-900">{row.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-gray-700">
                    {row.transactions} {lang === 'am' ? 'ሪኮርዶች' : 'records'} · {row.amount.toLocaleString()} {lang === 'am' ? 'ብር' : 'birr'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conflicts */}
      <ConflictsCard lang={lang} />

      {/* Blocked actions */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#fecaca', background: '#fff' }}>
        <button
          type="button"
          onClick={() => setShowBlocked(!showBlocked)}
          className="w-full px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: '#fecaca', background: '#fef2f2' }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-black text-red-700">
              {lang === 'am' ? 'የታገዱ ሙከራዎች' : 'Blocked Actions'}
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
                {lang === 'am' ? 'ምንም የታገደ ሙከራ የለም' : 'No blocked actions'}
              </div>
            ) : (
              filteredViolations.map(row => (
                <div key={row.id} className="rounded-xl border px-3 py-2" style={{ borderColor: '#fecaca', background: '#fff' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: '#b91c1c' }}>
                        {row.actorStaffMemberId ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name?.charAt(0) || 'S' : 'D'}
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        {row.actorStaffMemberId ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name || (lang === 'am' ? 'ሰራተኛ' : 'Staff') : (lang === 'am' ? 'ዘዴ' : 'Device')}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(row.createdAt, lang)}</span>
                  </div>
                  <div className="text-xs text-red-700 mt-1 font-semibold">
                    {lang === 'am' ? 'ጣሰ ሙከራ:' : 'Attempted:'} {row.blockedPermission || row.entityType || ''}
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
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: '#e8e2d8', background: '#fff' }}>
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {lang === 'am' ? 'ማጣሪያዎች' : 'Filters'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white" style={{ borderColor: '#e8e2d8' }}>
            <option value="all">{lang === 'am' ? 'ሁሉም ሰራተኞች' : 'All staff'}</option>
            {staffOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white" style={{ borderColor: '#e8e2d8' }}>
            <option value="today">{lang === 'am' ? 'ዛሬ' : 'Today'}</option>
            <option value="all">{lang === 'am' ? 'ሁሉም' : 'All'}</option>
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white" style={{ borderColor: '#e8e2d8' }}>
            <option value="all">{lang === 'am' ? 'ሁሉም' : 'All'}</option>
            <option value="CREATE">{lang === 'am' ? 'መውጫ' : 'Created'}</option>
            <option value="UPDATE">{lang === 'am' ? 'ማሻሻል' : 'Updated'}</option>
            <option value="DELETE">{lang === 'am' ? 'መሰረዝ' : 'Deleted'}</option>
          </select>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e2d8', background: '#fff' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#f0ece4', background: '#fcfbf8' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {lang === 'am' ? 'የቅርብ እንቅስቃሴዎች' : 'Recent activity'}
          </span>
        </div>
        {filteredActivity.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">
            {lang === 'am' ? 'ምንም እንቅስቃሴ አልተገኘም' : 'No matching activity'}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#f3f4f6' }}>
            {filteredActivity.slice(0, 100).map(row => {
              const dayLabel = relativeDayLabel(row.createdAt, lang);
              const timeStr = formatTime(row.createdAt, lang);
              const amount = entityAmount(row.entityType, row);
              const desc = entityDescription(row.entityType, row);
              const verb = ACTION_LABELS[row.action]?.[lang] || ACTION_LABELS[row.action]?.en || row.action;
              const actorName = row.actorStaffMemberId
                ? staffOptions.find(o => o.id === row.actorStaffMemberId)?.name || (lang === 'am' ? 'ሰራተኛ' : 'Staff')
                : (lang === 'am' ? 'ባለቤት' : 'Owner');

              return (
                <div key={row.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: '#1B4332' }}>
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
                      {amount.toLocaleString()} {lang === 'am' ? 'ብር' : 'birr'}
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