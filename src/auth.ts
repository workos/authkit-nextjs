'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { WORKOS_COOKIE_NAME } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { SwitchToOrganizationOptions, UserInfo } from './interfaces.js';
import { refreshSession, terminateSession } from './session.js';
import { getCookieOptions } from './cookie.js';
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

export async function signOut({ returnTo }: { returnTo?: string } = {}) {
  const cookieOptions = getCookieOptions();
  const nextCookies = await cookies();
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
  nextCookies.delete({ name: cookieName, ...cookieOptions });
  await terminateSession({ returnTo });
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
