import { sealData } from 'iron-session';
import { headers } from 'next/headers';
import { config } from './config.js';
import { GetAuthURLOptions, GetAuthURLResult, State } from './interfaces.js';
import { getWorkOS } from './workos.js';

async function fetchClaimNonce(baseURL: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseURL}/x/one-shot-environments/claim-nonces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        claim_token: config.claimToken,
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
  maxAge,
}: GetAuthURLOptions = {}): Promise<GetAuthURLResult> {
  const redirectUriToUse = await (async () => {
    if (redirectUri) {
      return redirectUri;
    }

    const headersList = await headers();
    return headersList.get('x-redirect-uri') ?? undefined;
  })();

  const pkce = await getWorkOS().pkce.generate();
  const claimNonce = config.claimToken ? await fetchClaimNonce(getWorkOS().baseURL) : null;

  const state = {
    nonce: crypto.randomUUID(),
    codeVerifier: pkce.codeVerifier,
    customState,
    returnPathname,
  } satisfies State;

  const sealedState = await sealData(state, { password: config.cookiePassword, ttl: 600 });

  const url = getWorkOS().userManagement.getAuthorizationUrl({
    provider: 'authkit' as const,
    clientId: config.clientId,
    redirectUri: redirectUriToUse ?? config.redirectUri,
    screenHint,
    organizationId,
    loginHint,
    prompt,
    state: sealedState,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
    ...(claimNonce && { claimNonce }),
    ...(maxAge !== undefined && { maxAge }),
  });

  return { url, sealedState };
}

export { getAuthorizationUrl };
