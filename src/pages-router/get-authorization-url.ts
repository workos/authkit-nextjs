import { getWorkOS } from '../workos.js';
import { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from '../env-variables.js';

export interface GetAuthURLOptions {
  returnPathname?: string;
  screenHint?: 'sign-in' | 'sign-up';
  organizationId?: string;
  redirectUri?: string;
  loginHint?: string;
}

export async function getAuthorizationUrl(options: GetAuthURLOptions = {}) {
  const {
    returnPathname,
    screenHint,
    organizationId,
    redirectUri,
    loginHint,
  } = options;

  return getWorkOS().userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUri ?? WORKOS_REDIRECT_URI,
    state: returnPathname ? btoa(JSON.stringify({ returnPathname })) : undefined,
    screenHint,
    organizationId,
    loginHint,
  });
}