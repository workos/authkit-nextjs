import { getWorkOS } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from './env-variables.js';
import { GetAuthURLOptions } from './interfaces.js';
import { headers } from 'next/headers';

async function getAuthorizationUrl(options: GetAuthURLOptions = {}) {
  const { returnPathname, screenHint, organizationId, loginHint, prompt, state: customState } = options;
  let redirectUri = options.redirectUri;
  if (!redirectUri) {
    const headersList = await headers();
    redirectUri = headersList.get('x-redirect-uri') ?? undefined;
  }

  const internalState = returnPathname
    ? btoa(JSON.stringify({ returnPathname })).replace(/\+/g, '-').replace(/\//g, '_')
    : null;

  const finalState =
    internalState && customState ? `${internalState}.${customState}` : internalState || customState || undefined;

  return getWorkOS().userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUri ?? WORKOS_REDIRECT_URI,
    state: finalState,
    screenHint,
    organizationId,
    loginHint,
    prompt,
  });
}

export { getAuthorizationUrl };
