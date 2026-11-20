import { useLang } from '../context/LangContext';
import { fmt } from '../utils/numformat';
import { label } from '../labels/index.js';

const typeEmoji = { sale: '💰', expense: '🛒', credit: '👥' };

export default function DeleteConfirmDialog({ deleteTarget, onConfirm, onCancel }) {
  const { lang, t } = useLang();

  if (!deleteTarget) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6 animate-fade">
      <div
        className="bg-white p-6 w-full max-w-sm animate-elastic"
        style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="text-3xl text-center mb-3">{typeEmoji[deleteTarget.type]}</div>
        <h3 className="text-lg font-black text-gray-900 text-center mb-1 font-sans">{t.deleteEntry}</h3>
        <p className="text-sm text-gray-500 text-center mb-5" style={{ color: 'var(--color-text-muted)' }}>
          "{deleteTarget.item_name}" · {fmt(deleteTarget.amount || 0)} {label('common.birr', lang)}
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onConfirm(deleteTarget.id)}
            className="w-full p-4 bg-red-500 text-white font-black min-h-[52px] press-scale"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            {t.delete}
          </button>
          <button
            onClick={onCancel}
            className="w-full p-4 font-bold min-h-[52px] press-scale"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
