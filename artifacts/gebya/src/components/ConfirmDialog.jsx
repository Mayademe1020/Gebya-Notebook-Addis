import { AlertTriangle } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { label } from '../labels/index.js';

/**
 * ConfirmDialog — reusable confirmation modal matching the app's design.
 * Controlled via props: open, title, message, confirmLabel, cancelLabel,
 * tone ('danger' | 'default'), onConfirm, onCancel.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const { lang } = useLang();
  if (!open) return null;

  const confirmBg = tone === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)';

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-[120] animate-fade"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div
        className="bg-white w-full max-w-md pb-safe animate-slide-up"
        style={{ borderRadius: '24px 24px 0 0', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex flex-col items-center px-5 pt-5 pb-4 text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
            style={{ background: tone === 'danger' ? 'var(--color-danger-bg)' : 'var(--color-success-bg)' }}
          >
            <AlertTriangle className="w-6 h-6" style={{ color: confirmBg }} />
          </div>
          {title && (
            <h2 className="text-base font-black text-gray-900 mb-1">{title}</h2>
          )}
          {message && (
            <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-bold min-h-[48px] press-scale"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {cancelLabel || (label('common.cancel', lang))}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[48px] press-scale"
            style={{ background: confirmBg }}
          >
            {confirmLabel || (label('common.confirm-2', lang))}
          </button>
        </div>
      </div>
    </div>
  );
}
