import { test, expect } from './fixtures.js';

test.describe('error handling', () => {
  test('corrupt session cookie is handled gracefully', async ({ page, baseURL }) => {
    // Set a garbage session cookie
    await page.context().addCookies([
      {
        name: 'wos-session',
        value: 'this-is-not-a-valid-encrypted-session',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(baseURL!);

    // The app should not crash — it should treat the user as unauthenticated
    await expect(page.getByText('AuthKit authentication example')).toBeVisible();
  });

  test('corrupt session cookie on protected page does not crash', async ({ page, baseURL }) => {
    await page.context().addCookies([
      {
        name: 'wos-session',
        value: 'garbage-cookie-value',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`${baseURL}/account`);

    // Should not render account details — either an error page or redirect
    await expect(page.getByRole('heading', { name: 'Account details' })).not.toBeVisible();
  });

  test('callback with missing params shows error', async ({ page, baseURL }) => {
    // Hit /callback directly with no code or state
    await page.goto(`${baseURL}/callback`);

    const body = await page.textContent('body');
    expect(body).toContain('Something went wrong');
  });

  test('callback with invalid code shows error', async ({ page, baseURL }) => {
    // Set a fake PKCE cookie so the state check passes but code exchange fails
    const fakeState = 'fake-state-value';
    await page.context().addCookies([
      {
        name: 'wos-auth-verifier',
        value: fakeState,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto(`${baseURL}/callback?code=invalid_code&state=${fakeState}`);

    const body = await page.textContent('body');
    expect(body).toContain('Something went wrong');
  });
});
