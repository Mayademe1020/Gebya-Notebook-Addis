import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { label } from '../src/labels/index.js';

// R2.1 pixel-proof helper: freeze animated state and wait for fonts so two
// runs of the same code produce the same PNG. Used only before screenshots.
async function settleForScreenshot(page: Page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

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

// Seed the permissions cache as owner AFTER the app has created its IndexedDB
// (onboarding itself doesn't resolve a role without a backend — the store
// hydrates cached_permissions on cold boot). Then reload so the store picks
// it up before any role-gated surface renders.
// Unpinned variant: clears storage but does NOT set gebya_lang, so the app
// renders in its real default locale (Amharic). Used by the Amharic smoke run
// so screenshots reflect what real users see, including Amharic label length.
async function resetFreshOriginDefaultLocale(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase('GebyaDB');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
}


async function seedOwnerRole(page: Page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({
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
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
    await page.reload({ waitUntil: 'domcontentloaded' });
}

// Seed a full shop profile (shop_name, shop_phone, intro_seen) plus the owner
// permissions cache, then reload so the store hydrates before the shell renders.
// This bypasses the OnboardingScreen gate (!shopProfile.name) so the full shell
// (SideNav, Settings tabs, Staff, Report) renders immediately. Used by the AM
// unpinned test so it can exercise Amharic nav labels and settings panels
// without navigating through the onboarding form.
async function seedShopProfileAndOwnerRole(page: Page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('GebyaDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['settings', 'identity'], 'readwrite');
      tx.objectStore('settings').put({ key: 'shop_name', value: 'Design Smoke Shop' });
      tx.objectStore('settings').put({ key: 'shop_phone', value: '+12025550101' });
      tx.objectStore('settings').put({ key: 'intro_seen', value: 'true' });
      tx.objectStore('settings').put({
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
      tx.objectStore('identity').put({
        key: 'me',
        shop_id: 'design-smoke-shop',
        shop_name: 'Design Smoke Shop',
        join_code: 'SAFE-UI12',
        join_url: 'http://127.0.0.1:4173/?join=SAFE-UI12',
        device_id: 'design-smoke-owner-device',
        device_token: 'design-smoke-owner-token',
        staff_id: 'design-smoke-owner-staff',
        display_name: 'Design Smoke Shop',
        phone_number: '+12025550101',
        role: 'owner',
        permissions: {},
        device_status: 'active',
        phone_required: false,
        approval_required: false,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const shot = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, {
    body: shot,
    contentType: 'image/png',
  });
  // Optional stable artifact: Playwright attachments are ephemeral (report-only),
  // so set SMOKE_SHOT_DIR (e.g. screenshots/amharic-default) to also persist the
  // PNGs to disk. Unset in CI — attachments remain the canonical artifact there.
  const shotDir = process.env.SMOKE_SHOT_DIR;
  if (shotDir) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    fs.mkdirSync(shotDir, { recursive: true });
    fs.writeFileSync(path.join(shotDir, `${name}.png`), shot);
  }
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
  await seedOwnerRole(page);

  await expect(page.getByText('Gebya').first()).toBeVisible();
  await expect(page.locator('img[alt="Gebya"]')).toBeVisible();
  // Current onboarding copy (Two ways / Select Account Type)
  await expect(page.getByText(label('onboarding.two-ways-to-use-gebya', 'en'))).toBeVisible();
  await expect(page.getByText('Shop Owner')).toBeVisible();
  await expect(page.getByText('Join a Shop')).toBeVisible();
  await expect(page.getByText('All data stays on your phone · Not connected with your bank · Free')).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '01-onboarding');

  await page.getByText('Shop Owner').click();
  await page.getByPlaceholder('Enter your name').fill('Design Smoke Shop');
  await page.getByRole('button', { name: label('onboarding.start', 'en'), exact: true }).click();

  await expect(page.getByText('Recording as')).toBeVisible();
  await expect(page.getByText('Design Smoke Shop').first()).toBeVisible();
  await expect(page.getByText(/TODAY\s+.*NET/i)).toBeVisible();
  // The scoreboard renders in compact one-line form (SaleWorkspace v1);
  // expand it to reach the trust line it now hides by default.
  await page.getByRole('button', { name: label('today.show-details', 'en') }).click();
  await expect(page.getByText('Saved on this phone only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record a Sale' })).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: 'Today' })).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: 'Report' })).toBeVisible();
  await expect(page.locator('nav').getByRole('button', { name: 'More' })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '02-owner-home');

  await page.locator('nav').getByRole('button', { name: 'More' }).click();
  // Current settings layout: tabbed (Shop / Money / Data) with accordion cards
  // Settings tabs are real ARIA tabs (role="tab"), not plain buttons.
  await expect(page.getByRole('tab', { name: 'Shop' })).toBeVisible();
  await expect(page.getByText(label('settings-shop.shop-profile', 'en'))).toBeVisible();
  await expect(page.getByText(label('settings-shop.items', 'en'), { exact: true })).toBeVisible();
  await expect(page.getByText(label('settings-shop.recurring-expenses', 'en'), { exact: true })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '03-settings-more');

  // R1 dedupe: reminder / notification / password panels are rendered ONCE,
  // at the top of the Data tab (no longer outside the tab panels).
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByText(label('settings-data.auto-reminders', 'en'))).toBeVisible();
  await expect(page.getByText(label('settings-data.notification-preferences', 'en'))).toBeVisible();
  await expect(page.getByText(label('settings-data.password-login', 'en'))).toBeVisible();

  // Team & Staff lives on the dedicated Staff tab (owner tab bar + join code).
  // 'Team' is an ARIA tab in the staff surface, not a plain button.
  await page.locator('nav').getByRole('button', { name: 'Staff' }).click();
  await expect(page.getByRole('tab', { name: 'Team' })).toBeVisible();
  await expect(page.getByText('Join code')).toBeVisible();
  await expect(page.getByText('SAFE-UI12')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset code' })).toBeVisible();
  await expect(page.getByText('Add Staff')).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '04-staff-team');

  await page.locator('nav').getByRole('button', { name: 'Report' }).click();
  await expect(page.getByRole('heading', { name: /Notebook/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '🌅 Today' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '📅 Week' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '🗓 Month' })).toBeVisible();
  // Empty shop renders the welcome/empty state (current ReportView copy)
  await expect(page.getByText(label('reports.welcome-to-your-shop', 'en'))).toBeVisible();
  await expect(page.getByText(label('reports.record-your-first-sale-today-your-shop', 'en'))).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: /Sale/ })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '05-report');
});

