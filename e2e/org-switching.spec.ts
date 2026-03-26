import { test, expect } from './fixtures.js';

const EMULATOR_URL = 'http://localhost:4100';
const API_KEY = 'sk_test_default';

// Org switching tests require authentication — skip on vinext
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

  needsAuth('switch org via client page shows success', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    await expect(page.getByRole('heading', { name: 'Organization Management' })).toBeVisible();

    const orgId = await getOrgId();
    await page.getByPlaceholder('org_...').fill(orgId);
    await page.getByRole('button', { name: 'Switch' }).click();

    await expect(page.getByText('Success!')).toBeVisible({ timeout: 10_000 });
  });

  needsAuth('org badge updates after switching', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    const orgId = await getOrgId();
    await page.getByPlaceholder('org_...').fill(orgId);
    await page.getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByText('Success!')).toBeVisible({ timeout: 10_000 });

    // The Organization ID field should now show the org ID
    await expect(page.getByText(orgId)).toBeVisible();
  });

  needsAuth('session remains valid after org switch', async ({ page, baseURL, signIn }) => {
    await signIn();
    await page.goto(`${baseURL}/client`);

    const orgId = await getOrgId();
    await page.getByPlaceholder('org_...').fill(orgId);
    await page.getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByText('Success!')).toBeVisible({ timeout: 10_000 });

    // Navigate back — should still be authenticated
    await page.goto(baseURL!);
    await expect(page.getByText('Welcome back')).toBeVisible();
  });
});
