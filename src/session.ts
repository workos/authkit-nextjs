'use server';

import { sealData, unsealData } from 'iron-session';
import { JWTPayload, createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { getCookieOptions, getJwtCookie } from './cookie.js';
import { WORKOS_CLIENT_ID, WORKOS_COOKIE_NAME, WORKOS_COOKIE_PASSWORD, WORKOS_REDIRECT_URI } from './env-variables.js';
import { TokenRefreshError, getSessionErrorContext } from './errors.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import {
  AccessToken,
  AuthkitMiddlewareAuth,
  AuthkitOptions,
  AuthkitResponse,
  NoUserInfo,
  Session,
  UserInfo,
} from './interfaces.js';
import { getWorkOS } from './workos.js';

import type { AuthenticationResponse } from '@workos-inc/node';
import { parse, tokensToRegexp } from 'path-to-regexp';
import { lazy, redirectWithFallback, setCachePreventionHeaders } from './utils.js';

const sessionHeaderName = 'x-workos-session';
const middlewareHeaderName = 'x-workos-middleware';
const signUpPathsHeaderName = 'x-sign-up-paths';
const jwtCookieName = 'workos-access-token';

const JWKS = lazy(() => createRemoteJWKSet(new URL(getWorkOS().userManagement.getJwksUrl(WORKOS_CLIENT_ID))));

/**
 * Applies cache security headers with Vary header deduplication.
 * Only applies headers if the request is authenticated (has session, cookie, or Authorization header).
 * Used in middleware where existing Vary headers may already be present.
 * @param headers - The Headers object to set the cache security headers on.
 * @param request - The NextRequest object to check for authentication.
 * @param sessionData - Optional session data to check for authentication.
 */
function applyCacheSecurityHeaders(
  headers: Headers,
  request: NextRequest,
  sessionData?: { accessToken?: string } | Session,
): void {
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';

  // Only apply cache headers for authenticated requests
  if (!sessionData?.accessToken && !request.cookies.has(cookieName) && !request.headers.has('authorization')) {
    return;
  }

  const varyValues = new Set<string>(['cookie']);
  if (request.headers.has('authorization')) {
    varyValues.add('authorization');
  }

  const currentVary = headers.get('Vary');
  if (currentVary) {
    currentVary.split(',').forEach((v) => {
      const trimmed = v.trim().toLowerCase();
      if (trimmed) varyValues.add(trimmed);
    });
  }

  headers.set(
    'Vary',
    Array.from(varyValues)
      .map((v) => v.charAt(0).toUpperCase() + v.slice(1))
      .join(', '),
  );

  setCachePreventionHeaders(headers);
}

/**
 * Determines if a request is for an initial document load (not API/RSC/prefetch)
 */
function isInitialDocumentRequest(request: NextRequest): boolean {
  const accept = request.headers.get('accept') || '';
  const isDocumentRequest = accept.includes('text/html');
  const isRSCRequest = request.headers.has('RSC') || request.headers.has('Next-Router-State-Tree');
  const isPrefetch =
    request.headers.get('Purpose') === 'prefetch' ||
    request.headers.get('Sec-Purpose') === 'prefetch' ||
    request.headers.has('Next-Router-Prefetch');

  return isDocumentRequest && !isRSCRequest && !isPrefetch;
}

/**
 * Prepares request headers by copying relevant headers from response headers and setting up session header.
 * Also applies cache security headers and removes the session header from response headers to prevent leakage.
 *
 * @param request - The original NextRequest object
 * @param headers - The response headers containing session and metadata
 * @param signUpPaths - Array of sign up paths to include in headers
 * @param session - Optional session data to apply cache security headers
 * @returns Modified request headers with session and metadata copied from response headers
 */
