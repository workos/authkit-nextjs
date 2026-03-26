import { test, expect } from './fixtures.js';

// Auth-dependent tests skip on vinext (PKCE cookie issue)
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

test.describe('client-side hooks', () => {
  test('useAuth resolves to unauthenticated state after hydration', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/client`);
    await expect(page.getByText('Please sign in to see the client-side hooks in action.')).toBeVisible();
  });

  needsAuth('useAuth shows session info when authenticated', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    await expect(page.getByRole('heading', { name: 'useAuth() Hook' })).toBeVisible();
    await expect(page.getByText('User ID:')).toBeVisible();
    await expect(page.getByText('Session ID:')).toBeVisible();
    await expect(page.getByText('Impersonator:')).toBeVisible();
  });

  needsAuth('useAccessToken shows token status', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    await expect(page.getByRole('heading', { name: 'useAccessToken() Hook' })).toBeVisible();
    await expect(page.getByText('Available')).toBeVisible();
    // Truncated token should be visible
    await expect(page.getByText('Access Token:')).toBeVisible();
  });

  needsAuth('useAuth updates after client-side sign-out', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);
    await expect(page.getByText('Session ID:')).toBeVisible();

    await page
      .getByRole('main')
      .getByRole('button', { name: /sign out/i })
      .click();
    await page.waitForTimeout(1000);
    await page.goto(`${baseURL}/client`);

    await expect(page.getByText('Please sign in to see the client-side hooks in action.')).toBeVisible({
      timeout: 10_000,
    });
  });
});
