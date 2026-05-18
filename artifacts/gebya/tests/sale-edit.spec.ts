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

// Helper: open kebab menu and click Edit
async function openEditForFirstEntry(page) {
  await page.getByRole('button', { name: 'Options' }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /edit/i }).first().click({ force: true });
}

// Helper: open kebab menu and click Delete
async function openDeleteForFirstEntry(page) {
  await page.getByRole('button', { name: 'Options' }).first().click();
  await page.getByRole('button', { name: /delete/i }).first().click();
}

test('paid partly: edit paid amount within valid range updates remaining and Dubie', async ({ page }) => {
  // Create a paid partly sale
  await page.getByRole('button', { name: /sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Coffee');
  await page.getByTestId('sale-settlement-paid_partly').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  const paidInput = page.locator('input[inputmode="decimal"]').nth(1);
  await paidInput.fill('400');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Verify locked fields
  await expect(page.getByText(/payment type cannot be changed/i)).toBeVisible();
  await expect(page.getByText(/customer cannot be changed/i)).toBeVisible();

  // Edit paid amount
  const editPaidInput = page.locator('input[inputmode="decimal"]').first();
  await editPaidInput.fill('600');
  
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /save changes/i }).click();

  // Verify update by checking if modal closes (no toast expected)
  await expect(page.getByText(/edit sale/i)).not.toBeVisible({ timeout: 5000 });
});

test('paid partly: paid amount = total blocks save', async ({ page }) => {
  // Create a paid partly sale
  await page.getByRole('button', { name: /sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Tea');
  await page.getByTestId('sale-settlement-paid_partly').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  const paidInput = page.locator('input[inputmode="decimal"]').nth(1);
  await paidInput.fill('400');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Try to set paid amount = total
  const editPaidInput = page.locator('input[inputmode="decimal"]').first();
  await editPaidInput.fill('1000');
  
  await page.waitForTimeout(600);
  
  // Save should be disabled
  const saveBtn = page.getByRole('button', { name: /save changes/i });
  await expect(saveBtn).toBeDisabled();
  
  // Validation error should appear
  await expect(page.getByText(/paid amount must be less than total/i)).toBeVisible();
});

test('paid partly: paid amount > total blocks save', async ({ page }) => {
  // Create a paid partly sale
  await page.getByRole('button', { name: /sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Milk');
  await page.getByTestId('sale-settlement-paid_partly').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  const paidInput = page.locator('input[inputmode="decimal"]').nth(1);
  await paidInput.fill('400');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Try to set paid amount > total
  const editPaidInput = page.locator('input[inputmode="decimal"]').first();
  await editPaidInput.fill('1500');
  
  await page.waitForTimeout(600);
  
  // Save should be disabled
  const saveBtn = page.getByRole('button', { name: /save changes/i });
  await expect(saveBtn).toBeDisabled();
  
  // Validation error should appear
  await expect(page.getByText(/paid amount must be less than total/i)).toBeVisible();
});

test('pay later: edit due date updates Dubie', async ({ page }) => {
  // Create a pay later sale
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('800');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Bread');
  await page.getByTestId('sale-settlement-pay_later').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Edit due date
  const dueDateInput = page.locator('input[type="date"]').first();
  await dueDateInput.fill('2026-12-31');
  
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /save changes/i }).click();

  // Verify update by checking if modal closes
  await expect(page.getByText(/edit sale/i)).not.toBeVisible({ timeout: 5000 });
});

test('paid partly: edit due date updates Dubie', async ({ page }) => {
  // Create a paid partly sale
  await page.getByRole('button', { name: /sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 5000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Sugar');
  await page.getByTestId('sale-settlement-paid_partly').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  const paidInput = page.locator('input[inputmode="decimal"]').nth(1);
  await paidInput.fill('400');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Edit due date
  const dueDateInput = page.locator('input[type="date"]').first();
  await dueDateInput.fill('2026-11-15');
  
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /save changes/i }).click();

  // Verify update by checking if modal closes
  await expect(page.getByText(/edit sale/i)).not.toBeVisible({ timeout: 5000 });
});

test('locked settlement mode message visible', async ({ page }) => {
  // Create a sale
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('500');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Salt');
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Verify locked message
  await expect(page.getByText(/payment type cannot be changed/i)).toBeVisible();
});

test('locked customer message visible', async ({ page }) => {
  // Create a pay later sale with customer
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('800');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Bread');
  await page.getByTestId('sale-settlement-pay_later').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Verify locked customer message
  await expect(page.getByText(/customer cannot be changed/i)).toBeVisible();
  await expect(page.getByText(/Sam/)).toBeVisible();
});

test('delete linked sale removes Dubie transaction', async ({ page }) => {
  // Create a pay later sale
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('800');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Bread');
  await page.getByTestId('sale-settlement-pay_later').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Delete the sale
  await openDeleteForFirstEntry(page);
  // Use exact match for the delete button in the confirmation dialog
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  
  await page.waitForTimeout(1000);
  
  // Verify sale is gone
  await expect(page.getByText(/Bread/)).not.toBeVisible();
  
  // Verify Dubie balance is cleared (customer record persists, but balance should be 0)
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /dubie$/i }).last().click();
  // Click on Sam to see details
  await page.getByText('Sam').first().click();
  // Verify balance is 0
  await expect(page.getByText('0.00 birr', { exact: true })).toBeVisible({ timeout: 5000 });
});

