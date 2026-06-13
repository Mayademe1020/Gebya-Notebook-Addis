import { expect, test } from '@playwright/test';

async function seedShopProfile(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      store.put({ key: 'intro_seen', value: 'yes' });
      store.put({ key: 'shop_name', value: 'Tigist Shop' });
      store.put({ key: 'shop_phone', value: '' });
      store.put({ key: 'shop_telegram', value: '' });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    db.close();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.getByText(/today memory/i)).toBeVisible();
}

async function readQuickNotes(page) {
  return page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const result = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('quick_notes', 'readonly');
      const getAll = tx.objectStore('quick_notes').getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return result;
  });
}

async function readCustomerLedger(page) {
  return page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const result = await new Promise<{ customers: any[]; transactions: any[] }>((resolve, reject) => {
      const tx = db.transaction(['customers', 'customer_transactions'], 'readonly');
      const customersReq = tx.objectStore('customers').getAll();
      const transactionsReq = tx.objectStore('customer_transactions').getAll();
      tx.oncomplete = () => resolve({
        customers: customersReq.result,
        transactions: transactionsReq.result,
      });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return result;
  });
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

test('quick memory saves locally and survives refresh', async ({ page, context }) => {
  await seedShopProfile(page);
  await context.setOffline(true);

  await page.getByRole('button', { name: /memory/i }).click();
  await page.getByPlaceholder(/dawit 1500 friday/i).fill('Dawit 1500 Friday');
  await page.getByRole('button', { name: /save on this phone/i }).click();

  await expect(page.getByText(/memory saved on this phone/i)).toBeVisible();
  await expect(page.getByText(/dawit 1500 friday/i)).toBeVisible();

  const savedNotes = await readQuickNotes(page);
  expect(savedNotes).toHaveLength(1);
  expect(savedNotes[0]).toMatchObject({
    raw_text: 'Dawit 1500 Friday',
    type: 'other',
    status: 'pending',
  });
  expect(savedNotes[0].transaction_id).toBeTruthy();
  expect(savedNotes[0].device_id).toBeTruthy();

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/dawit 1500 friday/i)).toBeVisible();

  await page.getByRole('button', { name: /dismiss note/i }).click();
  await expect.poll(async () => {
    const notes = await readQuickNotes(page);
    return notes[0]?.status;
  }).toBe('dismissed');
});

test('quick memory optional fields show on Today and can be marked done', async ({ page }) => {
  await seedShopProfile(page);

  await page.getByRole('button', { name: /memory/i }).click();
  await page.getByPlaceholder(/dawit 1500 friday/i).fill('Pay Ahmed supplier tomorrow');
  await page.getByRole('button', { name: /^supplier$/i }).click();
  await page.getByPlaceholder(/ahmed/i).fill('Ahmed');
  await page.getByRole('textbox', { name: '1500', exact: true }).fill('8000');
  await page.locator('input[type="date"]').fill(todayInputValue());
  await page.getByRole('button', { name: /save on this phone/i }).click();

  await expect(page.getByText(/due today/i)).toBeVisible();
  await expect(page.getByText(/^ahmed$/i)).toBeVisible();
  await expect(page.getByText(/8000 birr/i)).toBeVisible();
  await expect(page.getByText(/supplier/i)).toBeVisible();

  const savedNotes = await readQuickNotes(page);
  expect(savedNotes).toHaveLength(1);
  expect(savedNotes[0]).toMatchObject({
    raw_text: 'Pay Ahmed supplier tomorrow',
    person_name: 'Ahmed',
    amount: 8000,
    type: 'supplier',
    status: 'pending',
  });
  expect(savedNotes[0].due_date).toBeGreaterThan(0);

  await page.getByRole('button', { name: /mark done/i }).click();
  await expect.poll(async () => {
    const notes = await readQuickNotes(page);
    return notes[0]?.status;
  }).toBe('done');
  await expect(page.getByText(/^ahmed$/i)).not.toBeVisible();
});

test('dubie quick memory converts into customer ledger offline', async ({ page, context }) => {
  await seedShopProfile(page);
  await context.setOffline(true);

  await page.getByRole('button', { name: /memory/i }).click();
  await page.getByPlaceholder(/dawit 1500 friday/i).fill('Hana took sugar from shelf');
  await page.getByRole('button', { name: /^dubie$/i }).click();
  await page.getByPlaceholder(/ahmed/i).fill('Hana');
  await page.getByRole('textbox', { name: '1500', exact: true }).fill('500');
  await page.locator('input[type="date"]').fill(todayInputValue());
  await page.getByRole('button', { name: /save on this phone/i }).click();

  await expect(page.getByText(/due today/i)).toBeVisible();
  await expect(page.getByText(/^hana$/i)).toBeVisible();
  await page.getByRole('button', { name: /convert to dubie/i }).click();
  await expect(page.getByText(/memory converted to dubie/i)).toBeVisible();

  await expect.poll(async () => {
    const notes = await readQuickNotes(page);
    return notes[0]?.status;
  }).toBe('converted');

  const ledger = await readCustomerLedger(page);
  expect(ledger.customers).toHaveLength(1);
  expect(ledger.customers[0]).toMatchObject({ display_name: 'Hana' });
  expect(ledger.transactions).toHaveLength(1);
  expect(ledger.transactions[0]).toMatchObject({
    customer_id: ledger.customers[0].id,
    type: 'credit_add',
    amount: 500,
    item_note: 'Hana took sugar from shelf',
    converted_from_quick_note_id: expect.any(Number),
  });
  expect(ledger.transactions[0].due_date).toBeGreaterThan(0);

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByPlaceholder(/search name or phone/i).fill('Han');
  await page.getByRole('button', { name: /hana/i }).click();
  await expect(page.getByText(/500(?:\.00)?\s*birr/i).first()).toBeVisible();
  await expect(page.getByText(/hana took sugar from shelf/i)).toBeVisible();
});
