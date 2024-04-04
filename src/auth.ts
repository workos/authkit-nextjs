import { getAuthorizationUrl } from './get-authorization-url.js';
import { cookies } from 'next/headers';
import { cookieName } from './cookie.js';
import { terminateSession } from './session.js';

async function getSignInUrl() {
  return getAuthorizationUrl({ screenHint: 'sign-in' });
}

async function getSignUpUrl() {
  return getAuthorizationUrl({ screenHint: 'sign-up' });
}

async function signOut() {
  cookies().delete(cookieName);
  await terminateSession();
}

export { getSignInUrl, getSignUpUrl, signOut };
