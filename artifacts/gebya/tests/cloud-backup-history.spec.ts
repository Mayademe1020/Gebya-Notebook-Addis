import { expect, test } from '@playwright/test';

// P0-4b — the Data tab must show the snapshots the server already holds and
// restore one. The server half existed for months with no client caller, so a
// shop that lost its phone had no way back.
//
// Run: pnpm build && node scripts/run-playwright-isolated.mjs 4186 tests/cloud-backup-history.spec.ts --project=chromium

const OWNER_PERMISSIONS = {
  can_manage_team: true,
  can_delete_records: true,
  can_edit_settings: true,
  can_add_records: true,
  can_view_reports: true,
};

const SNAPSHOTS = [
  {
    id: 7,
    name: 'Auto-backup 2026-11-20',
    description: 'Weekly auto-backup from Gebya',
    deviceId: 'device-1',
    sizeBytes: 512,
    tables: ['transactions', 'customers', 'suppliers'],
    recordCount: 12,
    checksum: 'abc',
    createdAt: Date.UTC(2026, 10, 20, 9, 0, 0),
  },
  {
    id: 6,
    name: 'Auto-backup 2026-11-13',
    description: 'Weekly auto-backup from Gebya',
    deviceId: 'device-1',
    sizeBytes: 256,
    tables: ['transactions', 'customers', 'suppliers'],
    recordCount: 8,
    checksum: 'def',
    createdAt: Date.UTC(2026, 10, 13, 9, 0, 0),
  },
];

async function mockOwnerAuth(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ token: 'test-owner-token' }),
  }));
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      user: {
        id: 'test-user',
        phone_number: '+251911234567',
        preferred_lang: 'en',
        created_at: new Date().toISOString(),
      },
      has_password: false,
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      businesses: [{
        business_id: 'shop-1',
        name: 'Test Shop',
        plan: 'free',
        role: 'owner',
        permissions: OWNER_PERMISSIONS,
      }],
      is_platform_admin: false,
    }),
  }));
}

test.describe('Cloud backup history', () => {
  test.beforeEach(async ({ page }) => {
    await mockOwnerAuth(page);
    await page.route('**/api/backup/list', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, snapshots: SNAPSHOTS }),
    }));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      localStorage.clear();
      localStorage.setItem('gebya_lang', 'en');
      await new Promise<void>((resolve) => {
        const request = window.indexedDB.deleteDatabase('GebyaDB');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      const request = window.indexedDB.open('GebyaDB');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        store.put({ key: 'intro_seen', value: 'yes' });
        store.put({ key: 'shop_name', value: 'Test Shop' });
        store.put({ key: 'shop_phone', value: '+251911234567' });
        store.put({ key: 'gebya_auth_token', value: 'test-owner-token' });
        store.put({
          key: 'cached_permissions',
          value: {
            permissions: {
              can_manage_team: true,
              can_delete_records: true,
              can_edit_settings: true,
              can_add_records: true,
              can_view_reports: true,
            },
            role: 'owner',
            cached_at: Date.now(),
          },
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.locator('nav').getByRole('button', { name: 'More' }).click();
    await page.getByRole('tab', { name: /data/i }).click();
  });

  test('lists the snapshots the server holds', async ({ page }) => {
    await expect(page.getByText('Cloud backups')).toBeVisible();
    await expect(page.getByText('12 records')).toBeVisible();
    await expect(page.getByText('8 records')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(2);
  });

  test('asks twice before replacing, and says what it replaces', async ({ page }) => {
    await page.getByRole('button', { name: 'Restore' }).first().click();

    await expect(page.getByText('Restore from backup?')).toBeVisible();
    await expect(page.getByText(/Backup contains:/)).toBeVisible();

    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByText('Are you sure?')).toBeVisible();
    await expect(page.getByText(/Tip: download a backup of current data first/i)).toBeVisible();
  });
});