import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload({ waitUntil: 'networkidle' });

  if (await page.getByText(/start your notebook/i).isVisible()) {
    const input = page.getByPlaceholder(/e\.g\. tigist/i);
    await input.waitFor({ state: 'visible' });
    await input.fill('Tigist Shop');
    const btn = page.getByRole('button', { name: /start using gebya/i });
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    await page.waitForURL(/^[^#]*$/, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);
  }
});

test('3-step guided sale: paid now flow auto-advances', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('text=/how much total/i', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });

  await page.getByPlaceholder('0').fill('1500');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Coffee');

  await page.waitForTimeout(1500);

  await expect(page.getByRole('button', { name: /paid now/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /paid partly/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /pay later/i })).toBeVisible();

  await page.waitForTimeout(1500);

  await expect(page.getByText(/review sale/i)).toBeVisible();
  await expect(page.getByText(/coffee/i)).toBeVisible();

  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/1,500.*birr.*saved/i)).toBeVisible({ timeout: 10000 });
});

test('3-step guided sale: pay later flow gates on customer name', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('800');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Bread');

  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: /pay later/i }).click();

  await page.waitForTimeout(500);

  await expect(page.getByText(/enter customer name/i)).toBeVisible();

  await page.getByPlaceholder(/name, nickname, relation, place, or vehicle clue/i).fill('Sam');
  await page.waitForTimeout(1500);

  await expect(page.getByText(/review sale/i)).toBeVisible();

  await page.getByRole('button', { name: /save sale/i }).click();
  await expect(page.getByText(/800.*birr.*saved/i)).toBeVisible({ timeout: 10000 });
});

test('3-step guided sale: edit details from review', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('300');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Tea');

  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: /edit details/i }).click();
  await expect(page.getByPlaceholder('0')).toHaveValue('300');
  await expect(page.getByPlaceholder(/e\.g\. bread, sugar/i)).toHaveValue('Tea');
});

test('3-step guided sale: stepper still works for back navigation', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('500');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Milk');

  await page.waitForTimeout(3000);

  await expect(page.getByText(/review sale/i)).toBeVisible();

  await page.waitForTimeout(500);
  const stepButtons = page.locator('button').filter({ hasText: /1|details/i });
  const step1Button = stepButtons.first();
  await step1Button.waitFor({ state: 'visible', timeout: 3000 });
  await step1Button.click();
  await expect(page.getByPlaceholder(/e\.g\. bread, sugar/i)).toHaveValue('Milk');
});

test('expense form works without stepper', async ({ page }) => {
  await page.getByRole('button', { name: /expense/i }).click();
  await expect(page.getByText(/i spent something/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /save expense/i })).toBeVisible();
});

test('draft keep/discard prompt on close with unsaved changes', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('200');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Soap');

  await page.locator('button[aria-label="Close"]').click();
  await expect(page.getByText(/keep draft/i).first()).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /keep draft/i }).click();
});

test('draft discard clears draft', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('200');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Soap');
  await page.locator('button[aria-label="Close"]').click();

  await page.getByRole('button', { name: /discard/i }).click();

  await page.getByRole('button', { name: /sale/i }).click();
  await expect(page.getByPlaceholder('0')).toHaveValue('');
  await expect(page.getByPlaceholder(/e\.g\. bread, sugar/i)).toHaveValue('');
});

test('draft cleared only after successful save, not before', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('750');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Sugar');

  await page.waitForTimeout(1500);

  const draftBeforeSave = await page.evaluate(() => localStorage.getItem('gebya_sale_draft'));
  expect(draftBeforeSave).not.toBeNull();
  const parsed = JSON.parse(draftBeforeSave);
  expect(parsed.amount).toBe('750');
  expect(parsed.item).toBe('Sugar');

  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: /save sale/i }).click();

  await page.waitForTimeout(500);

  const draftAfterSuccess = await page.evaluate(() => localStorage.getItem('gebya_sale_draft'));
  expect(draftAfterSuccess).toBeNull();
});

test('draft survives failed save and shows error feedback', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 5000 });
  await page.getByPlaceholder('0').fill('400');
  await page.getByPlaceholder(/e\.g\. bread, sugar/i).fill('Salt');

  await page.waitForTimeout(1500);

  // Inject failure: throw from IDBObjectStore.add on first call
  // This forces Dexie's transaction to reject, propagating as a thrown error
  await page.evaluate(() => {
    const origAdd = IDBObjectStore.prototype.add;
    let once = true;
    IDBObjectStore.prototype.add = function(...args: unknown[]) {
      if (once) {
        once = false;
        throw new DOMException('Simulated DB failure', 'UnknownError');
      }
      return origAdd.apply(this, args);
    };
  });

  await page.getByRole('button', { name: /save sale/i }).click();

  await page.waitForTimeout(1000);

  // Draft must still exist after failed save
  const draftAfterFailure = await page.evaluate(() => localStorage.getItem('gebya_sale_draft'));
  expect(draftAfterFailure).not.toBeNull();
  const parsed = JSON.parse(draftAfterFailure);
  expect(parsed.amount).toBe('400');
  expect(parsed.item).toBe('Salt');

  // Success screen must NOT appear
  await expect(page.getByText(/birr.*saved/i)).not.toBeVisible({ timeout: 3000 });

  // Error toast must appear
  await expect(page.getByText(/could not save/i)).toBeVisible({ timeout: 5000 });
});