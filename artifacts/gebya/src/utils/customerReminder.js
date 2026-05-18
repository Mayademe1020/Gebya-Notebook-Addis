import { getCustomerCollectionStatus } from './customerLedger.js';
import { formatEthiopian } from './ethiopianCalendar.js';

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
  creditHeader: 'From {shop}',
  creditAmount: 'Credit added: {amount} birr',
  creditReturnDate: 'Return date: {date}',
  creditRemainingBalance: 'Remaining balance: {balance} birr',
  receiptHeader: 'Payment receipt from {shop}',
  receiptAmount: 'Amount paid: {amount} birr',
  receiptDate: 'Date: {date}',
  receiptRemainingBalance: 'Remaining balance: {balance} birr',
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
  creditHeader: 'ከ{shop}',
  creditAmount: 'የተጨመረ: {amount} ብር',
  creditReturnDate: 'የመመለሻ ቀን: {date}',
  creditRemainingBalance: 'ቀሪ ሂሳብ: {balance} ብር',
  receiptHeader: 'ከ{shop} የክፍያ ማረጋገጫ',
  receiptAmount: 'የተከፈለ: {amount} ብር',
  receiptDate: 'ቀን: {date}',
  receiptRemainingBalance: 'ቀሪ ሂሳብ: {balance} ብር',
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

export function buildCreditAddedMessage({ customer, shopName, amount, itemNote, dueDate, balance, now = Date.now(), lang = 'en' }) {
  const m = lang === 'am' ? MSG_AM : MSG_EN;
  const safeShopName = cleanText(shopName) || 'the shop';
  const formattedAmount = formatReminderAmount(amount);
  const formattedBalance = formatReminderAmount(balance);
  const returnDateText = dueDate ? formatEthiopian(dueDate) : 'Not set';

  const lines = [
    tpl(m.creditHeader, { shop: safeShopName }),
    tpl(m.creditAmount, { amount: formattedAmount }),
  ];

  if (itemNote) lines.push(itemNote);

  lines.push(tpl(m.creditReturnDate, { date: returnDateText }));
  lines.push(tpl(m.creditRemainingBalance, { balance: formattedBalance }));

  return lines.join('\n');
}

export function buildPaymentReceiptMessage({ customer, shopName, amount, balance, now = Date.now(), lang = 'en' }) {
  const m = lang === 'am' ? MSG_AM : MSG_EN;
  const safeShopName = cleanText(shopName) || 'the shop';
  const formattedAmount = formatReminderAmount(amount);
  const formattedBalance = formatReminderAmount(balance);
  const dateText = now ? formatEthiopian(now) : '';

  return [
    tpl(m.receiptHeader, { shop: safeShopName }),
    tpl(m.receiptAmount, { amount: formattedAmount }),
    tpl(m.receiptDate, { date: dateText }),
    tpl(m.receiptRemainingBalance, { balance: formattedBalance }),
    m.receiptThanks,
  ].join('\n');
}
