import db from '../../../db';
import { formatEthiopian } from '../../../utils/ethiopianCalendar';

const csvCell = (value) => {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const buildCsvSection = (title, headers, rows) =>
  [
    [csvCell(title)],
    headers.map(csvCell),
    ...rows.map((row) => row.map(csvCell)),
    [],
  ]
    .map((row) => row.join(','))
    .join('\n');

const triggerDownload = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportToCSV = async (transactions, lang) => {
  const [customerRows, customerTransactionRows, supplierRows, supplierTransactionRows] =
    await Promise.all([
      db.customers.toArray(),
      db.customer_transactions.toArray(),
      db.suppliers?.toArray?.() || [],
      db.supplier_transactions?.toArray?.() || [],
    ]);

  const transactionSection = buildCsvSection(
    'Transactions',
    ['Date (Ethiopian)', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Cost (birr)', 'Profit (birr)', 'Payment', 'Customer', 'Entered by', 'Actor role', 'Actor staff ID'],
    transactions.map((tx) => [
      formatEthiopian(tx.created_at), tx.type, tx.item_name || '', tx.quantity || 1,
      tx.amount || 0, tx.cost_price || '',
      tx.profit != null ? tx.profit : '',
      [tx.payment_type, tx.payment_provider].filter(Boolean).join(' ') || '',
      tx.customer_name || '', tx.actor_name_snapshot || '', tx.actor_role || '',
      tx.actor_staff_member_id ?? '',
    ])
  );

  const customerSection = buildCsvSection(
    'Customers',
    ['ID', 'Name', 'Phone', 'Note', 'Telegram', 'Telegram notify enabled', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
    customerRows.map((c) => [
      c.id, c.display_name || '', c.phone_number || '', c.note || '',
      c.telegram_username || '', c.telegram_notify_enabled ? 'yes' : 'no',
      c.created_at ? formatEthiopian(c.created_at) : '',
      c.updated_at ? formatEthiopian(c.updated_at) : '',
    ])
  );

  const customerTxSection = buildCsvSection(
    'Customer Ledger Transactions',
    ['ID', 'Customer ID', 'Type', 'Amount (birr)', 'Item note', 'Due date (Ethiopian)', 'Created at (Ethiopian)', 'Updated at (Ethiopian)', 'Entered by', 'Actor role', 'Actor staff ID'],
    customerTransactionRows.map((e) => [
      e.id, e.customer_id, e.type, e.amount || 0, e.item_note || '',
      e.due_date ? formatEthiopian(e.due_date) : '',
      e.created_at ? formatEthiopian(e.created_at) : '',
      e.updated_at ? formatEthiopian(e.updated_at) : '',
      e.actor_name_snapshot || '', e.actor_role || '', e.actor_staff_member_id ?? '',
    ])
  );

  const supplierSection = buildCsvSection(
    'Suppliers',
    ['ID', 'Name', 'Phone', 'Note', 'Active', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
    supplierRows.map((s) => [
      s.id, s.display_name || '', s.phone_number || '', s.note || '',
      s.active === false ? 'no' : 'yes',
      s.created_at ? formatEthiopian(s.created_at) : '',
      s.updated_at ? formatEthiopian(s.updated_at) : '',
    ])
  );

  const supplierTxSection = buildCsvSection(
    'Supplier Ledger Transactions',
    ['ID', 'Supplier ID', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Note', 'Created at (Ethiopian)', 'Updated at (Ethiopian)', 'Entered by', 'Actor role', 'Actor staff ID'],
    supplierTransactionRows.map((e) => [
      e.id, e.supplier_id, e.type, e.item_name || '',
      e.quantity != null ? e.quantity : '', e.amount || 0, e.note || '',
      e.created_at ? formatEthiopian(e.created_at) : '',
      e.updated_at ? formatEthiopian(e.updated_at) : '',
      e.actor_name_snapshot || '', e.actor_role || '', e.actor_staff_member_id ?? '',
    ])
  );

  triggerDownload(
    [transactionSection, customerSection, customerTxSection, supplierSection, supplierTxSection].join('\n'),
    `gebya-backup-full-${new Date().toISOString().split('T')[0]}.csv`,
    'text/csv;charset=utf-8;'
  );
};

export const clearAllData = async (setCleared, setShowClearConfirm) => {
  await db.transaction(
    'rw',
    db.transactions, db.customers, db.customer_transactions, db.catalog_entries,
    db.suppliers, db.supplier_transactions, db.staff_members, db.settings, db.analytics,
    db.suggestion_log, db.cross_shop_unmatched, db.credit_records, db.credit_payment_logs, db.daily_closings,
    async () => {
      await Promise.all([
        db.transactions.clear(), db.customers.clear(),
        db.customer_transactions.clear(), db.catalog_entries.clear(),
        db.suppliers.clear(), db.supplier_transactions.clear(),
        db.staff_members?.clear?.() || Promise.resolve(),
        db.settings.clear(), db.analytics?.clear?.() || Promise.resolve(),
        db.suggestion_log?.clear?.() || Promise.resolve(),
        db.cross_shop_unmatched?.clear?.() || Promise.resolve(),
        db.credit_records?.clear?.() || Promise.resolve(),
        db.credit_payment_logs?.clear?.() || Promise.resolve(),
        db.daily_closings?.clear?.() || Promise.resolve(),
      ]);
    }
  );
  setCleared(true);
  setShowClearConfirm(false);
  setTimeout(() => window.location.reload(), 800);
};

// Settings that belong to this phone's session or device, not to the ledger.
// A snapshot is taken on another phone (or on this one before a re-login), so
// restoring its token/device id would swap the live session for a stale one.
// They are also the keys that used to collide: the old code re-put the local
// copy after the wipe and then bulkAdded the snapshot's copy under the same
// primary key, which aborted the whole restore.
const PRESERVED_SETTINGS = [
  'gebya_auth_token',
  'gebya_device_id',
  'device_id',
  'gebya_business_id',
  'gebya_last_synced_at',
  'gebya_last_sync_at',
  'gebya_table_last_sync',
  'gebya_outbox_seeded_v1',
  'gebya_last_auto_backup_at',
  'cached_permissions',
  'privacy_mode',
];

export const restoreFromJSON = async (data) => {
  if (!data?.tables) throw new Error('Invalid backup');
  const { tables } = data;
  await db.transaction(
    'rw',
    db.transactions, db.customers, db.customer_transactions, db.catalog_entries,
    db.suppliers, db.supplier_transactions, db.staff_members, db.settings, db.analytics,
    db.suggestion_log, db.cross_shop_unmatched, db.credit_records, db.credit_payment_logs, db.daily_closings,
    async () => {
      // Keep this phone's session-bound settings, and keep the snapshot's copy
      // of them out of the restore entirely.
      const preserved = {};
      for (const key of PRESERVED_SETTINGS) {
        const row = await db.settings.get(key).catch(() => null);
        if (row) preserved[key] = row;
      }
      await Promise.all([
        db.transactions.clear(), db.customers.clear(),
        db.customer_transactions.clear(), db.catalog_entries.clear(),
        db.suppliers.clear(), db.supplier_transactions.clear(),
        db.staff_members?.clear?.() || Promise.resolve(),
        db.settings.clear(), db.analytics?.clear?.() || Promise.resolve(),
        db.suggestion_log?.clear?.() || Promise.resolve(),
        db.cross_shop_unmatched?.clear?.() || Promise.resolve(),
        db.credit_records?.clear?.() || Promise.resolve(),
        db.credit_payment_logs?.clear?.() || Promise.resolve(),
        db.daily_closings?.clear?.() || Promise.resolve(),
      ]);
      if (Object.keys(preserved).length) await db.settings.bulkPut(Object.values(preserved));
      const restorableSettings = Array.isArray(tables.settings)
        ? tables.settings.filter((row) => !PRESERVED_SETTINGS.includes(row?.key))
        : [];
      if (Array.isArray(tables.customers))             await db.customers.bulkAdd(tables.customers);
      if (Array.isArray(tables.suppliers))             await db.suppliers.bulkAdd(tables.suppliers);
      if (Array.isArray(tables.catalog_entries))       await db.catalog_entries.bulkAdd(tables.catalog_entries);
      if (Array.isArray(tables.staff_members))         await db.staff_members.bulkAdd(tables.staff_members);
      if (Array.isArray(tables.transactions))          await db.transactions.bulkAdd(tables.transactions);
      if (Array.isArray(tables.customer_transactions)) await db.customer_transactions.bulkAdd(tables.customer_transactions);
      if (Array.isArray(tables.supplier_transactions)) await db.supplier_transactions.bulkAdd(tables.supplier_transactions);
      if (restorableSettings.length)                 await db.settings.bulkAdd(restorableSettings);
      if (Array.isArray(tables.analytics))             await db.analytics.bulkAdd(tables.analytics);
      if (Array.isArray(tables.suggestion_log))        await db.suggestion_log.bulkAdd(tables.suggestion_log);
      if (Array.isArray(tables.cross_shop_unmatched))  await db.cross_shop_unmatched.bulkAdd(tables.cross_shop_unmatched);
      if (Array.isArray(tables.credit_records))        await db.credit_records.bulkAdd(tables.credit_records);
      if (Array.isArray(tables.credit_payment_logs))   await db.credit_payment_logs.bulkAdd(tables.credit_payment_logs);
      if (Array.isArray(tables.daily_closings))        await db.daily_closings.bulkAdd(tables.daily_closings);
    }
  );
};