export function prepareRequestHeaders(
  request: NextRequest,
  headers: Headers,
  signUpPaths: string[],
  session?: { accessToken?: string } | Session | UserInfo | NoUserInfo,
): Headers {
  // Record the sign up paths so we can use them later
  if (signUpPaths.length > 0) {
    headers.set(signUpPathsHeaderName, signUpPaths.join(','));
  }

  // Apply cache security headers
  applyCacheSecurityHeaders(headers, request, session);

  // Create a new request with modified headers (for page handlers and middleware chaining)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(middlewareHeaderName, headers.get(middlewareHeaderName)!);
  requestHeaders.set('x-url', headers.get('x-url')!);
  if (headers.has('x-redirect-uri')) {
    requestHeaders.set('x-redirect-uri', headers.get('x-redirect-uri')!);
  }
  if (headers.has(signUpPathsHeaderName)) {
    requestHeaders.set(signUpPathsHeaderName, headers.get(signUpPathsHeaderName)!);
  }

  // Pass session to page handlers via request header
  // This ensures handlers see refreshed sessions immediately (before Set-Cookie reaches browser)
  const sessionHeader = headers.get(sessionHeaderName);
  if (sessionHeader) {
    requestHeaders.set(sessionHeaderName, sessionHeader);
  }

  // Remove session header from response headers to prevent leakage
  headers.delete(sessionHeaderName);

  return requestHeaders;
}

async function encryptSession(session: Session) {
  return sealData(session, {
    password: WORKOS_COOKIE_PASSWORD,
    ttl: 0,
  });
}

async function updateSessionMiddleware(
  request: NextRequest,
  debug: boolean,
  middlewareAuth: AuthkitMiddlewareAuth,
  redirectUri: string,
  signUpPaths: string[],
  eagerAuth = false,
) {
  if (!redirectUri && !WORKOS_REDIRECT_URI) {
    throw new Error('You must provide a redirect URI in the AuthKit middleware or in the environment variables.');
  }

  if (!WORKOS_COOKIE_PASSWORD || WORKOS_COOKIE_PASSWORD.length < 32) {
    throw new Error(
      'You must provide a valid cookie password that is at least 32 characters in the environment variables.',
    );
  }

  let url;

  if (redirectUri) {
    url = new URL(redirectUri);
  } else {
    url = new URL(WORKOS_REDIRECT_URI);
  }

  if (
    middlewareAuth.enabled &&
    url.pathname === request.nextUrl.pathname &&
    !middlewareAuth.unauthenticatedPaths.includes(url.pathname)
  ) {
    // In the case where:
    // - We're using middleware auth mode
    // - The redirect URI is in the middleware matcher
    // - The redirect URI isn't in the unauthenticatedPaths array
    //
    // then we would get stuck in a login loop due to the redirect happening before the session is set.
    // It's likely that the user accidentally forgot to add the path to unauthenticatedPaths, so we add it here.
    middlewareAuth.unauthenticatedPaths.push(url.pathname);
  }

  const matchedPaths: string[] = middlewareAuth.unauthenticatedPaths.filter((pathGlob) => {
    const pathRegex = getMiddlewareAuthPathRegex(pathGlob);

    return pathRegex.exec(request.nextUrl.pathname);
  });

  const { session, headers, authorizationUrl } = await updateSession(request, {
    debug,
    redirectUri,
    screenHint: getScreenHint(signUpPaths, request.nextUrl.pathname),
    eagerAuth,
  });

  // If the user is logged out and this path isn't on the allowlist for logged out paths, redirect to AuthKit.
  if (middlewareAuth.enabled && matchedPaths.length === 0 && !session.user) {
    if (debug) {
      console.log(`Unauthenticated user on protected route ${request.url}, redirecting to AuthKit`);
    }

    return redirectWithFallback(authorizationUrl as string, headers);
  }

  const requestHeaders = prepareRequestHeaders(request, headers, signUpPaths, session);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
    headers,
  });
}

