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

const JWKS = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(WORKOS_CLIENT_ID)));

async function encryptSession(session: Session) {
  return sealData(session, { password: WORKOS_COOKIE_PASSWORD });
}

async function updateSession(request: NextRequest, debug: boolean) {
  const session = await getSessionFromCookie();

  // If no session, just continue
  if (!session) {
    return NextResponse.next();
  }

  const hasValidSession = await verifyAccessToken(session.accessToken);

  const newRequestHeaders = new Headers(request.headers);

  if (hasValidSession) {
    if (debug) console.log('Session is valid');
    // set the x-workos-session header according to the current cookie value
    newRequestHeaders.set(sessionHeaderName, cookies().get(cookieName)!.value);
    return NextResponse.next({
      headers: newRequestHeaders,
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
      request: {
        headers: newRequestHeaders,
      },
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
  const session = await getSessionFromHeader();
  if (!session) {
    if (ensureSignedIn) {
      const returnPathname = headers().get('next-url') ?? undefined;
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
