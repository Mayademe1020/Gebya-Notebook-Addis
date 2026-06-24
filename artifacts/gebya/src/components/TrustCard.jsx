export default function TrustCard({ totalEntries, todayCount, lastSavedSnapshot, onStartSale, t }) {
  const savedLabel = lastSavedSnapshot?.label || '';
  const savedAt = lastSavedSnapshot?.created_at
    ? new Date(lastSavedSnapshot.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      className="overflow-hidden animate-elastic"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl" style={{ background: 'rgba(27,67,50,0.08)' }}>
            💾
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-sm font-sans">
              {t.trustCardTitle || 'Your notebook stays on this phone'}
            </p>
            <p className="text-sm mt-1 font-sans" style={{ color: 'var(--color-text-muted)' }}>
              {t.trustCardBody || 'Save your sales, close the app, and open again later. Your records stay here on this phone.'}
            </p>
            {totalEntries > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-2.5 py-1 text-xs font-black" style={{ background: 'rgba(27,67,50,0.08)', color: '#1B4332', borderRadius: '999px' }}>
                  {todayCount} {t.trustTodayCount || 'saved today'}
                </span>
                {savedAt && (
                  <span className="px-2.5 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)', borderRadius: '999px' }}>
                    {t.trustLastSaved || 'Last saved'} {savedAt}
                  </span>
                )}
              </div>
            )}
            {savedLabel && (
              <p className="text-xs mt-2 font-semibold truncate font-sans" style={{ color: '#C4883A' }}>
                {savedLabel}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'var(--color-surface-soft)', borderTop: '1px solid var(--color-border-light)' }}>
        <p className="text-xs font-medium font-sans" style={{ color: 'var(--color-text-muted)' }}>
          {t.trustReopenHint || 'Close and reopen anytime — your records stay here.'}
        </p>
        {totalEntries === 0 && (
          <button
            onClick={onStartSale}
            className="flex-shrink-0 px-3 py-2 text-xs font-black text-white min-h-[40px] press-scale"
            style={{ background: '#1B4332', borderRadius: 'var(--radius-sm)' }}
          >
            {t.trustCardAction || 'Record your first sale'}
          </button>
        )}
      </div>
    </div>
  );
}
