'use server';

import { getAuthorizationUrl } from './get-authorization-url.js';
import { cookies } from 'next/headers';
import { terminateSession } from './session.js';
import { WORKOS_COOKIE_NAME } from './env-variables.js';

async function getSignInUrl({ organizationId }: { organizationId?: string } = {}) {
  return getAuthorizationUrl({ organizationId, screenHint: 'sign-in' });
}

async function getSignUpUrl() {
  return getAuthorizationUrl({ screenHint: 'sign-up' });
}

async function signOut() {
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
  const nextCookies = await cookies();
  nextCookies.delete(cookieName);
  await terminateSession();
}

export { getSignInUrl, getSignUpUrl, signOut };
