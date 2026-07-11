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

const thirdPhotoFile = {
  name: 'third.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#2563eb"/><rect x="180" y="280" width="540" height="540" fill="#facc15"/></svg>'),
};

const legacyPhoto =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=';

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

async function seedEnglishShopWithSupplier(page, supplierName = 'Photo Supplier') {
  await page.addInitScript(() => localStorage.setItem('gebya_lang', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (name) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['settings', 'suppliers'], 'readwrite');
      tx.objectStore('settings').put({ key: 'shop_name', value: 'Photo Proof Shop' });
      tx.objectStore('settings').put({ key: 'shop_phone', value: '' });
      tx.objectStore('settings').put({ key: 'shop_business_type', value: 'retail-shop' });
      tx.objectStore('suppliers').add({
        display_name: name,
        phone_number: '',
        note: '',
        active: true,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, supplierName);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/photo proof shop/i)).toBeVisible();
}

async function clickBottomAction(page, label: RegExp) {
  await page.locator('button').filter({ hasText: label }).last().click();
}

async function uploadTransactionPhotos(page, files = [photoFile]) {
  for (const file of files) {
    await page.getByRole('button', { name: /take or choose photo/i }).click();
    await expect(page.getByText(/choose from gallery/i)).toBeVisible();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByText(/choose from gallery/i).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(file);
  }
  await expect(page.getByText(new RegExp(`${files.length}/3`))).toBeVisible();
}

async function addCameraModalPhoto(page, file, expectedCount: number) {
  await page.getByRole('button', { name: /take or choose photo/i }).click();
  await expect(page.getByText(/choose from gallery/i)).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText(/choose from gallery/i).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await expect(page.getByText(new RegExp(`${expectedCount}/3`))).toBeVisible();
}

async function openTransactionEditor(page, itemName: string) {
  await page.getByText(itemName, { exact: false }).click();
  await expect(page.getByRole('heading', { name: /edit/i })).toBeVisible();
}

async function saveEdit(page) {
  await page.getByRole('button', { name: /save changes/i }).click();
}

async function getTransactionRecord(page, itemName: string) {
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
    return rows.find(row => row.item_name === name) || null;
  }, itemName);
}

async function getCustomerTransactionRecord(page, itemNote: string) {
  return page.evaluate(async (note) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('customer_transactions', 'readonly');
      const req = tx.objectStore('customer_transactions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.find(row => row.item_note === note) || null;
  }, itemNote);
}

async function getSupplierTransactionRecord(page, itemName: string) {
  return page.evaluate(async (name) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('supplier_transactions', 'readonly');
      const req = tx.objectStore('supplier_transactions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.find(row => row.item_name === name) || null;
  }, itemName);
}

async function getSupplierPaymentRecords(page) {
  return page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('supplier_transactions', 'readonly');
      const req = tx.objectStore('supplier_transactions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.filter(row => row.type === 'supplier_payment');
  });
}

