import { test } from '@playwright/test';

test('responsiveness check: sale form at 320px, 360px, 375px', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Onboard if needed
  if (await page.getByText(/start your notebook/i).isVisible()) {
    await page.getByPlaceholder(/e\.g\. tigist/i).fill('Test Shop');
    await page.getByRole('button', { name: /start using gebya/i }).click();
    await page.waitForTimeout(1000);
  }

  // Open Sale form
  await page.getByRole('button', { name: /type sale/i }).click();
  await page.waitForTimeout(1000);

  // Fill some data to expand form
  await page.locator('input[inputmode="decimal"]').first().fill('1000');
  await page.getByPlaceholder(/e\.g\. bread/i).fill('Test Item');
  await page.waitForTimeout(600);

  // 320px
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/responsive-320px.png', fullPage: true });

  // 360px
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/responsive-360px.png', fullPage: true });

  // 375px
  await page.setViewportSize({ width: 375, height: 640 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/responsive-375px.png', fullPage: true });

  // Test Dubie state at 320px
  await page.getByTestId('sale-settlement-pay_later').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/responsive-320px-pay-later.png', fullPage: true });
});
