import { formatEthiopian } from './ethiopianCalendar';
import { fmt } from './numformat';
import { CUSTOMER_TRANSACTION_TYPES } from './customerTransactionTypes';

export function normalizeTelegram(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^@[A-Za-z0-9_]+$/.test(trimmed)) return trimmed;
  if (/^https?:\/\/t\.me\/\S+$/i.test(trimmed)) return trimmed;
  if (/^t\.me\/\S+$/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

export function buildTelegramMessageUrl(value, message) {
  const normalized = normalizeTelegram(value);
  if (!normalized) return null;

  if (/^https?:\/\/t\.me\//i.test(normalized)) {
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}text=${encodeURIComponent(message)}`;
  }

  if (/^t\.me\//i.test(normalized)) {
    return `https://${normalized}?text=${encodeURIComponent(message)}`;
  }

  const handle = normalized.startsWith('@') ? normalized.slice(1) : normalized;
  if (!handle) return null;
  return `https://t.me/${handle}?text=${encodeURIComponent(message)}`;
}

export function createCustomerTelegramLinkToken(customerId) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cust-${customerId || 'new'}-${crypto.randomUUID()}`;
  }
  return `cust-${customerId || 'new'}-${Date.now().toString(36)}`;
}

export function buildCustomerConnectMessage({ shopName, customerName, token }) {
  const safeToken = token || `pending-${Date.now().toString(36)}`;
  return [
    `🏪 ${shopName || 'Gebya'}`,
    'Borrower Telegram link',
    '',
    `👤 ${customerName || 'Customer'}`,
    `🔢 ${safeToken}`,
    '',
    'Open the Gebya bot and start it to receive Dubie updates.',
  ].join('\n');
}

export function buildCustomerConnectLink({ botUsername, shopTelegram, shopName, customerName, token }) {
  if (botUsername) {
    // Bug fix: the bot status can return the username WITH a leading '@'
    // (e.g. '@shopnotebookbot'). A t.me URL must NOT include the '@' —
    // 'https://t.me/@name?start=...' is invalid and the QR/link fails to
    // open the bot. Strip any leading '@' before building the URL.
    const handle = String(botUsername).replace(/^@+/, '');
    return `https://t.me/${handle}?start=${encodeURIComponent(token)}`;
  }

  const connectMessage = buildCustomerConnectMessage({ shopName, customerName, token });
  if (shopTelegram) {
    const directTelegramUrl = buildTelegramMessageUrl(shopTelegram, connectMessage);
    if (directTelegramUrl) return directTelegramUrl;
  }

  return `https://t.me/share/url?url=${encodeURIComponent('https://gebya.app')}&text=${encodeURIComponent(connectMessage)}`;
}

export function buildCustomerLedgerTelegramMessage({
  shopName,
  customerName,
  type,
  amount,
  itemNote,
  previousBalance,
  updatedBalance,
  createdAt,
  referenceCode,
}) {
  const isPayment = type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const title = isPayment ? '💰 Payment Received' : '🧾 Credit Added';
  const signedAmount = `${isPayment ? '-' : '+'}${fmt(amount)} ETB`;

  return [
    `🏪 ${shopName || 'Gebya'}`,
    '',
    title,
    signedAmount,
    '',
    `👤 ${customerName || 'Customer'}`,
    !isPayment && itemNote ? `📦 ${itemNote}` : null,
    '',
    `Previous: ${fmt(previousBalance)} ETB`,
    `${isPayment ? 'Remaining' : 'New'}: ${fmt(updatedBalance)} ETB`,
    '',
    `📅 ${formatEthiopian(createdAt || Date.now())}`,
    referenceCode ? `🔢 Ref: ${referenceCode}` : null,
  ].filter(Boolean).join('\n');
}

export function createCustomerTransactionReference(id, createdAt = Date.now()) {
  const numericId = Number(id);
  if (Number.isFinite(numericId) && numericId > 0) {
    return `TX${String(numericId).padStart(4, '0')}`;
  }
  return `TX${String(createdAt).slice(-6)}`;
}