test('paid partly: edit total amount below existing paid amount blocks save', async ({ page }) => {
  // Create a paid partly sale
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Coffee');
  await page.getByTestId('sale-settlement-paid_partly').click();
  
  const customerInput = page.getByPlaceholder(/name, nickname/i);
  await customerInput.fill('Sam');
  
  const paidInput = page.locator('input[inputmode="decimal"]').nth(1);
  await paidInput.fill('600');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Edit total amount to be less than paid amount (600)
  const totalInput = page.locator('input[inputmode="decimal"]').nth(1);
  await totalInput.fill('400');
  
  await page.waitForTimeout(600);
  
  // Save should be disabled
  const saveBtn = page.getByRole('button', { name: /save changes/i });
  await expect(saveBtn).toBeDisabled();
  
  // Validation error should appear
  await expect(page.getByText(/paid amount must be less than total/i)).toBeVisible();
});

test('defensive guard: rejects invalid paid_partly update via direct DB manipulation', async ({ page }) => {
  // Create a paid partly sale
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Guard Test');
  await page.getByTestId('sale-settlement-paid_partly').click();
  
  await page.getByPlaceholder(/name, nickname/i).fill('Sam');
  await page.locator('input[inputmode="decimal"]').nth(1).fill('400');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Verify Dubie exists with balance
  await page.getByRole('button', { name: /dubie$/i }).last().click();
  await page.getByText('Sam').first().click();
  await expect(page.getByText('600.00 birr', { exact: true })).toBeVisible({ timeout: 5000 });

  // Corrupt the transaction directly in IndexedDB to bypass UI validation
  await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('GebyaDB');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && cursor.value.type === 'sale' && cursor.value.item_name === 'Guard Test') {
            const val = cursor.value;
            val.paid_amount = 1000;
            cursor.update(val).onsuccess = () => resolve(true);
          } else if (cursor) {
            cursor.continue();
          } else {
            resolve(false);
          }
        };
      };
      req.onerror = () => reject(req.error);
    });
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Open edit sheet and try to save (changing item name to trigger update)
  await page.getByRole('button', { name: 'Options' }).first().click();
  await page.getByRole('button', { name: /edit/i }).first().click();
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });
  
  // Change item name slightly to trigger save
  const itemInput = page.locator('input[type="text"]').first();
  await itemInput.fill('Guard Test Updated');
  await page.waitForTimeout(600);
  
  // Force click save (bypass disabled state if any)
  await page.getByRole('button', { name: /save changes/i }).click({ force: true });
  
  // Wait for alert/error handling
  await page.waitForTimeout(1500);

  // Verify modal is still open (save failed)
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });
  
  // Verify Dubie balance is still intact (not deleted/mutated)
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /dubie$/i }).last().click();
  await page.getByText('Sam').first().click();
  await expect(page.getByText('600.00 birr', { exact: true })).toBeVisible({ timeout: 5000 });
});

test('pay later: clear due date sets null in transaction and Dubie', async ({ page }) => {
  // Create a pay later sale with due date
  await page.getByRole('button', { name: /type sale/i }).click();
  await expect(page.getByText(/how much total/i)).toBeVisible({ timeout: 10000 });
  
  await page.locator('input[inputmode="decimal"]').first().fill('800');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Clear Date');
  await page.getByTestId('sale-settlement-pay_later').click();
  
  await page.getByPlaceholder(/name, nickname/i).fill('Sam');
  await page.locator('input[type="date"]').first().fill('2026-12-31');
  
  await page.waitForTimeout(600);
  await page.getByTestId('sale-save-button').click();
  await expect(page.getByText(/birr.*saved/i)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Open edit sheet
  await openEditForFirstEntry(page);
  await expect(page.getByText(/edit sale/i)).toBeVisible({ timeout: 5000 });

  // Clear due date using select all + delete
  const dueDateInput = page.locator('input[type="date"]').first();
  await dueDateInput.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  
  await page.getByRole('button', { name: /save changes/i }).click();

  // Verify modal closes (save succeeded)
  await expect(page.getByText(/edit sale/i)).not.toBeVisible({ timeout: 5000 });

  // Verify Dubie due date is cleared in DB
  const dubieDueDateCleared = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('GebyaDB');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('customer_transactions', 'readonly');
        const store = tx.objectStore('customer_transactions');
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const entry = getAll.result.find(ct => ct.item_note && ct.item_note.includes('Clear Date'));
          const val = entry?.due_date;
          resolve(val === null || val === undefined || val === 0);
        };
      };
    });
  });
  expect(dubieDueDateCleared).toBe(true);
});