async function updateSession(
  request: NextRequest,
  options: AuthkitOptions = { debug: false },
): Promise<AuthkitResponse> {
  const session = await getSessionFromCookie(request);

  // Since we're setting the headers in the response, we need to create a new Headers object without copying
  // the request headers.
  // See https://github.com/vercel/next.js/issues/50659#issuecomment-2333990159
  const newRequestHeaders = new Headers();

  // Record that the request was routed through the middleware so we can check later for DX purposes
  newRequestHeaders.set(middlewareHeaderName, 'true');

  // We store the current request url in a custom header, so we can always have access to it
  // This is because on hard navigations we don't have access to `next-url` but need to get the current
  // `pathname` to be able to return the users where they came from before sign-in
  newRequestHeaders.set('x-url', request.url);

  if (options.redirectUri) {
    // Store the redirect URI in a custom header, so we always have access to it and so that subsequent
    // calls to `getAuthorizationUrl` will use the same redirect URI
    newRequestHeaders.set('x-redirect-uri', options.redirectUri);
  }

  newRequestHeaders.delete(sessionHeaderName);

  if (!session) {
    if (options.debug) {
      console.log('No session found from cookie');
    }

    return {
      session: { user: null },
      headers: newRequestHeaders,
      authorizationUrl: await getAuthorizationUrl({
        returnPathname: getReturnPathname(request.url),
        redirectUri: options.redirectUri || WORKOS_REDIRECT_URI,
        screenHint: options.screenHint,
      }),
    };
  }

  const hasValidSession = await verifyAccessToken(session.accessToken);

  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';

  applyCacheSecurityHeaders(newRequestHeaders, request, session);

  if (hasValidSession) {
    newRequestHeaders.set(sessionHeaderName, request.cookies.get(cookieName)!.value);

    const {
      sid: sessionId,
      org_id: organizationId,
      role,
      roles,
      permissions,
      entitlements,
      feature_flags: featureFlags,
    } = decodeJwt<AccessToken>(session.accessToken);

    // Set JWT cookie if eagerAuth is enabled
    // Only set on document requests (initial page loads), not on API/RSC requests
    if (options.eagerAuth && isInitialDocumentRequest(request)) {
      const existingJwtCookie = request.cookies.get(jwtCookieName);
      // Only set if cookie doesn't exist or has different value
      if (!existingJwtCookie || existingJwtCookie.value !== session.accessToken) {
        newRequestHeaders.append('Set-Cookie', getJwtCookie(session.accessToken, request.url));
      }
    }

    return {
      session: {
        sessionId,
        user: session.user,
        organizationId,
        role,
        roles,
        permissions,
        entitlements,
        featureFlags,
        impersonator: session.impersonator,
        accessToken: session.accessToken,
      },
      headers: newRequestHeaders,
    };
  }

  try {
    if (options.debug) {
      // istanbul ignore next
      console.log(
        `Session invalid. ${session.accessToken ? `Refreshing access token that ends in ${session.accessToken.slice(-10)}` : 'Access token missing.'}`,
      );
    }

    const { org_id: organizationIdFromAccessToken } = decodeJwt<AccessToken>(session.accessToken);

    const { accessToken, refreshToken, user, impersonator } =
      await getWorkOS().userManagement.authenticateWithRefreshToken({
        clientId: WORKOS_CLIENT_ID,
        refreshToken: session.refreshToken,
        organizationId: organizationIdFromAccessToken,
      });

    if (options.debug) {
      console.log('Session successfully refreshed');
    }
    // Encrypt session with new access and refresh tokens
    const encryptedSession = await encryptSession({
      accessToken,
      refreshToken,
      user,
      impersonator,
    });

    newRequestHeaders.append('Set-Cookie', `${cookieName}=${encryptedSession}; ${getCookieOptions(request.url, true)}`);
    newRequestHeaders.set(sessionHeaderName, encryptedSession);

    // Set JWT cookie if eagerAuth is enabled
    // Only set on document requests (initial page loads), not on API/RSC requests
    if (options.eagerAuth && isInitialDocumentRequest(request)) {
      newRequestHeaders.append('Set-Cookie', getJwtCookie(accessToken, request.url));
    }

    const {
      sid: sessionId,
      org_id: organizationId,
      role,
      roles,
      permissions,
      entitlements,
      feature_flags: featureFlags,
    } = decodeJwt<AccessToken>(accessToken);

    options.onSessionRefreshSuccess?.({ accessToken, user, impersonator, organizationId });

    return {
      session: {
        sessionId,
        user,
        organizationId,
        role,
        roles,
        permissions,
        entitlements,
        featureFlags,
        impersonator,
        accessToken,
      },
      headers: newRequestHeaders,
    };
  } catch (e) {
    if (options.debug) {
      console.log('Failed to refresh. Deleting cookie.', e);
    }

    // When we need to delete a cookie, return it as a header as you can't delete cookies from edge middleware
    const deleteCookie = `${cookieName}=; Expires=${new Date(0).toUTCString()}; ${getCookieOptions(request.url, true, true)}`;
    newRequestHeaders.append('Set-Cookie', deleteCookie);

    // Delete JWT cookie if eagerAuth is enabled
    if (options.eagerAuth) {
      const deleteJwtCookie = getJwtCookie(null, request.url, true);
      newRequestHeaders.append('Set-Cookie', deleteJwtCookie);
    }

    options.onSessionRefreshError?.({ error: e, request });

    return {
      session: { user: null },
      headers: newRequestHeaders,
      authorizationUrl: await getAuthorizationUrl({
        returnPathname: getReturnPathname(request.url),
        redirectUri: options.redirectUri || WORKOS_REDIRECT_URI,
      }),
    };
  }
}

