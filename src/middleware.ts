import { NextMiddleware, NextRequest, NextResponse } from 'next/server';
import { prepareRequestHeaders, updateSession } from './session.js';
import { AuthkitMiddlewareOptions, AuthkitOptions, AuthkitResponse, UserInfo, NoUserInfo } from './interfaces.js';
import { WORKOS_REDIRECT_URI, WORKOS_COOKIE_PASSWORD } from './env-variables.js';
import { getScreenHint, getMiddlewareAuthPathRegex } from './session.js';
import { redirectWithFallback } from './utils.js';

type NextMiddlewareRequestParam = Parameters<NextMiddleware>['0'];
type NextMiddlewareEvtParam = Parameters<NextMiddleware>['1'];
type NextMiddlewareReturn = ReturnType<NextMiddleware>;

export type AuthkitMiddlewareAuth = () => Promise<UserInfo | NoUserInfo>;

export type AuthkitMiddlewareHandler = (
  auth: AuthkitMiddlewareAuth,
  request: NextMiddlewareRequestParam,
  event: NextMiddlewareEvtParam,
) => NextMiddlewareReturn | Promise<NextMiddlewareReturn>;

type AuthkitMiddlewareOptionsCallback = (
  req: NextMiddlewareRequestParam,
) => AuthkitMiddlewareOptions | Promise<AuthkitMiddlewareOptions>;

/**
 * Middleware for Next.js that handles authentication with WorkOS AuthKit.
 *
 * @example
 * // Basic usage
 * export default authkitMiddleware();
 *
 * @example
 * // With options
 * export default authkitMiddleware({ debug: true });
 *
 * @example
 * // With handler (for integration with other middleware like next-intl)
 * export default authkitMiddleware(async (auth, req) => {
 *   const session = await auth();
 *   if (isProtectedRoute(req) && !session.user) {
 *     // Handle protection
 *   }
 *   return handleI18nRouting(req);
 * });
 */
interface AuthkitMiddleware {
  /**
   * @example
   * export default authkitMiddleware((auth, request, event) => { ... }, options);
   */
  (handler: AuthkitMiddlewareHandler, options?: AuthkitMiddlewareOptions): NextMiddleware;

  /**
   * @example
   * export default authkitMiddleware((auth, request, event) => { ... }, (req) => options);
   */
  (handler: AuthkitMiddlewareHandler, options?: AuthkitMiddlewareOptionsCallback): NextMiddleware;

  /**
   * @example
   * export default authkitMiddleware(options);
   */
  (options?: AuthkitMiddlewareOptions): NextMiddleware;

  /**
   * @example
   * export default authkitMiddleware;
   */
  (request: NextMiddlewareRequestParam, event: NextMiddlewareEvtParam): NextMiddlewareReturn;
}

export const authkitMiddleware = ((...args: unknown[]): NextMiddleware | NextMiddlewareReturn => {
  const [request, event] = parseRequestAndEvent(args);
  const [handler, params] = parseHandlerAndOptions(args);

  const middleware: NextMiddleware = async (request, event) => {
    // Handles the case where `options` is a callback function to dynamically access `NextRequest`
    const resolvedParams = typeof params === 'function' ? await params(request) : params || {};

    const {
      debug = false,
      middlewareAuth = { enabled: false, unauthenticatedPaths: [] },
      redirectUri = WORKOS_REDIRECT_URI,
      signUpPaths = [],
      eagerAuth = false,
    } = resolvedParams;

    // Update session and get auth data
    const { session, headers, authorizationUrl, modifiedRequest } = await updateSessionForMiddleware(
      request,
      debug,
      middlewareAuth,
      redirectUri,
      signUpPaths,
      eagerAuth,
    );

    // Create auth function for handler
    const auth: AuthkitMiddlewareAuth = async () => {
      return session;
    };

    // If we have a handler, call it with the auth function and modified request
    if (handler) {
      const handlerResult = await handler(auth, modifiedRequest, event);

      // If handler returns a response, merge our headers with it
      if (handlerResult) {
        return mergeHeadersIntoResponse(handlerResult, headers);
      }
    }

    // Default behavior: handle middleware auth protection
    if (middlewareAuth.enabled) {
      const matchedPaths: string[] = middlewareAuth.unauthenticatedPaths.filter((pathGlob) => {
        const pathRegex = getMiddlewareAuthPathRegex(pathGlob);
        return pathRegex.exec(request.nextUrl.pathname);
      });

      // If the user is logged out and this path isn't on the allowlist for logged out paths, redirect to AuthKit.
      if (matchedPaths.length === 0 && !session.user) {
        if (debug) {
          console.log(`Unauthenticated user on protected route ${request.url}, redirecting to AuthKit`);
        }

        return redirectWithFallback(authorizationUrl as string, headers);
      }
    }

    // Return default response with modified request
    return NextResponse.next({
      request: {
        headers: modifiedRequest.headers,
      },
      headers,
    });
  };

  // If we have a request and event, we're being called as a middleware directly
  // eg, export default authkitMiddleware;
  if (request && event) {
    return middleware(request, event);
  }

  // Otherwise, return a middleware that can be called with a request and event
  // eg, export default authkitMiddleware(auth => { ... });
  return middleware;
}) as AuthkitMiddleware;

