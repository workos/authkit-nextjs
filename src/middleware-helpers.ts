import { NextRequest, NextResponse } from 'next/server';

/**
 * Headers used internally by AuthKit for request processing.
 * These are forwarded to downstream requests (for withAuth() etc.)
 * but NEVER sent to the browser in responses.
 *
 * Any header matching `x-workos-*` pattern is also treated as internal.
 */
export const AUTHKIT_REQUEST_HEADERS = [
  'x-workos-middleware',
  'x-url',
  'x-redirect-uri',
  'x-sign-up-paths',
  'x-workos-session',
] as const;

export type AuthkitRequestHeader = (typeof AUTHKIT_REQUEST_HEADERS)[number];

const REQUEST_ONLY_HEADERS: ReadonlySet<AuthkitRequestHeader> = new Set(AUTHKIT_REQUEST_HEADERS);

/**
 * Checks if a header is an internal AuthKit header that should not be sent to the browser.
 * Matches both explicit headers and the `x-workos-*` pattern.
 */
export function isAuthkitRequestHeader(name: string): name is AuthkitRequestHeader {
  const lower = name.toLowerCase();
  return REQUEST_ONLY_HEADERS.has(lower as AuthkitRequestHeader) || lower.startsWith('x-workos-');
}

/**
 * Headers that can have multiple values and must use append() instead of set().
 */
type MultiValueHeader = 'set-cookie' | 'www-authenticate' | 'proxy-authenticate' | 'link';

const MULTI_VALUE_HEADERS: ReadonlySet<MultiValueHeader> = new Set([
  'set-cookie',
  'www-authenticate',
  'proxy-authenticate',
  'link',
]);

/**
 * Headers that are safe to forward from AuthKit to the browser.
 * All other headers are filtered out for security.
 */
const ALLOWED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  'set-cookie',
  'cache-control',
  'vary',
  'www-authenticate',
  'proxy-authenticate',
  'link',
]);

function isMultiValueHeader(name: string): name is MultiValueHeader {
  return MULTI_VALUE_HEADERS.has(name.toLowerCase() as MultiValueHeader);
}

/**
 * Result of collecting and splitting AuthKit headers.
 */
export interface AuthkitHeadersResult {
  /** Headers to forward in the request for downstream use (withAuth, etc.) */
  requestHeaders: Headers;
  /** Headers to send in the response to the browser */
  responseHeaders: Headers;
}

/**
 * Warns in development if HeadersInit is used in a way that loses multi-value headers.
 */
function warnIfMultiValueHeadersLost(authkitHeaders: HeadersInit): void {
  if (process.env.NODE_ENV === 'production') return;
  if (authkitHeaders instanceof Headers) return;
  if (Array.isArray(authkitHeaders)) return; // Tuple array preserves multi-values

  // Plain object - check for set-cookie which commonly needs multiple values
  const obj = authkitHeaders as Record<string, string>;
  if ('set-cookie' in obj || 'Set-Cookie' in obj) {
    console.warn(
      '[authkit] Warning: Passing set-cookie as a plain object may lose multiple cookie values. ' +
        'Use a Headers instance or array of tuples instead:\n' +
        '  const headers = new Headers();\n' +
        '  headers.append("set-cookie", "cookie1=value1");\n' +
        '  headers.append("set-cookie", "cookie2=value2");',
    );
  }
}

/**
 * Collects and splits AuthKit headers into request and response headers.
 *
 * This is a low-level utility for advanced middleware composition.
 * Most users should use `handleAuthkitHeaders()` instead.
 *
 * @param request - The original NextRequest (used to preserve existing headers)
 * @param authkitHeaders - Headers returned from authkit()
 * @returns Object with requestHeaders and responseHeaders
 *
 * @example
 * ```typescript
 * const { requestHeaders, responseHeaders } = collectAuthkitHeaders(request, headers);
 * // Use these to build your own response
 * ```
 */
