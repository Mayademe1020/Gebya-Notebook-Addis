// utils/reminders.js — Reminder message + channel utilities for the credit flow.
//
// Channels (auto-discovered from customer record):
//   - telegram (if telegram_username or telegram_chat_id) → opens t.me/<username>
//   - whatsapp (if phone_number) → opens wa.me/<phone>?text=... (native pre-fill)
//   - sms      (if phone_number) → opens sms:<phone>?body=...
//   - tel      (if phone_number) → opens tel:<phone> (no text, fall-back call)
//
// Telegram t.me URLs don't natively pre-fill chat text — we copy the message
// to clipboard before opening so the user can paste.
//
// Templates use {name} {shop} {amount} variable substitution.

export const REMINDER_TEMPLATES = {
  gentle: {
    am: 'ሰላም {name}፣ ለ{shop} {amount} ብር ዱቤ አለዎት። ሲቻልዎ ያስታውሱ። እናመሰግናለን።',
    en: 'Hi {name}, you have {amount} birr open at {shop}. Please remember when you can. Thanks.',
    label: { am: 'ቀላል', en: 'Gentle' },
    emoji: '🙂',
  },
  firm: {
    am: 'ሰላም {name}፣ ለ{shop} {amount} ብር ዱቤ ይከፍሉ። እባክዎ በቅርብ ይምጡ።',
    en: 'Hi {name}, your balance of {amount} birr at {shop} is past due. Please come by soon.',
    label: { am: 'ቀጥተኛ', en: 'Firm' },
    emoji: '⏰',
  },
  final: {
    am: 'ሰላም {name}፣ የ{amount} ብር ዱቤ ለ{shop} አልተከፈለም። እባክዎ ዛሬ ያስተናግዱ።',
    en: 'Hi {name}, your {amount} birr balance at {shop} is overdue. Please settle today.',
    label: { am: 'ለመጨረሻ ጊዜ', en: 'Final notice' },
    emoji: '❗',
  },
};

export const CHANNEL_INFO = {
  telegram: { label: { am: 'ቴሌግራም', en: 'Telegram' }, emoji: '💬' },
  whatsapp: { label: { am: 'ዋትስአፕ', en: 'WhatsApp' }, emoji: '🟢' },
  sms:      { label: { am: 'SMS',     en: 'SMS' },      emoji: '✉️' },
  tel:      { label: { am: 'ጥሪ',     en: 'Call' },     emoji: '📞' },
};

function formatNumber(n) {
  const num = Number(n) || 0;
  // Match the app's fmt() pattern — comma thousands, no decimals when whole
  return Math.round(num).toLocaleString('en-US');
}

export function buildReminderMessage({ template, lang, customer, shopName }) {
  const tpl = REMINDER_TEMPLATES[template] || REMINDER_TEMPLATES.gentle;
  const text = tpl[lang === 'am' ? 'am' : 'en'];
  return text
    .replace('{name}', customer.display_name || 'customer')
    .replace('{shop}', shopName || 'the shop')
    .replace('{amount}', formatNumber(customer.balance));
}

export function getAvailableChannels(customer) {
  const channels = [];
  if (customer?.telegram_username || customer?.telegram_chat_id) channels.push('telegram');
  if (customer?.phone_number) {
    channels.push('whatsapp');
    channels.push('sms');
    channels.push('tel');
  }
  return channels;
}

export function preferredChannel(customer) {
  const available = getAvailableChannels(customer);
  return available[0] || null;
}

function cleanEthiopianPhone(phone) {
  // Accept +251.../0.../251.../just digits. Return E.164-ish "+2519XXXXXXXX".
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('251')) return `+${digits}`;
  if (digits.startsWith('0')) return `+251${digits.slice(1)}`;
  if (digits.length === 9) return `+251${digits}`;
  return `+${digits}`;
}

export function buildChannelUrl({ channel, customer, message }) {
  const phone = cleanEthiopianPhone(customer?.phone_number);
  const phoneNoPlus = phone.replace(/^\+/, '');
  const encodedMsg = encodeURIComponent(message);

  switch (channel) {
    case 'telegram': {
      const username = String(customer?.telegram_username || '').replace(/^@/, '');
      if (!username) return null;
      return `https://t.me/${username}`;
    }
    case 'whatsapp':
      if (!phoneNoPlus) return null;
      return `https://wa.me/${phoneNoPlus}?text=${encodedMsg}`;
    case 'sms':
      if (!phone) return null;
      return `sms:${phone}?body=${encodedMsg}`;
    case 'tel':
      if (!phone) return null;
      return `tel:${phone}`;
    default:
      return null;
  }
}

export async function copyMessageToClipboard(message) {
  if (typeof navigator === 'undefined') return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
      return true;
    }
  } catch {}
  // Legacy fallback
  try {
    const ta = document.createElement('textarea');
    ta.value = message;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Counts customers who have a non-zero balance — used to decide whether to show
// the "Remind all (N)" CTA. (Overdue computation needs transactions, deferred.)
export function countCustomersWithBalance(customers = []) {
  return customers.filter(c => Number(c?.balance || 0) > 0).length;
}

// Human-readable "X days ago" — null if missing.
export function daysAgoLabel(ts, lang) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - Number(ts)) / (1000 * 60 * 60 * 24));
  if (days <= 0) return lang === 'am' ? 'ዛሬ' : 'today';
  if (days === 1) return lang === 'am' ? 'ከ1 ቀን በፊት' : '1d ago';
  return lang === 'am' ? `ከ${days} ቀን በፊት` : `${days}d ago`;
}
