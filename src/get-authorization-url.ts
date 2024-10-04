import { workos } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from './env-variables.js';
import { GetAuthURLOptions } from './interfaces.js';
import { headers } from 'next/headers';

async function getAuthorizationUrl(options: GetAuthURLOptions = {}) {
  const { returnPathname, screenHint, organizationId, redirectUri = headers().get('x-redirect-uri') } = options;

  return workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUri ?? WORKOS_REDIRECT_URI,
    state: returnPathname ? btoa(JSON.stringify({ returnPathname })) : undefined,
    screenHint,
    organizationId,
  });
}

export { getAuthorizationUrl };
