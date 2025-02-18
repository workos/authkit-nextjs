'use server';

import { signOut } from './auth.js';
import { refreshSession, withAuth } from './session.js';
import { getWorkOSInstance } from './workos.js';

/**
 * This action is only accessible to authenticated users,
 * there is no need to check the session here as the middleware will
 * be responsible for that.
 */
export const checkSessionAction = async () => {
  return true;
};

export const handleSignOutAction = async ({ returnTo }: { returnTo?: string } = {}) => {
  await signOut({ returnTo });
};

export const getOrganizationAction = async (organizationId: string) => {
  return await getWorkOSInstance().organizations.getOrganization(organizationId);
};

export const getAuthAction = async (options?: { ensureSignedIn?: boolean }) => {
  return await withAuth(options);
};

export const refreshAuthAction = async ({
  ensureSignedIn,
  organizationId,
}: {
  ensureSignedIn?: boolean;
  organizationId?: string;
}) => {
  return await refreshSession({ ensureSignedIn, organizationId });
};
