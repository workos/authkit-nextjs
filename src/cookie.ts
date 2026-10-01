import {
  WORKOS_REDIRECT_URI,
  WORKOS_COOKIE_MAX_AGE,
  WORKOS_COOKIE_DOMAIN,
  WORKOS_COOKIE_SAMESITE,
} from './env-variables.js';
import { CookieOptions } from './interfaces.js';

type ValidSameSite = CookieOptions['sameSite'];

/**
 * One or more URLs describing where the app is served from, e.g. the incoming
 * request URL plus any configured browser-facing URL (`baseURL`, `redirectUri`).
 */
export type CookieUrlSource = string | null | undefined | ReadonlyArray<string | null | undefined>;

/**
 * Decide the `Secure` attribute from every available signal about the app's origin.
 *
 * Behind a TLS-terminating proxy the incoming request URL is the internal `http://`
 * origin, so it can't be trusted on its own. The configured redirect URI (and any
 * caller-supplied browser-facing URL) is the public origin. If any signal is HTTPS,
 * the cookie is Secure. Missing or unparseable URLs fail closed to Secure.
 */
function isSecureOrigin(urls: CookieUrlSource): boolean {
  const candidates = [urls, WORKOS_REDIRECT_URI].flat().filter((url): url is string => Boolean(url));
  if (candidates.length === 0) {
    return true;
  }

  return candidates.some((url) => {
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return true;
    }
  });
}

const JWT_COOKIE_MAX_AGE = 30; // seconds
const JWT_COOKIE_NAME = 'workos-access-token';

function assertValidSamSite(sameSite: string): asserts sameSite is ValidSameSite {
  if (!['lax', 'strict', 'none'].includes(sameSite.toLowerCase())) {
    throw new Error(`Invalid SameSite value: ${sameSite}`);
  }
}

export function getCookieOptions(): CookieOptions;
export function getCookieOptions(urls?: CookieUrlSource): CookieOptions;
export function getCookieOptions(urls: CookieUrlSource, asString: true, expired?: boolean): string;
export function getCookieOptions(urls: CookieUrlSource, asString: false, expired?: boolean): CookieOptions;
export function getCookieOptions(urls?: CookieUrlSource, asString?: boolean, expired?: boolean): CookieOptions | string;
export function getCookieOptions(
  urls?: CookieUrlSource,
  asString: boolean = false,
  expired: boolean = false,
): CookieOptions | string {
  const sameSite = WORKOS_COOKIE_SAMESITE || 'lax';
  assertValidSamSite(sameSite);

  const secure = sameSite.toLowerCase() === 'none' || isSecureOrigin(urls);

  let maxAge: number;
  if (expired) {
    maxAge = 0;
  } else if (WORKOS_COOKIE_MAX_AGE) {
    const parsed = parseInt(WORKOS_COOKIE_MAX_AGE, 10);
    maxAge = Number.isFinite(parsed) ? parsed : 60 * 60 * 24 * 400;
  } else {
    maxAge = 60 * 60 * 24 * 400;
  }

  if (asString) {
    const capitalizedSameSite = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
    const parts = ['Path=/', 'HttpOnly', `SameSite=${capitalizedSameSite}`, `Max-Age=${maxAge}`];
    if (WORKOS_COOKIE_DOMAIN) {
      parts.push(`Domain=${WORKOS_COOKIE_DOMAIN}`);
    }
    if (secure) {
      parts.push('Secure');
    }

    return parts.join('; ');
  }

  return {
    path: '/',
    httpOnly: true,
    secure,
    sameSite,
    // Defaults to 400 days, the maximum allowed by Chrome
    // It's fine to have a long cookie expiry date as the access/refresh tokens
    // act as the actual time-limited aspects of the session.
    maxAge,
    domain: WORKOS_COOKIE_DOMAIN || '',
  };
}

const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes

/**
 * Cookie options for the PKCE verifier cookie.
 * 'strict' blocks the cookie on the cross-site redirect back from WorkOS; downgrade to 'lax'.
 * 'none' is more permissive and must be preserved for iframe/cross-origin embed flows.
 * Max-age is always capped to 10 minutes — PKCE cookies are single-use and short-lived.
 */
export function getPKCECookieOptions(): CookieOptions;
export function getPKCECookieOptions(urls: CookieUrlSource, asString: true, expired?: boolean): string;
export function getPKCECookieOptions(
  urls?: CookieUrlSource,
  asString?: boolean,
  expired?: boolean,
): CookieOptions | string;
export function getPKCECookieOptions(
  urls?: CookieUrlSource,
  asString: boolean = false,
  expired: boolean = false,
): CookieOptions | string {
  if (asString) {
    const options = getCookieOptions(urls, true, expired);
    return options
      .replace(/SameSite=Strict/i, 'SameSite=Lax')
      .replace(/Max-Age=\d+/, `Max-Age=${expired ? 0 : PKCE_COOKIE_MAX_AGE}`);
  }

  const options = getCookieOptions(urls);
  return {
    ...options,
    sameSite: options.sameSite.toLowerCase() === 'strict' ? 'lax' : options.sameSite,
    maxAge: expired ? 0 : PKCE_COOKIE_MAX_AGE,
  };
}

export function getJwtCookie(body: string | null, requestUrlOrRedirectUri?: string | null, expired?: boolean): string {
  const cookie = `${JWT_COOKIE_NAME}=${expired ? '' : (body ?? '')}`;

  // Force Secure in production, except for localhost
  let secure = false;
  const isProduction = process.env.NODE_ENV === 'production';

  if (requestUrlOrRedirectUri) {
    try {
      const url = new URL(requestUrlOrRedirectUri);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      // In production, always use Secure unless explicitly on localhost
      secure = isProduction ? !isLocalhost : url.protocol === 'https:';
    } catch {
      // If URL parsing fails, default to secure in production
      secure = isProduction;
      // If it's not a valid URL, fall back to WORKOS_REDIRECT_URI
      const fallbackUrl = WORKOS_REDIRECT_URI;
      if (fallbackUrl) {
        try {
          const url = new URL(fallbackUrl);
          secure = url.protocol === 'https:';
        } catch {
          secure = false;
        }
      }
    }
  } else if (WORKOS_REDIRECT_URI) {
    // No URL provided, check WORKOS_REDIRECT_URI
    try {
      const url = new URL(WORKOS_REDIRECT_URI);
      secure = url.protocol === 'https:';
    } catch {
      secure = false;
    }
  }

  const maxAge = expired ? 0 : JWT_COOKIE_MAX_AGE;

  const parts = [cookie, 'SameSite=Lax', `Max-Age=${maxAge}`];

  // Only add Secure flag if on HTTPS
  if (secure) {
    parts.push('Secure');
  }

  if (expired) {
    parts.push(`Expires=${new Date(0).toUTCString()}`);
  }

  return parts.join('; ');
}
