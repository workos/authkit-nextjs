import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { getCookieOptions } from './cookie.js';
import { WORKOS_COOKIE_PASSWORD } from './env-variables.js';

export const PKCE_COOKIE_NAME = 'wos-auth-verifier';
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

interface AuthCookieData {
  codeVerifier?: string;
  state?: string;
}

/**
 * Read and unseal the auth cookie containing PKCE code verifier and OAuth state.
 * Returns empty object if the cookie is missing or corrupted.
 */
export async function getAuthCookieData(cookieValue: string | undefined): Promise<AuthCookieData> {
  if (!cookieValue) return {};
  try {
    const unsealed = await unsealData<AuthCookieData>(cookieValue, {
      password: WORKOS_COOKIE_PASSWORD,
    });
    return { codeVerifier: unsealed.codeVerifier, state: unsealed.state };
  } catch {
    // Cookie corrupted or expired — caller will proceed without verification
    return {};
  }
}
