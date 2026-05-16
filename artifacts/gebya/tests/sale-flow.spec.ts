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

test('single-screen sale: paid now flow saves and auto-closes', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/what did you sell/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /paid now/i })).toBeVisible();

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('1500');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Coffee');

  await page.waitForTimeout(600);

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // Success screen appears briefly
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });

  // Auto-closes after ~1.2s, form should be gone and sale button visible again
  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: /sale/i })).toBeVisible();
});

test('single-screen sale: pay later flow gates on customer name', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('800');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Bread');

  await page.getByRole('button', { name: /pay later/i }).click();

  await expect(page.getByText(/customer name or clue/i)).toBeVisible();

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeDisabled();

  const customerInput = page.getByPlaceholder(/name, nickname, relation, place, or vehicle clue/i);
  await customerInput.fill('Sam');

  await page.waitForTimeout(600);

  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: /sale/i })).toBeVisible();
});

test('single-screen sale: paid partly requires paid amount and customer', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('1000');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Tea');

  await page.getByRole('button', { name: /paid partly/i }).click();

  await expect(page.locator('input[inputmode="decimal"]').nth(1)).toBeVisible();
  await expect(page.getByText(/customer name or clue/i)).toBeVisible();

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeDisabled();

  const customerInput = page.getByPlaceholder(/name, nickname, relation, place, or vehicle clue/i);
  await customerInput.fill('Abebe');

  await expect(saveBtn).toBeDisabled();

  const paidInput = page.locator('input[inputmode="decimal"]').nth(1);
  await paidInput.fill('400');

  await page.waitForTimeout(600);

  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: /sale/i })).toBeVisible();
});

test('single-screen sale: inline validation shows helper text when disabled', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeDisabled();

  await expect(page.getByText(/enter an amount/i)).toBeVisible();

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('500');

  await expect(page.getByText(/enter what you sold/i)).toBeVisible();
});

test('single-screen sale: optional details expand/collapse', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  await expect(page.getByText(/optional details/i)).toBeVisible();
  await expect(page.getByText(/buying cost/i)).not.toBeVisible();

  await page.getByText(/optional details/i).click();
  await expect(page.getByText(/buying cost/i)).toBeVisible();
  await expect(page.getByText(/how many/i)).toBeVisible();

  await page.getByText(/optional details/i).click();
  await expect(page.getByText(/buying cost/i)).not.toBeVisible();

  // Close the form so next test can interact with main screen
  await page.locator('button[aria-label="Close"]').click();
});

test('expense form works without stepper', async ({ page }) => {
  await page.getByRole('button', { name: /spent/i }).click();
  await expect(page.getByText(/i spent something/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /save expense/i })).toBeVisible();
});

test('draft keep/discard prompt on close with unsaved changes', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('200');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Soap');

  await page.waitForTimeout(600);

  await page.locator('button[aria-label="Close"]').click();
  await expect(page.getByText(/keep draft/i).first()).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /keep draft/i }).click();
});

test('draft discard clears draft', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('200');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Soap');

  await page.waitForTimeout(600);

  await page.locator('button[aria-label="Close"]').click();
  await page.getByRole('button', { name: /discard/i }).click();

  await page.getByRole('button', { name: /sale/i }).click();
  await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue('');
  await expect(page.getByPlaceholder(/e\.g\. bread, sugar/i)).toHaveValue('');
});

test('draft cleared only after successful save, not before', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('750');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Sugar');

  await page.waitForTimeout(800);

  const draftBeforeSave = await page.evaluate(() => localStorage.getItem('gebya_sale_draft'));
  expect(draftBeforeSave).not.toBeNull();
  const parsed = JSON.parse(draftBeforeSave);
  expect(parsed.amount).toBe('750');
  expect(parsed.item).toBe('Sugar');

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await page.waitForTimeout(2000);

  const draftAfterSuccess = await page.evaluate(() => localStorage.getItem('gebya_sale_draft'));
  expect(draftAfterSuccess).toBeNull();
});

test('draft survives failed save and shows error feedback', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('400');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Salt');

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

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await page.waitForTimeout(1000);

  const draftAfterFailure = await page.evaluate(() => localStorage.getItem('gebya_sale_draft'));
  expect(draftAfterFailure).not.toBeNull();
  const parsed2 = JSON.parse(draftAfterFailure);
  expect(parsed2.amount).toBe('400');
  expect(parsed2.item).toBe('Salt');

  await expect(page.getByText(/birr.*saved/i)).not.toBeVisible({ timeout: 3000 });

  await expect(page.getByText(/could not save/i)).toBeVisible({ timeout: 5000 });
});

test('no undo button appears after save', async ({ page }) => {
  await page.getByRole('button', { name: /sale/i }).click();

  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });

  const amountInput = page.locator('input[inputmode="decimal"]').first();
  await amountInput.fill('300');

  const itemInput = page.getByPlaceholder(/e\.g\. bread, sugar/i);
  await itemInput.fill('Milk');

  await page.waitForTimeout(600);

  const saveBtn = page.getByRole('button', { name: /save sale/i });
  await saveBtn.click();

  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });

  await expect(page.getByRole('button', { name: /undo/i })).not.toBeVisible();
});
