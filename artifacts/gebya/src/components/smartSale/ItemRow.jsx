import { useRef, useState, useEffect } from 'react';
import { useLang } from '../../context/LangContext';
import { fmt, fmtInput } from '../../utils/numformat';
import MerchantMemoryAutocomplete from './MerchantMemoryAutocomplete';

const ROW_H = '26px';

export default function ItemRow({
  row,
  index,
  catalogEntries = [],
  sessionRecentIds = new Set(),
  lastSaleItems = [],
  onUpdate,
  onDelete,
  onRemember,
  onEnterLastRow,
  isLastRow = false,
  autoFocus = false,
}) {
  const { lang } = useLang();
  const itemRef = useRef(null);
  const qtyRef = useRef(null);
  const priceRef = useRef(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [swiped, setSwiped] = useState(false);

  useEffect(() => {
    if (autoFocus && itemRef.current) {
      itemRef.current.focus();
    }
  }, [autoFocus]);

  const handleItemKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showAutocomplete) return;
      qtyRef.current?.focus();
    } else if (e.key === 'Backspace' && !row.name) {
      if (isLastRow && index > 0) {
        onDelete(row.id);
      }
    }
  };

  const handleQtyKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      priceRef.current?.focus();
    }
  };

  const handlePriceKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isLastRow) {
        onEnterLastRow();
      } else {
        const nextRow = document.querySelector(`[data-row-id="${row.id}"] + [data-row-id] input[data-field="item"]`);
        if (nextRow) nextRow.focus();
      }
    }
  };

  const handleSelect = (entry) => {
    onUpdate(row.id, 'name', entry.name);
    onUpdate(row.id, 'code', entry.code || '');
    onUpdate(row.id, 'catalogEntryId', entry.id);
    onUpdate(row.id, 'itemKind', entry.kind || 'item');
    setShowAutocomplete(false);
    qtyRef.current?.focus();
    qtyRef.current?.select();
  };

  const handleRemember = (name) => {
    onRemember(name);
    onUpdate(row.id, 'name', name);
    setShowAutocomplete(false);
    qtyRef.current?.focus();
    qtyRef.current?.select();
  };

  const handleQtyFocus = () => {
    qtyRef.current?.select();
  };

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.touches[0].clientX;
    if (diff > 60) setSwiped(true);
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
    if (!swiped) return;
    setTimeout(() => setSwiped(false), 3000);
  };

  const handleConfirmDelete = () => {
    onDelete(row.id);
    setSwiped(false);
  };

  const lastPrice = row.catalogEntryId
    ? catalogEntries.find(e => e.id === row.catalogEntryId)?.last_price
    : null;

  const handleLastPriceTap = () => {
    if (lastPrice > 0) {
      onUpdate(row.id, 'price', String(lastPrice));
    }
  };

  return (
    <div
      data-row-id={row.id}
      className="relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-y-0 right-0 flex items-center"
        style={{ width: '80px', background: '#dc2626' }}
      >
        <button
          type="button"
          onClick={handleConfirmDelete}
          className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
          style={{ minHeight: '44px' }}
        >
          {lang === 'am' ? 'ሰርዝ' : 'Delete'}
        </button>
      </div>

      <div
        className="flex gap-1 items-center relative"
        style={{
          minHeight: ROW_H,
          transform: swiped ? 'translateX(-80px)' : 'translateX(0)',
          transition: swiped ? 'transform 0.2s ease' : 'none',
          background: '#fff',
          borderBottom: '1px solid #edeae5',
          padding: '0',
        }}
      >
        <div className="relative" style={{ flex: '5 1 0%', minWidth: 0 }}>
          <input
            ref={itemRef}
            type="text"
            data-field="item"
            value={row.name}
            onChange={(e) => {
              onUpdate(row.id, 'name', e.target.value);
              setShowAutocomplete(e.target.value.trim().length > 0);
            }}
            onKeyDown={handleItemKeyDown}
            onFocus={() => { if (row.name.trim()) setShowAutocomplete(true); }}
            onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
            placeholder={lang === 'am' ? 'ንጥል...' : 'Item...'}
            className="w-full px-1 text-[13px] font-medium bg-transparent focus:outline-none"
            style={{ minHeight: ROW_H, border: 'none' }}
            autoComplete="off"
          />
          {showAutocomplete && (
            <div className="absolute left-0 right-0 top-full z-20">
              <MerchantMemoryAutocomplete
                query={row.name}
                catalogEntries={catalogEntries}
                sessionRecentIds={sessionRecentIds}
                lastSaleItems={lastSaleItems}
                onSelect={handleSelect}
                onRemember={handleRemember}
              />
            </div>
          )}
        </div>

        <div style={{ width: '40px', flexShrink: 0 }}>
          <input
            ref={qtyRef}
            type="text"
            inputMode="numeric"
            data-field="qty"
            value={row.qty}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, '');
              onUpdate(row.id, 'qty', v || '1');
            }}
            onFocus={handleQtyFocus}
            onKeyDown={handleQtyKeyDown}
            className="w-full px-0.5 text-xs text-center font-bold bg-transparent focus:outline-none"
            style={{ minHeight: ROW_H, border: 'none' }}
          />
        </div>

        <div style={{ width: '64px', flexShrink: 0 }}>
          <input
            ref={priceRef}
            type="text"
            inputMode="decimal"
            data-field="price"
            value={fmtInput(row.price)}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
              onUpdate(row.id, 'price', raw);
            }}
            onKeyDown={handlePriceKeyDown}
            placeholder="0"
            className="w-full px-0.5 text-xs text-right font-bold bg-transparent focus:outline-none"
            style={{ minHeight: ROW_H, border: 'none' }}
          />
        </div>

        <div
          className="flex items-center justify-end text-[13px] font-black flex-shrink-0"
          style={{ width: '58px', color: row.lineTotal > 0 ? '#14532d' : '#d1d5db' }}
        >
          {row.lineTotal > 0 ? fmt(row.lineTotal) : '—'}
        </div>
      </div>

      {lastPrice > 0 && (
        <div className="flex justify-end pr-1 leading-none" style={{ marginTop: '0', marginBottom: '0', height: '12px' }}>
          <span
            onClick={handleLastPriceTap}
            className="text-[9px] cursor-pointer"
            style={{ color: '#c4b9a8' }}
          >
            {fmt(lastPrice)}
          </span>
        </div>
      )}
    </div>
  );
}
