import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';
import { sealData, unsealData } from 'iron-session';
import { cookieName, cookieOptions } from './cookie.js';
import { workos } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_COOKIE_PASSWORD } from './env-variables.js';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { AccessToken, NoUserInfo, Session, UserInfo } from './interfaces.js';

const sessionHeaderName = 'x-workos-session';
const middlewareHeaderName = 'x-workos-middleware';

const JWKS = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(WORKOS_CLIENT_ID)));

async function encryptSession(session: Session) {
  return sealData(session, { password: WORKOS_COOKIE_PASSWORD });
}

async function updateSession(request: NextRequest, debug: boolean) {
  const session = await getSessionFromCookie();
  const newRequestHeaders = new Headers(request.headers);

  // We store the current request url in a custom header, so we can always have access to it
  // This is because on hard navigations we don't have access to `next-url` but need to get the current
  // `pathname` to be able to return the users where they came from before sign-in
  newRequestHeaders.set('x-url', request.url);

  // Record that the request was routed through the middleware so we can check later for DX purposes
  newRequestHeaders.set(middlewareHeaderName, 'true');

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
    const { accessToken, refreshToken } = await workos.userManagement.authenticateWithRefreshToken({
      clientId: WORKOS_CLIENT_ID,
      refreshToken: session.refreshToken,
    });

    if (debug) console.log('Refresh successful:', refreshToken);

    // Encrypt session with new access and refresh tokens
    const encryptedSession = await encryptSession({
      accessToken,
      refreshToken,
      user: session.user,
      impersonator: session.impersonator,
    });

    newRequestHeaders.set(sessionHeaderName, encryptedSession);

    const response = NextResponse.next({
      request: { headers: newRequestHeaders },
    });
    // update the cookie
    response.cookies.set(cookieName, encryptedSession, cookieOptions);
    return response;
  } catch (e) {
    console.warn('Failed to refresh', e);
    const response = NextResponse.next();
    response.cookies.delete(cookieName);
    return response;
  }
}

async function getUser(options?: { ensureSignedIn: false }): Promise<UserInfo | NoUserInfo>;

async function getUser(options: { ensureSignedIn: true }): Promise<UserInfo>;

async function getUser({ ensureSignedIn = false } = {}) {
  const hasMiddleware = Boolean(headers().get(middlewareHeaderName));

  if (!hasMiddleware) {
    throw new Error(
      'You are calling `getUser` on a path that isn’t covered by the AuthKit middleware. Make sure it is running on all paths you are calling `getUser` from by updating your middleware config in `middleware.(js|ts)`.',
    );
  }

  const session = await getSessionFromHeader();
  if (!session) {
    if (ensureSignedIn) {
      const url = headers().get('x-url');
      const returnPathname = url ? new URL(url).pathname : undefined;
      redirect(await getAuthorizationUrl(returnPathname));
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
    console.warn('Failed to verify session:', e);
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

async function getSessionFromHeader(): Promise<Session | undefined> {
  const authHeader = headers().get(sessionHeaderName);
  if (!authHeader) return;

  return unsealData<Session>(authHeader, { password: WORKOS_COOKIE_PASSWORD });
}

export { encryptSession, updateSession, getUser, terminateSession };
