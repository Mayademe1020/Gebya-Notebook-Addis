import { expect, test } from '@playwright/test';

test('customer ledger flow stays trustworthy after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Complete onboarding
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();

  // Open credit flow from Today tab (actual app flow)
  await page.getByRole('button', { name: 'Dubie', exact: true }).click();

  // CustomerForm opens directly when no customers exist
  await page.getByPlaceholder(/customer name/i).fill('Almaz');
  await page.getByRole('button', { name: /save customer/i }).click();

  await expect(page.getByText(/almaz/i)).toBeVisible();
  await expect(page.getByText(/remaining balance/i)).toBeVisible();
  await expect(page.getByText(/^0(?:\.00)? birr$/i)).toBeVisible();

  await page.getByRole('button', { name: /add dubie/i }).click();
  await page.getByPlaceholder('0').fill('250');
  await page.getByPlaceholder(/what they took/i).fill('Sugar');
  await page.getByRole('button', { name: /save dubie/i }).click();

  await expect(page.getByText(/^250(?:\.00)? birr$/i)).toBeVisible();
  await expect(page.getByText('Sugar', { exact: true })).toBeVisible();

  // Dismiss the post-save notification sheet
  await page.getByRole('button', { name: /not now/i }).click();

  await page.getByRole('button', { name: /record payment/i }).click();
  await page.getByPlaceholder('0').fill('80');
  await page.getByPlaceholder(/any note about this payment/i).fill('Cash');
  await page.getByRole('button', { name: /save payment/i }).click();

  await expect(page.getByText(/^170(?:\.00)? birr$/i)).toBeVisible();
  await expect(page.getByText(/bal: 170/i)).toBeVisible();
  await expect(page.getByText(/bal: 250/i)).toBeVisible();

  // Dismiss the post-save notification sheet
  await page.getByRole('button', { name: /not now/i }).click();

  await page.getByRole('button', { name: /back to customers/i }).click();
  await page.getByPlaceholder(/search customer or note/i).fill('Alm');
  await expect(page.getByRole('button', { name: /almaz/i })).toBeVisible();
  await page.getByRole('button', { name: /almaz/i }).click();

  await page.reload();
  await page.locator('nav').getByRole('button', { name: /dubie/i }).click();
  await page.getByPlaceholder(/search customer or note/i).fill('Alm');
  await page.getByRole('button', { name: /almaz/i }).click();
  await expect(page.getByText(/almaz/i)).toBeVisible();
  await expect(page.getByText(/^170(?:\.00)? birr$/i)).toBeVisible();
  await expect(page.getByText(/sugar/i)).toBeVisible();
  await expect(page.getByText(/cash/i)).toBeVisible();
});
