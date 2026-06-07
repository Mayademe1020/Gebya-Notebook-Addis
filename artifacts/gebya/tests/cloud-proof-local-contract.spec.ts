import { expect, test, type Page } from '@playwright/test';

const CLOUD_PROOF_KIND = 'cloud_proof_upsert';
const STAFF_SALE_EVENT_KIND = 'staff_sale_event';
const DEVICE_KEY = 'cloud_proof_device_id';

async function startFreshShop(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await expect(page.getByText(/tigist shop/i)).toBeVisible();
}

async function readStore<T = any>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction(name, 'readonly');
        const store = tx.objectStore(name);
        const getAll = store.getAll();
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, storeName);
}

async function readSetting(page: Page, key: string) {
  return page.evaluate(async (settingKey) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const get = store.get(settingKey);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => reject(get.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, key);
}

function cloudRows(rows: any[]) {
  return rows.filter((row) => row.kind === CLOUD_PROOF_KIND);
}

function assertRecordHasContract(record: any, deviceId: string) {
  expect(record.transaction_id).toEqual(expect.any(String));
  expect(record.transaction_id.length).toBeGreaterThan(12);
  expect(record.device_id).toBe(deviceId);
  expect(record.sync_status).toBe('local_only');
  expect(record.created_at_device).toEqual(expect.any(Number));
  expect(record.schema_version).toBe(1);
}

function assertQueuePointsToSource(queueRow: any, source: any) {
  expect(queueRow.status).toBe('pending');
  expect(queueRow.device_id).toBe(source.device_id);
  expect(queueRow.transaction_id).toBe(source.transaction_id);
  expect(queueRow.idempotency_key).toBe(`${source.device_id}:${source.transaction_id}`);
  expect(queueRow.record_id).toBe(source.id);
  expect(queueRow.payload.transaction_id).toBe(source.transaction_id);
  expect(queueRow.payload.device_id).toBe(source.device_id);
  expect(queueRow.payload.local_id).toBe(source.id);
  expect(queueRow.payload.sync_status).toBe('local_only');
  expect(queueRow.payload.created_at_device).toEqual(expect.any(Number));
  expect(queueRow.payload.schema_version).toBe(1);
}

function assertPayloadIsPrivacySafe(payload: any) {
  const text = JSON.stringify(payload).toLowerCase();
  const forbiddenKeys = [
    'customer_name',
    'customer_phone',
    'display_name',
    'phone_number',
    'photo',
    'telegram',
    'chat_id',
    'token',
    'bank_account',
    'payment_provider',
    'raw_transcript',
    'raw_audio_ref',
    'item_name',
    'item_note',
    'note',
  ];

  for (const key of forbiddenKeys) {
    expect(text).not.toContain(key);
  }

  expect(text).not.toContain('almaz');
  expect(text).not.toContain('kiros');
  expect(text).not.toContain('sugar');
  expect(text).not.toContain('coffee');
}

async function waitForStoreCount(page: Page, storeName: string, count: number) {
  await expect.poll(async () => (await readStore(page, storeName)).length).toBe(count);
}

test('offline sale and expense get cloud proof contract rows without sensitive payload fields', async ({ page, context }) => {
  await startFreshShop(page);
  await context.setOffline(true);

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill('Sugar private item');
  await page.getByPlaceholder('0').fill('250');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/sugar private item/i)).toBeVisible();

  await page.getByRole('button', { name: /^expense$/i }).click();
  await page.getByPlaceholder(/add details/i).fill('Rent private note');
  await page.getByPlaceholder('0').fill('90');
  await page.getByRole('button', { name: /save expense/i }).click();
  await expect(page.getByText(/rent private note/i)).toBeVisible();

  const device = await readSetting(page, DEVICE_KEY);
  expect(device?.value).toEqual(expect.any(String));

  const transactions = await readStore(page, 'transactions');
  const sale = transactions.find((row) => row.type === 'sale');
  const expense = transactions.find((row) => row.type === 'expense');
  expect(sale).toBeTruthy();
  expect(expense).toBeTruthy();
  assertRecordHasContract(sale, device.value);
  assertRecordHasContract(expense, device.value);

  const queue = cloudRows(await readStore(page, 'sync_queue'));
  const saleQueue = queue.find((row) => row.record_table === 'transactions' && row.record_id === sale.id);
  const expenseQueue = queue.find((row) => row.record_table === 'transactions' && row.record_id === expense.id);
  expect(saleQueue?.record_type).toBe('sale');
  expect(expenseQueue?.record_type).toBe('expense');
  assertQueuePointsToSource(saleQueue, sale);
  assertQueuePointsToSource(expenseQueue, expense);
  assertPayloadIsPrivacySafe(saleQueue.payload);
  assertPayloadIsPrivacySafe(expenseQueue.payload);
});

