import { expect, test } from '@playwright/test';

test('offline typed sale is saved locally and survives reload', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('gebya_lang', 'en');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();

  await expect(page.getByText(/tigist shop/i)).toBeVisible();

  await context.setOffline(true);

  await page.getByRole('button', { name: /^sale$/i }).click();
  await page.getByPlaceholder(/add details|bread|sugar/i).fill('Sugar');
  await page.getByPlaceholder('0').fill('250');
  await page.getByRole('button', { name: /save sale/i }).click();

  await expect(page.getByText(/saved on this phone/i)).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/^\+?250(?:\.00)? birr$/i)).toBeVisible();

  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/^\+?250(?:\.00)? birr$/i)).toBeVisible();
});
