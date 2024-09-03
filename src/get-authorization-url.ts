import { workos } from './workos.js';
import { variables } from './env-variables.js';
import { GetAuthURLOptions } from './interfaces.js';

const { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } = variables;

async function getAuthorizationUrl(options: GetAuthURLOptions = {}) {
  const { returnPathname, screenHint, organizationId } = options;

  return workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: WORKOS_CLIENT_ID,
    redirectUri: WORKOS_REDIRECT_URI,
    state: returnPathname ? btoa(JSON.stringify({ returnPathname })) : undefined,
    screenHint,
    organizationId,
  });
}

export { getAuthorizationUrl };
