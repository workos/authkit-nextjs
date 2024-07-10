import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';
import { sealData, unsealData } from 'iron-session';
import { cookieName, cookieOptions } from './cookie.js';
import { workos } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_COOKIE_PASSWORD, WORKOS_REDIRECT_URI } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { AccessToken, AuthkitMiddlewareAuth, NoUserInfo, Session, UserInfo } from './interfaces.js';

import { parse, tokensToRegexp } from 'path-to-regexp';

const sessionHeaderName = 'x-workos-session';
const middlewareHeaderName = 'x-workos-middleware';

const JWKS = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(WORKOS_CLIENT_ID)));

async function encryptSession(session: Session) {
  return sealData(session, { password: WORKOS_COOKIE_PASSWORD });
}

async function updateSession(request: NextRequest, debug: boolean, middlewareAuth: AuthkitMiddlewareAuth) {
  const session = await getSessionFromCookie();
  const newRequestHeaders = new Headers(request.headers);

  // We store the current request url in a custom header, so we can always have access to it
  // This is because on hard navigations we don't have access to `next-url` but need to get the current
  // `pathname` to be able to return the users where they came from before sign-in
  newRequestHeaders.set('x-url', request.url);

  // Record that the request was routed through the middleware so we can check later for DX purposes
  newRequestHeaders.set(middlewareHeaderName, 'true');

  newRequestHeaders.delete(sessionHeaderName);

  const url = new URL(WORKOS_REDIRECT_URI);

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
    if (debug) console.log('Unauthenticated user on protected route, redirecting to AuthKit');

    // If the request is a POST, then we're likely to run afoul of CORS protections
    // as the request might have come from the client as a server function.
    // In that case we return an error response instead of redirecting.
    if (request.method === 'POST') {
      return new NextResponse('Not authorized', { status: 403 });
    }

    return NextResponse.redirect(await getAuthorizationUrl({ returnPathname: new URL(request.url).pathname }));
  }

  // If no session, just continue
  if (!session) {
    return NextResponse.next({
      request: { headers: newRequestHeaders },
    });
  }

  const hasValidSession = await verifyAccessToken(session.accessToken);

  if (hasValidSession) {
    if (debug) console.log('Session is valid');
    // set the x-workos-session header according to the current cookie value
    newRequestHeaders.set(sessionHeaderName, cookies().get(cookieName)!.value);
    return NextResponse.next({
      request: { headers: newRequestHeaders },
    });
  }

  try {
    if (debug) console.log('Session invalid. Attempting refresh', session.refreshToken);

    // If the session is invalid (i.e. the access token has expired) attempt to re-authenticate with the refresh token
    const { accessToken, refreshToken, user, impersonator } = await workos.userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: session.refreshToken,
    });

    if (debug) console.log('Refresh successful:', refreshToken);

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
    response.cookies.set(cookieName, encryptedSession, cookieOptions);
    return response;
  } catch (e) {
    if (debug) console.log('Failed to refresh. Deleting cookie and redirecting.', e);
    const response = NextResponse.next({
      request: { headers: newRequestHeaders },
    });
    response.cookies.delete(cookieName);
    return response;
  }
}

function getMiddlewareAuthPathRegex(pathGlob: string) {
  let regex: string;

  try {
    // Redirect URI is only used to construct the URL
    const url = new URL(pathGlob, WORKOS_REDIRECT_URI);
    const path = `${url.pathname!}${url.hash || ''}`;

    const tokens = parse(path);
    regex = tokensToRegexp(tokens).source;

    return new RegExp(regex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    throw new Error(`Error parsing routes for middleware auth. Reason: ${message}`);
  }
}

async function getUser(options?: { ensureSignedIn: false }): Promise<UserInfo | NoUserInfo>;

async function getUser(options: { ensureSignedIn: true }): Promise<UserInfo>;

async function getUser({ ensureSignedIn = false } = {}) {
  const session = await getSessionFromHeader('getUser');
  if (!session) {
    if (ensureSignedIn) {
      const url = headers().get('x-url');
      const returnPathname = url ? new URL(url).pathname : undefined;
      redirect(await getAuthorizationUrl({ returnPathname }));
    }
    return { user: null };
  }

  const { sid: sessionId, org_id: organizationId, role } = decodeJwt<AccessToken>(session.accessToken);

  return {
    sessionId,
    user: session.user,
    organizationId,
    role,
    impersonator: session.impersonator,
    accessToken: session.accessToken,
  };
}

async function terminateSession() {
  const { sessionId } = await getUser();
  if (sessionId) {
    redirect(workos.userManagement.getLogoutUrl({ sessionId }));
  }
  redirect('/');
}

async function verifyAccessToken(accessToken: string) {
  try {
    await jwtVerify(accessToken, JWKS);
    return true;
  } catch (e) {
    return false;
  }
}

async function getSessionFromCookie() {
  const cookie = cookies().get(cookieName);
  if (cookie) {
    return unsealData<Session>(cookie.value, {
      password: WORKOS_COOKIE_PASSWORD,
    });
  }
}

async function getSessionFromHeader(caller: string): Promise<Session | undefined> {
  const hasMiddleware = Boolean(headers().get(middlewareHeaderName));

  if (!hasMiddleware) {
    throw new Error(
      `You are calling \`${caller}\` on a path that isn’t covered by the AuthKit middleware. Make sure it is running on all paths you are calling \`${caller}\` from by updating your middleware config in \`middleware.(js|ts)\`.`,
    );
  }

  const authHeader = headers().get(sessionHeaderName);
  if (!authHeader) return;

  return unsealData<Session>(authHeader, { password: WORKOS_COOKIE_PASSWORD });
}

export { encryptSession, updateSession, getUser, terminateSession };