async function refreshSession(options: { organizationId?: string; ensureSignedIn: true }): Promise<UserInfo>;
async function refreshSession(options?: {
  organizationId?: string;
  ensureSignedIn?: boolean;
}): Promise<UserInfo | NoUserInfo>;
async function refreshSession({
  organizationId: nextOrganizationId,
  ensureSignedIn = false,
}: {
  organizationId?: string;
  ensureSignedIn?: boolean;
} = {}): Promise<UserInfo | NoUserInfo> {
  const session = await getSessionFromCookie();
  if (!session) {
    if (ensureSignedIn) {
      await redirectToSignIn();
    }
    return { user: null };
  }

  const { org_id: organizationIdFromAccessToken } = decodeJwt<AccessToken>(session.accessToken);

  let refreshResult;

  try {
    refreshResult = await getWorkOS().userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: session.refreshToken,
      organizationId: nextOrganizationId ?? organizationIdFromAccessToken,
    });
  } catch (error) {
    throw new TokenRefreshError(
      `Failed to refresh session: ${error instanceof Error ? error.message : String(error)}`,
      error,
      getSessionErrorContext(session),
    );
  }

  const headersList = await headers();
  const url = headersList.get('x-url');

  await saveSession(refreshResult, url || WORKOS_REDIRECT_URI);

  const { accessToken, user, impersonator } = refreshResult;

  const {
    sid: sessionId,
    org_id: organizationId,
    role,
    roles,
    permissions,
    entitlements,
    feature_flags: featureFlags,
  } = decodeJwt<AccessToken>(accessToken);

  return {
    sessionId,
    user,
    organizationId,
    role,
    roles,
    permissions,
    entitlements,
    featureFlags,
    impersonator,
    accessToken,
  };
}

export function getMiddlewareAuthPathRegex(pathGlob: string) {
  try {
    const url = new URL(pathGlob, 'https://example.com');
    const path = `${url.pathname!}${url.hash || ''}`;

    const tokens = parse(path);
    const regex = tokensToRegexp(tokens).source;

    return new RegExp(regex);
  } catch (err) {
    console.log('err', err);
    const message = err instanceof Error ? err.message : String(err);

    throw new Error(`Error parsing routes for middleware auth. Reason: ${message}`);
  }
}

async function redirectToSignIn() {
  const headersList = await headers();
  const url = headersList.get('x-url');

  if (!url) {
    throw new Error('No URL found in the headers');
  }

  // Determine if the current route is in the sign up paths
  const signUpPaths = headersList.get(signUpPathsHeaderName)?.split(',');

  const pathname = new URL(url).pathname;
  const screenHint = getScreenHint(signUpPaths, pathname);

  const returnPathname = getReturnPathname(url);

  redirect(await getAuthorizationUrl({ returnPathname, screenHint }));
}

export async function getTokenClaims<T = Record<string, unknown>>(
  accessToken?: string,
): Promise<Partial<JWTPayload & T>> {
  const token = accessToken ?? (await withAuth()).accessToken;
  if (!token) {
    return {};
  }

  return decodeJwt<T>(token);
}

