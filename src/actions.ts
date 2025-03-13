'use server';

import { signOut, switchToOrganization } from './auth.js';
import { NoUserInfo, UserInfo, SwitchToOrganizationOptions } from './interfaces.js';
import { refreshSession, withAuth } from './session.js';
import { getWorkOS } from './workos.js';

/**
 * This function is used to sanitize the auth object.
 * Remove the accessToken from the auth object as it is not needed on the client side.
 * @param value - The auth object to sanitize
 * @returns The sanitized auth object
 */
function sanitize<T extends UserInfo | NoUserInfo>(value: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken, ...sanitized } = value;
  return sanitized;
}

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
  return await getWorkOS().organizations.getOrganization(organizationId);
};

export const getAuthAction = async (options?: { ensureSignedIn?: boolean }) => {
  return sanitize(await withAuth(options));
};

export const refreshAuthAction = async ({
  ensureSignedIn,
  organizationId,
}: {
  ensureSignedIn?: boolean;
  organizationId?: string;
}) => {
  return sanitize(await refreshSession({ ensureSignedIn, organizationId }));
};

export const switchToOrganizationAction = async (organizationId: string, options?: SwitchToOrganizationOptions) => {
  return sanitize(await switchToOrganization(organizationId, options));
};
