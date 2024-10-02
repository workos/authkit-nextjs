import { WORKOS_REDIRECT_URI, WORKOS_COOKIE_MAX_AGE, WORKOS_COOKIE_DOMAIN } from './env-variables.js';
import { CookieOptions } from './interfaces.js';

export function getCookieOptions(redirectUri?: string | null): CookieOptions {
  const url = new URL(redirectUri || WORKOS_REDIRECT_URI);

  return {
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax' as const,
    // Defaults to 400 days, the maximum allowed by Chrome
    // It's fine to have a long cookie expiry date as the access/refresh tokens
    // act as the actual time-limited aspects of the session.
    maxAge: WORKOS_COOKIE_MAX_AGE ? parseInt(WORKOS_COOKIE_MAX_AGE, 10) : 60 * 60 * 24 * 400,
    domain: WORKOS_COOKIE_DOMAIN,
  };
}
