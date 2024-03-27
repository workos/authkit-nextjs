import { workos } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from './env-variables.js';

async function getAuthorizationUrl(returnPathname?: string) {
  return workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: WORKOS_CLIENT_ID,
    redirectUri: WORKOS_REDIRECT_URI,
    state: returnPathname ? btoa(JSON.stringify({ returnPathname })) : undefined,
  });
}

export { getAuthorizationUrl };
