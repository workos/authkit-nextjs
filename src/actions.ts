'use server';

import { signOut, switchToOrganization } from './auth.js';
import { NoUserInfo, UserInfo, SwitchToOrganizationOptions } from './interfaces.js';
import { refreshSession, withAuth } from './session.js';
import { getWorkOS } from './workos.js';

export interface RefreshAccessTokenActionResult {
  accessToken: string | undefined;
  error?: string;
}

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

/**
 * This action is used to get the access token from the auth object.
 * It is used to fetch the access token from the server.
 */
export async function getAccessTokenAction() {
  const auth = await withAuth();
  return auth.accessToken;
}

/**
 * This action is used to refresh the access token from the auth object.
 * It is used to fetch the access token from the server.
 *
 * Errors are caught and returned as data rather than thrown, to prevent
 * Next.js from returning 500 responses for server action failures.
 */
export async function refreshAccessTokenAction(): Promise<RefreshAccessTokenActionResult> {
  try {
    const auth = await refreshSession();
    return { accessToken: auth.accessToken };
  } catch (error) {
    console.warn('Failed to refresh access token:', error instanceof Error ? error.message : String(error));
    return {
      accessToken: undefined,
      error: 'Failed to refresh access token',
    };
  }
}
