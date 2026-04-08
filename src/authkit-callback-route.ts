import { NextRequest } from 'next/server';
import { getPKCECookieOptions } from './cookie.js';
import { WORKOS_CLIENT_ID } from './env-variables.js';
import { HandleAuthOptions } from './interfaces.js';
import { PKCE_COOKIE_NAME, getStateFromPKCECookieValue } from './pkce.js';
import { saveSession } from './session.js';
import { errorResponseWithFallback, redirectWithFallback, setCachePreventionHeaders } from './utils.js';
import { getWorkOS } from './workos.js';

function preventCaching(headers: Headers): void {
  headers.set('Vary', 'Cookie');
  setCachePreventionHeaders(headers);
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
    // Always delete the PKCE cookie after handling the callback, regardless of success or error
    // to avoid stale cookies affecting future auth attempts & prevent replays
    const deleteCookie = `${PKCE_COOKIE_NAME}=; ${getPKCECookieOptions(request.url, true, true)}`;

    // We want to catch any & all errors and respond the same way
    // Firstly, by destroying the 1-use PKCE cookie to prevent replay attacks
    // or stale cookies affecting future auth attempts
    try {
      // Fall back to standard URL parsing when nextUrl is not available (e.g., vinext)
      const requestUrl = request.nextUrl ?? new URL(request.url);

      // Gather mandatory information
      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      const pkceCookie = request.cookies.get(PKCE_COOKIE_NAME)?.value;

      if (!code) {
        throw new Error('Missing authorization code');
      }

      // Dashboard impersonation: WorkOS sends only `code` (no state parameter)
      // because the flow is initiated from the WorkOS dashboard, not from the application.
      // A stale PKCE cookie may exist from a prior auth flow — its presence is irrelevant here.
      // The impersonator check after code exchange guards against misuse of this path.
      const isDashboardImpersonation = state === null;

      let codeVerifier: string | undefined;
      let customState: string | undefined;
      let returnPathnameState: string | undefined;

      if (!isDashboardImpersonation) {
        // CSRF verification: both channels (cookie + URL state) must be present and match
        if (!pkceCookie) {
          throw new Error(
            'Auth cookie missing — cannot verify OAuth state. Ensure Set-Cookie headers are propagated on redirects.',
          );
        }

        if (state !== pkceCookie) {
          throw new Error('OAuth state mismatch');
        }

        const stateData = await getStateFromPKCECookieValue(pkceCookie);
        codeVerifier = stateData.codeVerifier;
        customState = stateData.customState;
        returnPathnameState = stateData.returnPathname;
      }

      // Use the code returned to us by AuthKit and authenticate the user with WorkOS
      const { accessToken, refreshToken, user, impersonator, oauthTokens, authenticationMethod, organizationId } =
        await getWorkOS().userManagement.authenticateWithCode({
          clientId: WORKOS_CLIENT_ID,
          code,
          codeVerifier,
        });

      if (!accessToken || !refreshToken) {
        throw new Error('response is missing tokens');
      }

      // If we skipped PKCE/CSRF verification, the response must indicate impersonation.
      // This prevents an intercepted authorization code from being exchanged without PKCE.
      if (isDashboardImpersonation && !impersonator) {
        throw new Error('PKCE/state verification was bypassed but response is not an impersonation session');
      }

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
      response.headers.append('Set-Cookie', deleteCookie);

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
      console.error('[AuthKit callback error]', error);
      const response = await errorResponse(request, error);
      response.headers.append('Set-Cookie', deleteCookie);
      return response;
    }
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
