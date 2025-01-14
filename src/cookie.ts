import { WORKOS_REDIRECT_URI, WORKOS_COOKIE_MAX_AGE, WORKOS_COOKIE_DOMAIN } from './env-variables.js';
import { CookieOptions } from './interfaces.js';

export function getCookieOptions(): CookieOptions;
export function getCookieOptions(redirectUri?: string | null): CookieOptions;
export function getCookieOptions(redirectUri: string | null | undefined, asString: true, expired?: boolean): string;
export function getCookieOptions(
  redirectUri: string | null | undefined,
  asString: false,
  expired?: boolean,
): CookieOptions;
export function getCookieOptions(
  redirectUri?: string | null,
  asString?: boolean,
  expired?: boolean,
): CookieOptions | string;
export function getCookieOptions(
  redirectUri?: string | null,
  asString: boolean = false,
  expired: boolean = false,
): CookieOptions | string {
  const url = new URL(redirectUri || WORKOS_REDIRECT_URI);

  const maxAge = expired ? 0 : WORKOS_COOKIE_MAX_AGE ? parseInt(WORKOS_COOKIE_MAX_AGE, 10) : 60 * 60 * 24 * 400;

  return asString
    ? `Path=/; HttpOnly; Secure=${url.protocol === 'https:'}; SameSite="Lax"; Max-Age=${maxAge}; Domain=${WORKOS_COOKIE_DOMAIN || ''}`
    : {
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'lax' as const,
        // Defaults to 400 days, the maximum allowed by Chrome
        // It's fine to have a long cookie expiry date as the access/refresh tokens
        // act as the actual time-limited aspects of the session.
        maxAge,
        domain: WORKOS_COOKIE_DOMAIN || '',
      };
}
