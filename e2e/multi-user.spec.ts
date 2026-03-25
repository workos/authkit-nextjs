import { test, expect } from './fixtures.js';

// Multi-user tests require authentication — skip on vinext
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

needsAuth.describe('multi-user support', () => {
  needsAuth('login_hint selects a specific user', async ({ page, baseURL }) => {
    // Sign in as the second seeded user via login_hint
    await page.goto(`${baseURL}/login?login_hint=other@example.com`);
    await page.waitForURL((url) => !url.pathname.includes('/callback') && !url.href.includes('/user_management/authorize'));

    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10_000 });
    // Should see "Other" (the second user's first name), not "Test"
    await expect(page.getByRole('heading', { name: /Welcome back.*Other/i })).toBeVisible();
  });

  needsAuth('different users see different account details', async ({ page, baseURL }) => {
    // Sign in as the second user
    await page.goto(`${baseURL}/login?login_hint=other@example.com`);
    await page.waitForURL((url) => !url.pathname.includes('/callback') && !url.href.includes('/user_management/authorize'));
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10_000 });

    // Account page should show the second user's details
    await page.goto(`${baseURL}/account`);
    await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /first name/i })).toHaveValue('Other');
    await expect(page.getByRole('textbox', { name: /email/i })).toHaveValue('other@example.com');
  });

  needsAuth('sessions are isolated between users in separate contexts', async ({ browser, baseURL }) => {
    // Sign in as first user in context A
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto(`${baseURL}/login`);
    await pageA.waitForURL((url) => !url.pathname.includes('/callback') && !url.href.includes('/user_management/authorize'));
    await expect(pageA.getByText('Welcome back')).toBeVisible({ timeout: 10_000 });

    // Sign in as second user in context B
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`${baseURL}/login?login_hint=other@example.com`);
    await pageB.waitForURL((url) => !url.pathname.includes('/callback') && !url.href.includes('/user_management/authorize'));
    await expect(pageB.getByText('Welcome back')).toBeVisible({ timeout: 10_000 });

    // Verify they see different users
    await pageA.goto(`${baseURL}/account`);
    await expect(pageA.getByRole('textbox', { name: /email/i })).toHaveValue('test@example.com');

    await pageB.goto(`${baseURL}/account`);
    await expect(pageB.getByRole('textbox', { name: /email/i })).toHaveValue('other@example.com');

    await contextA.close();
    await contextB.close();
  });
});
