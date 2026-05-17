import { expect, test } from '@playwright/test';

test('first-run onboarding is lean and deterministic', async ({ page }) => {
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

  await expect(page.getByText(/start your notebook/i)).toBeVisible();
  await expect(page.getByPlaceholder(/e\.g\. tigist/i)).toBeVisible();
  await expect(page.getByText(/record sales, spending, and dubie in a few taps/i)).toBeVisible();
  await expect(page.getByText(/see who owes what without hard accounting words/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /start using gebya/i })).toBeVisible();

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();

  await expect(page.getByText(/tigist shop/i)).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: /today/i })).toBeVisible();
  await expect(page.getByText(/start your notebook/i)).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/tigist shop/i)).toBeVisible();
  await expect(page.getByText(/start your notebook/i)).toHaveCount(0);
});

