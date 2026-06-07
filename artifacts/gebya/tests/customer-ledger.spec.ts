import { expect, test } from '@playwright/test';

async function openFreshEnglishApp(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    window.localStorage.setItem('gebya_lang', 'en');
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('customer ledger flow stays trustworthy after reload', async ({ page }) => {
  await openFreshEnglishApp(page);

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
  await expect(page.getByRole('button', { name: /add (your first )?customer/i })).toBeVisible();
  await page.getByRole('button', { name: /add (your first )?customer/i }).click();

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Almaz');
  await page.getByRole('button', { name: /save customer/i }).click();

  await expect(page.getByText(/almaz/i)).toBeVisible();
  await expect(page.getByText(/owes me/i)).toBeVisible();
  await expect(page.getByText(/^0(?:\.00)?$/i)).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: /^credit$/i }).click();
  await page.getByPlaceholder('0').fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Sugar');
  await page.getByRole('button', { name: /save (credit|dubie)/i }).click();

  await expect(page.getByText(/250(?:\.00)?\s*birr/i).first()).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: /^payment$/i }).click();
  await page.getByPlaceholder('0').fill('80');
  await page.getByPlaceholder(/any note about this payment/i).fill('Cash');
  await page.getByRole('button', { name: /save payment/i }).click();

  await expect(page.getByText(/170(?:\.00)?\s*birr/i).first()).toBeVisible();
  await expect(page.getByText(/after:\s*170(?:\.00)?\s*birr/i)).toBeVisible();
  await expect(page.getByText(/after:\s*250(?:\.00)?\s*birr/i)).toBeVisible();

  await page.getByRole('button', { name: /back.*customers/i }).click();
  await page.getByPlaceholder(/search name or phone/i).fill('Alm');
  await expect(page.getByRole('button', { name: /almaz/i })).toBeVisible();
  await page.getByRole('button', { name: /almaz/i }).click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/today memory/i)).toBeVisible();
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByPlaceholder(/search name or phone/i).fill('Alm');
  await page.getByRole('button', { name: /almaz/i }).click();
  await expect(page.getByText(/almaz/i)).toBeVisible();
  await expect(page.getByText(/170(?:\.00)?\s*birr/i).first()).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/cash/i)).toBeVisible();
});

test('today memory shows due-today and overdue dubie from local ledger', async ({ page }) => {
  await openFreshEnglishApp(page);

  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const now = Date.now();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['settings', 'customers', 'customer_transactions'], 'readwrite');
      const settings = transaction.objectStore('settings');
      const customers = transaction.objectStore('customers');
      const customerTransactions = transaction.objectStore('customer_transactions');

      settings.put({ key: 'intro_seen', value: 'yes' });
      settings.put({ key: 'shop_name', value: 'Tigist Shop' });
      settings.put({ key: 'shop_phone', value: '' });
      settings.put({ key: 'shop_telegram', value: '' });

      const hana = customers.add({
        display_name: 'Hana',
        note: null,
        phone_number: null,
        created_at: now,
        updated_at: now,
      });
      const kedir = customers.add({
        display_name: 'Kedir',
        note: null,
        phone_number: null,
        created_at: now,
        updated_at: now,
      });

      hana.onsuccess = () => {
        customerTransactions.add({
          customer_id: hana.result,
          type: 'credit_add',
          amount: 3000,
          item_note: 'Telebirr promise',
          due_date: today.getTime(),
          created_at: now,
          updated_at: now,
        });
      };
      kedir.onsuccess = () => {
        customerTransactions.add({
          customer_id: kedir.result,
          type: 'credit_add',
          amount: 1200,
          item_note: 'Old balance',
          due_date: yesterday.getTime(),
          created_at: now - 1000,
          updated_at: now - 1000,
        });
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    db.close();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/today memory/i)).toBeVisible();
  await expect(page.getByText(/due today/i)).toBeVisible();
  await expect(page.getByText(/overdue/i)).toBeVisible();
  await expect(page.getByText(/hana/i)).toBeVisible();
  await expect(page.getByText(/3000 birr/i)).toBeVisible();
  await expect(page.getByText(/kedir/i)).toBeVisible();
  await expect(page.getByText(/1200 birr/i)).toBeVisible();
});
