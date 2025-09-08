import {
  WORKOS_REDIRECT_URI,
  WORKOS_COOKIE_MAX_AGE,
  WORKOS_COOKIE_DOMAIN,
  WORKOS_COOKIE_SAMESITE,
} from './env-variables.js';
import { CookieOptions } from './interfaces.js';

type ValidSameSite = CookieOptions['sameSite'];

function assertValidSamSite(sameSite: string): asserts sameSite is ValidSameSite {
  if (!['lax', 'strict', 'none'].includes(sameSite.toLowerCase())) {
    throw new Error(`Invalid SameSite value: ${sameSite}`);
  }
}

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
  const sameSite = WORKOS_COOKIE_SAMESITE || 'lax';
  assertValidSamSite(sameSite);

  const urlString = redirectUri || WORKOS_REDIRECT_URI;
  // Default to secure=true when no URL available (production default)
  // Developers should set WORKOS_REDIRECT_URI for proper local dev
  let secure: boolean;
  if (sameSite.toLowerCase() === 'none') {
    secure = true;
  } else if (urlString) {
    try {
      const url = new URL(urlString);
      secure = url.protocol === 'https:';
    } catch {
      // Invalid URL - default to secure
      secure = true;
    }
  } else {
    secure = true;
  }

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

export function getJwtCookieOptions(
  redirectUri?: string | null,
  asString?: boolean,
  expired?: boolean,
): string {
  const sameSite = WORKOS_COOKIE_SAMESITE || 'lax';
  assertValidSamSite(sameSite);

  const urlString = redirectUri || WORKOS_REDIRECT_URI;
  let secure: boolean;
  if (sameSite.toLowerCase() === 'none') {
    secure = true;
  } else if (urlString) {
    try {
      const url = new URL(urlString);
      secure = url.protocol === 'https:';
    } catch {
      secure = true;
    }
  } else {
    secure = true;
  }

  let maxAge: number;
  if (expired) {
    maxAge = 0;
  } else if (WORKOS_COOKIE_MAX_AGE) {
    const parsed = parseInt(WORKOS_COOKIE_MAX_AGE, 10);
    maxAge = Number.isFinite(parsed) ? parsed : 60 * 60 * 24 * 400;
  } else {
    maxAge = 60 * 60 * 24 * 400;
  }

  const capitalizedSameSite = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
  const parts = ['Path=/', `SameSite=${capitalizedSameSite}`, `Max-Age=${maxAge}`];
  if (WORKOS_COOKIE_DOMAIN) {
    parts.push(`Domain=${WORKOS_COOKIE_DOMAIN}`);
  }
  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}
