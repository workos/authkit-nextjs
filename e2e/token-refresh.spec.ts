import { test, expect } from './fixtures.js';

// Token refresh tests require authentication — skip on vinext
const needsAuth = test.extend<{ requiresAuth: void }>({
  requiresAuth: [
    async (_fixtures, use, testInfo) => {
      if (testInfo.project.name === 'vinext') {
        testInfo.skip(true, 'vinext does not propagate cookies on redirect');
      }
      await use();
    },
    { auto: true },
  ],
});

needsAuth.describe('token refresh', () => {
  needsAuth('refresh token via client page succeeds', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    await expect(page.getByText('Available')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh Token' }).click();

    await expect(page.getByText('Token refreshed successfully')).toBeVisible({ timeout: 5000 });
  });

  needsAuth('session remains valid after refresh', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    // Refresh the token
    await page.getByRole('button', { name: 'Refresh Token' }).click();
    await expect(page.getByText('Token refreshed successfully')).toBeVisible({ timeout: 5000 });

    // Navigate back to home — should still be authenticated
    await page.goto(baseURL!);
    await expect(page.getByText('Welcome back')).toBeVisible();
  });
});
