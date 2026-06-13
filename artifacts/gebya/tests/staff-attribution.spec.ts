import { expect, test } from '@playwright/test';

async function resetDb(page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
}

async function startEnglishNotebook(page) {
  await page.evaluate(() => localStorage.setItem('gebya_lang', 'en'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/e\.g\. tigist/i).fill('Tigist Shop');
  await page.getByRole('button', { name: /start using gebya/i }).click();
}

async function openTeamSection(page) {
  await page.getByRole('button', { name: /settings/i }).click();
  await page.getByRole('button', { name: /team/i }).click();
}

function teamActorSelect(page) {
  return page.getByRole('combobox').first();
}

async function openSaleForm(page) {
  const recordSale = page.getByRole('button', { name: /record a sale/i });
  if (await recordSale.isVisible()) {
    await recordSale.click();
    return;
  }
  await page.getByRole('button', { name: /^sale$/i }).click();
}

async function installAlertCapture(page) {
  await page.evaluate(() => {
    window.__gebyaLastAlert = null;
    window.alert = (message) => {
      window.__gebyaLastAlert = String(message);
    };
  });
}

async function getLastAlert(page) {
  return page.evaluate(() => window.__gebyaLastAlert || null);
}

async function getLastSaveError(page) {
  return page.evaluate(() => window.__gebyaLastSaveError || null);
}

test('staff selection is shown on new records and persists in history after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await startEnglishNotebook(page);
  await installAlertCapture(page);

  await openTeamSection(page);

  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await expect(page.getByRole('button', { name: /^use$/i })).toBeVisible();

  await page.getByRole('button', { name: /^use$/i }).click();
  await expect(teamActorSelect(page)).toHaveValue('1');

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await openSaleForm(page);
  await expect(page.getByText(/recording as almaz/i)).toBeVisible();

  await page.getByPlaceholder(/amount, item, code, or note/i).fill('Bread 120');
  await page.getByRole('button', { name: /save 1 item .*120/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });

  await expect(page.getByRole('button', { name: /120.*bread/i })).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/^almaz .* today/i)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/^almaz .* today/i)).toBeVisible();
});

test('inactivating the current staff member warns the owner and falls back to owner', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await startEnglishNotebook(page);
  await installAlertCapture(page);

  await openTeamSection(page);

  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await page.getByRole('button', { name: /^use$/i }).click();

  await page.getByRole('button', { name: /inactivate/i }).click();
  await expect(page.getByText(/currently selected for new records on this phone/i)).toBeVisible();
  await expect(page.getByText(/past records stay attributed to this staff member/i)).toBeVisible();
  await page.getByRole('button', { name: /inactivate now/i }).click();

  await expect(page.getByText(/inactive - past records stay attributed to this staff member/i)).toBeVisible();
  await expect(teamActorSelect(page)).toHaveValue('');
});

test('renaming a staff member updates future attribution while keeping past snapshots', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await resetDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await startEnglishNotebook(page);
  await installAlertCapture(page);

  await openTeamSection(page);

  await page.getByPlaceholder(/staff name/i).fill('Almaz');
  await page.getByRole('button', { name: /^add$/i }).click();
  await page.getByRole('button', { name: /^use$/i }).click();

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await openSaleForm(page);
  await page.getByPlaceholder(/amount, item, code, or note/i).fill('Bread 120');
  await page.getByRole('button', { name: /save 1 item .*120/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });
  await expect(page.getByRole('button', { name: /120.*bread/i })).toBeVisible();

  await openTeamSection(page);
  await page.getByRole('button', { name: /^edit$/i }).click();
  await page.getByRole('textbox', { name: 'Staff name' }).nth(1).fill('Mahi');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(teamActorSelect(page)).toHaveValue('1');

  await page.locator('nav').getByRole('button', { name: /today/i }).click();
  await openSaleForm(page);
  await expect(page.getByText(/recording as mahi/i)).toBeVisible();
  await page.getByPlaceholder(/amount, item, code, or note/i).fill('Sugar 90');
  await page.getByRole('button', { name: /save 1 item .*90/i }).click();
  await expect.poll(async () => ({
    alert: await getLastAlert(page),
    error: await getLastSaveError(page),
  })).toEqual({ alert: null, error: null });
  await expect(page.getByRole('button', { name: /90.*sugar/i })).toBeVisible();

  await expect(page.getByRole('button', { name: /120.*bread/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /90.*sugar/i })).toBeVisible();

  const snapshots = await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      return await new Promise<Array<{ item_name: string; actor_name_snapshot?: string }>>((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const getAll = store.getAll();
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  expect(snapshots.find(row => row.item_name === 'Bread')?.actor_name_snapshot).toBe('Almaz');
  expect(snapshots.find(row => row.item_name === 'Sugar')?.actor_name_snapshot).toBe('Mahi');

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/^mahi .* today/i)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTeamSection(page);
  await expect(teamActorSelect(page)).toHaveValue('1');
  await expect(page.getByRole('button', { name: /^current$/i })).toBeVisible();

  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/^mahi .* today/i)).toBeVisible();
});
