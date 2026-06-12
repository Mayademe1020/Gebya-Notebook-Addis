// phoneNumber.js — Ethiopian phone number standardization (Commit C.3)
//
// Single source of truth for parsing, validating, and formatting Ethiopian
// phone numbers across the app (CustomerForm, SupplierForm, SettingsPage).
//
// Format rules:
//   - Country code: +251 (Ethiopia)
//   - Subscriber number: 9 digits
//   - Mobile prefix: 9 (Ethio Telecom mobile) or 7 (Safaricom mobile)
//   - Common formats users type: 0911XXXXXX, +251911XXXXXX, 251911XXXXXX,
//     911XXXXXX, +2519... etc. — we normalize them all.
//
// Storage: always normalized to E.164: "+251911XXXXXX" (12 chars total).
// Display: optionally formatted as "+251 911 XXX XXX" for readability.

/**
 * Strips all non-digit characters from input.
 */
function stripDigits(input) {
  if (input == null) return '';
  return String(input).replace(/\D/g, '');
}

/**
 * Extract just the 9-digit subscriber portion (after +251 / 251 / 0) from any
 * input. Returns up to 9 digits — does NOT validate the prefix.
 *
 * Examples:
 *   "0911234567"   → "911234567"
 *   "+251911234567" → "911234567"
 *   "251911234567"  → "911234567"
 *   "911234567"    → "911234567"
 *   "911-234-567"  → "911234567"
 *   "9112"         → "9112"       (partial)
 */
export function extractSubscriberDigits(input) {
  let digits = stripDigits(input);
  // Strip the country code variants
  if (digits.startsWith('251') && digits.length > 9) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length > 9) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 9);
}

/**
 * Validate an Ethiopian subscriber number (9 digits, starts with 9 or 7).
 * Pass the 9-digit subscriber portion (no +251 / no leading 0).
 *
 * Returns true if valid, false otherwise. Empty/null is INVALID.
 */
export function isValidSubscriber(subscriber) {
  return /^[79]\d{8}$/.test(subscriber || '');
}

/**
 * Validate a full phone number in any input format. Empty/null → INVALID.
 */
export function isValidEthiopianPhone(input) {
  return isValidSubscriber(extractSubscriberDigits(input));
}

/**
 * Normalize any input to E.164 format: "+251911234567".
 *
 * Returns null if the input doesn't have enough digits to form a valid number.
 * Returns the normalized string (with +251 prefix) on success.
 *
 * Use this before saving phone numbers to the database. Use it on reminder
 * URLs (tel: links), so all downstream consumers see one shape.
 *
 * Examples:
 *   "0911234567"   → "+251911234567"
 *   "+251911234567" → "+251911234567"
 *   "911234567"    → "+251911234567"
 *   "abc"          → null
 *   "" / null      → null
 */
export function normalizeEthiopianPhone(input) {
  const sub = extractSubscriberDigits(input);
  if (!isValidSubscriber(sub)) return null;
  return `+251${sub}`;
}

/**
 * Format a stored phone number for display. Accepts E.164 or raw input.
 *
 *   "+251911234567" → "+251 911 234 567"
 *   "0911234567"    → "+251 911 234 567"
 *   invalid         → returns input as-is (so we don't lose user data)
 */
export function formatEthiopianPhone(input) {
  const sub = extractSubscriberDigits(input);
  if (!isValidSubscriber(sub)) {
    return String(input || '');
  }
  return `+251 ${sub.slice(0, 3)} ${sub.slice(3, 6)} ${sub.slice(6)}`;
}

/**
 * Build the dial-ready tel: URL.
 *   "+251911234567" → "tel:+251911234567"
 *   invalid         → null
 */
export function toTelUrl(input) {
  const normalized = normalizeEthiopianPhone(input);
  return normalized ? `tel:${normalized}` : null;
}