export function collectAuthkitHeaders(request: NextRequest, authkitHeaders: HeadersInit): AuthkitHeadersResult {
  warnIfMultiValueHeadersLost(authkitHeaders);

  const headers = new Headers(authkitHeaders);

  // Start with original request headers
  const requestHeaders = new Headers(request.headers);

  // Strip any client-injected internal headers (security: prevent header injection attacks)
  for (const name of [...requestHeaders.keys()]) {
    if (isAuthkitRequestHeader(name)) {
      requestHeaders.delete(name);
    }
  }

  // Add trusted internal headers from authkit()
  for (const headerName of AUTHKIT_REQUEST_HEADERS) {
    const value = headers.get(headerName);
    if (value != null) {
      requestHeaders.set(headerName, value);
    }
  }

  // Build response headers with allowlist (security: only forward safe headers)
  const responseHeaders = new Headers();
  for (const [name, value] of headers) {
    const lowerName = name.toLowerCase();

    // Skip internal headers (never leak to browser)
    if (isAuthkitRequestHeader(lowerName)) continue;

    // Skip headers not in allowlist (security)
    if (!ALLOWED_RESPONSE_HEADERS.has(lowerName)) continue;

    if (isMultiValueHeader(lowerName)) {
      responseHeaders.append(name, value);
    } else {
      responseHeaders.set(name, value);
    }
  }

  // Auto-add cache-control: no-store when setting cookies (prevent caching authenticated responses)
  if (responseHeaders.has('set-cookie') && !responseHeaders.has('cache-control')) {
    responseHeaders.set('cache-control', 'no-store');
  }

  return { requestHeaders, responseHeaders };
}

/**
 * Applies collected headers to an existing NextResponse.
 *
 * Useful when you've already created a response and need to add AuthKit headers.
 *
 * @param response - The NextResponse to modify
 * @param responseHeaders - Headers to add to the response
 * @returns The modified response (same instance)
 *
 * @example
 * ```typescript
 * const { responseHeaders } = collectAuthkitHeaders(request, headers);
 * const response = NextResponse.rewrite(new URL('/app', request.url));
 * applyResponseHeaders(response, responseHeaders);
 * ```
 */
export function applyResponseHeaders(response: NextResponse, responseHeaders: Headers): NextResponse {
  for (const [name, value] of responseHeaders) {
    if (isMultiValueHeader(name.toLowerCase())) {
      response.headers.append(name, value);
    } else {
      response.headers.set(name, value);
    }
  }
  return response;
}

export type RedirectStatus = 302 | 303 | 307 | 308;

/**
 * Predicate function for custom cross-origin redirect validation.
 */
export type CrossOriginRedirectPredicate = (redirectUrl: URL, request: NextRequest) => boolean;

export interface HandleAuthkitHeadersOptions {
  /**
   * URL to redirect to. Can be:
   * - Relative path (e.g., '/login') - resolved against request URL
   * - Absolute URL string
   * - URL object
   *
   * If the URL is invalid, falls through to NextResponse.next() instead of throwing.
   */
  redirect?: string | URL;

  /**
   * HTTP status code for redirects.
   * - 307: Temporary redirect, preserves method (default for GET/HEAD)
   * - 303: See Other, always uses GET (default for POST/PUT/etc.)
   * - 302: Found (legacy, avoid)
   * - 308: Permanent redirect, preserves method
   *
   * @default 307 for GET/HEAD, 303 for other methods
   */
  redirectStatus?: RedirectStatus;

  /**
   * Controls whether cross-origin redirects are allowed.
   *
   * - `false` (default): Block all cross-origin redirects
   * - `true`: Allow all cross-origin redirects (use with caution)
   * - `string[]`: Whitelist of allowed origins (e.g., ['https://workos.com', 'https://auth.example.com'])
   * - `(url, request) => boolean`: Custom predicate for fine-grained control
   *
   * @default false
   *
   * @example Whitelist specific origins
   * ```typescript
   * handleAuthkitHeaders(request, headers, {
   *   redirect: authorizationUrl,
   *   allowCrossOriginRedirect: ['https://workos.com', 'https://auth.workos.com'],
   * });
   * ```
   *
   * @example Custom predicate
   * ```typescript
   * handleAuthkitHeaders(request, headers, {
   *   redirect: someUrl,
   *   allowCrossOriginRedirect: (url) => url.hostname.endsWith('.workos.com'),
   * });
   * ```
   */
  allowCrossOriginRedirect?: boolean | string[] | CrossOriginRedirectPredicate;

  /**
   * Enable debug logging for redirect decisions.
   * Useful for troubleshooting why redirects aren't happening.
   *
   * @default false (or true if NODE_ENV !== 'production' and redirect fails)
   */
  debug?: boolean;
}

/**
 * Checks if a cross-origin redirect should be allowed based on the options.
 */
function isCrossOriginRedirectAllowed(
  redirectUrl: URL,
  request: NextRequest,
  allowCrossOriginRedirect: boolean | string[] | CrossOriginRedirectPredicate,
): boolean {
  if (allowCrossOriginRedirect === true) {
    return true;
  }

  if (allowCrossOriginRedirect === false) {
    return false;
  }

  if (Array.isArray(allowCrossOriginRedirect)) {
    return allowCrossOriginRedirect.some((origin) => {
      try {
        const allowedOrigin = new URL(origin).origin;
        return redirectUrl.origin === allowedOrigin;
      } catch {
        return false;
      }
    });
  }

  // Custom predicate
  return allowCrossOriginRedirect(redirectUrl, request);
}

