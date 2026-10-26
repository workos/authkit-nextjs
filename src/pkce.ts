import fnv1a from '@sindresorhus/fnv1a';
import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import * as v from 'valibot';
import { type OriginUrls, getPKCECookieOptions, serializeCookie } from './cookie.js';
import { WORKOS_COOKIE_PASSWORD } from './env-variables.js';
import { State, StateSchema } from './interfaces.js';

export const PKCE_COOKIE_NAME = 'wos-auth-verifier';
export const PKCE_STATE_HEADER = 'x-workos-pkce-state';
export const PKCE_AUTHORIZATION_URL_HEADER = 'x-workos-authorization-url';

const MAX_PKCE_COOKIES = 5;

/**
 * Short, deterministic hex fingerprint of an arbitrary string.
 * Used to give each PKCE flow its own cookie name without depending
 * on the internal format of the sealed state value
 */
function shortHash(input: string): string {
  // fnv1a returns a BigInt — use 32-bit variant so it fits safely in a Number
  const hash = Number(fnv1a(input, { size: 32 }));

  // Hex-encode and pad to a fixed 8-char width
  return hash.toString(16).padStart(8, '0');
}

/**
 * Derive a flow-specific cookie name so concurrent auth flows don't overwrite
 * each other's PKCE cookies. Uses an FNV-1a hash of the full sealed state
 */
export function getPKCECookieNameForState(state: string): string {
  return `${PKCE_COOKIE_NAME}-${shortHash(state)}`;
}

/**
 * Set the PKCE verifier cookie in server action context.
 * In middleware context, callers must set the cookie via Set-Cookie headers instead.
 */
export async function setPKCECookie(sealedState: string, originUrls: OriginUrls): Promise<void> {
  const nextCookies = await cookies();
  const newCookieName = getPKCECookieNameForState(sealedState);

  // Sign-in routes run on every request, so this path needs the same cap as the middleware.
  const expiredOptions = getPKCECookieOptions(originUrls, { expired: true });
  for (const name of getPKCECookiesToExpire(nextCookies.getAll(), newCookieName)) {
    nextCookies.set(name, '', expiredOptions);
  }

  nextCookies.set(newCookieName, sealedState, getPKCECookieOptions(originUrls));
}

/**
 * Store pending PKCE state in internal middleware headers until the response
 * actually redirects to AuthKit. These headers are stripped before reaching the
 * browser or downstream request handlers.
 */
export function setPendingPKCERedirectHeaders(headers: Headers, authorizationUrl: string, sealedState: string): void {
  headers.set(PKCE_AUTHORIZATION_URL_HEADER, authorizationUrl);
  headers.set(PKCE_STATE_HEADER, sealedState);
}

/**
 * Only set the PKCE cookie for initial document navigations that redirect to
 * AuthKit. Fetch/XHR/RSC/prefetch requests never follow cross-origin redirects
 * to complete OAuth, so they do not need verifier cookies.
 *
 * `originUrls` must include any browser-facing URL alongside the request URL so a
 * TLS-terminating proxy's internal http:// origin can't drop the Secure attribute.
 */
export function appendPKCESetCookieHeader(
  request: NextRequest,
  headers: Headers,
  sealedState: string,
  originUrls: OriginUrls,
): void {
  if (!isInitialDocumentRequest(request)) {
    return;
  }

  const newCookieName = getPKCECookieNameForState(sealedState);
  const expiredOptions = getPKCECookieOptions(originUrls, { expired: true });
  for (const name of getPKCECookiesToExpire(request.cookies.getAll(), newCookieName)) {
    headers.append('Set-Cookie', serializeCookie(name, '', expiredOptions));
  }

  headers.append('Set-Cookie', serializeCookie(newCookieName, sealedState, getPKCECookieOptions(originUrls)));
}

export function stripPKCESetCookieHeaders(headers: Headers): void {
  const setCookieHeaders = headers.getSetCookie();
  if (setCookieHeaders.length === 0) {
    return;
  }

  headers.delete('Set-Cookie');

  for (const setCookieHeader of setCookieHeaders) {
    if (!isPKCESetCookieHeader(setCookieHeader)) {
      headers.append('Set-Cookie', setCookieHeader);
    }
  }
}

export function isBrowserPrefetchRequest(request: NextRequest): boolean {
  return ['Purpose', 'Sec-Purpose'].some((name) => request.headers.get(name)?.split(';', 1)[0].trim() === 'prefetch');
}

export function isInitialDocumentRequest(request: NextRequest): boolean {
  const accept = request.headers.get('accept') || '';
  const isDocumentRequest = accept.includes('text/html');
  const isRSCRequest = request.headers.has('RSC') || request.headers.has('Next-Router-State-Tree');
  const isPrefetch = isBrowserPrefetchRequest(request) || request.headers.has('Next-Router-Prefetch');

  return isDocumentRequest && !isRSCRequest && !isPrefetch;
}

function isPKCECookieName(name: string): boolean {
  return name === PKCE_COOKIE_NAME || name.startsWith(`${PKCE_COOKIE_NAME}-`);
}

/**
 * Verifier cookies to expire before writing `newCookieName`. A small number of
 * concurrent PKCE cookies is normal (multiple tabs each starting an OAuth flow),
 * so only purge when accumulation risks HTTP 431.
 */
function getPKCECookiesToExpire(existing: { name: string }[], newCookieName: string): string[] {
  const names = existing.map(({ name }) => name).filter(isPKCECookieName);
  return names.length >= MAX_PKCE_COOKIES ? names.filter((name) => name !== newCookieName) : [];
}

function isPKCESetCookieHeader(setCookieHeader: string): boolean {
  const separatorIndex = setCookieHeader.indexOf('=');
  if (separatorIndex === -1) {
    return false;
  }
  return isPKCECookieName(setCookieHeader.slice(0, separatorIndex));
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
