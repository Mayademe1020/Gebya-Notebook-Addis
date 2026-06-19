export function PanelFallback({ label }) {
  return (
    <div
      className="rounded-2xl border px-4 py-8 text-center text-sm font-semibold"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
    >
      {label}
    </div>
  );
}

export function ModalFallback({ label }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
      <div
        className="w-full max-w-sm rounded-3xl px-6 py-8 text-center text-sm font-semibold"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', boxShadow: 'var(--shadow-lg)' }}
      >
        {label}
      </div>
    </div>
  );
}
