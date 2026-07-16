import fnv1a from '@sindresorhus/fnv1a';
import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import * as v from 'valibot';
import { getPKCECookieOptions } from './cookie.js';
import { config } from './config.js';
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
export async function setPKCECookie(sealedState: string): Promise<void> {
  const nextCookies = await cookies();
  const options = getPKCECookieOptions();

  nextCookies.set(getPKCECookieNameForState(sealedState), sealedState, {
    ...options,
    httpOnly: true,
  });
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
 */
export function appendPKCESetCookieHeader(request: NextRequest, headers: Headers, sealedState: string): void {
  if (!isInitialDocumentRequest(request)) {
    return;
  }

  const newCookieName = getPKCECookieNameForState(sealedState);
  const pkceCookies = request.cookies
    .getAll()
    .filter(({ name }) => name === PKCE_COOKIE_NAME || name.startsWith(`${PKCE_COOKIE_NAME}-`));

  // A small number of concurrent PKCE cookies is normal (multiple tabs each
  // starting an OAuth flow). Only purge when accumulation risks HTTP 431.
  if (pkceCookies.length >= MAX_PKCE_COOKIES) {
    const expiredOptions = getPKCECookieOptions(request.url, true, true);
    for (const { name } of pkceCookies) {
      if (name !== newCookieName) {
        headers.append('Set-Cookie', `${name}=; ${expiredOptions}`);
      }
    }
  }

  headers.append('Set-Cookie', `${newCookieName}=${sealedState}; ${getPKCECookieOptions(request.url, true)}`);
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

export function isInitialDocumentRequest(request: NextRequest): boolean {
  const accept = request.headers.get('accept') || '';
  const isDocumentRequest = accept.includes('text/html');
  const isRSCRequest = request.headers.has('RSC') || request.headers.has('Next-Router-State-Tree');
  const isPrefetch =
    request.headers.get('Purpose') === 'prefetch' ||
    request.headers.get('Sec-Purpose') === 'prefetch' ||
    request.headers.has('Next-Router-Prefetch');

  return isDocumentRequest && !isRSCRequest && !isPrefetch;
}

function isPKCESetCookieHeader(setCookieHeader: string): boolean {
  const separatorIndex = setCookieHeader.indexOf('=');
  if (separatorIndex === -1) {
    return false;
  }
  const cookieName = setCookieHeader.slice(0, separatorIndex);
  return cookieName === PKCE_COOKIE_NAME || cookieName.startsWith(`${PKCE_COOKIE_NAME}-`);
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
    password: config.cookiePassword,
  });

  return v.parse(StateSchema, unsealed);
}
