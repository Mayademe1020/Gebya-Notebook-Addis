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

  const ownerChoice = page.getByRole('button', { name: /i own \/ manage a shop/i });
  if (await ownerChoice.count()) {
    await ownerChoice.click();
  }
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();

  await expect(page.getByRole('heading', { name: /tigist shop/i })).toBeVisible();

  await page.getByRole('button', { name: /^sale$/i }).click();
  await expect(page.getByPlaceholder(/amount, item, code, or note/i)).toBeVisible();

  await context.setOffline(true);
  await page.getByPlaceholder(/amount, item, code, or note/i).fill('Sugar 250');
  await page.getByRole('button', { name: /save 1 item .*250/i }).click();

  await expect(page.getByText(/offline .* saves on this phone/i)).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/^\+?250(?:\.00)? birr$/i)).toBeVisible();

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/^\+?250(?:\.00)? birr$/i)).toBeVisible();
});
