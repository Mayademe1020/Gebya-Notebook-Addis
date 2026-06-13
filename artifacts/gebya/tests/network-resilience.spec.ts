import { expect, test, type Page } from '@playwright/test';

async function seedShopProfile(page: Page, shopName = 'Tigist Shop') {
  await page.evaluate(async (name) => {
    const request = window.indexedDB.open('GebyaDB');

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      store.put({ key: 'intro_seen', value: 'yes' });
      store.put({ key: 'shop_name', value: name });
      store.put({ key: 'shop_phone', value: '' });
      store.put({ key: 'shop_telegram', value: '' });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    db.close();
  }, shopName);
}

test('core notebook actions still work while offline', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  const page = await context.newPage();

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await seedShopProfile(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event('offline'));
  });

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/amount, item, code, or note/i).fill('Offline sale 120');
  await page.getByRole('button', { name: /save 1 item .*120/i }).click();

  await expect(page.getByText(/offline sale/i)).toBeVisible();
  await expect(page.getByText(/120(?:\.00)? birr/i).first()).toBeVisible();

  await context.close();
});

test('slow-network guidance shows before telegram flow', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await seedShopProfile(page);
  await page.evaluate(() => {
    window.localStorage.setItem('gebya_test_connection', JSON.stringify({
      effectiveType: '2g',
      saveData: false,
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /add (your first )?customer/i }).click();
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Slow Network Buyer');
  await page.getByPlaceholder(/@username, t\.me/i).fill('@slowbuyer');
  await page.getByRole('button', { name: /save customer/i }).click();

  await expect(page.getByText(/slow network buyer/i)).toBeVisible();
  await page.getByRole('button', { name: /\+?\s*link/i }).click();
  await expect(page.getByText(/telegram service is unavailable right now/i)).toBeVisible();

  await context.close();
});
