/**
 * CrossShopCurationQueue — admin-only view for managing frequent unmatched items
 * across shops. Shows items that haven't been matched to a canonical catalog entry.
 */
import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { db } from '../db';
import { label } from '../labels/index.js';

export default function CrossShopCurationQueue() {
  const { lang } = useLang();
  const [unmatched, setUnmatched] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUnmatched();
  }, []);

  async function loadUnmatched() {
    try {
      const items = await db.cross_shop_unmatched
        .where('curated').equals(0)
        .reverse()
        .sortBy('occurrence_count');
      setUnmatched(items);
    } catch {
      setUnmatched([]);
    }
    setLoading(false);
  }

  async function handleCurate(id, canonicalName) {
    try {
      await db.cross_shop_unmatched.update(id, {
        curated: 1,
        canonical_name_en: canonicalName,
      });
      setUnmatched((prev) => prev.filter((item) => item.id !== id));
    } catch {}
  }

  async function handleDismiss(id) {
    try {
      await db.cross_shop_unmatched.update(id, { curated: -1 });
      setUnmatched((prev) => prev.filter((item) => item.id !== id));
    } catch {}
  }

  if (loading) return <div className="p-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {label('admin.unmatched-items-queue', lang)}
      </p>
      {unmatched.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
          {label('admin.no-unmatched-items', lang)}
        </p>
      ) : (
        <div className="space-y-2">
          {unmatched.map((item) => (
            <div
              key={item.id}
              className="border p-3 flex items-center justify-between gap-2"
              style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text)' }}>
                  {item.item_name}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  Seen {item.occurrence_count}x | {item.canonical_name_am || 'No Amharic name'}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => handleCurate(item.id, item.item_name)}
                  className="text-[10px] px-2 py-1 font-bold border"
                  style={{ borderColor: 'var(--color-text-soft)', borderRadius: 4, background: 'var(--color-bg-active)' }}
                >
                  {label('admin.approve', lang)}
                </button>
                <button
                  onClick={() => handleDismiss(item.id)}
                  className="text-[10px] px-2 py-1 font-bold border"
                  style={{ borderColor: 'var(--color-danger-border)', borderRadius: 4, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                >
                  {label('admin.dismiss', lang)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
