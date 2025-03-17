'use server';

import { getAuthorizationUrl } from './get-authorization-url.js';
import { cookies } from 'next/headers';
import { terminateSession } from './session.js';
import { WORKOS_COOKIE_NAME, WORKOS_COOKIE_DOMAIN } from './env-variables.js';

async function getSignInUrl({ organizationId, loginHint }: { organizationId?: string; loginHint?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-in', loginHint });
}

async function getSignUpUrl({ organizationId, loginHint }: { organizationId?: string; loginHint?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-up', loginHint });
}

async function signOut({ returnTo }: { returnTo?: string } = {}) {
  const cookie: { name: string; domain?: string } = {
    name: WORKOS_COOKIE_NAME || 'wos-session',
  };
  if (WORKOS_COOKIE_DOMAIN) cookie.domain = WORKOS_COOKIE_DOMAIN;

  const nextCookies = await cookies();

  nextCookies.delete(cookie);
  await terminateSession({ returnTo });
}

export { getSignInUrl, getSignUpUrl, signOut };
