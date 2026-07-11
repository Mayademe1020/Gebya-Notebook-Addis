import db from '../../../db';
import { formatEthiopian } from '../../../utils/ethiopianCalendar';
import { fireToast } from '../../Toast';

// ─── CSV helpers ────────────────────────────────────────────────────────────

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

// ─── JSON backup builder ─────────────────────────────────────────────────────

export const buildBackupJSON = async () => {
  const [
    transactionsRows,
    customerRows,
    customerTxRows,
    catalogRows,
    supplierRows,
    supplierTxRows,
    staffRows,
    settingsRows,
    analyticsRows,
    suggestionLogRows,
    crossShopRows,
    creditRecordsRows,
    creditPaymentLogRows,
    dailyClosingsRows,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.customers.toArray(),
    db.customer_transactions.toArray(),
    db.catalog_entries?.toArray?.() || [],
    db.suppliers?.toArray?.() || [],
    db.supplier_transactions?.toArray?.() || [],
    db.staff_members?.toArray?.() || [],
    db.settings?.toArray?.() || [],
    db.analytics?.toArray?.() || [],
    db.suggestion_log?.toArray?.() || [],
    db.cross_shop_unmatched?.toArray?.() || [],
    db.credit_records?.toArray?.() || [],
    db.credit_payment_logs?.toArray?.() || [],
    db.daily_closings?.toArray?.() || [],
  ]);

  return {
    gebya_backup_version: 1,
    exported_at: new Date().toISOString(),
    app_version: '1.0',
    counts: {
      transactions: transactionsRows.length,
      customers: customerRows.length,
      customer_transactions: customerTxRows.length,
      suppliers: supplierRows.length,
      supplier_transactions: supplierTxRows.length,
      catalog_entries: catalogRows.length,
      staff_members: staffRows.length,
      credit_records: creditRecordsRows.length,
      credit_payment_logs: creditPaymentLogRows.length,
      daily_closings: dailyClosingsRows.length,
    },
    tables: {
      transactions: transactionsRows,
      customers: customerRows,
      customer_transactions: customerTxRows,
      catalog_entries: catalogRows,
      suppliers: supplierRows,
      supplier_transactions: supplierTxRows,
      staff_members: staffRows,
      settings: settingsRows,
      analytics: analyticsRows,
      suggestion_log: suggestionLogRows,
      cross_shop_unmatched: crossShopRows,
      credit_records: creditRecordsRows,
      credit_payment_logs: creditPaymentLogRows,
      daily_closings: dailyClosingsRows,
    },
  };
};

// ─── Trigger a browser file download ────────────────────────────────────────

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

// ─── Exported actions ────────────────────────────────────────────────────────

export const exportToJSON = async (lang, setLastBackupAt) => {
  try {
    const data = await buildBackupJSON();
    triggerDownload(
      JSON.stringify(data, null, 2),
      `gebya-backup-${new Date().toISOString().split('T')[0]}.json`,
      'application/json;charset=utf-8;'
    );
    try { await db.settings.put({ key: 'gebya_last_backup_at', value: Date.now() }); } catch { /* ignore */ }
    setLastBackupAt(Date.now());
    fireToast(lang === 'am' ? '✓ ምትኬ ወረደ' : '✓ Backup downloaded', 1800);
  } catch (err) {
    if (import.meta.env.DEV) console.error('JSON backup failed:', err);
    fireToast(lang === 'am' ? 'ምትኬ አልተሳካም' : 'Backup failed', 2400);
  }
};

export const shareBackup = async (lang, setLastBackupAt) => {
  try {
    const data = await buildBackupJSON();
    const json = JSON.stringify(data, null, 2);
    const filename = `gebya-backup-${new Date().toISOString().split('T')[0]}.json`;
    if (navigator.canShare && typeof File === 'function') {
      try {
        const file = new File([json], filename, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Gebya backup',
            text: `Gebya backup · ${new Date().toLocaleDateString()}`,
          });
          try { await db.settings.put({ key: 'gebya_last_backup_at', value: Date.now() }); } catch { /* ignore */ }
          setLastBackupAt(Date.now());
          return;
        }
      } catch (shareErr) {
        if (import.meta.env.DEV) console.warn('File share failed, falling back:', shareErr);
      }
    }
    await exportToJSON(lang, setLastBackupAt);
  } catch (err) {
    if (import.meta.env.DEV) console.error('Share backup failed:', err);
    fireToast(lang === 'am' ? 'ማጋራት አልተሳካም' : 'Share failed', 2400);
  }
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

export const restoreFromJSON = async (data, setLastBackupAt) => {
  if (!data?.tables) throw new Error('Invalid backup');
  const { tables } = data;
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
      if (Array.isArray(tables.customers))             await db.customers.bulkAdd(tables.customers);
      if (Array.isArray(tables.suppliers))             await db.suppliers.bulkAdd(tables.suppliers);
      if (Array.isArray(tables.catalog_entries))       await db.catalog_entries.bulkAdd(tables.catalog_entries);
      if (Array.isArray(tables.staff_members))         await db.staff_members.bulkAdd(tables.staff_members);
      if (Array.isArray(tables.transactions))          await db.transactions.bulkAdd(tables.transactions);
      if (Array.isArray(tables.customer_transactions)) await db.customer_transactions.bulkAdd(tables.customer_transactions);
      if (Array.isArray(tables.supplier_transactions)) await db.supplier_transactions.bulkAdd(tables.supplier_transactions);
      if (Array.isArray(tables.settings))              await db.settings.bulkAdd(tables.settings);
      if (Array.isArray(tables.analytics))             await db.analytics.bulkAdd(tables.analytics);
      if (Array.isArray(tables.suggestion_log))        await db.suggestion_log.bulkAdd(tables.suggestion_log);
      if (Array.isArray(tables.cross_shop_unmatched))  await db.cross_shop_unmatched.bulkAdd(tables.cross_shop_unmatched);
      if (Array.isArray(tables.credit_records))        await db.credit_records.bulkAdd(tables.credit_records);
      if (Array.isArray(tables.credit_payment_logs))   await db.credit_payment_logs.bulkAdd(tables.credit_payment_logs);
      if (Array.isArray(tables.daily_closings))        await db.daily_closings.bulkAdd(tables.daily_closings);
    }
  );
};
