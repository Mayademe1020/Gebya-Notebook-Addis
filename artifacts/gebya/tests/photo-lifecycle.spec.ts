import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

const photoFile = {
  name: 'proof.png',
  mimeType: 'image/png',
  buffer: tinyPng,
};

const replacementPhotoFile = {
  name: 'replacement.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#dc2626"/><circle cx="600" cy="400" r="240" fill="#fff"/></svg>'),
};

async function startEnglishShop(page) {
  await page.addInitScript(() => localStorage.setItem('gebya_lang', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key: 'shop_name', value: 'Photo Proof Shop' });
      tx.objectStore('settings').put({ key: 'shop_phone', value: '' });
      tx.objectStore('settings').put({ key: 'shop_business_type', value: 'retail-shop' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/photo proof shop/i)).toBeVisible();
}

async function seedEnglishShopWithCustomer(page, customerName = 'Photo Customer') {
  await page.addInitScript(() => localStorage.setItem('gebya_lang', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (name) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['settings', 'customers'], 'readwrite');
      tx.objectStore('settings').put({ key: 'shop_name', value: 'Photo Proof Shop' });
      tx.objectStore('settings').put({ key: 'shop_phone', value: '' });
      tx.objectStore('settings').put({ key: 'shop_business_type', value: 'retail-shop' });
      tx.objectStore('customers').add({
        display_name: name,
        phone_number: '',
        note: '',
        telegram_username: '',
        telegram_chat_id: null,
        telegram_notify_enabled: false,
        telegram_link_token: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, customerName);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/photo proof shop/i)).toBeVisible();
}

async function uploadTransactionPhoto(page) {
  await page.locator('input[type="file"][capture="environment"]').setInputFiles(photoFile);
  await expect(page.getByText(/photo attached/i)).toBeVisible();
}

async function clickBottomAction(page, label: RegExp) {
  await page.locator('button').filter({ hasText: label }).last().click();
}

async function openTransactionEditor(page, itemName: string) {
  await page.getByText(itemName, { exact: false }).click();
  await expect(page.getByRole('heading', { name: /edit/i })).toBeVisible();
}

async function saveEdit(page) {
  await page.getByRole('button', { name: /save changes/i }).click();
}

async function getTransactionPhoto(page, itemName: string) {
  return page.evaluate(async (name) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('transactions', 'readonly');
      const req = tx.objectStore('transactions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.find(row => row.item_name === name)?.photo || null;
  }, itemName);
}

test('sale photo is previewed, saved, visible on Today and History, and opens full viewer after reload', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Sale$/i);
  await page.getByPlaceholder(/add details/i).fill('Photo audit sale');
  await page.getByPlaceholder('0').first().fill('123');
  await uploadTransactionPhoto(page);
  await page.getByRole('button', { name: /save sale/i }).click();

  await expect(page.getByText(/photo audit sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/photo audit sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await page.getByRole('button', { name: /view transaction photo/i }).click();
  await expect(page.getByRole('dialog', { name: /view transaction photo/i })).toBeVisible();
  await page.getByRole('button', { name: /close/i }).click();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
});

test('sale edit mode can add, replace, and remove a transaction photo', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Sale$/i);
  await page.getByPlaceholder(/add details/i).fill('Edit photo sale');
  await page.getByPlaceholder('0').first().fill('111');
  await expect(page.getByText(/record by voice/i)).toHaveCount(0);
  await page.getByRole('button', { name: /save sale/i }).click();

  await expect(page.getByText(/edit photo sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toHaveCount(0);

  await openTransactionEditor(page, 'Edit photo sale');
  await expect(page.getByText(/voice/i)).toHaveCount(0);
  await page.locator('input[type="file"][capture="environment"]').setInputFiles(photoFile);
  await expect(page.getByText(/photo attached/i)).toBeVisible();
  await saveEdit(page);
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
  const firstPhoto = await getTransactionPhoto(page, 'Edit photo sale');
  expect(firstPhoto).toMatch(/^data:image\/jpeg;base64,/);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await openTransactionEditor(page, 'Edit photo sale');
  await page.locator('input[type="file"][capture="environment"]').setInputFiles(replacementPhotoFile);
  await expect(page.getByText(/photo attached/i)).toBeVisible();
  await saveEdit(page);
  const replacedPhoto = await getTransactionPhoto(page, 'Edit photo sale');
  expect(replacedPhoto).toMatch(/^data:image\/jpeg;base64,/);
  expect(replacedPhoto).not.toBe(firstPhoto);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await openTransactionEditor(page, 'Edit photo sale');
  await page.getByRole('button', { name: /remove photo/i }).click();
  await expect(page.getByText(/photo attached/i)).toHaveCount(0);
  await saveEdit(page);
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toHaveCount(0);
  expect(await getTransactionPhoto(page, 'Edit photo sale')).toBeNull();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/edit photo sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toHaveCount(0);
});

test('expense photo stays transaction-level and remains visible after reload', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Expense$/i);
  await page.getByPlaceholder(/add details/i).fill('Photo audit expense');
  await page.getByPlaceholder('0').first().fill('45');
  await uploadTransactionPhoto(page);
  await page.getByRole('button', { name: /save expense/i }).click();

  await expect(page.getByText(/photo audit expense/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/photo audit expense/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
});

test('expense edit mode can add a transaction photo', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Expense$/i);
  await page.getByPlaceholder(/add details/i).fill('Edit photo expense');
  await page.getByPlaceholder('0').first().fill('35');
  await page.getByRole('button', { name: /save expense/i }).click();

  await openTransactionEditor(page, 'Edit photo expense');
  await expect(page.getByText(/voice/i)).toHaveCount(0);
  await page.locator('input[type="file"][capture="environment"]').setInputFiles(photoFile);
  await expect(page.getByText(/photo attached/i)).toBeVisible();
  await saveEdit(page);
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/edit photo expense/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
});

test('pay later sale copies transaction photo into the generated customer Dubie row', async ({ page }) => {
  await seedEnglishShopWithCustomer(page);

  await clickBottomAction(page, /^Sale$/i);
  await page.getByPlaceholder(/add details/i).fill('Photo pay later sale');
  await page.getByPlaceholder('0').first().fill('300');
  await uploadTransactionPhoto(page);
  await page.getByRole('button', { name: /later/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await page.getByRole('button', { name: /save sale/i }).click();

  await expect(page.getByText(/photo pay later sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await expect(page.getByText(/photo pay later sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view item photo/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await expect(page.getByRole('button', { name: /view item photo/i })).toBeVisible();
});

test('direct Dubie photo remains visible after reload and payment rows stay photo-free', async ({ page }) => {
  await seedEnglishShopWithCustomer(page);

  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await page.locator('main').getByRole('button', { name: /^credit$/i }).click();
  await page.getByPlaceholder('0').first().fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Direct photo dubie');
  await page.getByRole('button', { name: /item photo/i }).click();
  await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles(photoFile);
  await expect(page.getByText(/item photo attached/i)).toBeVisible();
  await page.getByRole('button', { name: /save credit/i }).click();

  await expect(page.getByText(/direct photo dubie/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view item photo/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await expect(page.getByRole('button', { name: /view item photo/i })).toBeVisible();

  await page.getByRole('button', { name: /payment/i }).click();
  await page.getByPlaceholder('0').first().fill('50');
  await page.getByRole('button', { name: /save payment/i }).click();
  await expect(page.getByRole('button', { name: /view item photo/i })).toHaveCount(1);
});
