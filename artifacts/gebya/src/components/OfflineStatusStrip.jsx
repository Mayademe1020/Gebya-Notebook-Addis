import { useSyncStore } from '../stores/syncStore';
import { label as tr } from '../labels/index.js';

export default function OfflineStatusStrip({
  pwa,
  pendingTelegramCount = 0,
  lang = 'en',
  onRetryTelegram,
  retryingTelegram = false,
  conflictWarning = null,
  conflictDetails = [],
  onSignIn,
  onOpenDiagnostic,
}) {
  const syncStatus = useSyncStore(s => s.status);
  const pendingCount = useSyncStore(s => s.pendingCount);
  const syncError = useSyncStore(s => s.error);
  let tone = null;
  let label = '';
  let detail = '';
  let action = null;

  if (syncStatus === 'syncing') {
    tone = 'waiting';
    label = tr('sync.syncing', lang);
  } else if (pendingCount > 0 && pwa?.isOnline) {
    tone = 'waiting';
    label = tr('sync.pending-sync', lang);
    detail = `${pendingCount} ${tr('sync.record', lang)}${pendingCount !== 1 ? 's' : ''}`;
  } else if (syncStatus === 'error') {
    tone = 'offline';
    label = tr('sync.sync-failed', lang);
    if (syncError) {
      detail = (tr('sync.error', lang)) + String(syncError).slice(0, 70);
    }
  } else if (!pwa?.isOnline) {
    tone = 'offline';
    label = tr('sync.offline', lang);
    detail = tr('sync.saves-on-this-phone', lang);
  } else if (pendingTelegramCount > 0) {
    tone = 'waiting';
    label = tr('sync.telegram-waiting', lang);
    detail = `${pendingTelegramCount}`;
    if (typeof onRetryTelegram === 'function') {
      action = (
        <button
          type="button"
          onClick={onRetryTelegram}
          disabled={retryingTelegram}
          className="press-scale"
          style={{
            minHeight: 36, minWidth: 56, padding: '6px 10px', border: 'none',
            borderRadius: 8, background: retryingTelegram ? 'var(--color-info-border)' : 'var(--color-info)',
            color: 'var(--color-bg-white)', fontSize: 11, fontWeight: 800,
            cursor: retryingTelegram ? 'wait' : 'pointer',
          }}
        >
          {retryingTelegram ? '...' : (tr('sync.retry', lang))}
        </button>
      );
    }
  } else if (pwa?.updateReady) {
    tone = 'update';
    label = tr('sync.update-ready', lang);
    detail = tr('sync.tap-to-refresh', lang);
    action = (
      <button
        type="button"
        onClick={pwa.applyUpdate}
        className="press-scale"
        style={{ minHeight: 30, padding: '4px 10px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: 'var(--color-bg-white)', fontSize: 11, fontWeight: 800 }}
      >
        {tr('sync.update', lang)}
      </button>
    );
  } else if (pwa?.offlineReady) {
    tone = 'ready';
    label = tr('sync.offline-ready', lang);
    detail = tr('sync.works-without-internet', lang);
  }

  if (conflictWarning) {
    const detailLines = (conflictDetails || []).slice(0, 3).map((d) => {
      const changes = (d.changedFields || []).slice(0, 3).map((field) => {
        const oldVal = d.localVersion?.[field];
        const newVal = d.serverVersion?.[field];
        const oldStr = oldVal == null ? '(empty)' : String(oldVal).substring(0, 30);
        const newStr = newVal == null ? '(empty)' : String(newVal).substring(0, 30);
        return `${field}: ${oldStr} → ${newStr}`;
      });
      const more = (d.changedFields || []).length > 3 ? ` +${(d.changedFields || []).length - 3} more` : '';
      return `${d.table} #${d.recordId}: ${changes.join(', ')}${more}`;
    });
    return (
      <div
        role="alert"
        className="mt-2 flex flex-col gap-1"
        style={{ minHeight: 36, padding: '7px 9px', borderRadius: 8, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning)', fontSize: 12, fontWeight: 800 }}
      >
        <span className="truncate">
          ⚠️ {tr('sync.sync-conflict', lang)} · {conflictWarning}
        </span>
        {detailLines.length > 0 && (
          <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.85 }}>
            {detailLines.join(' · ')}
            {(conflictDetails || []).length > 3 && ` +${(conflictDetails || []).length - 3} more`}
          </span>
        )}
      </div>
    );
  }

  if (!tone) return null;

  const styles = {
    offline: { background: 'var(--color-warning-bg)', border: 'var(--color-warning-border)', color: '#9a3412' },
    waiting: { background: 'var(--color-info-bg)', border: 'var(--color-info-border)', color: 'var(--color-info)' },
    update:  { background: 'var(--color-success-bg)', border: 'var(--color-success-border)', color: 'var(--color-success-text)' },
    ready:   { background: 'var(--color-success-bg)', border: 'var(--color-success-border)', color: 'var(--color-success-text)' },
  }[tone];

  const tappable = typeof onOpenDiagnostic === 'function' && Boolean(tone);
  return (
    <div
      role={tappable ? 'button' : 'status'}
      aria-live="polite"
      onClick={tappable ? onOpenDiagnostic : undefined}
      className="mt-2 flex items-center justify-between gap-2"
      style={{ minHeight: 36, padding: '7px 9px', borderRadius: 8, background: styles.background, border: `1px solid ${styles.border}`, color: styles.color, fontSize: 12, fontWeight: 800, cursor: tappable ? 'pointer' : 'default' }}
    >
      <span className="min-w-0 truncate">
        {label}
        {detail ? <span style={{ fontWeight: 700 }}> · {detail}</span> : null}
      </span>
      {action}
    </div>
  );
}
