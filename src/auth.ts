'use server';

import { revalidatePath, revalidateTag } from 'next/cache.js';
import { cookies, headers } from 'next/headers.js';
import { redirect } from 'next/navigation.js';
import { WORKOS_COOKIE_DOMAIN, WORKOS_COOKIE_NAME, WORKOS_COOKIE_SAMESITE } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { SwitchToOrganizationOptions, UserInfo } from './interfaces.js';
import { refreshSession, withAuth } from './session.js';
import { getWorkOS } from './workos.js';
export async function getSignInUrl({
  organizationId,
  loginHint,
  redirectUri,
}: { organizationId?: string; loginHint?: string; redirectUri?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-in', loginHint, redirectUri });
}

export async function getSignUpUrl({
  organizationId,
  loginHint,
  redirectUri,
}: { organizationId?: string; loginHint?: string; redirectUri?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-up', loginHint, redirectUri });
}

/**
 * Sign out the user and delete the session cookie.
 * @param options Options for signing out.
 * @param options.returnTo The URL to redirect to after signing out.
 */
export async function signOut({ returnTo }: { returnTo?: string } = {}) {
  let sessionId: string | undefined;

  try {
    const { sessionId: sid } = await withAuth();
    sessionId = sid;
  } finally {
    const nextCookies = await cookies();
    const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
    const sameSite = WORKOS_COOKIE_SAMESITE || 'lax';
    const domain = WORKOS_COOKIE_DOMAIN || /* istanbul ignore next */ undefined;
    const secure = sameSite.toLowerCase() === 'none' ? true : undefined;
    nextCookies.delete({ name: cookieName, domain, path: '/', sameSite, secure });

    if (sessionId) {
      redirect(getWorkOS().userManagement.getLogoutUrl({ sessionId, returnTo }));
    } else {
      redirect(returnTo ?? '/');
    }
  }
}

export async function switchToOrganization(
  organizationId: string,
  options: SwitchToOrganizationOptions = {},
): Promise<UserInfo> {
  const { returnTo, revalidationStrategy = 'path', revalidationTags = [] } = options;
  const headersList = await headers();
  let result: UserInfo;
  // istanbul ignore next
  const pathname = returnTo || headersList.get('x-url') || '/';
  try {
    result = await refreshSession({ organizationId, ensureSignedIn: true });
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: any
  ) {
    const { cause } = error;
    /* istanbul ignore next */
    if (cause?.rawData?.authkit_redirect_url) {
      redirect(cause.rawData.authkit_redirect_url);
    } else {
      if (cause?.error === 'sso_required' || cause?.error === 'mfa_enrollment') {
        const url = await getAuthorizationUrl({ organizationId });
        return redirect(url);
      }
      throw error;
    }
  }

  switch (revalidationStrategy) {
    case 'path':
      revalidatePath(pathname);
      break;
    case 'tag':
      for (const tag of revalidationTags) {
        revalidateTag(tag);
      }
      break;
  }
  if (revalidationStrategy !== 'none') {
    redirect(pathname);
  }

  return result;
}
