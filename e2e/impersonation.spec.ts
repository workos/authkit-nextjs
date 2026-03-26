import { test, expect } from './fixtures.js';

// Impersonation tests require authentication — skip on vinext
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

needsAuth.describe('impersonation', () => {
  needsAuth('shows impersonation banner when session has impersonator', async ({ page, signIn }) => {
    await signIn();

    // The seeded user has impersonator data — the Impersonation component
    // should render a banner showing who is being impersonated
    const banner = page.locator('[data-workos-impersonation-root]');
    await expect(banner).toBeVisible();
    await expect(page.getByText('You are impersonating')).toBeVisible();
    await expect(page.getByText('test@example.com')).toBeVisible();
  });

  needsAuth('impersonation banner has stop button', async ({ page, signIn }) => {
    await signIn();

    const banner = page.locator('[data-workos-impersonation-root]');
    await expect(banner).toBeVisible();

    const stopButton = banner.getByRole('button', { name: 'Stop' });
    await expect(stopButton).toBeVisible();
  });

  needsAuth('stop impersonation ends session', async ({ page, baseURL, signIn }) => {
    await signIn();

    const banner = page.locator('[data-workos-impersonation-root]');
    await expect(banner).toBeVisible();

    // Click "Stop" to end impersonation — the Impersonation component's sign-out
    // doesn't pass returnTo, so the emulator returns JSON. Navigate back manually.
    await banner.getByRole('button', { name: 'Stop' }).click();
    await page.waitForTimeout(1000);
    await page.goto(baseURL!);

    // Should return to unauthenticated state
    await expect(page.getByText('AuthKit authentication example')).toBeVisible({ timeout: 10_000 });
    await expect(banner).not.toBeVisible();
  });
});
