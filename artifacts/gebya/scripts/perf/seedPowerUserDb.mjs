const DAY_MS = 24 * 60 * 60 * 1000;
const DB_NAME = 'GebyaDB';
const DB_VERSION = 14;

const STORE_SCHEMAS = {
  transactions: { keyPath: 'id', autoIncrement: true, indexes: ['type', 'amount', 'item_name', 'cost_price', 'quantity', 'profit', 'is_credit', 'customer_id', 'customer_name', 'created_at', 'ethiopian_date', 'payment_type', 'payment_provider', 'updated_at', 'source', 'raw_transcript', 'detected_total', 'was_edited', 'transcription_provider', 'parsing_confidence', 'voice_note', 'raw_audio_ref', 'actor_role', 'actor_staff_member_id', 'actor_name_snapshot'] },
  customers: { keyPath: 'id', autoIncrement: true, indexes: ['display_name', 'note', 'phone_number', 'telegram_username', 'telegram_chat_id', 'telegram_notify_enabled', 'telegram_link_token', 'telegram_linked_at', 'telegram_link_requested_at', 'created_at', 'updated_at'] },
  customer_transactions: { keyPath: 'id', autoIncrement: true, indexes: ['customer_id', 'type', 'amount', 'due_date', 'reference_code', 'telegram_delivery_state', 'telegram_delivery_error', 'telegram_delivery_attempted_at', 'created_at', 'updated_at', 'actor_role', 'actor_staff_member_id', 'actor_name_snapshot'] },
  catalog_entries: { keyPath: 'id', autoIncrement: true, indexes: ['name', 'kind', 'active', 'created_at', 'updated_at'] },
  suppliers: { keyPath: 'id', autoIncrement: true, indexes: ['display_name', 'phone_number', 'note', 'active', 'created_at', 'updated_at'] },
  supplier_transactions: { keyPath: 'id', autoIncrement: true, indexes: ['supplier_id', 'type', 'catalog_entry_id', 'created_at', 'updated_at', 'actor_role', 'actor_staff_member_id', 'actor_name_snapshot'] },
  staff_members: { keyPath: 'id', autoIncrement: true, indexes: ['display_name', 'role', 'active', 'created_at', 'updated_at', 'deactivated_at'] },
  credit_records: { keyPath: 'id', autoIncrement: true, indexes: ['customer_id', 'customer_name', 'original_amount', 'paid_amount', 'remaining_amount', 'due_date', 'status', 'created_at', 'direction'] },
  credit_payment_logs: { keyPath: 'id', autoIncrement: true, indexes: ['credit_record_id', 'amount', 'payment_method', 'paid_at'] },
  settings: { keyPath: 'key', indexes: ['value'] },
  analytics: { keyPath: 'key', indexes: ['value'] },
};

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteDatabase(name) {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function openDatabase() {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const [storeName, schema] of Object.entries(STORE_SCHEMAS)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: schema.keyPath,
            autoIncrement: schema.autoIncrement,
          });

          for (const indexName of schema.indexes) {
            if (!store.indexNames.contains(indexName)) {
              store.createIndex(indexName, indexName);
            }
          }
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function bulkPut(db, storeName, rows, chunkSize = 500) {
  for (const batch of chunk(rows, chunkSize)) {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const row of batch) {
      store.put(row);
    }
    await transactionDone(transaction);
  }
}

function makeCustomers(count, now) {
  const names = ['Abebe', 'Tigist', 'Mekdes', 'Dawit', 'Hana', 'Selam', 'Kedir', 'Bethel', 'Mulu', 'Alem'];
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const name = `${names[index % names.length]} Customer ${String(id).padStart(3, '0')}`;
    const createdAt = now - (count - index) * 6 * 60 * 60 * 1000;
    return {
      id,
      display_name: name,
      note: index % 4 === 0 ? `Market lane ${1 + (index % 12)}` : '',
      phone_number: `09${String(10000000 + id).slice(-8)}`,
      telegram_username: index % 8 === 0 ? `@gebya_customer_${id}` : '',
      telegram_chat_id: null,
      telegram_notify_enabled: index % 8 === 0,
      telegram_link_token: index % 8 === 0 ? `token-${id}` : null,
      telegram_linked_at: null,
      telegram_link_requested_at: index % 8 === 0 ? createdAt : null,
      created_at: createdAt,
      updated_at: now - (index % 30) * DAY_MS,
    };
  });
}

function makeCatalog(count, now) {
  const itemRoots = ['Sugar', 'Coffee', 'Bread', 'Soap', 'Rice', 'Oil', 'Flour', 'Tea', 'Pasta', 'Salt'];
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id,
      name: `${itemRoots[index % itemRoots.length]} ${String(id).padStart(4, '0')}`,
      kind: index % 5 === 0 ? 'service' : 'item',
      default_price: 25 + (index % 80) * 3,
      default_cost: 15 + (index % 60) * 2,
      note: index % 11 === 0 ? 'Power user seed item' : '',
      active: index % 17 !== 0,
      created_at: now - (count - index) * 60 * 1000,
      updated_at: now - (index % 20) * DAY_MS,
    };
  });
}

