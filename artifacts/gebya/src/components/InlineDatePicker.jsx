// InlineDatePicker.jsx — Compact inline month+day scroll picker.
//
// Replaces the full EthiopianDatePicker modal with a simpler inline
// control that sits directly in the credit form. Month is navigated
// with arrows, days are a horizontal scroll.
//
// Props:
//   value     — Gregorian ISO string ('YYYY-MM-DD') or empty
//   onChange   — (iso) => void
//   lang      — 'am' | 'en'

import { useMemo, useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toEthiopian, toGregorian } from 'ethiopian-date';

const MONTHS_AM = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ',
];
const MONTHS_EN = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
];

function gregorianISOToEthiopianParts(iso) {
  if (!iso) {
    const d = new Date();
    const [y, m, day] = toEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { year: y, month: m, day };
  }
  const d = new Date(`${iso}T12:00:00`);
  const [y, m, day] = toEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return { year: y, month: m, day };
}

function ethiopianToGregorianISO(year, month, day) {
  try {
    const [gy, gm, gd] = toGregorian(year, month, day);
    const mm = String(gm).padStart(2, '0');
    const dd = String(gd).padStart(2, '0');
    return `${gy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function daysInEthiopianMonth(year, month) {
  if (month < 13) return 30;
  return year % 4 === 3 ? 6 : 5;
}

function InlineDatePicker({ value, onChange, lang = 'am' }) {
  const months = lang === 'am' ? MONTHS_AM : MONTHS_EN;
  const dayScrollRef = useRef(null);

  const parts = useMemo(() => gregorianISOToEthiopianParts(value), [value]);
  const [month, setMonth] = useState(parts.month);
  const [day, setDay] = useState(parts.day);
  const [year] = useState(parts.year); // Year stays fixed (current year)

  // Sync from external value changes
  useEffect(() => {
    const p = gregorianISOToEthiopianParts(value);
    setMonth(p.month);
    setDay(p.day);
  }, [value]);

  const maxDay = daysInEthiopianMonth(year, month);
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);

  const handleDaySelect = (d) => {
    setDay(d);
    const iso = ethiopianToGregorianISO(year, month, d);
    if (iso) onChange?.(iso);
  };

  const handleMonthChange = (delta) => {
    const newMonth = month + delta;
    if (newMonth < 1 || newMonth > 13) return;
    setMonth(newMonth);
    // Clamp day to new month's max
    const newMax = daysInEthiopianMonth(year, newMonth);
    if (day > newMax) {
      setDay(newMax);
      const iso = ethiopianToGregorianISO(year, newMonth, newMax);
      if (iso) onChange?.(iso);
    } else {
      const iso = ethiopianToGregorianISO(year, newMonth, day);
      if (iso) onChange?.(iso);
    }
  };

  // Scroll to selected day when month changes
  useEffect(() => {
    if (dayScrollRef.current) {
      const selectedBtn = dayScrollRef.current.querySelector('[data-selected="true"]');
      if (selectedBtn) {
        selectedBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [month, day]);

  return (
    <div style={{
      padding: '10px 12px',
      background: '#fafaf5',
      border: '1px solid #e8e2d8',
      borderRadius: 10,
    }}>
      {/* Month navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <button
          type="button"
          onClick={() => handleMonthChange(-1)}
          disabled={month <= 1}
          aria-label="Previous month"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: '#fff', border: '1px solid #e8e2d8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: month <= 1 ? 'not-allowed' : 'pointer',
            opacity: month <= 1 ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <ChevronLeft className="w-4 h-4" style={{ color: '#374151' }} />
        </button>
        <span style={{
          fontSize: '0.82rem', fontWeight: 800, color: '#1B4332',
          textAlign: 'center',
        }}>
          {months[month - 1]} {year}
        </span>
        <button
          type="button"
          onClick={() => handleMonthChange(1)}
          disabled={month >= 13}
          aria-label="Next month"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: '#fff', border: '1px solid #e8e2d8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: month >= 13 ? 'not-allowed' : 'pointer',
            opacity: month >= 13 ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <ChevronRight className="w-4 h-4" style={{ color: '#374151' }} />
        </button>
      </div>

      {/* Day horizontal scroll */}
      <div
        ref={dayScrollRef}
        style={{
          display: 'flex', gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="hide-scrollbar"
      >
        {days.map((d) => {
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              data-selected={active ? 'true' : undefined}
              onClick={() => handleDaySelect(d)}
              style={{
                minWidth: 36, height: 36, borderRadius: 8,
                background: active ? '#C4883A' : '#fff',
                color: active ? '#fff' : '#374151',
                border: `1.5px solid ${active ? '#C4883A' : '#e8e2d8'}`,
                fontSize: '0.82rem', fontWeight: active ? 800 : 600,
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .1s ease',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default InlineDatePicker;
