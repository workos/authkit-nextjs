import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { getCookieOptions } from './cookie.js';
import { WORKOS_COOKIE_PASSWORD } from './env-variables.js';

export const PKCE_COOKIE_NAME = 'wos-pkce-verifier';
const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes

/**
 * Set the PKCE verifier cookie in server action context.
 * In middleware context, callers must set the cookie via Set-Cookie headers instead.
 */
export async function setPKCECookie(pkceCookieValue: string | undefined): Promise<void> {
  if (!pkceCookieValue) return;
  const nextCookies = await cookies();
  const { domain, path, sameSite, secure } = getCookieOptions();
  nextCookies.set(PKCE_COOKIE_NAME, pkceCookieValue, {
    domain,
    path,
    sameSite,
    secure,
    httpOnly: true,
    maxAge: PKCE_COOKIE_MAX_AGE,
  });
}

/**
 * Read and unseal the PKCE code verifier from the cookie.
 * Returns undefined if the cookie is missing or corrupted.
 */
export async function getPKCECodeVerifier(cookieValue: string | undefined): Promise<string | undefined> {
  if (!cookieValue) return undefined;
  try {
    const unsealed = await unsealData<{ codeVerifier: string }>(cookieValue, {
      password: WORKOS_COOKIE_PASSWORD,
    });
    return unsealed.codeVerifier;
  } catch {
    // Cookie corrupted or expired — caller will proceed without PKCE
    return undefined;
  }
}
