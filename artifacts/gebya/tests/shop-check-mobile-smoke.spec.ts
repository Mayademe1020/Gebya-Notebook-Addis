import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
});

async function resetDb(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('gebya_lang', 'en');

    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
}

async function startEnglishNotebook(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Demo Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
  await expect(page.getByText(/demo shop/i).first()).toBeVisible();
}

async function openTeamSection(page) {
  await page.locator('nav').getByRole('button', { name: /more/i }).click();
  await page.getByRole('button', { name: /team/i }).click();
}

async function openSaleForm(page) {
  const recordSale = page.getByRole('button', { name: /record a sale/i });
  if (await recordSale.isVisible()) {
    await recordSale.click();
    return;
  }
  await page.getByRole('button', { name: /^sale$/i }).click();
}

test('Shop Check is demo-safe on a cramped phone viewport', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await startEnglishNotebook(page);

  await openTeamSection(page);
  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await page.getByRole('button', { name: /^use$/i }).click();

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await openSaleForm(page);
  await expect(page.getByText(/^almaz$/i)).toBeVisible();
  await page.getByPlaceholder(/add details/i).fill('Coffee beans');
  await page.getByPlaceholder(/^0$/).fill('1200');
  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/coffee beans/i)).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText('Shop Check')).toBeVisible();
  await expect(page.getByText('Sold')).toBeVisible();
  await expect(page.getByText('Cash to Expect')).toBeVisible();
  await expect(page.getByPlaceholder('Search item, code, amount, staff, or date')).toBeVisible();
  await expect(page.getByText('Staff Sales Today')).toBeVisible();
  await expect(page.getByText('Almaz').first()).toBeVisible();
  await expect(page.getByText('Owner Alerts')).toBeVisible();
  await expect(page.getByText(/High-value/i).first()).toBeVisible();
  await expect(page.getByText(/Coffee beans/i).first()).toBeVisible();
  await expect(page.getByText('Recent Transactions')).toBeVisible();

  await page.getByPlaceholder('Search item, code, amount, staff, or date').fill('coffee');
  await expect(page.getByText('Search Results')).toBeVisible();
  await expect(page.getByText(/Coffee beans/i).first()).toBeVisible();

  await page.getByRole('button', { name: /export/i }).click();
  await expect(page.getByRole('button', { name: /^CSV$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^JSON$/i })).toBeVisible();

  await page.getByRole('button', { name: /history/i }).click();
  await expect(page.getByText('Staff sales audit')).toBeVisible();
  await expect(page.getByText(/Almaz/i).first()).toBeVisible();
});
