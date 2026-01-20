'use server';

import { decodeJwt } from 'jose';
import { revalidatePath, revalidateTag } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { WORKOS_COOKIE_NAME } from './env-variables.js';
import { getCookieOptions } from './cookie.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import type { AccessToken, SwitchToOrganizationOptions, UserInfo } from './interfaces.js';
import { getSessionFromCookie, refreshSession, withAuth } from './session.js';
import { getWorkOS } from './workos.js';

/**
 * A wrapper around revalidateTag to provide compatibility with previous versions.
 * @param tag The tag to revalidate.
 */
function revalidateTagCompat(tag: string): void {
  const fn = revalidateTag as (tag: string, profile: string) => void;
  return fn(tag, 'max');
}

export async function getSignInUrl({
  organizationId,
  loginHint,
  redirectUri,
  prompt,
  state,
}: {
  organizationId?: string;
  loginHint?: string;
  redirectUri?: string;
  prompt?: 'consent';
  state?: string;
} = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-in', loginHint, redirectUri, prompt, state });
}

export async function getSignUpUrl({
  organizationId,
  loginHint,
  redirectUri,
  prompt,
  state,
}: {
  organizationId?: string;
  loginHint?: string;
  redirectUri?: string;
  prompt?: 'consent';
  state?: string;
} = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-up', loginHint, redirectUri, prompt, state });
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
  } catch (error) {
    // Fall back to reading session directly from cookie when middleware isn't available
    const session = await getSessionFromCookie();
    if (session && session.accessToken) {
      const { sid } = decodeJwt<AccessToken>(session.accessToken);
      sessionId = sid;
    } else {
      // can't recover - throw the original error.
      throw error;
    }
  } finally {
    const nextCookies = await cookies();
    const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
    const { domain, path, sameSite, secure } = getCookieOptions();

    // Delete all session cookies (base + chunks)
    const allCookies = nextCookies.getAll();
    for (const cookie of allCookies) {
      // Delete base cookie or any chunked cookie (cookieName.0, cookieName.1, etc.)
      if (cookie.name === cookieName || (cookie.name.startsWith(`${cookieName}.`) && /\.\d+$/.test(cookie.name))) {
        nextCookies.delete({ name: cookie.name, domain, path, sameSite, secure });
      }
    }

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
        revalidateTagCompat(tag);
      }
      break;
  }
  if (revalidationStrategy !== 'none') {
    redirect(pathname);
  }

  return result;
}