/**
 * Debug logger for redirect decisions.
 */
function debugLog(message: string, debug: boolean | undefined): void {
  if (debug || (debug === undefined && process.env.NODE_ENV !== 'production')) {
    console.debug(`[authkit] ${message}`);
  }
}

/**
 * Creates a NextResponse with properly merged headers from AuthKit.
 *
 * This helper ensures:
 * - Request-only headers (session, URLs) are forwarded to downstream requests for withAuth()
 * - Response headers (Set-Cookie, cache-control) are sent to the browser
 * - Internal headers are NEVER leaked to the browser
 * - Only allowlisted headers are forwarded (security)
 * - Redirects use appropriate status codes (303 for POST to prevent resubmission)
 * - Cross-origin redirects are blocked by default (security)
 * - CORS preflight (OPTIONS) requests are never redirected
 * - Invalid redirect URLs fail gracefully instead of crashing
 * - Cache-control is automatically set when cookies are present
 *
 * @param request - The original NextRequest
 * @param authkitHeaders - Headers returned from authkit()
 * @param options - Optional configuration for redirects
 * @returns Properly configured NextResponse
 *
 * @example Basic usage - continue with AuthKit headers
 * ```typescript
 * import { authkit, handleAuthkitHeaders } from '@workos-inc/authkit-nextjs';
 *
 * export default async function middleware(request: NextRequest) {
 *   const { headers } = await authkit(request);
 *   return handleAuthkitHeaders(request, headers);
 * }
 * ```
 *
 * @example Redirect unauthenticated users
 * ```typescript
 * const { session, headers, authorizationUrl } = await authkit(request);
 *
 * if (!session.user && pathname.startsWith('/app')) {
 *   return handleAuthkitHeaders(request, headers, {
 *     redirect: authorizationUrl,
 *     allowCrossOriginRedirect: ['https://workos.com'], // Whitelist WorkOS
 *   });
 * }
 * ```
 *
 * @example Custom redirect with relative URL
 * ```typescript
 * if (pathname === '/old-path') {
 *   return handleAuthkitHeaders(request, headers, { redirect: '/new-path' });
 * }
 * ```
 */
export function handleAuthkitHeaders(
  request: NextRequest,
  authkitHeaders: HeadersInit,
  options: HandleAuthkitHeadersOptions = {},
): NextResponse {
  const { requestHeaders, responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);
  const { redirect, redirectStatus, allowCrossOriginRedirect = false, debug } = options;

  // Never redirect CORS preflight requests
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return NextResponse.next({
      request: { headers: requestHeaders },
      headers: responseHeaders,
    });
  }

  if (redirect) {
    let redirectUrl: URL | null = null;
    try {
      redirectUrl = redirect instanceof URL ? redirect : new URL(redirect, request.url);
    } catch {
      debugLog(`Invalid redirect URL: ${redirect}`, debug);
      redirectUrl = null;
    }

    if (redirectUrl) {
      const requestOrigin = new URL(request.url).origin;
      const isSameOrigin = redirectUrl.origin === requestOrigin;

      // Normalize URLs for comparison (remove trailing slash, default ports)
      const normalizeUrl = (url: URL): string => {
        const normalized = new URL(url.href);
        normalized.hash = ''; // Ignore hash for comparison
        return normalized.href.replace(/\/$/, '');
      };
      const isSameUrl = normalizeUrl(redirectUrl) === normalizeUrl(new URL(request.url));

      if (isSameUrl) {
        debugLog(`Redirect blocked: same URL (${redirectUrl.href})`, debug);
      } else if (!isSameOrigin && !isCrossOriginRedirectAllowed(redirectUrl, request, allowCrossOriginRedirect)) {
        debugLog(
          `Cross-origin redirect blocked: ${redirectUrl.origin} (request origin: ${requestOrigin}). ` +
            `Use allowCrossOriginRedirect option to allow.`,
          debug,
        );
      } else {
        const status = redirectStatus ?? (method === 'GET' || method === 'HEAD' ? 307 : 303);

        // Strip location header from responseHeaders to prevent clobbering
        // (security: authkitHeaders should not override redirect destination)
        const safeResponseHeaders = new Headers(responseHeaders);
        safeResponseHeaders.delete('location');

        const response = NextResponse.redirect(redirectUrl, status);
        applyResponseHeaders(response, safeResponseHeaders);
        return response;
      }
    }
  }

  // Strip location header from non-redirect responses (avoid confusion)
  responseHeaders.delete('location');

  return NextResponse.next({
    request: { headers: requestHeaders },
    headers: responseHeaders,
  });
}
