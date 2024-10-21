'use server';

import { getAuthorizationUrl } from './get-authorization-url.js';
import { cookies } from 'next/headers';
import { terminateSession } from './session.js';
import { WORKOS_COOKIE_NAME, WORKOS_COOKIE_DOMAIN } from './env-variables.js';

async function getSignInUrl({ organizationId }: { organizationId?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-in' });
}

async function getSignUpUrl() {
  return getAuthorizationUrl({ screenHint: 'sign-up' });
}

async function signOut() {
  const cookie: { name: string; domain?: string } = {
    name: WORKOS_COOKIE_NAME || 'wos-session',
  };
  if (WORKOS_COOKIE_DOMAIN) cookie.domain = WORKOS_COOKIE_DOMAIN;
  cookies().delete(cookie);
  await terminateSession();
}

export { getSignInUrl, getSignUpUrl, signOut };
