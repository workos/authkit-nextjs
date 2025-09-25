import { getWorkOS } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from './env-variables.js';
import { GetAuthURLOptions } from './interfaces.js';
import { headers } from 'next/headers';

async function getAuthorizationUrl(options: GetAuthURLOptions = {}) {
  const headersList = await headers();
  const {
    returnPathname,
    screenHint,
    organizationId,
    redirectUri = headersList.get('x-redirect-uri'),
    loginHint,
    prompt,
    state: customState,
  } = options;

  // Build state object with returnPathname and any custom state
  const stateObject =
    returnPathname || customState
      ? {
          returnPathname,
          ...customState,
        }
      : null;

  return getWorkOS().userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUri ?? WORKOS_REDIRECT_URI,
    state: stateObject ? btoa(JSON.stringify(stateObject)) : undefined,
    screenHint,
    organizationId,
    loginHint,
    prompt,
  });
}

export { getAuthorizationUrl };
