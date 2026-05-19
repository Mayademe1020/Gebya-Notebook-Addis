import { getCustomerCollectionStatus } from './customerLedger.js';

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function getCustomerName(customer = {}) {
  return cleanText(customer.display_name || customer.displayName) || 'Customer';
}

function getCustomerBalance(customer = {}) {
  const balance = Number(customer.balance ?? customer.currentBalance ?? 0);
  return Number.isFinite(balance) ? Math.max(balance, 0) : 0;
}

function formatReminderAmount(amount) {
  if (Number.isInteger(amount)) return amount.toLocaleString('en-US');
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MSG_EN = {
  reminderGreeting: 'Selam {name}, from {shop}.',
  reminderBalance: 'Your remaining balance is {amount} birr.',
  reminderDueToday: 'This amount is due today.',
  reminderOverdue: 'This amount is overdue by {days} days.',
  reminderDueIn: 'This amount is due in {days} days.',
  reminderNoDueDate: 'No due date was set.',
  reminderAged: 'This balance has been open for {days} days.',
  creditLine1: '{amount} birr credit was recorded at {shop}.',
  creditBalance: 'Current balance: {balance} birr.',
  creditItemNote: 'For: {itemNote}',
  creditTrustLine: 'Please contact the shop if anything is incorrect.',
  receiptLine1: '{amount} birr payment was recorded at {shop}.',
  receiptBalance: 'Remaining balance: {balance} birr.',
  receiptThanks: 'Thank you.',
};

const MSG_AM = {
  reminderGreeting: 'ሰላም {name}፣ ከ{shop} ነው።',
  reminderBalance: 'የቀረህ ቀሪ ሂሳብ {amount} ብር ነው።',
  reminderDueToday: 'ይህ መጠን ዛሬ የመጨረሻ ቀን ነው።',
  reminderOverdue: 'ይህ መጠን በ{days} ቀናት አልፏል።',
  reminderDueIn: 'ይህ መጠን በ{days} ቀናት ውስጥ ነው።',
  reminderNoDueDate: 'የመመለሻ ቀን አልተቀመጠም።',
  reminderAged: 'ይህ ቀሪ ሂሳብ ለ{days} ቀናት ክፍት ነበር።',
  creditLine1: '{amount} ብር ክሬዲት በ{shop} ተመዝግቧል።',
  creditBalance: 'አጠቃላይ ቀሪ ሂሳብ: {balance} ብር።',
  creditItemNote: 'ለ: {itemNote}',
  creditTrustLine: 'ስህተት ካለ እባክዎ ሱቁን ያግኙ።',
  receiptLine1: '{amount} ብር ክፍያ በ{shop} ተመዝግቧል።',
  receiptBalance: 'ቀሪ ሂሳብ: {balance} ብር።',
  receiptThanks: 'አመሰግናለሁ።',
};

function tpl(strings, vars) {
  let result = strings;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(`{${key}}`, String(val ?? ''));
  }
  return result;
}

export function buildReminderDueSentence(status = {}, customer = {}, lang = 'en') {
  const m = lang === 'am' ? MSG_AM : MSG_EN;
  if (status.key === 'due_today') return m.reminderDueToday;
  if (status.key === 'overdue') {
    const days = Number(status.days) || 0;
    return tpl(m.reminderOverdue, { days });
  }
  if (status.key === 'due_in') {
    const days = Number(status.days) || 0;
    return tpl(m.reminderDueIn, { days });
  }
  if (status.key === 'no_due_date' && customer.needs_follow_up) {
    const days = customer.days_since_activity || 0;
    return tpl(m.reminderAged, { days });
  }
  return m.reminderNoDueDate;
}

export function buildCustomerReminderMessage({ customer, shopName, now = Date.now(), lang = 'en' } = {}) {
  const m = lang === 'am' ? MSG_AM : MSG_EN;
  const safeShopName = cleanText(shopName) || 'your shop';
  const balance = getCustomerBalance(customer);
  const status = customer?.collection_status || getCustomerCollectionStatus(customer || {}, now);

  return [
    tpl(m.reminderGreeting, { name: getCustomerName(customer), shop: safeShopName }),
    tpl(m.reminderBalance, { amount: formatReminderAmount(balance) }),
    buildReminderDueSentence(status, customer || {}, lang),
  ].join('\n');
}

export function buildSmsUri(phone, message) {
  if (!phone) return null;
  const clean = String(phone).replace(/\s+/g, '');
  return `sms:${clean}?body=${encodeURIComponent(message)}`;
}

export function buildCreditAddedMessage({ customer, shopName, amount, itemNote, dueDate, balance, customerName, now = Date.now(), lang = 'en' }) {
  const m = lang === 'am' ? MSG_AM : MSG_EN;
  const safeShopName = cleanText(shopName) || 'the shop';
  const formattedAmount = formatReminderAmount(amount);
  const formattedBalance = formatReminderAmount(balance);

  const lines = [];

  if (customerName) {
    const name = cleanText(customerName);
    if (name) {
      lines.push(lang === 'am' ? `ሰላም ${name}.` : `Selam ${name}.`);
    }
  }

  lines.push(tpl(m.creditLine1, { amount: formattedAmount, shop: safeShopName }));
  lines.push(tpl(m.creditBalance, { balance: formattedBalance }));

  const shortNote = cleanText(itemNote);
  if (shortNote && shortNote.length <= 60) {
    lines.push(tpl(m.creditItemNote, { itemNote: shortNote }));
  }

  lines.push(m.creditTrustLine);

  return lines.join('\n');
}

export function buildPaymentReceiptMessage({ customer, shopName, amount, balance, customerName, now = Date.now(), lang = 'en' }) {
  const m = lang === 'am' ? MSG_AM : MSG_EN;
  const safeShopName = cleanText(shopName) || 'the shop';
  const formattedAmount = formatReminderAmount(amount);
  const formattedBalance = formatReminderAmount(balance);

  const lines = [];

  if (customerName) {
    const name = cleanText(customerName);
    if (name) {
      lines.push(lang === 'am' ? `ሰላም ${name}.` : `Selam ${name}.`);
    }
  }

  lines.push(tpl(m.receiptLine1, { amount: formattedAmount, shop: safeShopName }));
  lines.push(tpl(m.receiptBalance, { balance: formattedBalance }));

  if (formattedBalance === '0' || formattedBalance === '0.00') {
    lines.push(m.receiptThanks);
  }

  return lines.join('\n');
}