async function seedLegacySaleWithPhoto(page) {
  await page.evaluate(async (photo) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      tx.objectStore('transactions').add({
        type: 'sale',
        item_name: 'Legacy proof sale',
        quantity: 1,
        amount: 77,
        cost_price: 0,
        profit: null,
        payment_type: 'cash',
        payment_provider: null,
        customer_phone: null,
        direction: null,
        due_date: null,
        photo,
        photo_taken_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, legacyPhoto);
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('sale supports up to three proof photos and keeps legacy first-photo fields', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Sale$/i);
  await page.getByPlaceholder(/add details/i).fill('Multi photo sale');
  await page.getByPlaceholder('0').first().fill('123');
  await uploadTransactionPhotos(page, [photoFile, replacementPhotoFile, thirdPhotoFile]);
  await expect(page.getByText(/3\/3/)).toBeVisible();
  await page.getByRole('button', { name: /save sale/i }).click();

  const saved = await getTransactionRecord(page, 'Multi photo sale');
  expect(saved?.photos).toHaveLength(3);
  expect(saved?.photo).toBe(saved.photos[0].dataUrl);
  expect(saved?.photo_taken_at).toBe(saved.photos[0].taken_at);

  await expect(page.getByText(/multi photo sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
  await expect(page.getByText('+2')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
  await page.getByRole('button', { name: /view transaction photo/i }).click();
  await expect(page.getByRole('dialog', { name: /view transaction photo/i })).toBeVisible();
  await page.getByRole('button', { name: /next photo/i }).click();
  await expect(page.getByText('2/3')).toBeVisible();
  await page.getByRole('button', { name: /close/i }).click();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
});

test('sale edit mode can add, replace, and remove individual proof photos', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Sale$/i);
  await page.getByPlaceholder(/add details/i).fill('Edit multi photo sale');
  await page.getByPlaceholder('0').first().fill('111');
  await expect(page.getByText(/record by voice/i)).toHaveCount(0);
  await page.getByRole('button', { name: /save sale/i }).click();

  await expect(page.getByRole('button', { name: /view transaction photo/i })).toHaveCount(0);
  await openTransactionEditor(page, 'Edit multi photo sale');
  await expect(page.getByText(/voice/i)).toHaveCount(0);
  await page.getByRole('button', { name: /take or choose photo/i }).click();
  const editChooser1 = page.waitForEvent('filechooser');
  await page.getByText(/choose from gallery/i).click();
  (await editChooser1).setFiles(photoFile);
  await expect(page.getByText(/1\/3/)).toBeVisible();
  await saveEdit(page);

  const withOne = await getTransactionRecord(page, 'Edit multi photo sale');
  expect(withOne?.photos).toHaveLength(1);
  expect(withOne?.photo).toMatch(/^data:image\/jpeg;base64,/);

  await openTransactionEditor(page, 'Edit multi photo sale');
  await page.getByRole('button', { name: /take or choose photo/i }).click();
  const editChooser2 = page.waitForEvent('filechooser');
  await page.getByText(/choose from gallery/i).click();
  (await editChooser2).setFiles(replacementPhotoFile);
  await expect(page.getByText(/2\/3/)).toBeVisible();
  await saveEdit(page);

  const withTwo = await getTransactionRecord(page, 'Edit multi photo sale');
  expect(withTwo?.photos).toHaveLength(2);

  await openTransactionEditor(page, 'Edit multi photo sale');
  await page.getByRole('button', { name: /replace photo 1/i }).click();
  await expect(page.getByText(/choose from gallery/i)).toBeVisible();
  const replaceChooserPromise = page.waitForEvent('filechooser');
  await page.getByText(/choose from gallery/i).click();
  const replaceChooser = await replaceChooserPromise;
  await replaceChooser.setFiles(thirdPhotoFile);
  await saveEdit(page);

  const replacedFirst = await getTransactionRecord(page, 'Edit multi photo sale');
  expect(replacedFirst?.photos).toHaveLength(2);
  expect(replacedFirst.photos[0].dataUrl).not.toBe(withTwo.photos[0].dataUrl);

  await openTransactionEditor(page, 'Edit multi photo sale');
  await page.getByRole('button', { name: /remove photo 1/i }).click();
  await expect(page.getByText(/1\/3/)).toBeVisible();
  await saveEdit(page);

  const afterRemoveOne = await getTransactionRecord(page, 'Edit multi photo sale');
  expect(afterRemoveOne?.photos).toHaveLength(1);
  expect(afterRemoveOne?.photo).toBe(afterRemoveOne.photos[0].dataUrl);

  await openTransactionEditor(page, 'Edit multi photo sale');
  await page.getByRole('button', { name: /remove photo 1/i }).click();
  await expect(page.getByText(/proof photos/i)).toHaveCount(0);
  await expect(page.getByText('+3')).toBeVisible();
  await saveEdit(page);

  const afterRemoveAll = await getTransactionRecord(page, 'Edit multi photo sale');
  expect(afterRemoveAll?.photos).toHaveLength(0);
  expect(afterRemoveAll?.photo).toBeNull();
  expect(afterRemoveAll?.photo_taken_at).toBeNull();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/edit multi photo sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toHaveCount(0);
});

test('expense proof photos remain transaction-level and visible after reload', async ({ page }) => {
  await startEnglishShop(page);

  await clickBottomAction(page, /^Expense$/i);
  await page.getByPlaceholder(/add details/i).fill('Multi photo expense');
  await page.getByPlaceholder('0').first().fill('45');
  await uploadTransactionPhotos(page, [photoFile, replacementPhotoFile]);
  await page.getByRole('button', { name: /save expense/i }).click();

  const saved = await getTransactionRecord(page, 'Multi photo expense');
  expect(saved?.photos).toHaveLength(2);

  await expect(page.getByText(/multi photo expense/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/multi photo expense/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view transaction photo/i })).toBeVisible();
});

test('pay later sale copies proof photos and source linkage into generated customer Dubie row', async ({ page }) => {
  await seedEnglishShopWithCustomer(page);

  await clickBottomAction(page, /^Sale$/i);
  await page.getByPlaceholder(/add details/i).fill('Photo pay later sale');
  await page.getByPlaceholder('0').first().fill('300');
  await uploadTransactionPhotos(page, [photoFile, replacementPhotoFile]);
  await page.getByRole('button', { name: /later/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await page.getByRole('button', { name: /save sale/i }).click();

  const sale = await getTransactionRecord(page, 'Photo pay later sale');
  const dubie = await getCustomerTransactionRecord(page, 'Photo pay later sale');
  expect(sale?.photos).toHaveLength(2);
  expect(dubie?.photos).toHaveLength(2);
  expect(dubie?.photo).toBe(sale.photos[0].dataUrl);
  expect(dubie?.source_transaction_id).toBe(sale.id);
  expect(dubie?.source_type).toBe('pay_later_sale');

  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await expect(page.getByText(/photo pay later sale/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view item photo/i })).toBeVisible();
  await expect(page.getByText('+1')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await expect(page.getByRole('button', { name: /view item photo/i })).toBeVisible();
});

test('direct Dubie supports proof photos and payment rows stay photo-free', async ({ page }) => {
  await seedEnglishShopWithCustomer(page);

  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /photo customer/i }).click();
  await page.locator('main').getByRole('button', { name: /^credit$/i }).click();
  await page.getByPlaceholder('0').first().fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Direct photo dubie');

  await page.getByRole('button', { name: /take or choose photo/i }).click();
  const dubieChooser1 = page.waitForEvent('filechooser');
  await page.getByText(/choose from gallery/i).click();
  (await dubieChooser1).setFiles(photoFile);
  await page.getByRole('button', { name: /take or choose photo/i }).click();
  const dubieChooser2 = page.waitForEvent('filechooser');
  await page.getByText(/choose from gallery/i).click();
  (await dubieChooser2).setFiles(replacementPhotoFile);
  await expect(page.getByText(/2\/3/)).toBeVisible();
  await page.getByRole('button', { name: /save credit/i }).click();

  const dubie = await getCustomerTransactionRecord(page, 'Direct photo dubie');
  expect(dubie?.photos).toHaveLength(2);
  expect(dubie?.photo).toBe(dubie.photos[0].dataUrl);

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

test('supplier purchases support proof photos and supplier payments stay photo-free', async ({ page }) => {
  await seedEnglishShopWithSupplier(page);

  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /suppliers/i }).click();
  await page.getByRole('button', { name: /photo supplier/i }).click();
  await page.getByRole('button', { name: /^buy$/i }).click();
  await page.getByPlaceholder('0').first().fill('500');
  await page.getByPlaceholder(/bags coffee/i).fill('Supplier photo purchase');

  await addCameraModalPhoto(page, photoFile, 1);
  await addCameraModalPhoto(page, replacementPhotoFile, 2);
  await addCameraModalPhoto(page, thirdPhotoFile, 3);
  await expect(page.getByText(/3\/3/)).toBeVisible();
  await page.getByRole('button', { name: /save purchase/i }).click();

  const purchase = await getSupplierTransactionRecord(page, 'Supplier photo purchase');
  expect(purchase?.photos).toHaveLength(3);
  expect(purchase?.photo).toBe(purchase.photos[0].dataUrl);
  expect(purchase?.photo_taken_at).toBe(purchase.photos[0].taken_at);

  await expect(page.getByText(/supplier photo purchase/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /view purchase photo/i })).toBeVisible();
  await expect(page.getByText('+2')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /credit/i }).click();
  await page.getByRole('button', { name: /suppliers/i }).click();
  await page.getByRole('button', { name: /photo supplier/i }).click();
  await expect(page.getByRole('button', { name: /view purchase photo/i })).toBeVisible();

  await page.getByRole('button', { name: /^pay$/i }).click();
  await page.getByPlaceholder('0').first().fill('50');
  await expect(page.getByRole('button', { name: /take or choose photo/i })).toHaveCount(0);
  await page.getByRole('button', { name: /save payment/i }).click();

  const payments = await getSupplierPaymentRecords(page);
  expect(payments).toHaveLength(1);
  expect(payments[0].photos).toEqual([]);
  expect(payments[0].photo).toBeNull();
  expect(payments[0].photo_taken_at).toBeNull();
  await expect(page.getByRole('button', { name: /view purchase photo/i })).toHaveCount(1);
});

test('legacy single-photo records still display without photos array', async ({ page }) => {
  await startEnglishShop(page);
  await seedLegacySaleWithPhoto(page);

  await expect(page.getByText(/legacy proof sale/i)).toBeVisible();
  await page.getByRole('button', { name: /view transaction photo/i }).click();
  await expect(page.getByRole('dialog', { name: /view transaction photo/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /next photo/i })).toHaveCount(0);
});
