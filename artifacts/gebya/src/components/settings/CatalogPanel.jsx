import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import { fmt, parseInput } from '../../utils/numformat';
import { fireToast } from '../Toast';
import { label } from '../../labels/index';

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
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {label('settings-shop.save-items-you-sell-often-with-their-prices', lang)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {['item', 'service'].map(kind => (
            <button
              key={kind}
              type="button"
              onClick={() => setCatalogForm(prev => ({ ...prev, kind }))}
              className="py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[44px]"
              style={{
                borderColor: catalogForm.kind === kind ? 'var(--color-primary)' : 'var(--color-border)',
                background: catalogForm.kind === kind ? 'rgba(27,67,50,0.07)' : 'var(--color-bg-white)',
                color: catalogForm.kind === kind ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              {kind === 'item'
                ? (label('settings-shop.item', lang))
                : (label('settings-shop.service', lang))}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={catalogForm.name}
          onChange={e => setCatalogForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder={label('settings-shop.name-e-g-sugar', lang)}
          className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
          style={{ borderColor: catalogForm.name.trim() ? 'var(--color-accent-amber)' : 'var(--color-border)' }}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {label('settings-shop.sale-price', lang)}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={catalogForm.default_price}
              onChange={e => setCatalogForm(prev => ({ ...prev, default_price: e.target.value.replace(/[^\d.,]/g, '') }))}
              placeholder={label('settings-shop.birr', lang)}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {label('settings-shop.cost-optional', lang)}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={catalogForm.default_cost}
              onChange={e => setCatalogForm(prev => ({ ...prev, default_cost: e.target.value.replace(/[^\d.,]/g, '') }))}
              placeholder={label('settings-shop.for-profit', lang)}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
              style={{ borderColor: 'var(--color-border)' }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {catalogForm.id && (
            <button
              type="button"
              onClick={resetCatalogForm}
              className="px-4 py-3 rounded-xl text-sm font-bold min-h-[44px]"
              style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
            >
              {label('settings-shop.cancel', lang)}
            </button>
          )}
          <button
            type="button"
            onClick={handleCatalogSubmit}
            disabled={!catalogForm.name.trim()}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[44px] disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {catalogForm.id
              ? (label('settings-shop.update', lang))
              : (label('settings-shop.save', lang))}
          </button>
        </div>

        <div className="space-y-2 pt-2">
          {(catalogEntries || []).length === 0 && (
            <p className="text-xs text-gray-400">
              {label('settings-shop.no-saved-items-yet', lang)}
            </p>
          )}
          {(catalogEntries || []).map(entry => (
            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface-muted)', border: '1.5px solid var(--color-border)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 text-sm">{entry.name}</p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: entry.kind === 'service' ? 'var(--color-info-bg)' : 'var(--color-success-bg)', color: entry.kind === 'service' ? 'var(--color-info)' : 'var(--color-success-text)' }}>
                    {entry.kind === 'service'
                      ? (label('settings-shop.service-2', lang))
                      : (label('settings-shop.item-2', lang))}
                  </span>
                  {entry.active === false && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                      {label('settings-shop.archived', lang)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {label('settings-shop.sale', lang)} {entry.default_price != null ? fmt(entry.default_price) : '-'}
                  {' · '}
                  {label('settings-shop.cost', lang)} {entry.default_cost != null ? fmt(entry.default_cost) : '-'}
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
                  style={{ background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
                >
                  {label('settings-shop.edit', lang)}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCatalogEntryActive?.(entry)}
                  className="px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: entry.active === false ? 'var(--color-success-bg)' : 'var(--color-bg-hover)', color: entry.active === false ? 'var(--color-success-text)' : 'var(--color-text-muted)' }}
                >
                  {entry.active === false
                    ? (label('settings-shop.restore', lang))
                    : (label('settings-shop.archive', lang))}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
