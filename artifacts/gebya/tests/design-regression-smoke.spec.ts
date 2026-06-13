import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function resetFreshOrigin(page: Page) {
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

    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

async function mockIdentityRoutes(page: Page) {
  await page.route('**/api/shops', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();

    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        shop_id: 'design-smoke-shop',
        shop_name: 'Design Smoke Shop',
        join_code: 'SAFE-UI12',
        join_url: 'http://127.0.0.1:4173/?join=SAFE-UI12',
        device_id: 'design-smoke-owner-device',
        device_token: 'design-smoke-owner-token',
        staff_id: 'design-smoke-owner-staff',
        display_name: 'Design Smoke Shop',
        role: 'owner',
        permissions: {},
        device_status: 'active',
        phone_required: false,
        approval_required: false,
      }),
    });
  });

  await page.route('**/api/shops/design-smoke-shop/staff', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ staff: [] }),
    });
  });
}

test('design regression smoke protects core merchant surfaces', async ({ page }, testInfo) => {
  await mockIdentityRoutes(page);
  await resetFreshOrigin(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Gebya').first()).toBeVisible();
  await expect(page.locator('img[alt="Gebya"]')).toBeVisible();
  await expect(page.getByText('How are you using Gebya?')).toBeVisible();
  await expect(page.getByText('I own / manage a shop')).toBeVisible();
  await expect(page.getByText('I was invited by a shop')).toBeVisible();
  await expect(page.getByText('Gebya is a notebook, not a bank.')).toBeVisible();
  await attachScreenshot(page, testInfo, '01-onboarding');

  await page.getByText('I own / manage a shop').click();
  await page.getByPlaceholder('e.g. Tigist').fill('Design Smoke Shop');
  await page.getByRole('button', { name: 'Start using Gebya' }).click();

  await expect(page.getByText('Recording as')).toBeVisible();
  await expect(page.getByText('Design Smoke Shop').first()).toBeVisible();
  await expect(page.getByText(/TODAY\s+.*NET/i)).toBeVisible();
  await expect(page.getByText('Saved on this phone only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record a Sale' })).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: 'Today' })).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: 'Report' })).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: 'More' })).toBeVisible();
  await attachScreenshot(page, testInfo, '02-owner-home');

  await page.locator('nav').getByRole('button', { name: 'More' }).click();
  await expect(page.getByText('Profile')).toBeVisible();
  await expect(page.getByText('Payment channels')).toBeVisible();
  await expect(page.getByText('Team & Staff')).toBeVisible();
  await expect(page.getByText('Backup & data')).toBeVisible();
  await attachScreenshot(page, testInfo, '03-settings-more');

  await page.getByRole('button', { name: /Team & Staff/ }).click();
  await expect(page.getByText('Owner-only area.')).toBeVisible();
  await expect(page.getByText('Shop invite code')).toBeVisible();
  await expect(page.getByText('SAFE-UI12')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rotate' })).toBeVisible();
  await expect(page.getByText('Require staff phone number')).toBeVisible();
  await expect(page.getByText('Require device approval')).toBeVisible();
  await attachScreenshot(page, testInfo, '04-team-and-staff');

  await page.locator('nav').getByRole('button', { name: 'Report' }).click();
  await expect(page.getByPlaceholder('Search item, code, customer, staff, amount, or date')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'today', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'week', exact: true })).toBeVisible();
  await expect(page.getByText('Total Sold')).toBeVisible();
  await expect(page.getByText("Today's Closing Check")).toBeVisible();
  await attachScreenshot(page, testInfo, '05-report');
});
