import { sealData } from 'iron-session';
import { headers } from 'next/headers';
import {
  WORKOS_CLAIM_TOKEN,
  WORKOS_CLIENT_ID,
  WORKOS_COOKIE_PASSWORD,
  WORKOS_ENABLE_PKCE,
  WORKOS_REDIRECT_URI,
} from './env-variables.js';
import { GetAuthURLOptions, GetAuthURLResult } from './interfaces.js';
import { getWorkOS } from './workos.js';

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

async function getAuthorizationUrl(options: GetAuthURLOptions = {}): Promise<GetAuthURLResult> {
  const { returnPathname, screenHint, organizationId, loginHint, prompt, state: customState } = options;
  let redirectUri = options.redirectUri;
  if (!redirectUri) {
    const headersList = await headers();
    redirectUri = headersList.get('x-redirect-uri') ?? undefined;
  }

  const internalState = returnPathname
    ? btoa(JSON.stringify({ returnPathname })).replace(/\+/g, '-').replace(/\//g, '_')
    : null;

  const claimNonce = WORKOS_CLAIM_TOKEN ? await fetchClaimNonce(getWorkOS().baseURL) : null;

  const finalState =
    internalState && customState ? `${internalState}.${customState}` : internalState || customState || undefined;

  const baseOptions = {
    provider: 'authkit' as const,
    clientId: WORKOS_CLIENT_ID,
    redirectUri: redirectUri ?? WORKOS_REDIRECT_URI,
    state: finalState,
    screenHint,
    organizationId,
    loginHint,
    prompt,
    ...(claimNonce && { claimNonce }),
  };

  if (WORKOS_ENABLE_PKCE === 'true') {
    const pkce = await getWorkOS().pkce.generate();
    const pkceCookieValue = await sealData(
      { codeVerifier: pkce.codeVerifier, state: finalState },
      { password: WORKOS_COOKIE_PASSWORD, ttl: 600 },
    );
    const url = getWorkOS().userManagement.getAuthorizationUrl({
      ...baseOptions,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    });

    return { url, pkceCookieValue };
  }

  // Without PKCE, state is the only CSRF protection (RFC 9700 Section 4.7.1)
  const csrfState = finalState ?? btoa(JSON.stringify({ nonce: crypto.randomUUID() }));
  const pkceCookieValue = await sealData({ state: csrfState }, { password: WORKOS_COOKIE_PASSWORD, ttl: 600 });
  return {
    url: getWorkOS().userManagement.getAuthorizationUrl({ ...baseOptions, state: csrfState }),
    pkceCookieValue,
  };
}

export { getAuthorizationUrl };
