import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { workos } from './workos.js';
import { WORKOS_CLIENT_ID } from './env-variables.js';
import { encryptSession } from './session.js';
import { cookieName, cookieOptions } from './cookie.js';
import { HandleAuthOptions } from './interfaces.js';

export function handleAuth(options: HandleAuthOptions = {}) {
  const { returnPathname: returnPathnameOption = '/' } = options;

  return async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    let returnPathname = state ? JSON.parse(atob(state)).returnPathname : null;

    if (code) {
      try {
        // Use the code returned to us by AuthKit and authenticate the user with WorkOS
        const { accessToken, refreshToken, user, impersonator } = await workos.userManagement.authenticateWithCode({
          clientId: WORKOS_CLIENT_ID,
          code,
        });

        const url = request.nextUrl.clone();

        // Cleanup params
        url.searchParams.delete('code');
        url.searchParams.delete('state');

        // Redirect to the requested path and store the session
        returnPathname = returnPathname ?? returnPathnameOption;

        // Extract the search params if they are present
        if (returnPathname.includes('?')) {
          const [pathname, search] = returnPathname.split('?');
          url.pathname = pathname;
          search.split('&').forEach((param: string) => {
            const [key, value] = param.split('=');
            url.searchParams.append(key, value);
          });
        } else {
          url.pathname = returnPathname;
        }

        const response = NextResponse.redirect(url);

        if (!accessToken || !refreshToken) throw new Error('response is missing tokens');

        // The refreshToken should never be accesible publicly, hence why we encrypt it in the cookie session
        // Alternatively you could persist the refresh token in a backend database
        const session = await encryptSession({ accessToken, refreshToken, user, impersonator });
        cookies().set(cookieName, session, cookieOptions);

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
    return NextResponse.json(
      {
        error: {
          message: 'Something went wrong',
          description: 'Couldn’t sign in. If you are not sure what happened, please contact your organization admin.',
        },
      },
      { status: 500 },
    );
  }
}
