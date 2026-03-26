import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixtures that provide emulator reset between tests
 * and a convenience `signIn` helper for tests needing authenticated state.
 */
export const test = base.extend<{
  signIn: () => Promise<void>;
}>({
  signIn: async ({ page, baseURL }, use) => {
    const doSignIn = async () => {
      await page.goto(`${baseURL}/login`);
      // The emulator auto-selects the first seeded user and redirects back.
      // Wait for the callback redirect to complete and land on the home page.
      await page.waitForURL(
        (url) => !url.pathname.includes('/callback') && !url.href.includes('/user_management/authorize'),
      );
      await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10_000 });
    };
    await use(doSignIn);
  },
});

export { expect };
