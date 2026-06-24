import { useState, useEffect, useCallback, useMemo } from 'react';
import db from '../db';

/**
 * useCatalog hook — manages the shop's catalog of saved items/services.
 * Keeps state in sync with IndexedDB.
 */

export function useCatalog() {
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await db.catalog_entries?.toArray?.() || [];
        if (!cancelled) setCatalogEntries(rows);
      } catch (err) {
        if (import.meta.env.DEV) console.error('useCatalog load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveCatalogEntry = useCallback(async (payload) => {
    const now = Date.now();
    const entry = {
      name: String(payload.name || '').trim(),
      kind: payload.kind === 'service' ? 'service' : 'item',
      default_price: payload.default_price != null && payload.default_price !== '' ? Number(payload.default_price) : null,
      default_cost: payload.default_cost != null && payload.default_cost !== '' ? Number(payload.default_cost) : null,
      note: payload.note ? String(payload.note).trim() : null,
      active: payload.active !== false,
      created_at: payload.created_at || now,
      updated_at: now,
    };

    if (!entry.name) return null;

    if (payload.id) {
      await db.catalog_entries.update(payload.id, entry);
      const saved = await db.catalog_entries.get(payload.id);
      setCatalogEntries(prev => prev.map(item => item.id === payload.id ? saved : item));
      return saved;
    }

    const id = await db.catalog_entries.add(entry);
    const saved = await db.catalog_entries.get(id);
    setCatalogEntries(prev => [...prev, saved]);
    return saved;
  }, []);

  const toggleCatalogEntryActive = useCallback(async (entry) => {
    if (!entry?.id) return;
    const updatedAt = Date.now();
    await db.catalog_entries.update(entry.id, { active: entry.active === false, updated_at: updatedAt });
    setCatalogEntries(prev => prev.map(item => (
      item.id === entry.id ? { ...item, active: item.active === false, updated_at: updatedAt } : item
    )));
  }, []);

  const activeCatalogEntries = useMemo(
    () => catalogEntries
      .filter(entry => entry.active !== false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [catalogEntries]
  );

  return {
    catalogEntries,
    setCatalogEntries,
    activeCatalogEntries,
    loading,
    saveCatalogEntry,
    toggleCatalogEntryActive,
  };
}
