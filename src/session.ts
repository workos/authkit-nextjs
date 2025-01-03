'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';
import { sealData, unsealData } from 'iron-session';
import { getCookieOptions } from './cookie.js';
import { workos } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_COOKIE_PASSWORD, WORKOS_COOKIE_NAME, WORKOS_REDIRECT_URI } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { AccessToken, AuthkitMiddlewareAuth, NoUserInfo, Session, UserInfo } from './interfaces.js';

import { parse, tokensToRegexp } from 'path-to-regexp';
import { redirectWithFallback } from './utils.js';

const sessionHeaderName = 'x-workos-session';
const middlewareHeaderName = 'x-workos-middleware';
const redirectUriHeaderName = 'x-redirect-uri';
const signUpPathsHeaderName = 'x-sign-up-paths';

const JWKS = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(WORKOS_CLIENT_ID)));

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
) {
  if (!redirectUri && !WORKOS_REDIRECT_URI) {
    throw new Error('You must provide a redirect URI in the AuthKit middleware or in the environment variables.');
  }

  if (!WORKOS_COOKIE_PASSWORD || WORKOS_COOKIE_PASSWORD.length < 32) {
    throw new Error(
      'You must provide a valid cookie password that is at least 32 characters in the environment variables.',
    );
  }

  const session = await getSessionFromCookie();
  const newRequestHeaders = new Headers(request.headers);

  // We store the current request url in a custom header, so we can always have access to it
  // This is because on hard navigations we don't have access to `next-url` but need to get the current
  // `pathname` to be able to return the users where they came from before sign-in
  newRequestHeaders.set('x-url', request.url);

  // Record that the request was routed through the middleware so we can check later for DX purposes
  newRequestHeaders.set(middlewareHeaderName, 'true');

  // Record the sign up paths so we can use it later
  if (signUpPaths.length > 0) {
    newRequestHeaders.set(signUpPathsHeaderName, signUpPaths.join(','));
  }

  let url;

  // If the redirect URI is set, store it in the headers so we can use it later
  if (redirectUri) {
    newRequestHeaders.set(redirectUriHeaderName, redirectUri);
    url = new URL(redirectUri);
  } else {
    url = new URL(WORKOS_REDIRECT_URI);
  }

  newRequestHeaders.delete(sessionHeaderName);

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

  // If the user is logged out and this path isn't on the allowlist for logged out paths, redirect to AuthKit.
  if (middlewareAuth.enabled && matchedPaths.length === 0 && !session) {
    if (debug) console.log(`Unauthenticated user on protected route ${request.url}, redirecting to AuthKit`);

    const redirectTo = await getAuthorizationUrl({
      returnPathname: getReturnPathname(request.url),
      redirectUri: redirectUri,
      screenHint: getScreenHint(signUpPaths, request.nextUrl.pathname),
    });

    return redirectWithFallback(redirectTo);
  }

  // If no session, just continue
  if (!session) {
    return NextResponse.next({
      request: { headers: newRequestHeaders },
    });
  }

  const hasValidSession = await verifyAccessToken(session.accessToken);
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';

  const nextCookies = await cookies();

  if (hasValidSession) {
    if (debug) console.log('Session is valid');
    // set the x-workos-session header according to the current cookie value
    newRequestHeaders.set(sessionHeaderName, nextCookies.get(cookieName)!.value);
    return NextResponse.next({
      request: { headers: newRequestHeaders },
    });
  }

  try {
    if (debug) console.log(`Session invalid. Refreshing access token that ends in ${session.accessToken.slice(-10)}`);

    const { org_id: organizationId } = decodeJwt<AccessToken>(session.accessToken);

    // If the session is invalid (i.e. the access token has expired) attempt to re-authenticate with the refresh token
    const { accessToken, refreshToken, user, impersonator } = await workos.userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: session.refreshToken,
      organizationId,
    });

    if (debug) console.log(`Refresh successful. New access token ends in ${accessToken.slice(-10)}`);

    // Encrypt session with new access and refresh tokens
    const encryptedSession = await encryptSession({
      accessToken,
      refreshToken,
      user,
      impersonator,
    });

    newRequestHeaders.set(sessionHeaderName, encryptedSession);

    const response = NextResponse.next({
      request: { headers: newRequestHeaders },
    });
    // update the cookie
    response.cookies.set(cookieName, encryptedSession, getCookieOptions(redirectUri));
    return response;
  } catch (e) {
    if (debug) console.log('Failed to refresh. Deleting cookie and redirecting.', e);

    nextCookies.delete(cookieName);
  }

  // If we get here, the session is invalid and the user needs to sign in again.
  // We redirect to the current URL which will trigger the middleware again.
  // This is outside of the above block because you cannot redirect in Next.js
  // from inside a try/catch block.
  return redirectWithFallback(request.url);
}

