// utils/todaySummary.js
// Math helpers for the Today screen summary section.

/**
 * Compute trend percent (today vs yesterday).
 * Returns null when yesterday has no signal (zero or missing).
 */
export function getTrendPercent(todayNet, yesterdayNet) {
  if (yesterdayNet === 0 || yesterdayNet === null || yesterdayNet === undefined) return null;
  return ((todayNet - yesterdayNet) / Math.abs(yesterdayNet)) * 100;
}

/**
 * Format a trend percent into display parts.
 * Returns { arrow, color, sign, percent } or null.
 */
export function formatTrend(percent) {
  if (percent === null || percent === undefined) return null;
  const isUp = percent >= 0;
  return {
    arrow: isUp ? '▲' : '▼',
    color: isUp ? '#16a34a' : '#dc2626',
    sign: isUp ? '+' : '−',
    percent: Math.abs(Math.round(percent)),
  };
}

/**
 * Auto-scale font size for the hero net number so 1-9 digits all fit on one line.
 * Returns { size, lineHeight } as CSS values.
 */
export function heroFontSize(amount) {
  const digits = Math.abs(Math.round(amount || 0)).toString().length;
  if (digits <= 4) return { size: '3rem',    lineHeight: '1' };   // up to    9,999
  if (digits <= 6) return { size: '2.5rem',  lineHeight: '1' };   // up to  999,999
  if (digits <= 8) return { size: '2rem',    lineHeight: '1' };   // up to 99,999,999
  return                  { size: '1.625rem', lineHeight: '1' };  // up to 999,999,999
}
