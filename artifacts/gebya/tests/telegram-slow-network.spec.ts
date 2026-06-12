import { expect, test } from '@playwright/test';

async function ensureEnglish(page) {
  const switchToEnglish = page.getByRole('button', { name: /switch to english/i });
  if (await switchToEnglish.isVisible().catch(() => false)) {
    await switchToEnglish.click();
  }
}

test('telegram connect sheet avoids automatic API chatter on slow connection', async ({ page }) => {
  let telegramRequestCount = 0;

  await page.addInitScript(() => {
    localStorage.setItem('gebya_lang', 'en');
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        effectiveType: '3g',
        saveData: false,
      },
    });
  });

  await page.route('**/api/telegram/**', async (route) => {
    telegramRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        bot_username: 'gebya_bot',
      }),
    });
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
      const settingsTx = db.transaction('settings', 'readwrite');
      const settingsStore = settingsTx.objectStore('settings');
      settingsStore.put({ key: 'intro_seen', value: 'yes' });
      settingsStore.put({ key: 'shop_name', value: 'Tigist Shop' });
      settingsStore.put({ key: 'shop_phone', value: '' });
      settingsStore.put({ key: 'shop_telegram', value: '' });
      settingsTx.oncomplete = () => resolve();
      settingsTx.onerror = () => reject(settingsTx.error);
      settingsTx.onabort = () => reject(settingsTx.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['customers', 'customer_transactions'], 'readwrite');
      tx.objectStore('customers').add({
        display_name: 'Almaz',
        note: '',
        phone_number: '',
        telegram_username: '@almaz',
        telegram_chat_id: null,
        telegram_notify_enabled: false,
        telegram_link_token: 'cust-1-slow-test',
        telegram_linked_at: null,
        telegram_link_requested_at: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureEnglish(page);
  await page.getByRole('navigation').getByRole('button', { name: /credit|dubie/i }).click();
  await page.getByRole('button', { name: /almaz/i }).click();
  await page.getByRole('button', { name: /manual telegram|\+ link/i }).click();

  await expect(page.getByRole('link', { name: /open telegram & link/i })).toBeVisible();

  await page.waitForTimeout(1000);
  expect(telegramRequestCount).toBe(0);
});

test('linked customer telegram sheet can resend the latest update', async ({ page }) => {
  let resendRequestCount = 0;

  await page.addInitScript(() => {
    localStorage.setItem('gebya_lang', 'en');
  });

  await page.route('**/api/telegram/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/telegram/resend-latest')) {
      resendRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ delivered: true }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        bot_username: 'gebya_bot',
        delivered: true,
      }),
    });
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
      const settingsTx = db.transaction('settings', 'readwrite');
      const settingsStore = settingsTx.objectStore('settings');
      settingsStore.put({ key: 'intro_seen', value: 'yes' });
      settingsStore.put({ key: 'shop_name', value: 'Tigist Shop' });
      settingsStore.put({ key: 'shop_phone', value: '' });
      settingsStore.put({ key: 'shop_telegram', value: '' });
      settingsTx.oncomplete = () => resolve();
      settingsTx.onerror = () => reject(settingsTx.error);
      settingsTx.onabort = () => reject(settingsTx.error);
    });

    await new Promise<void>((resolve, reject) => {
      const now = Date.now();
      const tx = db.transaction(['customers', 'customer_transactions'], 'readwrite');
      tx.objectStore('customers').add({
        display_name: 'Bekele',
        note: '',
        phone_number: '',
        telegram_username: '@bekele',
        telegram_chat_id: '123456',
        telegram_notify_enabled: true,
        telegram_link_token: 'cust-linked-resend',
        telegram_linked_at: now,
        telegram_link_requested_at: now,
        created_at: now,
        updated_at: now,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureEnglish(page);
  await page.getByRole('navigation').getByRole('button', { name: /credit|dubie/i }).click();
  await page.getByRole('button', { name: /bekele/i }).click();
  await page.getByRole('button', { name: /bot connected|manage/i }).click();

  await expect(page.getByRole('button', { name: /resend latest update/i })).toBeVisible();
  await page.getByRole('button', { name: /resend latest update/i }).click();

  await expect(page.getByText(/latest borrower update sent again/i)).toBeVisible();
  expect(resendRequestCount).toBe(1);
});

test('telegram connect sheet saves detected bot link automatically', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gebya_lang', 'en');
  });

  await page.route('**/api/telegram/**', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST' && url.includes('/api/telegram/link-sessions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'cust-auto-link',
          bot_username: 'gebya_bot',
          requested_at: Date.now(),
          chat_id: null,
          telegram_username: null,
          linked_at: null,
        }),
      });
      return;
    }

    if (url.includes('/api/telegram/link-sessions/cust-auto-link')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'cust-auto-link',
          bot_username: 'gebya_bot',
          requested_at: Date.now() - 1000,
          chat_id: '987654',
          telegram_username: '@hana_customer',
          linked_at: Date.now(),
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        bot_username: 'gebya_bot',
        delivered: true,
      }),
    });
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
      const settingsTx = db.transaction('settings', 'readwrite');
      const settingsStore = settingsTx.objectStore('settings');
      settingsStore.put({ key: 'intro_seen', value: 'yes' });
      settingsStore.put({ key: 'shop_name', value: 'Tigist Shop' });
      settingsStore.put({ key: 'shop_phone', value: '' });
      settingsStore.put({ key: 'shop_telegram', value: '' });
      settingsTx.oncomplete = () => resolve();
      settingsTx.onerror = () => reject(settingsTx.error);
      settingsTx.onabort = () => reject(settingsTx.error);
    });

    await new Promise<void>((resolve, reject) => {
      const now = Date.now();
      const tx = db.transaction(['customers', 'customer_transactions'], 'readwrite');
      tx.objectStore('customers').add({
        display_name: 'Hana',
        note: '',
        phone_number: '',
        telegram_username: '@hana',
        telegram_chat_id: null,
        telegram_notify_enabled: false,
        telegram_link_token: 'cust-auto-link',
        telegram_linked_at: null,
        telegram_link_requested_at: now,
        created_at: now,
        updated_at: now,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureEnglish(page);
  await page.getByRole('navigation').getByRole('button', { name: /credit|dubie/i }).click();
  await page.getByRole('button', { name: /hana/i }).click();
  await page.getByRole('button', { name: /manual telegram|\+ link/i }).click();

  await expect(page.getByText(/connect the customer in telegram/i)).toBeVisible();
  await expect(page.getByText(/Gebya detects and saves it automatically/i)).toBeVisible();
  await page.getByRole('button', { name: /check again/i }).click();

  await expect(page.getByText(/telegram connected/i)).toBeVisible();

  const savedCustomer = await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const customers = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('customers', 'readonly');
      const req = tx.objectStore('customers').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return customers.find(customer => customer.display_name === 'Hana');
  });

  expect(savedCustomer.telegram_chat_id).toBe('987654');
  expect(savedCustomer.telegram_username).toBe('@hana_customer');
});
