import { test, expect } from './fixtures.js';

// Session isolation tests require authentication — skip on vinext
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

needsAuth.describe('session management', () => {
  needsAuth('session persists across page navigations', async ({ page, baseURL, signIn }) => {
    await signIn();

    // Navigate to account page — should still be authenticated
    await page.goto(`${baseURL}/account`);
    await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();

    // Navigate back to home — should still show welcome
    await page.goto(baseURL!);
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  needsAuth('session is isolated between browser contexts', async ({ browser, baseURL, signIn, page }) => {
    // Sign in with the default context
    await signIn();
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Create a fresh incognito context — should NOT be authenticated
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto(baseURL!);

    await expect(otherPage.getByText('AuthKit authentication example')).toBeVisible();
    await expect(otherPage.getByText('Welcome back')).not.toBeVisible();

    await otherContext.close();
  });

  needsAuth('session cookie contains expected name', async ({ page, baseURL, signIn }) => {
    await signIn();

    const cookies = await page.context().cookies(baseURL!);
    const sessionCookie = cookies.find((c) => c.name === 'wos-session');

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.value).toBeTruthy();
  });
});
