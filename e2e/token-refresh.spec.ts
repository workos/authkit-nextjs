import { test, expect } from './fixtures.js';

// Token refresh tests require authentication — skip on vinext
const needsAuth = test.extend<{ requiresAuth: void }>({
  requiresAuth: [
    async ({}, use, testInfo) => {
      if (testInfo.project.name === 'vinext') {
        testInfo.skip(true, 'vinext does not propagate cookies on redirect');
      }
      await use();
    },
    { auto: true },
  ],
});

needsAuth.describe('token refresh', () => {
  needsAuth('refresh endpoint returns updated session', async ({ page, baseURL, signIn }) => {
    await signIn();

    // Hit the test-refresh route which calls refreshSession()
    const response = await page.goto(`${baseURL}/test-refresh`);
    expect(response?.status()).toBe(200);

    const body = await page.evaluate(() => document.body.textContent);
    const json = JSON.parse(body!);
    expect(json.refreshed).toBe(true);
    expect(json.user.email).toBe('test@example.com');
  });

  needsAuth('session remains valid after refresh', async ({ page, baseURL, signIn }) => {
    await signIn();

    // Force a refresh
    await page.goto(`${baseURL}/test-refresh`);

    // Navigate back to home — should still be authenticated
    await page.goto(baseURL!);
    await expect(page.getByText('Welcome back')).toBeVisible();
  });
});
