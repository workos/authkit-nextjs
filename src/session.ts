import 'server-only';

import { sealData, unsealData } from 'iron-session';
import { JWTPayload, createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
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
import {
  appendPKCESetCookieHeader,
  isInitialDocumentRequest,
  setPKCECookie,
  setPendingPKCERedirectHeaders,
} from './pkce.js';
import { getWorkOS } from './workos.js';

import type { AuthenticationResponse } from '@workos-inc/node';
import { parse, tokensToRegexp } from 'path-to-regexp';
import { handleAuthkitHeaders } from './middleware-helpers.js';
import { evaluateRecentAuth, lazy, setCachePreventionHeaders } from './utils.js';

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
  refreshBufferSeconds?: number,
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
    refreshBufferSeconds,
  });

  // Record the sign up paths so we can use them later
  if (signUpPaths.length > 0) {
    headers.set(signUpPathsHeaderName, signUpPaths.join(','));
  }

  applyCacheSecurityHeaders(headers, request, session);

  // If the user is logged out and this path isn't on the allowlist for logged out paths, redirect to AuthKit.
  if (middlewareAuth.enabled && matchedPaths.length === 0 && !session.user) {
    if (debug) {
      console.log(`Unauthenticated user on protected route ${request.url}, redirecting to AuthKit`);
    }

    return handleAuthkitHeaders(request, headers, { redirect: authorizationUrl as string });
  }

  return handleAuthkitHeaders(request, headers);
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

    const { url: authorizationUrl, sealedState } = await getAuthorizationUrl({
      returnPathname: getReturnPathname(request.url),
      redirectUri: options.redirectUri || WORKOS_REDIRECT_URI,
      screenHint: options.screenHint,
    });

    setPendingPKCERedirectHeaders(newRequestHeaders, authorizationUrl, sealedState);
    appendPKCESetCookieHeader(request, newRequestHeaders, sealedState);

    return {
      session: { user: null },
      headers: newRequestHeaders,
      authorizationUrl,
    };
  }

  const hasValidSession = await verifyAccessToken(session.accessToken);
  const isExpiring = hasValidSession && isTokenExpiring(session.accessToken, options.refreshBufferSeconds);

  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';

  applyCacheSecurityHeaders(newRequestHeaders, request, session);

  const respondWithCurrentToken = (): AuthkitResponse => {
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
  };

  if (hasValidSession && !isExpiring) {
    return respondWithCurrentToken();
  }

  try {
    if (options.debug) {
      // istanbul ignore next
      console.log(
        isExpiring
          ? `Session expiring soon. Proactively refreshing access token that ends in ${session.accessToken.slice(-10)}`
          : `Session invalid. ${session.accessToken ? `Refreshing access token that ends in ${session.accessToken.slice(-10)}` : 'Access token missing.'}`,
      );
    }

    const { org_id: organizationIdFromAccessToken } = decodeJwt<AccessToken>(session.accessToken);

    const { accessToken, refreshToken, user, impersonator, authenticationMethod } =
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
      authenticationMethod,
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
    if (isExpiring) {
      // A failed proactive refresh is not fatal while the current token is still
      // valid. Refresh tokens are single-use, so a concurrent request in the same
      // buffer window may have already rotated this one; that request has persisted
      // the new session cookie. Serve this request with the current token instead of
      // destroying the session. Re-check validity here: the token may have expired
      // during the refresh round trip, in which case fall through to the
      // delete-cookie path below.
      const { exp } = decodeJwt(session.accessToken);
      if (typeof exp === 'number' && exp > Math.floor(Date.now() / 1000)) {
        if (options.debug) {
          console.log('Proactive refresh failed. Serving request with the still-valid access token.', e);
        }

        return respondWithCurrentToken();
      }
    }

    // Only tear down the session for a terminal failure. A transient failure
    // (network error, request timeout, 429, or 5xx that survived the SDK's
    // internal retries) is not a signal that the refresh token is dead —
    // deleting the cookie here would turn a brief outage into a forced
    // re-authentication, and the still-valid refresh token would be lost. Keep
    // the sealed cookie so a later request refreshes successfully once the
    // condition clears.
    const isTransient = isTransientRefreshError(e);

    if (options.debug) {
      console.log(
        isTransient
          ? 'Failed to refresh due to a transient error. Preserving the session cookie so it can be retried.'
          : 'Failed to refresh. Deleting cookie.',
        e,
      );
    }

    if (!isTransient) {
      // When we need to delete a cookie, return it as a header as you can't delete cookies from edge middleware
      const deleteCookie = `${cookieName}=; Expires=${new Date(0).toUTCString()}; ${getCookieOptions(request.url, true, true)}`;
      newRequestHeaders.append('Set-Cookie', deleteCookie);

      // Delete JWT cookie if eagerAuth is enabled
      if (options.eagerAuth) {
        const deleteJwtCookie = getJwtCookie(null, request.url, true);
        newRequestHeaders.append('Set-Cookie', deleteJwtCookie);
      }
    }

    options.onSessionRefreshError?.({ error: e, request, isTransient });

    const { url: authorizationUrl, sealedState } = await getAuthorizationUrl({
      returnPathname: getReturnPathname(request.url),
      redirectUri: options.redirectUri || WORKOS_REDIRECT_URI,
    });

    setPendingPKCERedirectHeaders(newRequestHeaders, authorizationUrl, sealedState);
    appendPKCESetCookieHeader(request, newRequestHeaders, sealedState);

    return {
      session: { user: null },
      headers: newRequestHeaders,
      authorizationUrl,
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
      { ...getSessionErrorContext(session), isTransient: isTransientRefreshError(error) },
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

function getMiddlewareAuthPathRegex(pathGlob: string) {
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

  const { url: authkitUrl, sealedState } = await getAuthorizationUrl({ returnPathname, screenHint });
  await setPKCECookie(sealedState);
  redirect(authkitUrl);
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

/**
 * Check how recently the current user authenticated, using the `auth_time`
 * claim on the access token. Returns data only — it never redirects — so it is
 * safe to call as the enforcement step inside a sensitive server action or in a
 * server component where you decide what to do.
 *
 * @example
 * ```typescript
 * // Guard a sensitive server action
 * const { isStale } = await checkRecentAuth({ maxAge: 300 });
 * if (isStale) {
 *   return { status: 'reauth_required' };
 * }
 * ```
 *
 * @remarks
 * To send the user through re-authentication, redirect to your sign-in route
 * with `maxAge` (e.g. `getSignInUrl({ maxAge: 300 })`), which forwards OIDC
 * `max_age` so the IdP forces a reauth when the most recent auth is older.
 *
 * Requires `@workos-inc/node` >= 10.7.0 for `maxAge` forwarding.
 */
export async function checkRecentAuth({ maxAge }: { maxAge: number }) {
  const { user, accessToken } = await withAuth();
  const authTime = user && accessToken ? (await getTokenClaims(accessToken)).auth_time : undefined;
  return evaluateRecentAuth({ authTime, maxAgeSeconds: maxAge, nowSeconds: Math.floor(Date.now() / 1000) });
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
    sub,
    sid: sessionId,
    org_id: organizationId,
    role,
    roles,
    permissions,
    entitlements,
    feature_flags: featureFlags,
  } = decodeJwt<AccessToken>(session.accessToken);

  // Defense-in-depth (SEC-1219): bind the sealed `user` to the access token's
  // subject. `saveSession` seals whatever `user` object it is handed, so a
  // caller presenting their own valid access token alongside a forged `user`
  // must not have that identity trusted here. A signature-verified WorkOS
  // access token always carries `sub`; when it disagrees with the sealed user
  // id, treat the session as unauthenticated rather than impersonate the user.
  if (session.user && sub && session.user.id !== sub) {
    console.warn(
      `withAuth: sealed session user (${session.user.id}) does not match the access token subject (${sub}); rejecting session.`,
    );
    if (options?.ensureSignedIn) {
      await redirectToSignIn();
    }
    return { user: null };
  }

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

/**
 * Determines whether a still-valid access token is close enough to expiry that it
 * should be proactively refreshed, so it cannot expire in the hands of a
 * server-side consumer (render latency, network round trips, clock skew).
 *
 * Mirrors the buffer the client token store uses (`components/tokenStore.ts`):
 * 60 seconds, or 30 seconds for tokens with a total lifetime of 5 minutes or
 * less, unless an explicit `refreshBufferSeconds` is provided. A buffer of 0
 * disables proactive refresh.
 */
function isTokenExpiring(accessToken: string, refreshBufferSeconds?: number): boolean {
  try {
    const { exp, iat } = decodeJwt(accessToken);
    if (typeof exp !== 'number') {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const totalTokenLifetime = exp - (iat ?? exp);
    const bufferSeconds = refreshBufferSeconds ?? (totalTokenLifetime <= 300 ? 30 : 60);

    return exp < now + bufferSeconds;
  } catch {
    return false;
  }
}

// HTTP statuses the WorkOS SDK treats as idempotent/retryable and retries
// internally. If one of these still surfaces, the failure is transient rather
// than a dead refresh token: request timeouts (normalized to 408), rate limits
// (429), and 5xx.
const RETRYABLE_REFRESH_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// A network-level fetch failure surfaces as a TypeError ("fetch failed" /
// "Failed to fetch"). Match its message so an unrelated programming TypeError
// isn't misclassified as a transient (and therefore session-preserving) error.
const NETWORK_ERROR_MESSAGE = /fetch failed|failed to fetch|network|load failed|terminated/i;

// A raw network TypeError is not an HttpClientError, so the WorkOS SDK re-wraps
// it in a plain Error whose `cause` is the original TypeError. Follow the cause
// chain to recognize it.
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return NETWORK_ERROR_MESSAGE.test(error.message);
  }

  if (error instanceof Error && error.cause != null && error.cause !== error) {
    return isNetworkError(error.cause);
  }

  return false;
}

/**
 * Determines whether a failed refresh is transient (should preserve the
 * session and be retried) rather than terminal (the refresh token is dead and
 * the user must re-authenticate).
 *
 * Mirrors the WorkOS SDK's own retry classification: transient HTTP responses
 * (request timeout normalized to `408`, `429`, and `5xx`) surface as an
 * exception carrying a retryable numeric `status`, and a network-level failure
 * surfaces as a `TypeError` (wrapped by the SDK in an `Error` with the
 * `TypeError` as its `cause`). Anything else (a terminal `invalid_grant` at
 * 400, a 401, or an unrecognized error) is treated as terminal.
 */
export function isTransientRefreshError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error;
    if (typeof status === 'number' && RETRYABLE_REFRESH_STATUS_CODES.has(status)) {
      return true;
    }
  }

  return isNetworkError(error);
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

  return `${newUrl.pathname}${newUrl.search}`;
}

function getScreenHint(signUpPaths: string[] | undefined, pathname: string) {
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