// ─── Unpinned (default Amharic) smoke ────────────────────────────
// Gate A addendum: design-regression-smoke also runs once UNPINNED so the
// screenshots reflect what real users see, including Amharic label length.
// Onboarding is bypassed via a seeded owner (intro_seen), because the
// onboarding copy is locale-specific and the goal here is layout/overflow,
// not literal copy. Assertions use verified Amharic source strings where
// available; everything else is locale-agnostic (counts + roles + English
// strings that are shared across locales, e.g. "Join code", "SAFE-UI12").
test('design regression smoke — default Amharic (unpinned)', async ({ page }, testInfo) => {
  await mockIdentityRoutes(page);
  await resetFreshOriginDefaultLocale(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // NOTE: seedOwnerRole() alone does NOT seed intro_seen, so the shell still
  // renders the onboarding card (no SideNav, no settings tabs). The smoke
  // goal here is seed: layouts + overflow, which needs the shell fully
  // mounted; the onboarding-gated first-run Amharic path moves to R2 (see
  // docs/R2-WIREFRAMES.md — Owner/incomplete setup state).
  await seedShopProfileAndOwnerRole(page);

  // Brand: SideNav.jsx:32 hardcodes <span className="text-xl font-black">Gebya</span> —
  // visible brand on the seeded shell, locale-agnostic English by intent.
  // t('appName') -> 'ገበያ' (AM_OVERRIDES.appName, dictionaries.js:1076) exists but
  // is NOT rendered as visible in-flow text on the seeded shell (only transient on
  // LoadingScreen's <h1>, gone once seed glyphs are hydrated). Brand is English
  // by design — DO NOT localize it. See R2 dead-override note below.
  await expect(page.getByText('Gebya').first()).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '01-am-home');

  // Amharic nav labels (SideNav.jsx:9/8/7 TABS.am): 'ተጨማሪ' / 'ሰራተኞች' / 'ሪፖርት'.
  await page.locator('nav').getByRole('button', { name: 'ተጨማሪ' }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);

  // Settings panels in Amharic. Panel headers are by design (shop-tabs.opt,
  // ShopTab.jsx:58; ReminderSettings.jsx:101; NotificationPreferences.jsx:227).
  // tab names: ሱቅ/ገንዘብ/ውሂብ — REMOVED in R2 (SettingsPanel now uses locale-agnostic
  // "Shop"/"Money"/"Data"). Assert structural only (count + role), NOT the removed
  // tab strings. Verified Amharic headers live in the panels that open after the
  // tab is clicked.
  //   // mojibake tripwire: የሱቅ መገለጫ
  await expect(page.getByText(label('settings-shop.shop-profile', 'am'), { exact: true })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '03-am-settings');

  // Data tab — STRUCTURAL click only (owner amendment #2): the Shop/Money/Data
  // tab labels are locale-rendered (SettingsPage.jsx TABS[].labelAm) and slated
  // for removal in R2, so they must NOT be name-pinned here. nth(2) = third tab
  // (fixed Shop → Money → Data order in SettingsPage TABS); label fidelity is
  // carried by the 04-am-data-tabs screenshot instead. ReminderSettings header =
  // label('settings-data.auto-reminders', 'am') (ReminderSettings.jsx:101).
  // NotificationPreferences header = label('settings-data.notification-preferences', 'am') (NotificationPreferences.jsx:227).
  await page.getByRole('tab').nth(2).click();
  //   // mojibake tripwire: ራስ-ሰር ማስታወቂያ
  await expect(page.getByText(label('settings-data.auto-reminders', 'am'), { exact: true })).toBeVisible();
  //   // mojibake tripwire: የማስጠንቂያ ምርጫ
  await expect(page.getByText(label('settings-data.notification-preferences', 'am'), { exact: true })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '04-am-data-tabs');

  // Staff tab in Amharic. Nav button = 'ሰራተኞች' (SideNav.jsx:8 TABS.am). The
  // staff surface has five ARIA tabs (Team / Today / Performance / Settlements /
  // Activity); assert the structural count instead of a locale-specific title.
  await page.locator('nav').getByRole('button', { name: 'ሰራተኞች' }).click();
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(page.getByRole('tab').first()).toBeVisible();
  await expect(page.getByText('የመቀላቀል ኮድ', { exact: true })).toBeVisible();
  await expect(page.getByText('SAFE-UI12', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ቅዳ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ኮድ ለአዲስ', exact: true })).toBeVisible();
  await expect(page.getByText('ሰራተኛ አክሙ', { exact: true })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '05-am-staff');

  // Report in Amharic. Nav button = 'ሪፖርት' (SideNav.jsx:9 TABS.am). Period
  // labels and empty-state copy are locale-specific; assert exact verified
  // Amharic strings and the report's structural controls.
  //   // mojibake tripwire: ወደ ሱቅ ታሪክ እንኳን በደህና መጡ
  await page.locator('nav').getByRole('button', { name: 'ሪፖርት' }).click();
  await expect(page.getByRole('main').getByRole('heading', {
    name: label('reports.welcome-to-your-shop', 'am'),
    exact: true,
  })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '🌅 ዛሬ', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '📅 ሳምንት', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '🗓 ወር', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '✏️ ብጁ', exact: true })).toBeVisible();
  await expect(page.getByText(label('reports.record-your-first-sale-today-your-shop', 'am'), { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', {
    name: '🛒 የመጀመሪያ ሽያጭ መዝግብ',
    exact: true,
  })).toBeVisible();
  await settleForScreenshot(page);
  await attachScreenshot(page, testInfo, '06-am-report');
});
