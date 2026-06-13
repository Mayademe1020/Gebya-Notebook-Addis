import { expect, test } from '@playwright/test';

test('offline typed sale is saved locally and survives reload', async ({ page, context }) => {
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

  await expect(page.getByRole('heading', { name: /tigist shop/i })).toBeVisible();

  await page.getByRole('button', { name: /^sale$/i }).click();
  await expect(page.getByText(/total amount/i)).toBeVisible();

  await context.setOffline(true);
  await page.getByPlaceholder('0').fill('250');
  await page.getByPlaceholder(/search item name or code/i).fill('Sugar');
  await page.getByRole('button', { name: /add item/i }).click();
  await page.getByRole('button', { name: /save 1 item .*250/i }).click();

  await expect(page.getByText(/saved on this phone .* syncs later/i)).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/^\+?250(?:\.00)? birr$/i)).toBeVisible();

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/^\+?250(?:\.00)? birr$/i)).toBeVisible();
});
