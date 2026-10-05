import { test, expect } from '@playwright/test';

// Runs against the static build without a Salesforce session: checks the shell,
// navigation and the honest "can't reach Salesforce" state. Data journeys are
// verified against an org (see docs/SALES_WORKSPACE.md).
test.describe('Amwaj sales workspace shell', () => {
  test('shows branded navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'Amwaj International' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const label of ['Overview', 'My leads', 'Customers', 'Units', 'EOIs & holds', 'My commission']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('explains when Salesforce is unreachable instead of showing sample data', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText("We couldn't load this");
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