function makeStaff(now) {
  return Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    display_name: `Seller ${index + 1}`,
    role: index === 0 ? 'owner' : 'seller',
    active: index < 10,
    created_at: now - (90 - index) * DAY_MS,
    updated_at: now - (index % 9) * DAY_MS,
    deactivated_at: index < 10 ? null : now - index * DAY_MS,
  }));
}

function makeTransactions(count, customers, catalog, staff, now) {
  const paymentTypes = ['cash', 'bank', 'wallet'];
  const bankProviders = ['CBE', 'Awash', 'Telebirr', 'Dashen'];
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const catalogEntry = catalog[index % catalog.length];
    const customer = customers[index % customers.length];
    const staffMember = staff[index % staff.length];
    const type = index % 7 === 0 ? 'expense' : 'sale';
    const quantity = 1 + (index % 5);
    const unitPrice = Number(catalogEntry.default_price || 40);
    const amount = type === 'sale' ? unitPrice * quantity : 20 + (index % 140);
    const costPrice = type === 'sale' ? Number(catalogEntry.default_cost || Math.max(1, unitPrice - 8)) : null;
    const createdAt = now - index * 23 * 60 * 1000;
    const paymentType = paymentTypes[index % paymentTypes.length];
    return {
      id,
      type,
      amount,
      item_name: type === 'sale' ? catalogEntry.name : `Expense ${1 + (index % 30)}`,
      catalog_entry_id: type === 'sale' ? catalogEntry.id : null,
      item_kind: type === 'sale' ? catalogEntry.kind : null,
      cost_price: costPrice,
      quantity,
      profit: type === 'sale' ? amount - costPrice * quantity : null,
      is_credit: false,
      customer_id: type === 'sale' && index % 3 === 0 ? customer.id : null,
      customer_name: type === 'sale' && index % 3 === 0 ? customer.display_name : null,
      customer_phone: null,
      due_date: null,
      ethiopian_date: null,
      payment_type: paymentType,
      payment_provider: paymentType === 'cash' ? null : bankProviders[index % bankProviders.length],
      direction: null,
      source: index % 9 === 0 ? 'voice' : 'typed',
      raw_transcript: index % 9 === 0 ? `sold ${catalogEntry.name} ${amount} birr` : null,
      detected_total: index % 9 === 0 ? amount : null,
      was_edited: index % 13 === 0,
      transcription_provider: index % 9 === 0 ? 'seed' : null,
      parsing_confidence: index % 9 === 0 ? 0.88 : null,
      voice_note: index % 9 === 0 ? catalogEntry.name : null,
      raw_audio_ref: null,
      actor_role: staffMember.role,
      actor_staff_member_id: staffMember.id,
      actor_name_snapshot: staffMember.display_name,
      created_at: createdAt,
      updated_at: index % 19 === 0 ? createdAt + 30 * 60 * 1000 : null,
    };
  });
}

function makeCustomerLedgerEntries(customers, now) {
  const rows = [];
  let id = 1;

  for (const customer of customers) {
    const creditCount = 1 + (customer.id % 4);
    for (let index = 0; index < creditCount; index += 1) {
      const createdAt = now - (customer.id * 2 + index) * DAY_MS;
      const amount = 120 + ((customer.id + index) % 12) * 35;
      rows.push({
        id: id++,
        customer_id: customer.id,
        type: 'credit_add',
        amount,
        item_note: `Dubie item ${index + 1}`,
        due_date: createdAt + (7 + (customer.id % 20)) * DAY_MS,
        reference_code: `CR-${customer.id}-${index}`,
        telegram_delivery_state: customer.telegram_notify_enabled ? 'bot_pending' : 'not_linked',
        telegram_delivery_error: null,
        telegram_delivery_attempted_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
        actor_role: 'seller',
        actor_staff_member_id: 1 + (customer.id % 10),
        actor_name_snapshot: `Seller ${1 + (customer.id % 10)}`,
      });

      if (index % 2 === 0) {
        rows.push({
          id: id++,
          customer_id: customer.id,
          type: 'payment',
          amount: Math.round(amount * 0.45),
          item_note: 'Partial payment',
          due_date: null,
          reference_code: `PM-${customer.id}-${index}`,
          telegram_delivery_state: customer.telegram_notify_enabled ? 'bot_pending' : 'not_linked',
          telegram_delivery_error: null,
          telegram_delivery_attempted_at: createdAt + DAY_MS,
          created_at: createdAt + DAY_MS,
          updated_at: createdAt + DAY_MS,
          actor_role: 'seller',
          actor_staff_member_id: 1 + (customer.id % 10),
          actor_name_snapshot: `Seller ${1 + (customer.id % 10)}`,
        });
      }
    }
  }

  return rows;
}

