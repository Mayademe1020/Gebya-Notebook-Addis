import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import { fmt, parseInput } from '../../utils/numformat';
import { fireToast } from '../Toast';

export default function CatalogPanel({ catalogEntries, onSaveCatalogEntry, onToggleCatalogEntryActive }) {
  const { lang, t } = useLang();

  const [catalogForm, setCatalogForm] = useState({
    id: null,
    name: '',
    kind: 'item',
    default_price: '',
    default_cost: '',
    note: '',
  });

  const resetCatalogForm = () => {
    setCatalogForm({
      id: null,
      name: '',
      kind: 'item',
      default_price: '',
      default_cost: '',
      note: '',
    });
  };

  const handleCatalogSubmit = async () => {
    const saved = await onSaveCatalogEntry?.({
      id: catalogForm.id,
      name: catalogForm.name,
      kind: catalogForm.kind,
      default_price: parseInput(catalogForm.default_price),
      default_cost: parseInput(catalogForm.default_cost),
      note: catalogForm.note,
      active: true,
    });
    if (!saved) return;
    fireToast(catalogForm.id ? 'Catalog updated' : 'Saved to items & services', 1800);
    resetCatalogForm();
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      <div className="px-5 pt-5 pb-4 space-y-3">
        <p className="text-xs" style={{ color: '#6b7280' }}>
          {lang === 'am'
            ? 'በተደጋጋሚ የሚሸጡትን ዕቃዎች ከነ ዋጋቸው ያስቀምጡ — ሽያጭ ሲመዘግቡ በፍጥነት ይመጣሉ።'
            : 'Save items you sell often with their prices — they autofill when you record a sale.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {['item', 'service'].map(kind => (
            <button
              key={kind}
              type="button"
              onClick={() => setCatalogForm(prev => ({ ...prev, kind }))}
              className="py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[44px]"
              style={{
                borderColor: catalogForm.kind === kind ? '#1B4332' : '#e8e2d8',
                background: catalogForm.kind === kind ? 'rgba(27,67,50,0.07)' : '#fff',
                color: catalogForm.kind === kind ? '#1B4332' : '#6b7280',
              }}
            >
              {kind === 'item'
                ? (lang === 'am' ? '📦 ዕቃ' : '📦 Item')
                : (lang === 'am' ? '🛠 አገልግሎት' : '🛠 Service')}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={catalogForm.name}
          onChange={e => setCatalogForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder={lang === 'am' ? 'ስም · ለምሳሌ ስኳር' : 'Name · e.g. Sugar'}
          className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
          style={{ borderColor: catalogForm.name.trim() ? '#C4883A' : '#e8e2d8' }}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
              {lang === 'am' ? 'የሽያጭ ዋጋ' : 'Sale price'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={catalogForm.default_price}
              onChange={e => setCatalogForm(prev => ({ ...prev, default_price: e.target.value.replace(/[^\d.,]/g, '') }))}
              placeholder={lang === 'am' ? 'ብር' : 'birr'}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
              style={{ borderColor: '#e8e2d8' }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
              {lang === 'am' ? 'መግዣ ዋጋ (አማራጭ)' : 'Cost (optional)'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={catalogForm.default_cost}
              onChange={e => setCatalogForm(prev => ({ ...prev, default_cost: e.target.value.replace(/[^\d.,]/g, '') }))}
              placeholder={lang === 'am' ? 'ለትርፍ ስሌት' : 'for profit'}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
              style={{ borderColor: '#e8e2d8' }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {catalogForm.id && (
            <button
              type="button"
              onClick={resetCatalogForm}
              className="px-4 py-3 rounded-xl text-sm font-bold min-h-[44px]"
              style={{ background: '#f5f5f5', color: '#6b7280' }}
            >
              {lang === 'am' ? 'ይቅር' : 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCatalogSubmit}
            disabled={!catalogForm.name.trim()}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[44px] disabled:opacity-40"
            style={{ background: '#1B4332' }}
          >
            {catalogForm.id
              ? (lang === 'am' ? 'አስተካክል' : 'Update')
              : (lang === 'am' ? '＋ አስቀምጥ' : '＋ Save')}
          </button>
        </div>

        <div className="space-y-2 pt-2">
          {(catalogEntries || []).length === 0 && (
            <p className="text-xs text-gray-400">
              {lang === 'am' ? 'ገና ምንም ዕቃ አልተቀመጠም።' : 'No saved items yet.'}
            </p>
          )}
          {(catalogEntries || []).map(entry => (
            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 text-sm">{entry.name}</p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: entry.kind === 'service' ? '#dbeafe' : '#dcfce7', color: entry.kind === 'service' ? '#1d4ed8' : '#166534' }}>
                    {entry.kind === 'service'
                      ? (lang === 'am' ? 'አገልግሎት' : 'Service')
                      : (lang === 'am' ? 'ዕቃ' : 'Item')}
                  </span>
                  {entry.active === false && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                      {lang === 'am' ? 'ተደብቋል' : 'Archived'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {lang === 'am' ? 'ሽያጭ' : 'Sale'} {entry.default_price != null ? fmt(entry.default_price) : '-'}
                  {' · '}
                  {lang === 'am' ? 'መግዣ' : 'Cost'} {entry.default_cost != null ? fmt(entry.default_cost) : '-'}
                </p>
                {entry.note && <p className="text-xs text-gray-400 mt-1">{entry.note}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogForm({
                    id: entry.id,
                    name: entry.name || '',
                    kind: entry.kind || 'item',
                    default_price: entry.default_price != null ? String(entry.default_price) : '',
                    default_cost: entry.default_cost != null ? String(entry.default_cost) : '',
                    note: entry.note || '',
                  })}
                  className="px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: '#fff', color: '#1B4332', border: '1px solid #e8e2d8' }}
                >
                  {lang === 'am' ? 'አስተካክል' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCatalogEntryActive?.(entry)}
                  className="px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: entry.active === false ? '#dcfce7' : '#f3f4f6', color: entry.active === false ? '#166534' : '#6b7280' }}
                >
                  {entry.active === false
                    ? (lang === 'am' ? 'መልስ' : 'Restore')
                    : (lang === 'am' ? 'ደብቅ' : 'Archive')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
