'use server';

import { signOut } from './auth.js';
import { refreshSession, withAuth } from './session.js';
import { workos } from './workos.js';

/**
 * This action is only accessible to authenticated users,
 * there is no need to check the session here as the middleware will
 * be responsible for that.
 */
export const checkSessionAction = async () => {
  return true;
};

export const handleSignOutAction = async () => {
  await signOut();
};

export const getOrganizationAction = async (organizationId: string) => {
  return await workos.organizations.getOrganization(organizationId);
};

export const getAuthAction = async (ensureSignedIn?: boolean) => {
  return await withAuth({ ensureSignedIn: ensureSignedIn as false });
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
