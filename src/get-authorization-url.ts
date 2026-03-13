import { sealData } from 'iron-session';
import { headers } from 'next/headers';
import { WORKOS_CLIENT_ID, WORKOS_COOKIE_PASSWORD, WORKOS_DISABLE_PKCE, WORKOS_REDIRECT_URI } from './env-variables.js';
import { GetAuthURLOptions, GetAuthURLResult, State } from './interfaces.js';
import { getWorkOS } from './workos.js';
import { UserManagementAuthorizationURLOptions } from '@workos-inc/node';

async function getAuthorizationUrl({
  returnPathname,
  screenHint,
  organizationId,
  loginHint,
  prompt,
  state: customState,
  redirectUri,
}: GetAuthURLOptions = {}): Promise<GetAuthURLResult> {
  const redirectUriToUse = await (async () => {
    if (redirectUri) {
      return redirectUri;
    }

    const headersList = await headers();
    return headersList.get('x-redirect-uri') ?? undefined;
  })();

  // We will always pass state for PKCE & non-PKCE flows, for "Defense in Depth" purposes
  // The state will be used in the non-PKCE flow as the CSRF token
  // Passing it as the same shape, and passing it always simplifies code paths
  const state = {
    nonce: crypto.randomUUID(),
    customState,
    returnPathname,
  } satisfies State;

  const baseOptions = {
    provider: 'authkit' as const,
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUriToUse ?? WORKOS_REDIRECT_URI,
    screenHint,
    organizationId,
    loginHint,
    prompt,
  } satisfies UserManagementAuthorizationURLOptions;

  if (WORKOS_DISABLE_PKCE === 'true') {
    const sealedState = await sealData(state, { password: WORKOS_COOKIE_PASSWORD, ttl: 600 });

    return {
      url: getWorkOS().userManagement.getAuthorizationUrl({ ...baseOptions, state: sealedState }),
      sealedState,
    };
  }

  const pkce = await getWorkOS().pkce.generate();

  const pkceState = {
    ...state,
    codeVerifier: pkce.codeVerifier,
  } satisfies State;

  const sealedState = await sealData(pkceState, { password: WORKOS_COOKIE_PASSWORD, ttl: 600 });

  const url = getWorkOS().userManagement.getAuthorizationUrl({
    ...baseOptions,
    state: sealedState,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
  });

  return {
    url,
    sealedState,
  };
}

export { getAuthorizationUrl };
