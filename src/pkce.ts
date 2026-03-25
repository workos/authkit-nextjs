import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import * as v from 'valibot';
import { getPKCECookieOptions } from './cookie.js';
import { WORKOS_COOKIE_PASSWORD } from './env-variables.js';
import { State, StateSchema } from './interfaces.js';

export const PKCE_COOKIE_NAME = 'wos-auth-verifier';
const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes

/**
 * Set the PKCE verifier cookie in server action context.
 * In middleware context, callers must set the cookie via Set-Cookie headers instead.
 */
export async function setPKCECookie(sealedState: string): Promise<void> {
  const nextCookies = await cookies();
  const { domain, path, sameSite, secure } = getPKCECookieOptions();

  nextCookies.set(PKCE_COOKIE_NAME, sealedState, {
    domain,
    path,
    sameSite,
    secure,
    httpOnly: true,
    maxAge: PKCE_COOKIE_MAX_AGE,
  });
}

/**
 * Read and unseal the auth cookie containing PKCE code verifier and OAuth state.
 * Throws if the cookie is not in the required state
 */
export async function getStateFromPKCECookieValue(cookieValue: string): Promise<State> {
  // NOTE: TypeScript compiler won't flag if we Seal different data in than we Unseal
  // Also, this function is not in a critically-high-performance path, so runtime validation
  // is an acceptable tradeoff for increased security and type-safety
  const unsealed = await unsealData(cookieValue, {
    password: WORKOS_COOKIE_PASSWORD,
  });

  return v.parse(StateSchema, unsealed);
}