async function refreshSession(options: {
  organizationId?: string;
  ensureSignedIn?: boolean;
}): Promise<UserInfo | NoUserInfo>;

/* istanbul ignore next */
async function refreshSession({
  organizationId: nextOrganizationId,
  ensureSignedIn = false,
}: {
  organizationId?: string;
  ensureSignedIn?: boolean;
} = {}) {
  const session = await getSessionFromCookie();
  if (!session) {
    if (ensureSignedIn) {
      await redirectToSignIn();
    }
    return { user: null };
  }

  const { org_id: organizationIdFromAccessToken } = decodeJwt<AccessToken>(session.accessToken);

  const { accessToken, refreshToken, user, impersonator } = await workos.userManagement.authenticateWithRefreshToken({
    clientId: WORKOS_CLIENT_ID,
    refreshToken: session.refreshToken,
    organizationId: nextOrganizationId ?? organizationIdFromAccessToken,
  });

  // Encrypt session with new access and refresh tokens
  const encryptedSession = await encryptSession({
    accessToken,
    refreshToken,
    user,
    impersonator,
  });

  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';

  const headersList = await headers();
  const url = headersList.get('x-url');

  const nextCookies = await cookies();
  nextCookies.set(cookieName, encryptedSession, getCookieOptions(url));

  const {
    sid: sessionId,
    org_id: organizationId,
    role,
    permissions,
    entitlements,
  } = decodeJwt<AccessToken>(accessToken);

  return {
    sessionId,
    user,
    organizationId,
    role,
    permissions,
    entitlements,
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

  redirect(await getAuthorizationUrl({ returnPathname, screenHint }));
}

async function withAuth(options?: { ensureSignedIn: false }): Promise<UserInfo | NoUserInfo>;
// @ts-expect-error - TS complains about the overload signature when we have more than 2 optional properties
async function withAuth(options: { ensureSignedIn: true }): Promise<UserInfo>;
async function withAuth({ ensureSignedIn = false } = {}) {
  const session = await getSessionFromHeader();

  if (!session) {
    if (ensureSignedIn) {
      await redirectToSignIn();
    }
    return { user: null };
  }

  const {
    sid: sessionId,
    org_id: organizationId,
    role,
    permissions,
    entitlements,
  } = decodeJwt<AccessToken>(session.accessToken);

  return {
    sessionId,
    user: session.user,
    organizationId,
    role,
    permissions,
    entitlements,
    impersonator: session.impersonator,
    accessToken: session.accessToken,
  };
}

async function terminateSession() {
  const { sessionId } = await withAuth();
  if (sessionId) {
    redirect(workos.userManagement.getLogoutUrl({ sessionId }));
  } else {
    redirect('/');
  }
}

async function verifyAccessToken(accessToken: string) {
  try {
    await jwtVerify(accessToken, JWKS);
    return true;
  } catch {
    return false;
  }
}

async function getSessionFromCookie(response?: NextResponse) {
  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
  const nextCookies = await cookies();
  const cookie = response ? response.cookies.get(cookieName) : nextCookies.get(cookieName);

  if (cookie) {
    return unsealData<Session>(cookie.value ?? cookie, {
      password: WORKOS_COOKIE_PASSWORD,
    });
  }
}

/**
 * Retrieves the session from the cookie. Meant for use in the middleware, for client side use `withAuth` instead.
 *
 * @returns UserInfo | NoUserInfo
 */
async function getSession(response?: NextResponse) {
  const session = await getSessionFromCookie(response);

  if (!session) return { user: null };

  if (await verifyAccessToken(session.accessToken)) {
    const {
      sid: sessionId,
      org_id: organizationId,
      role,
      permissions,
      entitlements,
    } = decodeJwt<AccessToken>(session.accessToken);

    return {
      sessionId,
      user: session.user,
      organizationId,
      role,
      permissions,
      entitlements,
      impersonator: session.impersonator,
      accessToken: session.accessToken,
    };
  }
}

async function getSessionFromHeader(): Promise<Session | undefined> {
  const headersList = await headers();
  const hasMiddleware = Boolean(headersList.get(middlewareHeaderName));

  if (!hasMiddleware) {
    const url = headersList.get('x-url');
    throw new Error(
      `You are calling 'withAuth' on ${url} that isn’t covered by the AuthKit middleware. Make sure it is running on all paths you are calling 'withAuth' from by updating your middleware config in 'middleware.(js|ts)'.`,
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

function getScreenHint(signUpPaths: string[] | undefined, pathname: string) {
  if (!signUpPaths) return 'sign-in';

  const screenHintPaths: string[] = signUpPaths.filter((pathGlob) => {
    const pathRegex = getMiddlewareAuthPathRegex(pathGlob);
    return pathRegex.exec(pathname);
  });

  return screenHintPaths.length > 0 ? 'sign-up' : 'sign-in';
}

export { encryptSession, withAuth, refreshSession, terminateSession, updateSessionMiddleware, getSession };
