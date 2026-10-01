import {
  WORKOS_REDIRECT_URI,
  WORKOS_COOKIE_MAX_AGE,
  WORKOS_COOKIE_DOMAIN,
  WORKOS_COOKIE_SAMESITE,
} from './env-variables.js';
import { CookieOptions } from './interfaces.js';

type ValidSameSite = CookieOptions['sameSite'];

/**
 * Every URL known to describe where the app is served from: the incoming request
 * URL plus any configured browser-facing URL (`baseURL`, `redirectUri`). Entries
 * may be missing; `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is always considered too.
 */
export type OriginUrls = ReadonlyArray<string | null | undefined>;

interface CookieLifetime {
  /** Produce options that delete the cookie (`Max-Age=0`). */
  expired?: boolean;
}

const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days, the maximum allowed by Chrome
const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes
const JWT_COOKIE_MAX_AGE = 30; // seconds
const JWT_COOKIE_NAME = 'workos-access-token';
const EPOCH = new Date(0).toUTCString();

function assertValidSamSite(sameSite: string): asserts sameSite is ValidSameSite {
  if (!['lax', 'strict', 'none'].includes(sameSite.toLowerCase())) {
    throw new Error(`Invalid SameSite value: ${sameSite}`);
  }
}

/** Unparseable URLs count as HTTPS so a bad value fails closed to `Secure`. */
function isHttpsOrUnparseable(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return true;
  }
}

/**
 * The single policy for the `Secure` attribute on every AuthKit cookie.
 *
 * Behind a TLS-terminating proxy the incoming request URL is the internal `http://`
 * origin, so it can't be trusted on its own. If any origin signal is HTTPS, the
 * cookie is Secure. With no signals at all, it fails closed to Secure.
 */
function isSecureOrigin(urls: OriginUrls): boolean {
  const candidates = [...urls, WORKOS_REDIRECT_URI].filter((url): url is string => Boolean(url));
  return candidates.length === 0 || candidates.some(isHttpsOrUnparseable);
}

/**
 * Origin signals available in a server action / route handler: the request URL and
 * redirect URI the AuthKit middleware recorded on the request headers.
 */
export function originUrlsFromHeaders(headers: Pick<Headers, 'get'>): OriginUrls {
  return [headers.get('x-url'), headers.get('x-redirect-uri')];
}

export function getCookieOptions(urls: OriginUrls, { expired = false }: CookieLifetime = {}): CookieOptions {
  const sameSite = WORKOS_COOKIE_SAMESITE || 'lax';
  assertValidSamSite(sameSite);

  let maxAge = DEFAULT_COOKIE_MAX_AGE;
  if (expired) {
    maxAge = 0;
  } else if (WORKOS_COOKIE_MAX_AGE) {
    const parsed = parseInt(WORKOS_COOKIE_MAX_AGE, 10);
    maxAge = Number.isFinite(parsed) ? parsed : DEFAULT_COOKIE_MAX_AGE;
  }

  return {
    path: '/',
    httpOnly: true,
    secure: sameSite.toLowerCase() === 'none' || isSecureOrigin(urls),
    sameSite,
    // It's fine to have a long cookie expiry date as the access/refresh tokens
    // act as the actual time-limited aspects of the session.
    maxAge,
    domain: WORKOS_COOKIE_DOMAIN || '',
  };
}

/**
 * Cookie options for the PKCE verifier cookie.
 * 'strict' blocks the cookie on the cross-site redirect back from WorkOS; downgrade to 'lax'.
 * 'none' is more permissive and must be preserved for iframe/cross-origin embed flows.
 * Max-age is always capped to 10 minutes — PKCE cookies are single-use and short-lived.
 */
export function getPKCECookieOptions(urls: OriginUrls, { expired = false }: CookieLifetime = {}): CookieOptions {
  const options = getCookieOptions(urls, { expired });
  return {
    ...options,
    sameSite: options.sameSite.toLowerCase() === 'strict' ? 'lax' : options.sameSite,
    maxAge: expired ? 0 : PKCE_COOKIE_MAX_AGE,
  };
}

/** Serialize a cookie for a raw `Set-Cookie` header (e.g. in middleware, where `cookies()` is unavailable). */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const sameSite = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1).toLowerCase();
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
    `Max-Age=${options.maxAge}`,
  ];
  if (options.maxAge === 0) {
    parts.push(`Expires=${EPOCH}`);
  }
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * The short-lived, script-readable access token cookie used by `eagerAuth`.
 * Uses the same `Secure` policy as every other AuthKit cookie.
 */
export function getJwtCookie(body: string | null, urls: OriginUrls, expired: boolean = false): string {
  const parts = [
    `${JWT_COOKIE_NAME}=${expired ? '' : (body ?? '')}`,
    'SameSite=Lax',
    `Max-Age=${expired ? 0 : JWT_COOKIE_MAX_AGE}`,
  ];
  if (isSecureOrigin(urls)) {
    parts.push('Secure');
  }
  if (expired) {
    parts.push(`Expires=${EPOCH}`);
  }

  return parts.join('; ');
}
