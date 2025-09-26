import { NextRequest } from 'next/server';
import { WORKOS_CLIENT_ID } from './env-variables.js';
import { HandleAuthOptions } from './interfaces.js';
import { saveSession } from './session.js';
import { errorResponseWithFallback, redirectWithFallback } from './utils.js';
import { getWorkOS } from './workos.js';

function handleState(state: string | null) {
  let returnPathname: string | undefined = undefined;
  let userState: string | undefined;
  if (state?.includes('.')) {
    const [internal, ...rest] = state.split('.');
    userState = rest.join('.');
    try {
      // Reverse URL-safe base64 encoding
      const decoded = internal.replace(/-/g, '+').replace(/_/g, '/');
      returnPathname = JSON.parse(atob(decoded)).returnPathname;
    } catch {
      // Malformed internal part, ignore it
    }
  } else if (state) {
    try {
      const decoded = JSON.parse(atob(state));
      if (decoded.returnPathname) {
        returnPathname = decoded.returnPathname;
      } else {
        userState = state;
      }
    } catch {
      userState = state;
    }
  }
  return {
    returnPathname,
    state: userState,
  };
}

export function handleAuth(options: HandleAuthOptions = {}) {
  const { returnPathname: returnPathnameOption = '/', baseURL, onSuccess, onError } = options;

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

    const { state: customState, returnPathname: returnPathnameState } = handleState(state);

    if (code) {
      try {
        // Use the code returned to us by AuthKit and authenticate the user with WorkOS
        const { accessToken, refreshToken, user, impersonator, oauthTokens, authenticationMethod, organizationId } =
          await getWorkOS().userManagement.authenticateWithCode({
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
        const returnPathname = returnPathnameState ?? returnPathnameOption;

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

        await saveSession({ accessToken, refreshToken, user, impersonator }, request);

        if (onSuccess) {
          await onSuccess({
            accessToken,
            refreshToken,
            user,
            impersonator,
            oauthTokens,
            authenticationMethod,
            organizationId,
            state: customState,
          });
        }

        return response;
      } catch (error) {
        const errorRes = {
          error: error instanceof Error ? error.message : String(error),
        };

        console.error(errorRes);

        return errorResponse(request, error);
      }
    }

    return errorResponse(request);
  };

  function errorResponse(request: NextRequest, error?: unknown) {
    if (onError) {
      return onError({ error, request });
    }

    return errorResponseWithFallback({
      error: {
        message: 'Something went wrong',
        description: "Couldn't sign in. If you are not sure what happened, please contact your organization admin.",
      },
    });
  }
}
