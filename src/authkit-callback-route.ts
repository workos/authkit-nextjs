import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { workos } from './workos.js';
import { WORKOS_CLIENT_ID, WORKOS_COOKIE_NAME } from './env-variables.js';
import { encryptSession } from './session.js';
import { errorResponseWithFallback, redirectWithFallback } from './utils.js';
import { getCookieOptions } from './cookie.js';
import { HandleAuthOptions } from './interfaces.js';

export function handleAuth(options: HandleAuthOptions = {}) {
  const { returnPathname: returnPathnameOption = '/', baseURL, onSuccess } = options;

  // Throw early if baseURL is provided but invalid
  if (baseURL) {
    try {
      new URL(baseURL);
    } catch (error) {
      throw new Error(`Invalid baseURL: ${baseURL}`, { cause: error });
    }
  }

  return async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    let returnPathname = state && state !== 'null' ? JSON.parse(atob(state)).returnPathname : null;

    if (code) {
      try {
        // Use the code returned to us by AuthKit and authenticate the user with WorkOS
        const { accessToken, refreshToken, user, impersonator, oauthTokens } =
          await workos.userManagement.authenticateWithCode({
            clientId: WORKOS_CLIENT_ID,
            code,
          });

        // If baseURL is provided, use it instead of request.nextUrl
        // This is useful if the app is being run in a container like docker where
        // the hostname can be different from the one in the request
        const url = baseURL ? new URL(baseURL) : request.nextUrl.clone();

        // Cleanup params
        url.searchParams.delete('code');
        url.searchParams.delete('state');

        // Redirect to the requested path and store the session
        returnPathname = returnPathname ?? returnPathnameOption;

        // Extract the search params if they are present
        if (returnPathname.includes('?')) {
          const newUrl = new URL(returnPathname, 'https://example.com');
          url.pathname = newUrl.pathname;

          for (const [key, value] of newUrl.searchParams) {
            url.searchParams.append(key, value);
          }
        } else {
          url.pathname = returnPathname;
        }

        // Fall back to standard Response if NextResponse is not available.
        // This is to support Next.js 13.
        const response = redirectWithFallback(url.toString());

        if (!accessToken || !refreshToken) throw new Error('response is missing tokens');

        if (onSuccess) {
          await onSuccess({ accessToken, refreshToken, user, impersonator, oauthTokens });
        }

        // The refreshToken should never be accesible publicly, hence why we encrypt it in the cookie session
        // Alternatively you could persist the refresh token in a backend database
        const session = await encryptSession({ accessToken, refreshToken, user, impersonator });
        const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
        const nextCookies = await cookies();

        nextCookies.set(cookieName, session, getCookieOptions(request.url));

        return response;
      } catch (error) {
        const errorRes = {
          error: error instanceof Error ? error.message : String(error),
        };

        console.error(errorRes);

        return errorResponse();
      }
    }

    return errorResponse();
  };

  function errorResponse() {
    return errorResponseWithFallback({
      error: {
        message: 'Something went wrong',
        description: "Couldn't sign in. If you are not sure what happened, please contact your organization admin.",
      },
    });
  }
}
