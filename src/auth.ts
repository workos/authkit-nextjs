'use server';

import { getAuthorizationUrl } from './get-authorization-url.js';
import { cookies, headers } from 'next/headers';
import { refreshSession, terminateSession } from './session.js';
import { WORKOS_COOKIE_NAME, WORKOS_COOKIE_DOMAIN } from './env-variables.js';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { UserInfo, SwitchToOrganizationOptions } from './interfaces.js';

export async function getSignInUrl({ organizationId }: { organizationId?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-in' });
}

export async function getSignUpUrl() {
  return getAuthorizationUrl({ screenHint: 'sign-up' });
}

export async function signOut({ returnTo }: { returnTo?: string } = {}) {
  const cookie: { name: string; domain?: string } = {
    name: WORKOS_COOKIE_NAME || 'wos-session',
  };
  if (WORKOS_COOKIE_DOMAIN) cookie.domain = WORKOS_COOKIE_DOMAIN;

  const nextCookies = await cookies();

  nextCookies.delete(cookie);
  await terminateSession({ returnTo });
}

export async function switchToOrganization(
  organizationId: string,
  options: SwitchToOrganizationOptions = {},
): Promise<UserInfo> {
  const { returnTo, revalidationStrategy = 'path', revalidationTags = [] } = options;
  const headersList = await headers();
  const pathname = returnTo || headersList.get('x-url') || '/';
  const result = await refreshSession({ organizationId, ensureSignedIn: true });

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