async function withAuth(options: { ensureSignedIn: true }): Promise<UserInfo>;
async function withAuth(options?: { ensureSignedIn?: true | false }): Promise<UserInfo | NoUserInfo>;
async function withAuth(options?: { ensureSignedIn?: boolean }): Promise<UserInfo | NoUserInfo> {
  const session = await getSessionFromHeader();

  if (!session) {
    if (options?.ensureSignedIn) {
      await redirectToSignIn();
    }
    return { user: null };
  }

  const {
    sid: sessionId,
    org_id: organizationId,
    role,
    roles,
    permissions,
    entitlements,
    feature_flags: featureFlags,
  } = decodeJwt<AccessToken>(session.accessToken);

  return {
    sessionId,
    user: session.user,
    organizationId,
    role,
    roles,
    permissions,
    entitlements,
    featureFlags,
    impersonator: session.impersonator,
    accessToken: session.accessToken,
  };
}

async function verifyAccessToken(accessToken: string) {
  try {
    await jwtVerify(accessToken, JWKS());
    return true;
  } catch {
    return false;
  }
}

export async function getSessionFromCookie(request?: NextRequest) {
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
  let cookie;

  if (request) {
    cookie = request.cookies.get(cookieName);
  } else {
    const nextCookies = await cookies();
    cookie = nextCookies.get(cookieName);
  }

  if (cookie) {
    return unsealData<Session>(cookie.value, {
      password: WORKOS_COOKIE_PASSWORD,
    });
  }
}

async function getSessionFromHeader(): Promise<Session | undefined> {
  const headersList = await headers();
  const hasMiddleware = Boolean(headersList.get(middlewareHeaderName));

  if (!hasMiddleware) {
    const url = headersList.get('x-url');
    throw new Error(
      `You are calling 'withAuth' on ${url ?? 'a route'} that isn't covered by the AuthKit middleware. Make sure it is running on all paths you are calling 'withAuth' from by updating your middleware config in 'middleware.(js|ts)'.`,
    );
  }

  const authHeader = headersList.get(sessionHeaderName);
  if (!authHeader) return;

  return unsealData<Session>(authHeader, { password: WORKOS_COOKIE_PASSWORD });
}

function getReturnPathname(url: string): string {
  const newUrl = new URL(url);

  return `${newUrl.pathname}${newUrl.searchParams.size > 0 ? '?' + newUrl.searchParams.toString() : ''}`;
}

export function getScreenHint(signUpPaths: string[] | undefined, pathname: string) {
  if (!signUpPaths) return 'sign-in';

  const screenHintPaths: string[] = signUpPaths.filter((pathGlob) => {
    const pathRegex = getMiddlewareAuthPathRegex(pathGlob);
    return pathRegex.exec(pathname);
  });

  return screenHintPaths.length > 0 ? 'sign-up' : 'sign-in';
}

/**
 * Saves a WorkOS session to a cookie for use with AuthKit.
 *
 * This function is intended for advanced use cases where you need to manually manage sessions,
 * such as custom authentication flows (email verification, etc.) that don't use
 * the standard AuthKit authentication flow.
 *
 * @param sessionOrResponse The WorkOS session or AuthenticationResponse containing access token, refresh token, and user information.
 * @param request Either a NextRequest object or a URL string, used to determine cookie settings.
 *
 * @example
 * // With a NextRequest object
 * import { saveSession } from '@workos-inc/authkit-nextjs';
 *
 * async function handleEmailVerification(req: NextRequest) {
 *   const { code } = await req.json();
 *   const authResponse = await workos.userManagement.authenticateWithEmailVerification({
 *     clientId: process.env.WORKOS_CLIENT_ID,
 *     code,
 *   });
 *
 *   await saveSession(authResponse, req);
 * }
 *
 * @example
 * // With a URL string
 * await saveSession(authResponse, 'https://example.com/callback');
 */
export async function saveSession(
  sessionOrResponse: Session | AuthenticationResponse,
  request: NextRequest | string,
): Promise<void> {
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
  const encryptedSession = await encryptSession(sessionOrResponse);
  const nextCookies = await cookies();
  const url = typeof request === 'string' ? request : request.url;
  nextCookies.set(cookieName, encryptedSession, getCookieOptions(url));
}

export { encryptSession, refreshSession, updateSession, updateSessionMiddleware, withAuth };
