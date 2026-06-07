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

  await expect(page.getByText(/^almaz$/i)).toBeVisible();
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const customer = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction('customers', 'readonly');
      const getAll = tx.objectStore('customers').getAll();
      getAll.onsuccess = () => resolve(getAll.result.find((row) => row.display_name === 'Almaz'));
      getAll.onerror = () => reject(getAll.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('customers', 'readwrite');
      tx.objectStore('customers').put({
        ...customer,
        telegram_notify_enabled: true,
        telegram_chat_id: 'offline-ledger-chat',
        telegram_link_token: 'offline-ledger-token',
        telegram_linked_at: Date.now(),
        updated_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /almaz/i }).click();

  await context.setOffline(true);

  await page.getByRole('main').getByRole('button', { name: /^credit$/i }).click();
  await page.getByPlaceholder('0').fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Sugar');
  await page.getByRole('button', { name: /save (credit|dubie)/i }).click();

  await expect(page.getByText(/saved on this phone/i)).toBeVisible();
  async function readTelegramState() {
    return page.evaluate(async () => {
      const request = window.indexedDB.open('GebyaDB');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const result = await new Promise<any>((resolve, reject) => {
        const tx = db.transaction(['customer_transactions', 'sync_queue'], 'readonly');
        const customerRequest = tx.objectStore('customer_transactions').getAll();
        const queueRequest = tx.objectStore('sync_queue').getAll();
        tx.oncomplete = () => {
          const latest = customerRequest.result.at(-1);
          resolve({
            deliveryState: latest?.telegram_delivery_state,
            telegramQueueCount: queueRequest.result.filter((row) => row.kind === 'telegram_ledger_update').length,
          });
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      return result;
    });
  }
  await expect.poll(async () => (await readTelegramState()).deliveryState).toBe('bot_waiting_for_connection');
  const telegramState = await readTelegramState();
  expect(telegramState.telegramQueueCount).toBe(1);
  await expect(page.getByText(/250(?:\.00)?\s*birr/i).first()).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /almaz/i }).click();
  await expect(page.getByText(/250(?:\.00)?\s*birr/i).first()).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
});
