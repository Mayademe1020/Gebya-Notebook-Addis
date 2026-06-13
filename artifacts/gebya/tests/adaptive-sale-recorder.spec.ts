import { expect, test, type Page } from '@playwright/test';

async function resetDb(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
}

async function startEnglishNotebook(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'intro_seen', value: 'yes' });
      store.put({ key: 'shop_name', value: 'Tigist Shop' });
      store.put({ key: 'shop_phone', value: '' });
      store.put({ key: 'shop_telegram', value: '' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /tigist shop/i })).toBeVisible();
}

async function seedCatalog(page: Page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('catalog_entries', 'readwrite');
        const store = tx.objectStore('catalog_entries');
        store.add({
          name: 'Charger',
          code: 'CH-01',
          kind: 'item',
          default_price: 470,
          active: true,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

async function readSavedSale(page: Page) {
  return page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const getAll = store.getAll();
        getAll.onsuccess = () => resolve(getAll.result.find((row: any) => row.type === 'sale') || null);
        getAll.onerror = () => reject(getAll.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

test('amount stays separate from optional item details and records mismatch basis', async ({ page }) => {
  await startEnglishNotebook(page);
  await seedCatalog(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /^sale$/i }).click();
  await expect(page.getByText(/total amount/i)).toBeVisible();

  await page.getByPlaceholder('0').fill('500');
  await expect(page.getByText(/500(?:\.00)? ETB/i).first()).toBeVisible();

  await page.getByPlaceholder(/search item name or code/i).fill('ch');
  await expect(page.getByRole('button', { name: /charger/i })).toBeVisible();
  await page.getByRole('button', { name: /charger/i }).click();

  await expect(page.getByText(/entered total 500/i)).toBeVisible();
  await expect(page.getByText(/item subtotal 470/i)).toBeVisible();
  await page.getByRole('button', { name: /use entered total 500/i }).click();
  await page.getByRole('button', { name: /save 1 item .*500/i }).click();

  await expect.poll(async () => readSavedSale(page)).not.toBeNull();
  const saved = await readSavedSale(page);

  expect(saved.item_name).toBe('Charger');
  expect(saved.amount).toBe(500);
  expect(saved.entered_total).toBe(500);
  expect(saved.items_subtotal).toBe(470);
  expect(saved.amount_basis).toBe('entered');
  expect(saved.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Charger', line_total: 470 }),
  ]));
});

test('calculator writes the amount field without permanently occupying the form', async ({ page }) => {
  await startEnglishNotebook(page);

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByRole('button', { name: /calculator/i }).click();
  await page.getByPlaceholder(/350 \+ 250/i).fill('350+250');
  await page.getByRole('button', { name: /done .*600/i }).click();

  await expect(page.getByPlaceholder('0')).toHaveValue('600');
  await expect(page.getByPlaceholder(/350 \+ 250/i)).toHaveCount(0);
});

test('selecting the same suggested item twice merges quantity and updates save label', async ({ page }) => {
  await startEnglishNotebook(page);
  await seedCatalog(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder('0').fill('940');
  await page.getByPlaceholder(/search item name or code/i).fill('ch');
  await page.getByRole('button', { name: /charger/i }).click();
  await page.getByPlaceholder(/search item name or code/i).fill('ch');
  await page.getByRole('button', { name: /charger/i }).click();

  await expect(page.getByText(/qty:\s*2/i)).toBeVisible();
  await expect(page.getByText(/items subtotal \(2 units\)/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /save 2 items .*940/i })).toBeVisible();
});

test('new typed sale item is learned locally for recent items after reload', async ({ page }) => {
  await startEnglishNotebook(page);

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder('0').fill('123');
  await page.getByPlaceholder(/search item name or code/i).fill('New Gum');
  await page.getByRole('button', { name: /add item/i }).click();
  await page.getByRole('button', { name: /save 1 item .*123/i }).click();
  await expect.poll(async () => readSavedSale(page)).toEqual(expect.objectContaining({
    item_name: 'New Gum',
    amount: 123,
  }));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /tigist shop/i })).toBeVisible();

  await page.getByRole('button', { name: /^sale$/i }).click();
  await expect(page.getByText(/recent \/ most sold/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Gum', exact: true })).toBeVisible();

  const catalog = await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction('catalog_entries', 'readonly');
        const store = tx.objectStore('catalog_entries');
        const getAll = store.getAll();
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });

  expect(catalog).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'New Gum',
      default_price: 123,
      use_count: 1,
    }),
  ]));
});
