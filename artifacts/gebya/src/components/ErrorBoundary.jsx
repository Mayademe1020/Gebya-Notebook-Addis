import { Component } from 'react';

// Patterns that indicate a chunk-hash mismatch after a deploy
// (browser cached the old index.html / index.js, new chunks don't exist).
// When we see this, auto-reload ONCE to get a fresh manifest.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk \w+ failed/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

function isChunkLoadError(error) {
  const msg = String(error?.message || '');
  return CHUNK_ERROR_PATTERNS.some((rx) => rx.test(msg));
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, autoReloading: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Always log — production visibility is essential to diagnose real reports.
    // eslint-disable-next-line no-console
    console.error('[Gebya] ErrorBoundary caught:', error?.message, error?.stack, info?.componentStack);
    this.setState({ info });

    // Auto-recover from post-deploy chunk-hash mismatch. Reload ONCE per
    // session so we don't loop if the root cause is something else.
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const KEY = 'gebya_chunk_reload_attempted';
      try {
        const already = window.sessionStorage.getItem(KEY);
        if (!already) {
          window.sessionStorage.setItem(KEY, String(Date.now()));
          this.setState({ autoReloading: true });
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      } catch {
        // sessionStorage can throw in private mode — just skip auto-reload
      }
    }
  }

  handleReload() {
    // Clear the auto-reload sentinel so a manual reload always works
    try { window.sessionStorage.removeItem('gebya_chunk_reload_attempted'); } catch {}
    window.location.reload();
  }

  handleCopy() {
    const { error, info } = this.state;
    const text = [
      `Error: ${error?.message || 'unknown'}`,
      `Stack: ${error?.stack || ''}`,
      `Component: ${info?.componentStack || ''}`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    ].join('\n\n');
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      }
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // ─── Auto-recovery UI · post-deploy chunk reload in progress ────────
    if (this.state.autoReloading) {
      return (
        <div
          style={{
            minHeight: '100svh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FAF8F5',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              width: 48, height: 48,
              border: '4px solid #ece6d6',
              borderTopColor: '#1B4332',
              borderRadius: '50%',
              animation: 'gebya-spin 0.9s linear infinite',
              marginBottom: 18,
            }}
          />
          <h1
            style={{
              fontSize: '1.05rem', fontWeight: 800,
              color: '#1B4332', marginBottom: 6,
              textAlign: 'center',
            }}
          >
            Updating to the latest version…
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', maxWidth: 320 }}>
            One moment — refreshing to load the newest code.
          </p>
          <style>{`@keyframes gebya-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // ─── Normal error UI ────────────────────────────────────────────────
    const errMsg = this.state.error?.message || 'Unknown error';
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fdf8f0',
          padding: '24px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>!</div>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 900,
            color: '#7c3d12',
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#9ca3af',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          A problem occurred. Tap reload to continue.
        </p>
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            padding: '12px',
            background: '#fff',
            border: '1px solid #f5c993',
            borderRadius: '8px',
            fontSize: '0.75rem',
            color: '#7c3d12',
            fontFamily: 'monospace',
            wordBreak: 'break-word',
            marginBottom: '16px',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          {errMsg}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => this.handleReload()}
            style={{
              background: '#7c3d12',
              color: '#fff',
              border: 'none',
              borderRadius: '16px',
              padding: '14px 24px',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            Reload
          </button>
          <button
            onClick={() => this.handleCopy()}
            style={{
              background: '#fff',
              color: '#7c3d12',
              border: '1px solid #7c3d12',
              borderRadius: '16px',
              padding: '14px 24px',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            Copy error
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
