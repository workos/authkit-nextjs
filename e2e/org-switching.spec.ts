import { test, expect } from './fixtures.js';

const EMULATOR_URL = 'http://localhost:4100';
const API_KEY = 'sk_test_default';

// Org switching tests require authentication — skip on vinext
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

async function getOrgId(): Promise<string> {
  const res = await fetch(`${EMULATOR_URL}/organizations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const body = await res.json();
  return body.data[0].id;
}

async function createMembership(userId: string, orgId: string): Promise<void> {
  await fetch(`${EMULATOR_URL}/user_management/organization_memberships`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, organization_id: orgId }),
  });
}

async function getUserId(email: string): Promise<string> {
  const res = await fetch(`${EMULATOR_URL}/user_management/users?email=${email}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const body = await res.json();
  return body.data[0].id;
}

needsAuth.describe('organization switching', () => {
  needsAuth.beforeAll(async () => {
    const [userId, orgId] = await Promise.all([getUserId('test@example.com'), getOrgId()]);
    await createMembership(userId, orgId);
  });

  needsAuth('switch org via client page updates organization badge', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    // Initially no org
    await expect(page.getByText('none').first()).toBeVisible();

    // Enter org ID and switch
    const orgId = await getOrgId();
    await page.getByPlaceholder('org_...').fill(orgId);
    await page.getByRole('button', { name: 'Switch' }).click();

    // Should show success and updated org badge
    await expect(page.getByText('Switched successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(orgId)).toBeVisible();
  });

  needsAuth('switch org via test route returns session with org context', async ({ page, baseURL, signIn }) => {
    await signIn();

    const orgId = await getOrgId();
    const response = await page.goto(`${baseURL}/test-switch-org?org_id=${orgId}`);
    expect(response?.status()).toBe(200);

    const body = await page.evaluate(() => document.body.textContent);
    const json = JSON.parse(body!);
    expect(json.switched).toBe(true);
    expect(json.organizationId).toBe(orgId);
    expect(json.user.email).toBe('test@example.com');
  });
});
