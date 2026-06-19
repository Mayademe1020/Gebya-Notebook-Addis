export default function OfflineStatusStrip({
  pwa,
  pendingTelegramCount = 0,
  lang = 'en',
  onRetryTelegram,
  retryingTelegram = false,
}) {
  let tone = null;
  let label = '';
  let detail = '';
  let action = null;

  if (!pwa?.isOnline) {
    tone = 'offline';
    label = lang === 'am' ? 'ኔትወርክ የለም' : 'Offline';
    detail = lang === 'am' ? 'በዚህ ስልክ ይቀመጣል' : 'saves on this phone';
  } else if (pendingTelegramCount > 0) {
    tone = 'waiting';
    label = lang === 'am' ? 'ቴሌግራም ይጠብቃል' : 'Telegram waiting';
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
            borderRadius: 8, background: retryingTelegram ? '#bfdbfe' : '#1d4ed8',
            color: '#fff', fontSize: 11, fontWeight: 800,
            cursor: retryingTelegram ? 'wait' : 'pointer',
          }}
        >
          {retryingTelegram ? '...' : (lang === 'am' ? 'እንደገና' : 'Retry')}
        </button>
      );
    }
  } else if (pwa?.updateReady) {
    tone = 'update';
    label = lang === 'am' ? 'አዲስ ስሪት ዝግጁ ነው' : 'Update ready';
    detail = lang === 'am' ? 'ለማደስ ይጫኑ' : 'tap to refresh';
    action = (
      <button
        type="button"
        onClick={pwa.applyUpdate}
        className="press-scale"
        style={{ minHeight: 30, padding: '4px 10px', border: 'none', borderRadius: 8, background: '#1B4332', color: '#fff', fontSize: 11, fontWeight: 800 }}
      >
        {lang === 'am' ? 'አድስ' : 'Update'}
      </button>
    );
  } else if (pwa?.offlineReady) {
    tone = 'ready';
    label = lang === 'am' ? 'ከመስመር ውጭ ዝግጁ' : 'Offline ready';
    detail = lang === 'am' ? 'ያለ ኢንተርኔት ይሰራል' : 'works without internet';
  }

  if (!tone) return null;

  const styles = {
    offline: { background: '#fff7ed', border: '#fed7aa', color: '#9a3412' },
    waiting: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
    update:  { background: '#ecfdf5', border: '#bbf7d0', color: '#166534' },
    ready:   { background: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-center justify-between gap-2"
      style={{ minHeight: 36, padding: '7px 9px', borderRadius: 8, background: styles.background, border: `1px solid ${styles.border}`, color: styles.color, fontSize: 12, fontWeight: 800 }}
    >
      <span className="min-w-0 truncate">
        {label}
        {detail ? <span style={{ fontWeight: 700 }}> · {detail}</span> : null}
      </span>
      {action}
    </div>
  );
}
