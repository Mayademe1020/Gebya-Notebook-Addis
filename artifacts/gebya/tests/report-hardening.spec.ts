import { expect, test, type Page } from '@playwright/test';

const STAFF_ID = 7;

async function resetAndSeed(page: Page, options: { staff?: boolean; activeStaff?: boolean } = {}) {
  const base = new Date();
  base.setHours(8, 0, 0, 0);
  const ts = base.getTime();
  const staffRows = options.staff
    ? [
        { id: STAFF_ID, display_name: 'Abel Longname Cashier', role: 'seller', active: true, created_at: ts, updated_at: ts },
        { id: 8, display_name: 'Marta', role: 'seller', active: true, created_at: ts, updated_at: ts },
      ]
    : [];

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('gebya_lang', 'en');

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }

    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);

  await page.evaluate(async ({ ts, staffRows, activeStaff, staffId }) => {

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('GebyaDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const stores = ['transactions', 'customer_transactions', 'customers', 'staff_members', 'settings'];
    const tx = db.transaction(stores, 'readwrite');
    const put = (store: string, row: unknown) => tx.objectStore(store).put(row);
    stores.forEach(store => tx.objectStore(store).clear());

    [
      { key: 'shop_name', value: 'Yosef' },
      { key: 'shop_phone', value: '' },
      { key: 'shop_business_type', value: 'retail-shop' },
      { key: 'privacy_mode', value: 'visible' },
      { key: 'active_staff_member_id', value: activeStaff ? staffId : null },
    ].forEach(row => put('settings', row));

    staffRows.forEach(row => put('staff_members', row));
    [
      { id: 1, display_name: 'Abebe', note: '', phone_number: '', created_at: ts, updated_at: ts },
      { id: 2, display_name: 'Marta', note: '', phone_number: '', created_at: ts, updated_at: ts },
    ].forEach(row => put('customers', row));
    [
      { id: 101, type: 'sale', amount: 2450, item_name: 'Sale to Cash', payment_type: 'cash', cash_received: 2450, actor_name_snapshot: 'Owner', created_at: ts + 1, updated_at: ts + 1 },
      { id: 102, type: 'sale', amount: 19380, item_name: 'Transfer order', payment_type: 'bank', payment_provider: 'CBE', actor_staff_member_id: staffId, actor_name_snapshot: 'Abel Longname Cashier', created_at: ts + 2, updated_at: ts + 2 },
      { id: 103, type: 'expense', amount: 1700, item_name: 'Milk supplier', payment_type: 'cash', actor_name_snapshot: 'Owner', created_at: ts + 3, updated_at: ts + 3 },
    ].forEach(row => put('transactions', row));
    [
      { id: 201, customer_id: 1, type: 'credit_add', amount: 6500, item_note: 'Credit sale to Abebe', actor_staff_member_id: staffId, actor_name_snapshot: 'Abel Longname Cashier', created_at: ts + 4, updated_at: ts + 4 },
      { id: 202, customer_id: 2, type: 'payment', amount: 3000, item_note: 'Collection from Marta', actor_staff_member_id: 8, actor_name_snapshot: 'Marta', created_at: ts + 5, updated_at: ts + 5 },
    ].forEach(row => put('customer_transactions', row));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { ts, staffRows, activeStaff: !!options.activeStaff, staffId: STAFF_ID });

  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function openReport(page: Page) {
  await page.locator('nav').getByRole('button', { name: /report/i }).click();
  await expect(page.getByText(/Shop Check|My Sales Report/)).toBeVisible();
}

async function expectNoBottomNavOverlap(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await expect(locator).toBeVisible();
    const covered = await locator.evaluate((node) => {
      const nav = document.querySelector('nav');
      if (!nav) return false;
      const navRect = nav.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      return rect.bottom > navRect.top && rect.top < navRect.bottom;
    });
    expect(covered, `${selector} should not be covered by bottom nav`).toBe(false);
  }
}

test('owner report is readable and not covered at required mobile widths', async ({ page }, testInfo) => {
  await resetAndSeed(page, { staff: true });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openReport(page);

    await expect(page.getByPlaceholder(viewport.width < 360 ? 'Search shop records' : 'Search item, code, customer, staff, amount, or date')).toBeVisible();
    for (const label of ['Total Sold', 'Cash Expected', 'Transfer Recorded', 'New Dubie', 'Credit Collected', 'Spent Today']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'All Staff' })).toBeVisible();
    await expect(page.getByText('25,880')).toBeVisible();
    await expect(page.getByText(/Cash 0\.00 .* Transfer 19,380\.00 .* Dubie 6,500\.00/)).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).resolves.toBe(true);
    await expectNoBottomNavOverlap(page, [
      '[data-report-section="staff-sales"] h3',
      '[data-report-section="closing"] h3',
      '[data-report-section="closing"] input',
      '[data-report-section="closing"] button',
      '[data-report-actions]',
    ]);

    if (viewport.width === 320 || viewport.width === 390) {
      await testInfo.attach(`report-${viewport.width}x${viewport.height}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  }
});

test('search, filter, export, history, and closing flows are functional', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetAndSeed(page, { staff: true });
  await openReport(page);

  await page.getByPlaceholder(/Search/).fill('Abebe');
  await expect(page.getByText(/Search results \(1\)/)).toBeVisible();
  await page.getByLabel('Clear search').click();
  await page.getByPlaceholder(/Search/).fill('not-here');
  await expect(page.getByText('No matching shop records in this period and scope.')).toBeVisible();
  await page.getByLabel('Clear search').click();

  await page.getByRole('button', { name: /Filter/i }).click();
  await expect(page.getByText('Report filters')).toBeVisible();
  await page.getByLabel('Payment').selectOption('transfer');
  await page.getByLabel('Close').click();
  await expect(page.getByText('Payment: transfer')).toBeVisible();
  await expect(page.getByText('Transfer order')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/gebya-report-.*\.csv/);

  await page.getByRole('button', { name: /Filter/i }).click();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('Payment: transfer')).toHaveCount(0);

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Report history')).toBeVisible();
  await expect(page.getByText('No saved closing reviews yet.')).toBeVisible();
  await page.getByLabel('Close').click();

  await page.getByLabel('Actual cash counted').fill('3750');
  await page.getByRole('button', { name: /Mark day reviewed/i }).click();
  await expect(page.getByText(/Saved as balanced/)).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openReport(page);
  await expect(page.getByText(/Reviewed by Yosef/)).toBeVisible();

  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByText(/Cash closing is editable only for Today/)).toBeVisible();
});

test('owner-only and staff presentations hide unavailable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await resetAndSeed(page, { staff: false });
  await openReport(page);
  await expect(page.getByText('Shop Check')).toBeVisible();
  await expect(page.getByText('All Staff')).toHaveCount(0);

  await resetAndSeed(page, { staff: true, activeStaff: true });
  await openReport(page);
  await expect(page.getByText('My Sales Report')).toBeVisible();
  await expect(page.getByText('Shop Check')).toHaveCount(0);
  await expect(page.getByText('Needs Attention')).toHaveCount(0);
  await expect(page.getByText('Owner cash closing is not shown in staff view.')).toBeVisible();
  await page.getByRole('button', { name: /Export/i }).click();
  await expect(page.getByText('Export is owner-only on this device.')).toBeVisible();
});
