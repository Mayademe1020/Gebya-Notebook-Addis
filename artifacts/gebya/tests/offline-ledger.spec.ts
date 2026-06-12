import { expect, test } from '@playwright/test';

test('offline dubie save keeps the record and explains Telegram needs internet', async ({ page, context }) => {
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
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /add (your first )?customer/i }).click();

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Almaz');
  await page.getByPlaceholder(/@username, t\.me/i).fill('@almaz_shop');
  await page.getByRole('button', { name: /save customer/i }).click();

  await expect(page.getByText('Almaz', { exact: true })).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: /^(add )?(credit|dubie)$/i }).click();
  await expect(page.getByPlaceholder('0')).toBeVisible();

  await context.setOffline(true);
  await page.getByPlaceholder('0').fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Sugar');
  await page.getByRole('button', { name: /save (credit|dubie)/i }).click();

  await expect(page.getByText(/saved on this phone/i)).toBeVisible();
  await expect(page.getByText(/\+?250(?:\.00)?/i).first()).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByPlaceholder(/search name or phone/i).fill('Alm');
  await page.getByRole('button', { name: /almaz/i }).click();
  await expect(page.getByText(/\+?250(?:\.00)?/i).first()).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
});
