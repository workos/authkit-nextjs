import { test, expect } from './fixtures.js';

// Tests for client-side hook behavior (useAuth).
// The SignInButton component uses useAuth() and renders:
//   - "Loading..." while hydrating
//   - "Sign In" link when unauthenticated
//   - "Sign Out" button when authenticated

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
    await page.goto(baseURL!);

    // After hydration, useAuth should resolve — "Loading..." disappears
    // and sign-in links become visible
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByText('Loading...')).not.toBeVisible();
  });

  needsAuth('useAuth reflects authenticated state after sign-in', async ({ page, signIn }) => {
    await signIn();

    // useAuth should now show the user is authenticated — sign out buttons visible
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).not.toBeVisible();
  });

  needsAuth('useAuth updates after sign-out', async ({ page, baseURL, signIn }) => {
    await signIn();
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();

    // Sign out and return to home
    await page.getByRole('main').getByRole('button', { name: /sign out/i }).click();
    await page.waitForTimeout(1000);
    await page.goto(baseURL!);

    // useAuth should reflect unauthenticated state
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible({ timeout: 10_000 });
  });
});
