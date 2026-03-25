import { test, expect } from './fixtures.js';

// Auth-dependent tests skip on vinext (PKCE cookie issue)
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

test.describe('client-side hooks', () => {
  test('useAuth resolves to unauthenticated state after hydration', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/client`);
    // Unauthenticated users see the sign-in prompt
    await expect(page.getByText('Please sign in to see the client-side hooks in action.')).toBeVisible();
  });

  needsAuth('useAuth shows session info when authenticated', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    await expect(page.getByRole('heading', { name: 'useAuth() Hook' })).toBeVisible();
    await expect(page.getByText('User ID:')).toBeVisible();
    await expect(page.getByText('Session ID:')).toBeVisible();
    // Impersonator info should be visible (seeded user has impersonator data)
    await expect(page.getByText('Impersonator:')).toBeVisible();
  });

  needsAuth('useAccessToken provides token status', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    // Token should be available after sign-in
    await expect(page.getByText('Available')).toBeVisible();
  });

  needsAuth('refresh token button works', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    // Token should be available before refresh
    await expect(page.getByText('Available')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh Token' }).click();
    // Token should still be available after refresh
    await expect(page.getByText('Available')).toBeVisible();
  });

  needsAuth('useAuth updates after sign-out', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);
    await expect(page.getByText('Session ID:')).toBeVisible();

    // Sign out via the client page button and navigate back
    await page.getByRole('main').getByRole('button', { name: /sign out/i }).click();
    await page.waitForTimeout(1000);
    await page.goto(`${baseURL}/client`);

    // Should show unauthenticated state
    await expect(page.getByText('Please sign in to see the client-side hooks in action.')).toBeVisible({ timeout: 10_000 });
  });
});
