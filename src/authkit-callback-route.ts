import { NextRequest } from 'next/server';
import { getCookieOptions } from './cookie.js';
import { WORKOS_CLIENT_ID } from './env-variables.js';
import { HandleAuthOptions } from './interfaces.js';
import { PKCE_COOKIE_NAME, getAuthCookieData } from './pkce.js';
import { saveSession } from './session.js';
import { errorResponseWithFallback, redirectWithFallback, setCachePreventionHeaders } from './utils.js';
import { getWorkOS } from './workos.js';

function preventCaching(headers: Headers): void {
  headers.set('Vary', 'Cookie');
  setCachePreventionHeaders(headers);
}

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
      } else if (!decoded.nonce) {
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
    // Fall back to standard URL parsing when nextUrl is not available (e.g., vinext)
    const requestUrl = request.nextUrl ?? new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');

    const { state: customState, returnPathname: returnPathnameState } = handleState(state);

    const pkceCookie = request.cookies.get(PKCE_COOKIE_NAME);
    const deleteCookie = `${PKCE_COOKIE_NAME}=; ${getCookieOptions(request.url, true, true)}`;

    if (code) {
      try {
        const { codeVerifier, state: storedState } = await getAuthCookieData(pkceCookie?.value);

        // Verify the OAuth state parameter matches the stored state (CSRF protection)
        if (storedState !== (state ?? undefined)) {
          throw new Error('OAuth state mismatch');
        }

        // Use the code returned to us by AuthKit and authenticate the user with WorkOS
        const { accessToken, refreshToken, user, impersonator, oauthTokens, authenticationMethod, organizationId } =
          await getWorkOS().userManagement.authenticateWithCode({
            clientId: WORKOS_CLIENT_ID,
            code,
            codeVerifier,
          });

        // If baseURL is provided, use it instead of request.nextUrl
        // This is useful if the app is being run in a container like docker where
        // the hostname can be different from the one in the request
        const url = baseURL ? new URL(baseURL) : new URL(requestUrl.toString());

        // Cleanup params
        url.searchParams.delete('code');
        url.searchParams.delete('state');

        // Redirect to the requested path and store the session
        const returnPathname = returnPathnameState ?? returnPathnameOption;

        // Extract pathname and search params from returnPathname
        const parsedReturnUrl = new URL(returnPathname, 'https://placeholder.com');
        url.pathname = parsedReturnUrl.pathname;
        url.search = parsedReturnUrl.search;

        // Fall back to standard Response if NextResponse is not available.
        // This is to support Next.js 13.
        const response = redirectWithFallback(url.toString());
        preventCaching(response.headers);

        if (pkceCookie) {
          response.headers.append('Set-Cookie', deleteCookie);
        }

        if (!accessToken || !refreshToken) {
          throw new Error('response is missing tokens');
        }

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

        const response = await errorResponse(request, error);
        if (pkceCookie) {
          response.headers.append('Set-Cookie', deleteCookie);
        }
        return response;
      }
    }

    const response = await errorResponse(request);
    if (pkceCookie) {
      response.headers.append('Set-Cookie', deleteCookie);
    }
    return response;
  };

  async function errorResponse(request: NextRequest, error?: unknown) {
    if (onError) {
      const response = await onError({ error, request });
      preventCaching(response.headers);
      return response;
    }

    const response = errorResponseWithFallback({
      error: {
        message: 'Something went wrong',
        description: "Couldn't sign in. If you are not sure what happened, please contact your organization admin.",
      },
    });

    preventCaching(response.headers);
    return response;
  }
}
