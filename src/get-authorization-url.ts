import { sealData } from 'iron-session';
import { headers } from 'next/headers';
import {
  WORKOS_CLAIM_TOKEN,
  WORKOS_CLIENT_ID,
  WORKOS_COOKIE_PASSWORD,
  WORKOS_ENABLE_PKCE,
  WORKOS_REDIRECT_URI,
} from './env-variables.js';
import { GetAuthURLOptions, GetAuthURLResult, State } from './interfaces.js';
import { getWorkOS } from './workos.js';
import { UserManagementAuthorizationURLOptions } from '@workos-inc/node';

async function fetchClaimNonce(baseURL: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseURL}/x/one-shot-environments/claim-nonces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: WORKOS_CLIENT_ID,
        claim_token: WORKOS_CLAIM_TOKEN,
      }),
    });
    if (!response.ok) {
      if (response.status !== 409) {
        console.warn(
          `[authkit-nextjs]: Failed to exchange WORKOS_CLAIM_TOKEN (${response.status}). Try removing WORKOS_CLAIM_TOKEN from your environment variables.`,
        );
      }
      return null;
    }
    const data = await response.json();
    return data.nonce;
  } catch (error) {
    console.warn(
      '[authkit-nextjs]: Failed to exchange WORKOS_CLAIM_TOKEN. Try removing WORKOS_CLAIM_TOKEN from your environment variables.',
      error,
    );
    return null;
  }
}

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

  const claimNonce = WORKOS_CLAIM_TOKEN ? await fetchClaimNonce(getWorkOS().baseURL) : null;

  const baseOptions = {
    provider: 'authkit' as const,
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUriToUse ?? WORKOS_REDIRECT_URI,
    screenHint,
    organizationId,
    loginHint,
    prompt,
    ...(claimNonce && { claimNonce }),
  } satisfies UserManagementAuthorizationURLOptions;

  if (WORKOS_ENABLE_PKCE === 'true') {
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

    return { url, sealedState };
  }

  const sealedState = await sealData(state, { password: WORKOS_COOKIE_PASSWORD, ttl: 600 });

  return {
    url: getWorkOS().userManagement.getAuthorizationUrl({ ...baseOptions, state: sealedState }),
    sealedState,
  };
}

export { getAuthorizationUrl };