test('offline customer dubie and payment get cloud proof contract rows', async ({ page, context }) => {
  await startFreshShop(page);
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /add (your first )?customer/i }).click();
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Almaz Secret');
  await page.getByPlaceholder(/9x/i).fill('912345678');
  await page.getByRole('button', { name: /save customer/i }).click();
  await expect(page.getByText(/almaz secret/i)).toBeVisible();

  await context.setOffline(true);

  await page.getByRole('main').getByRole('button', { name: /^credit$/i }).click();
  await page.getByPlaceholder('0').fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Sugar private item');
  await page.getByRole('button', { name: /save (credit|dubie)/i }).click();
  await waitForStoreCount(page, 'customer_transactions', 1);

  await page.getByRole('main').getByRole('button', { name: /^payment$/i }).click();
  await page.getByPlaceholder('0').fill('80');
  await page.getByPlaceholder(/any note about this payment/i).fill('Cash private note');
  await page.getByRole('button', { name: /save payment/i }).click();
  await waitForStoreCount(page, 'customer_transactions', 2);

  const device = await readSetting(page, DEVICE_KEY);
  const customerTransactions = await readStore(page, 'customer_transactions');
  const credit = customerTransactions.find((row) => row.type === 'credit_add');
  const payment = customerTransactions.find((row) => row.type === 'payment');
  expect(credit).toBeTruthy();
  expect(payment).toBeTruthy();
  assertRecordHasContract(credit, device.value);
  assertRecordHasContract(payment, device.value);

  const queue = cloudRows(await readStore(page, 'sync_queue'));
  const creditQueue = queue.find((row) => row.record_table === 'customer_transactions' && row.record_id === credit.id);
  const paymentQueue = queue.find((row) => row.record_table === 'customer_transactions' && row.record_id === payment.id);
  expect(creditQueue?.record_type).toBe('customer_credit');
  expect(paymentQueue?.record_type).toBe('customer_payment');
  assertQueuePointsToSource(creditQueue, credit);
  assertQueuePointsToSource(paymentQueue, payment);
  expect(creditQueue.payload.customer_local_id).toBe(credit.customer_id);
  expect(paymentQueue.payload.customer_local_id).toBe(payment.customer_id);
  assertPayloadIsPrivacySafe(creditQueue.payload);
  assertPayloadIsPrivacySafe(paymentQueue.payload);
});

test('offline supplier purchase and payment get cloud proof contract rows', async ({ page, context }) => {
  await startFreshShop(page);
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /suppliers/i }).click();
  await page.getByRole('button', { name: /^add$/i }).click();
  await page.getByPlaceholder(/kiros coffee wholesale/i).fill('Kiros Secret Supplier');
  await page.getByRole('button', { name: /save supplier/i }).click();
  await expect(page.getByText(/kiros secret supplier/i)).toBeVisible();

  await context.setOffline(true);

  await page.getByRole('button', { name: /^buy$/i }).click();
  await page.getByPlaceholder('0').fill('400');
  await page.getByPlaceholder(/5 bags coffee/i).fill('Coffee private batch');
  await page.getByRole('button', { name: /save purchase/i }).click();
  await waitForStoreCount(page, 'supplier_transactions', 1);

  await page.getByRole('button', { name: /^pay$/i }).click();
  await page.getByPlaceholder('0').fill('150');
  await page.getByRole('button', { name: /save payment/i }).click();
  await waitForStoreCount(page, 'supplier_transactions', 2);

  const device = await readSetting(page, DEVICE_KEY);
  const supplierTransactions = await readStore(page, 'supplier_transactions');
  const purchase = supplierTransactions.find((row) => row.type === 'purchase_add');
  const payment = supplierTransactions.find((row) => row.type === 'supplier_payment');
  expect(purchase).toBeTruthy();
  expect(payment).toBeTruthy();
  assertRecordHasContract(purchase, device.value);
  assertRecordHasContract(payment, device.value);

  const queue = cloudRows(await readStore(page, 'sync_queue'));
  const purchaseQueue = queue.find((row) => row.record_table === 'supplier_transactions' && row.record_id === purchase.id);
  const paymentQueue = queue.find((row) => row.record_table === 'supplier_transactions' && row.record_id === payment.id);
  expect(purchaseQueue?.record_type).toBe('supplier_purchase');
  expect(paymentQueue?.record_type).toBe('supplier_payment');
  assertQueuePointsToSource(purchaseQueue, purchase);
  assertQueuePointsToSource(paymentQueue, payment);
  expect(purchaseQueue.payload.supplier_local_id).toBe(purchase.supplier_id);
  expect(paymentQueue.payload.supplier_local_id).toBe(payment.supplier_id);
  assertPayloadIsPrivacySafe(purchaseQueue.payload);
  assertPayloadIsPrivacySafe(paymentQueue.payload);
});

