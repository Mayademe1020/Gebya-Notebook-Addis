import { expect, test, type Page } from '@playwright/test';

const STAFF_EVENT_KIND = 'staff_event_push';

async function deleteGebyaDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
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

async function updateStaffQueueRows(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(async ({ kind, patch }) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          for (const row of getAll.result) {
            if (row.kind === kind) store.put({ ...row, ...patch });
          }
        };
        getAll.onerror = () => reject(getAll.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, { kind: STAFF_EVENT_KIND, patch });
}

async function mockOwnerIdentity(page: Page) {
  await page.route('**/api/shops', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        shop_id: 'shop-test-1',
        shop_name: 'Tigist Shop',
        join_code: 'TEST-CODE',
        join_url: 'http://127.0.0.1:4173/?join=TEST-CODE',
        device_id: 'device-owner-1',
        device_token: 'owner-token',
        staff_id: 'staff-owner-1',
        display_name: 'Tigist',
        role: 'owner',
        permissions: { can_create_sale: true, can_create_customer_payment: true, can_create_customer_credit: true },
        device_status: 'active',
        phone_required: false,
        approval_required: false,
      }),
    });
  });
}

async function startFreshOwner(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  await mockOwnerIdentity(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await deleteGebyaDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /own.*manage a shop/i }).click();
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await expect(page.getByRole('heading', { name: /tigist shop/i })).toBeVisible();
}

function staffRows(rows: any[]) {
  return rows.filter((row) => row.kind === STAFF_EVENT_KIND);
}

async function saveSale(page: Page, item: string, amount: string) {
  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill(item);
  await page.getByPlaceholder('0').fill(amount);
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(new RegExp(item, 'i'))).toBeVisible();
}

async function addCustomer(page: Page, name: string) {
  await page.locator('nav').getByRole('button', { name: /credit|dubie/i }).click();
  await page.getByRole('button', { name: /add (your first )?customer/i }).click();
  await page.getByPlaceholder(/e\.g\. tigist|name, nickname/i).fill(name);
  await page.getByRole('button', { name: /save customer/i }).click();
  await expect(page.getByText(new RegExp(name, 'i'))).toBeVisible();
}

async function saveCustomerPayment(page: Page, amount: string) {
  await page.getByRole('main').getByRole('button', { name: /^payment$/i }).click();
  await page.getByPlaceholder('0').fill(amount);
  await page.getByPlaceholder(/any note about this payment/i).fill('Cash');
  await page.getByRole('button', { name: /save payment/i }).click();
}

async function saveCustomerCredit(page: Page, amount: string) {
  await page.getByRole('main').getByRole('button', { name: /^credit$/i }).click();
  await page.getByPlaceholder('0').fill(amount);
  await page.getByPlaceholder(/what they took/i).fill('Sugar');
  await page.getByRole('button', { name: /save (credit|dubie)/i }).click();
}

test('offline sale queues a staff event and keeps the local ledger after reload', async ({ page, context }) => {
  await startFreshOwner(page);
  await context.setOffline(true);

  await saveSale(page, 'Queue Sale', '250');

  const transactions = await readStore(page, 'transactions');
  const sale = transactions.find((row) => row.item_name === 'Queue Sale');
  expect(sale).toBeTruthy();

  const queueRows = staffRows(await readStore(page, 'sync_queue'));
  expect(queueRows).toHaveLength(1);
  expect(queueRows[0]).toMatchObject({
    status: 'pending',
    event_type: 'sale',
    shop_id: 'shop-test-1',
    device_id: 'device-owner-1',
    record_table: 'transactions',
    record_id: sale.id,
  });
  expect(queueRows[0].payload).toMatchObject({
    client_event_id: `device-owner-1:${sale.transaction_id}`,
    record_id: String(sale.id),
    actor_staff_member_id: 'staff-owner-1',
    actor_name_snapshot: 'Tigist Shop',
    actor_role_at_event: 'owner',
    event_type: 'sale',
    schema_version: 1,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/queue sale/i)).toBeVisible();
  expect(staffRows(await readStore(page, 'sync_queue'))).toHaveLength(1);
});

test('offline customer payment queues a staff event', async ({ page, context }) => {
  await startFreshOwner(page);
  await addCustomer(page, 'Almaz');
  await context.setOffline(true);

  await saveCustomerCredit(page, '200');
  await saveCustomerPayment(page, '80');
  await expect.poll(async () => staffRows(await readStore(page, 'sync_queue')).length).toBe(2);

  const queueRows = staffRows(await readStore(page, 'sync_queue'));
  const paymentRow = queueRows.find((row) => row.event_type === 'customer_payment');
  expect(paymentRow).toMatchObject({
    status: 'pending',
    event_type: 'customer_payment',
    shop_id: 'shop-test-1',
    device_id: 'device-owner-1',
    record_table: 'customer_transactions',
  });
  expect(paymentRow.payload.payload).toMatchObject({
    amount: 80,
    payment_method_label: null,
  });
});

test('temporary push failure retries and sync success does not delete local records', async ({ page }) => {
  await startFreshOwner(page);

  let eventPushAttempts = 0;
  await page.route('**/api/events/push', async (route) => {
    eventPushAttempts += 1;
    if (eventPushAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'temporary outage' }),
      });
      return;
    }

    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: body.events.map((event: any) => ({
          client_event_id: event.client_event_id,
          event_id: `server-${event.client_event_id}`,
          status: 'accepted',
        })),
      }),
    });
  });

  await saveSale(page, 'Retry Sale', '110');
  await expect.poll(async () => staffRows(await readStore(page, 'sync_queue'))[0]?.status).toBe('failed');

  await updateStaffQueueRows(page, { next_attempt_at: Date.now() - 1000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect.poll(async () => staffRows(await readStore(page, 'sync_queue'))[0]?.status).toBe('synced');
  const syncedRow = staffRows(await readStore(page, 'sync_queue'))[0];
  expect(syncedRow.server_event_id).toEqual(expect.stringContaining('server-device-owner-1'));

  const transactions = await readStore(page, 'transactions');
  expect(transactions.find((row) => row.item_name === 'Retry Sale')).toBeTruthy();
});
