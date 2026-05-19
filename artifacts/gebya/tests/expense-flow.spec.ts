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

test('expense form: basic save and auto-close', async ({ page }) => {
  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/what did you spend on/i)).toBeVisible();

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('500');

  const itemInput = page.getByPlaceholder(/e\.g\. transport, rent/i);
  await itemInput.fill('Transport');

  await page.waitForTimeout(600);

  const saveBtn = page.getByRole('button', { name: /save expense/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: /i spent/i })).toBeVisible();
});

test('expense form: draft restore after close', async ({ page }) => {
  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('350');

  const itemInput = page.getByPlaceholder(/e\.g\. transport, rent/i);
  await itemInput.fill('Rent');

  await page.waitForTimeout(800);

  await page.locator('button[aria-label="Close"]').click();
  await page.getByRole('button', { name: /keep/i }).click();

  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(amountInput).toHaveValue('350');
  await expect(itemInput).toHaveValue('Rent');
});

test('expense form: draft cleared after successful save', async ({ page }) => {
  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('200');

  const itemInput = page.getByPlaceholder(/e\.g\. transport, rent/i);
  await itemInput.fill('Lunch');

  await page.waitForTimeout(800);

  const draftBeforeSave = await page.evaluate(() => localStorage.getItem('gebya_expense_draft'));
  expect(draftBeforeSave).not.toBeNull();
  const parsed = JSON.parse(draftBeforeSave);
  expect(parsed.amount).toBe('200');
  expect(parsed.item).toBe('Lunch');

  const saveBtn = page.getByRole('button', { name: /save expense/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await page.waitForTimeout(2000);

  const draftAfterSuccess = await page.evaluate(() => localStorage.getItem('gebya_expense_draft'));
  expect(draftAfterSuccess).toBeNull();
});

test('expense form: draft survives failed save', async ({ page }) => {
  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('150');

  const itemInput = page.getByPlaceholder(/e\.g\. transport, rent/i);
  await itemInput.fill('Taxi');

  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const origAdd = IDBObjectStore.prototype.add;
    let once = true;
    IDBObjectStore.prototype.add = function(...args) {
      if (once) {
        once = false;
        throw new DOMException('Simulated DB failure', 'UnknownError');
      }
      return origAdd.apply(this, args);
    };
  });

  const saveBtn = page.getByRole('button', { name: /save expense/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await page.waitForTimeout(1000);

  const draftAfterFailure = await page.evaluate(() => localStorage.getItem('gebya_expense_draft'));
  expect(draftAfterFailure).not.toBeNull();
  const parsed = JSON.parse(draftAfterFailure);
  expect(parsed.amount).toBe('150');
  expect(parsed.item).toBe('Taxi');

  await expect(page.getByText(/could not save/i)).toBeVisible({ timeout: 5000 });
});

test('expense form: inline validation shows helper when disabled', async ({ page }) => {
  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const saveBtn = page.getByRole('button', { name: /save expense/i });
  await expect(saveBtn).toBeDisabled();

  await expect(page.getByText(/enter an amount/i)).toBeVisible();

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('100');

  await expect(page.getByText(/enter expense reason/i)).toBeVisible();

  const itemInput = page.getByPlaceholder(/e\.g\. transport, rent/i);
  await itemInput.fill('Coffee');

  await expect(saveBtn).toBeEnabled();
});

test('expense form: discard draft clears storage', async ({ page }) => {
  await page.getByRole('button', { name: /i spent/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('400');

  const itemInput = page.getByPlaceholder(/e\.g\. transport, rent/i);
  await itemInput.fill('Supplies');

  await page.waitForTimeout(800);

  await page.locator('button[aria-label="Close"]').click();
  await page.getByRole('button', { name: /discard/i }).click();

  const draftAfterDiscard = await page.evaluate(() => localStorage.getItem('gebya_expense_draft'));
  expect(draftAfterDiscard).toBeNull();

  await page.getByRole('button', { name: /i spent/i }).click();
  await expect(amountInput).toHaveValue('');
  await expect(itemInput).toHaveValue('');
});