test('cloud proof queue failure does not block local save and telegram queue kind stays separate', async ({ page, context }) => {
  await startFreshShop(page);
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      tx.objectStore('sync_queue').add({
        kind: 'telegram_ledger_update',
        status: 'pending',
        record_table: 'customer_transactions',
        record_id: 9999,
        payload: { ledgerUpdate: { token: 'telegram-secret-token' } },
        created_at: Date.now(),
        updated_at: Date.now(),
        next_attempt_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    (window as any).__gebyaTestCloudProofQueueFailure = true;
  });

  await context.setOffline(true);
  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill('Queue failure sale');
  await page.getByPlaceholder('0').fill('75');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/queue failure sale/i)).toBeVisible();

  const transactions = await readStore(page, 'transactions');
  const saved = transactions.find((row) => row.item_name === 'Queue failure sale');
  expect(saved).toBeTruthy();
  expect(saved.transaction_id).toEqual(expect.any(String));

  const queue = await readStore(page, 'sync_queue');
  expect(queue.filter((row) => row.kind === 'telegram_ledger_update')).toHaveLength(1);
  expect(cloudRows(queue)).toHaveLength(0);
});

test('staff sale event queue failure does not block local sale save', async ({ page, context }) => {
  await startFreshShop(page);
  await page.evaluate(() => {
    (window as any).__gebyaTestStaffSaleQueueFailure = true;
  });

  await context.setOffline(true);
  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill('Staff event failure sale');
  await page.getByPlaceholder('0').fill('125');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/staff event failure sale/i)).toBeVisible();

  const transactions = await readStore(page, 'transactions');
  const saved = transactions.find((row) => row.item_name === 'Staff event failure sale');
  expect(saved).toBeTruthy();
  expect(saved.transaction_id).toEqual(expect.any(String));
  expect(saved.device_id).toEqual(expect.any(String));
  expect(saved.sync_status).toBe('local_only');

  const staffEvents = await readStore(page, 'staff_sale_events');
  const queue = await readStore(page, 'sync_queue');
  expect(staffEvents).toHaveLength(0);
  expect(queue.filter((row) => row.kind === STAFF_SALE_EVENT_KIND)).toHaveLength(0);
});

test('staff sale event remains pending when API persistence fails', async ({ page }) => {
  await page.route('**/api/staff-sales/events', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        accepted: false,
        error: 'DATABASE_URL is not configured. Staff sale event persistence is unavailable.',
        required_env: 'DATABASE_URL',
      }),
    });
  });
  await startFreshShop(page);

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill('Pending staff sync sale');
  await page.getByPlaceholder('0').fill('175');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/pending staff sync sale/i)).toBeVisible();

  await expect.poll(async () => {
    const transactions = await readStore(page, 'transactions');
    const staffEvents = await readStore(page, 'staff_sale_events');
    const queue = await readStore(page, 'sync_queue');
    const saved = transactions.find((row) => row.item_name === 'Pending staff sync sale');
    const event = staffEvents.find((row) => row.transaction_id === saved?.transaction_id);
    const queueRow = queue.find((row) => row.kind === STAFF_SALE_EVENT_KIND && row.transaction_id === saved?.transaction_id);
    return {
      saleSaved: Boolean(saved),
      eventStatus: event?.sync_status,
      queueStatus: queueRow?.status,
      hasError: Boolean(queueRow?.error),
    };
  }).toEqual({
    saleSaved: true,
    eventStatus: 'pending_sync',
    queueStatus: 'failed',
    hasError: true,
  });
});

test('staff sale event becomes synced after API persistence succeeds', async ({ page }) => {
  await page.route('**/api/staff-sales/events', async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        accepted: true,
        event_id: payload.event_id,
        transaction_id: payload.transaction_id,
        status: 'persisted',
        duplicate: false,
        received_at_server: '2026-06-07T00:00:00.000Z',
      }),
    });
  });
  await startFreshShop(page);

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill('Synced staff sale');
  await page.getByPlaceholder('0').fill('225');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/synced staff sale/i)).toBeVisible();

  await expect.poll(async () => {
    const transactions = await readStore(page, 'transactions');
    const staffEvents = await readStore(page, 'staff_sale_events');
    const queue = await readStore(page, 'sync_queue');
    const saved = transactions.find((row) => row.item_name === 'Synced staff sale');
    const event = staffEvents.find((row) => row.transaction_id === saved?.transaction_id);
    const queueRow = queue.find((row) => row.kind === STAFF_SALE_EVENT_KIND && row.transaction_id === saved?.transaction_id);
    return {
      saleSaved: Boolean(saved),
      eventStatus: event?.sync_status,
      queueStatus: queueRow?.status,
      receivedAt: event?.received_at_server,
      syncedAt: typeof event?.synced_at,
    };
  }).toEqual({
    saleSaved: true,
    eventStatus: 'synced',
    queueStatus: 'sent',
    receivedAt: '2026-06-07T00:00:00.000Z',
    syncedAt: 'number',
  });
});
