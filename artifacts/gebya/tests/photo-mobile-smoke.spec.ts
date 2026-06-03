import { expect, test } from '@playwright/test';

const photoA =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=';

const photoB =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAm//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Am//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z';

async function seedMobileProofData(page) {
  await page.addInitScript(() => localStorage.setItem('gebya_lang', 'en'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ firstPhoto, secondPhoto }) => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = Date.now();
    const photos = [
      { id: 'mobile-a', dataUrl: firstPhoto, taken_at: now - 2000 },
      { id: 'mobile-b', dataUrl: secondPhoto, taken_at: now - 1000 },
    ];

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['settings', 'customers', 'transactions', 'customer_transactions'], 'readwrite');
      tx.objectStore('settings').put({ key: 'shop_name', value: 'Mobile Proof Shop' });
      tx.objectStore('settings').put({ key: 'shop_phone', value: '' });
      tx.objectStore('settings').put({ key: 'shop_business_type', value: 'retail-shop' });

      const customerReq = tx.objectStore('customers').add({
        display_name: 'Mobile Customer',
        phone_number: '',
        note: '',
        telegram_username: '',
        telegram_chat_id: null,
        telegram_notify_enabled: false,
        telegram_link_token: null,
        created_at: now,
        updated_at: now,
      });

      customerReq.onsuccess = () => {
        const customerId = customerReq.result;
        tx.objectStore('transactions').add({
          type: 'sale',
          item_name: 'Mobile proof sale',
          quantity: 1,
          amount: 120,
          cost_price: 0,
          profit: null,
          payment_type: 'cash',
          payment_provider: null,
          customer_phone: null,
          direction: null,
          due_date: null,
          photos,
          photo: photos[0].dataUrl,
          photo_taken_at: photos[0].taken_at,
          created_at: now,
          updated_at: now,
        });
        tx.objectStore('customer_transactions').add({
          customer_id: customerId,
          type: 'credit_add',
          amount: 250,
          item_note: 'Mobile direct Dubie',
          due_date: null,
          photos,
          photo: photos[0].dataUrl,
          photo_taken_at: photos[0].taken_at,
          created_at: now,
          updated_at: now,
        });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { firstPhoto: photoA, secondPhoto: photoB });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/mobile proof shop/i)).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const width of [360, 390]) {
  test(`photo proof touch targets are usable without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedMobileProofData(page);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /view transaction photo/i }).click();
    await expect(page.getByRole('dialog', { name: /view transaction photo/i })).toBeVisible();
    await page.getByRole('button', { name: /next photo/i }).click();
    await expect(page.getByText('2/2')).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expectNoHorizontalOverflow(page);

    await page.locator('nav').getByRole('button', { name: /report/i }).click();
    await page.getByRole('button', { name: /view transaction photo/i }).click();
    await expect(page.getByRole('dialog', { name: /view transaction photo/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expectNoHorizontalOverflow(page);

    await page.locator('nav').getByRole('button', { name: /credit/i }).click();
    await page.getByRole('button', { name: /mobile customer/i }).click();
    await page.getByRole('button', { name: /view item photo/i }).click();
    await expect(page.getByRole('dialog', { name: /view item photo/i })).toBeVisible();
    await page.getByRole('button', { name: /next photo/i }).click();
    await expect(page.getByText('2/2')).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expectNoHorizontalOverflow(page);
  });
}
