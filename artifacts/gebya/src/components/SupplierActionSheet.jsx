import { Store, Wallet, X } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';

function getSupplierName(s) {
  return s.display_name || s.displayName || '';
}

function getSupplierBalance(s) {
  return Number(s.balance ?? 0);
}

function SupplierActionSheet({ supplier, onAddDubie, onRecordPayment, onDone }) {
  const { t } = useLang();
  if (!supplier) return null;

  const balance = getSupplierBalance(supplier);
  const hasBalance = balance > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 animate-fade" onClick={(e) => { if (e.target === e.currentTarget) onDone?.(); }}>
      <div className="bg-white w-full max-w-md animate-slide-up" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">{getSupplierName(supplier)}</p>
              {hasBalance && (
                <p className="text-xs mt-0.5" style={{ color: '#92400e' }}>{fmt(balance)} {t.birr || 'birr'} {t.toPay || 'to pay'}</p>
              )}
            </div>
            <button type="button" onClick={onDone} aria-label={t.close || 'Close'} className="p-1.5 press-scale">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
        <div className="px-5 py-3 space-y-1">
          <button type="button" onClick={() => { onAddDubie?.(supplier); onDone?.(); }} className="w-full py-3 text-sm font-bold text-left px-3 min-h-[48px] press-scale flex items-center gap-3" style={{ borderRadius: 'var(--radius-sm)', color: '#374151' }}>
            <Store className="w-4 h-4" style={{ color: '#C4883A' }} />
            {t.addAmountOwed || 'Add amount owed'}
          </button>
          {hasBalance && (
            <button type="button" onClick={() => { onRecordPayment?.(supplier); onDone?.(); }} className="w-full py-3 text-sm font-bold text-left px-3 min-h-[48px] press-scale flex items-center gap-3" style={{ borderRadius: 'var(--radius-sm)', color: '#2d6a4f' }}>
              <Wallet className="w-4 h-4" />
              {t.recordPayment || 'Record payment'}
            </button>
          )}
          <button type="button" onClick={onDone} className="w-full py-3 text-sm text-center min-h-[44px] press-scale" style={{ color: '#9ca3af' }}>
            {t.cancel || 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SupplierActionSheet;
