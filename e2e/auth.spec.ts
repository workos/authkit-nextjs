import { test, expect } from './fixtures.js';

// vinext's redirect() shim doesn't propagate Set-Cookie headers from cookies().set(),
// so the PKCE cookie is lost during the sign-in redirect chain. Tests that require
// authentication are skipped for vinext until this is resolved upstream.
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

test.describe('authentication flows', () => {
  test('unauthenticated home page shows sign-in prompt', async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    await expect(page.getByText('AuthKit authentication example')).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByText('Welcome back')).not.toBeVisible();
  });

  needsAuth('sign-in flow authenticates and shows welcome message', async ({ page, signIn }) => {
    await signIn();
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByText('Test')).toBeVisible();
  });

  needsAuth('authenticated user can view account page', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/account`);
    await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /first name/i })).toHaveValue('Test');
    await expect(page.getByRole('textbox', { name: /email/i })).toHaveValue('test@example.com');
  });

  test('unauthenticated access to /account does not show account details', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/account`);
    // ensureSignedIn triggers a redirect or error for unauthenticated users —
    // either way, the account details should not be visible.
    await expect(page.getByRole('heading', { name: 'Account details' })).not.toBeVisible();
  });

  needsAuth('sign-out clears session', async ({ page, baseURL, signIn }) => {
    await signIn();
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Click the sign out button in the main content area.
    // signOut() deletes the session cookie then redirects to the emulator's
    // logout endpoint which revokes the session. Without a full returnTo URL,
    // the emulator returns JSON, so we navigate back to verify session cleared.
    await page.getByRole('main').getByRole('button', { name: /sign out/i }).click();
    await page.waitForTimeout(1000);
    await page.goto(baseURL!);

    // Session should be cleared — user should see the unauthenticated state
    await expect(page.getByText('AuthKit authentication example')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Welcome back')).not.toBeVisible();
  });
});
