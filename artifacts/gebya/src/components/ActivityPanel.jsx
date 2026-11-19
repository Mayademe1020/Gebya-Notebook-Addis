/**
 * ActivityPanel — global admin action audit feed (Command Center "Activity" tab).
 * Reads GET /api/admin/logs and shows recent admin actions across all shops.
 */
import { useEffect, useState } from 'react';
import { useLang } from '../context/LangContext';
import { listAdminLogs } from '../api/admin.js';
import { label } from '../labels/index';

const TYPE_LABEL = {
  note: 'Note',
  nudge: 'Nudge',
  'reset-sms-quota': 'SMS quota reset',
  'resend-reminders': 'Resent reminders',
  broadcast: 'Broadcast',
  'push-all': 'Push blast',
  member: 'Team member',
};

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function ActivityPanel() {
  const { lang } = useLang();
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listAdminLogs({ limit: 50, offset: 0 })
      .then((data) => {
        if (!active) return;
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
      })
      .catch((e) => {
        if (!active) return;
        setError(e?.message || 'Failed to load activity');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
        {label('history.loading-activity', lang)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-sm font-black mb-1" style={{ color: 'var(--color-danger-text)' }}>
          {label('history.could-not-load-activity', lang)}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{error}</p>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-sm font-black mb-1">
          {label('history.no-admin-actions-yet', lang)}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {label('history.team-actions-across-all-shops-will-appear', lang)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold mb-1" style={{ color: 'var(--color-text-muted)' }}>
        {label('history.team-activity-admin-shop-logs', lang)}
      </p>
      <ul className="space-y-2">
        {logs.map((log) => (
          <li
            key={log.id}
            className="rounded-2xl border p-3"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-hover)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">
                {TYPE_LABEL[log.type] || log.type || 'Action'}
                {log.title ? `: ${log.title}` : ''}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
              >
                {log.status || 'ok'}
              </span>
            </div>
            {log.body ? (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{log.body}</p>
            ) : null}
            <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {log.adminPhone ? <span>👤 {log.adminPhone}</span> : null}
              {log.businessId ? <span>🏪 #{log.businessId}</span> : null}
              {log.channel ? <span>📡 {log.channel}</span> : null}
              {log.createdAt ? <span>{fmtDate(log.createdAt)}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