const parseRequestAndEvent = (args: unknown[]) => {
  return [args[0] instanceof Request ? args[0] : undefined, args[0] instanceof Request ? args[1] : undefined] as [
    NextMiddlewareRequestParam | undefined,
    NextMiddlewareEvtParam | undefined,
  ];
};

const parseHandlerAndOptions = (args: unknown[]) => {
  return [
    typeof args[0] === 'function' ? args[0] : undefined,
    (args.length === 2 ? args[1] : typeof args[0] === 'function' ? {} : args[0]) || {},
  ] as [AuthkitMiddlewareHandler | undefined, AuthkitMiddlewareOptions | AuthkitMiddlewareOptionsCallback];
};

/**
 * Merges headers from session update into a response returned by the handler.
 * This ensures that session headers (like Set-Cookie) are always present in the final response.
 */
function mergeHeadersIntoResponse(response: Response, sessionHeaders: Headers): Response {
  // If it's already a NextResponse, we can modify it directly
  if (response instanceof NextResponse) {
    sessionHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // Otherwise, create a new NextResponse with merged headers
  const newResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  sessionHeaders.forEach((value, key) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
}

/**
 * Updates session and returns both the session data and a modified request with updated headers.
 * This is used internally by the middleware to prepare the request for handlers.
 */
async function updateSessionForMiddleware(
  request: NextRequest,
  debug: boolean,
  middlewareAuth: AuthkitMiddlewareOptions['middlewareAuth'],
  redirectUri: string,
  signUpPaths: string[],
  eagerAuth: boolean,
): Promise<{
  session: UserInfo | NoUserInfo;
  headers: Headers;
  authorizationUrl?: string;
  modifiedRequest: NextRequest;
}> {
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

  const authConfig = middlewareAuth || { enabled: false, unauthenticatedPaths: [] };

  if (
    authConfig.enabled &&
    url.pathname === request.nextUrl.pathname &&
    !authConfig.unauthenticatedPaths.includes(url.pathname)
  ) {
    // In the case where:
    // - We're using middleware auth mode
    // - The redirect URI is in the middleware matcher
    // - The redirect URI isn't in the unauthenticatedPaths array
    //
    // then we would get stuck in a login loop due to the redirect happening before the session is set.
    // It's likely that the user accidentally forgot to add the path to unauthenticatedPaths, so we add it here.
    authConfig.unauthenticatedPaths.push(url.pathname);
  }

  const { session, headers, authorizationUrl } = await updateSession(request, {
    debug,
    redirectUri,
    screenHint: getScreenHint(signUpPaths, request.nextUrl.pathname),
    eagerAuth,
  });

  const requestHeaders = prepareRequestHeaders(request, headers, signUpPaths, session);

  // Create a modified request with updated headers
  // We create a new NextRequest with the modified headers for middleware chaining
  // The body is not included as it may have already been consumed
  const modifiedRequest = new NextRequest(request.url, {
    method: request.method,
    headers: requestHeaders,
  });

  return {
    session,
    headers,
    authorizationUrl,
    modifiedRequest,
  };
}

export async function authkit(request: NextRequest, options: AuthkitOptions = {}): Promise<AuthkitResponse> {
  return await updateSession(request, options);
}
