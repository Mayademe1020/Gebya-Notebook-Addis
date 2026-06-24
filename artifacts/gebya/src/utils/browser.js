/**
 * Browser environment utilities.
 */

export function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}