function makeSuppliers(now) {
  return Array.from({ length: 80 }, (_, index) => ({
    id: index + 1,
    display_name: `Supplier ${String(index + 1).padStart(2, '0')}`,
    phone_number: `07${String(30000000 + index + 1).slice(-8)}`,
    note: index % 5 === 0 ? 'Weekly supplier' : '',
    active: index % 13 !== 0,
    created_at: now - (index + 20) * DAY_MS,
    updated_at: now - (index % 15) * DAY_MS,
  }));
}

function makeSupplierTransactions(suppliers, catalog, staff, now) {
  return Array.from({ length: 650 }, (_, index) => {
    const id = index + 1;
    const supplier = suppliers[index % suppliers.length];
    const catalogEntry = catalog[index % catalog.length];
    const staffMember = staff[index % staff.length];
    const type = index % 5 === 0 ? 'supplier_payment' : 'purchase_add';
    const createdAt = now - index * 4 * 60 * 60 * 1000;
    return {
      id,
      supplier_id: supplier.id,
      type,
      catalog_entry_id: type === 'purchase_add' ? catalogEntry.id : null,
      item_name: type === 'purchase_add' ? catalogEntry.name : null,
      item_kind: type === 'purchase_add' ? catalogEntry.kind : null,
      quantity: type === 'purchase_add' ? 5 + (index % 20) : null,
      amount: type === 'purchase_add' ? 500 + (index % 80) * 12 : 300 + (index % 40) * 10,
      note: type === 'supplier_payment' ? 'Supplier payment' : 'Restock',
      created_at: createdAt,
      updated_at: createdAt,
      actor_role: staffMember.role,
      actor_staff_member_id: staffMember.id,
      actor_name_snapshot: staffMember.display_name,
    };
  });
}

async function seedPowerUserDatabase(options = {}) {
  const counts = {
    transactions: Number(options.transactions || 5000),
    customers: Number(options.customers || 500),
    catalog: Number(options.catalog || 1000),
  };
  const now = Date.now();

  await deleteDatabase(DB_NAME);
  const db = await openDatabase();

  const customers = makeCustomers(counts.customers, now);
  const catalog = makeCatalog(counts.catalog, now);
  const staff = makeStaff(now);
  const transactions = makeTransactions(counts.transactions, customers, catalog, staff, now);
  const customerLedger = makeCustomerLedgerEntries(customers, now);
  const suppliers = makeSuppliers(now);
  const supplierTransactions = makeSupplierTransactions(suppliers, catalog, staff, now);

  await bulkPut(db, 'settings', [
    { key: 'shop_name', value: 'Power Mart Addis' },
    { key: 'shop_phone', value: '0912345678' },
    { key: 'shop_business_type', value: 'retail-shop' },
    { key: 'shop_telegram', value: '@powermartaddis' },
    { key: 'enabled_payment_methods', value: JSON.stringify({ banks: ['CBE', 'Awash', 'Dashen'], wallets: ['Telebirr', 'M-Pesa'] }) },
    { key: 'recurring_expenses', value: JSON.stringify([{ label: 'Rent', amount: 12000 }, { label: 'Transport', amount: 600 }]) },
    { key: 'active_staff_member_id', value: 1 },
    { key: 'last_saved_snapshot', value: JSON.stringify({ label: 'Seeded power user notebook', created_at: now }) },
  ]);
  await bulkPut(db, 'analytics', [
    { key: 'session_count', value: 42 },
    { key: 'last_active_date', value: new Date(now - DAY_MS).toISOString().slice(0, 10) },
    { key: 'streak_days', value: 12 },
    { key: 'longest_streak', value: 24 },
    { key: 'days_active', value: JSON.stringify([]) },
    { key: 'feature_counts', value: JSON.stringify({ sales: counts.transactions, expenses: Math.round(counts.transactions / 7), credits: customerLedger.length }) },
    { key: 'first_used_date', value: new Date(now - 120 * DAY_MS).toISOString().slice(0, 10) },
    { key: 'best_day_total', value: 28500 },
    { key: 'credits_repaid', value: 140 },
  ]);

  await bulkPut(db, 'customers', customers);
  await bulkPut(db, 'customer_transactions', customerLedger);
  await bulkPut(db, 'catalog_entries', catalog);
  await bulkPut(db, 'staff_members', staff);
  await bulkPut(db, 'suppliers', suppliers);
  await bulkPut(db, 'supplier_transactions', supplierTransactions);
  await bulkPut(db, 'transactions', transactions);

  db.close();

  return {
    database: DB_NAME,
    version: DB_VERSION,
    counts: {
      transactions: transactions.length,
      customers: customers.length,
      customer_transactions: customerLedger.length,
      catalog_entries: catalog.length,
      suppliers: suppliers.length,
      supplier_transactions: supplierTransactions.length,
      staff_members: staff.length,
    },
  };
}

export { seedPowerUserDatabase };
