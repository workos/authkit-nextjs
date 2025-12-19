import { NextRequest, NextResponse } from 'next/server';

/** Internal AuthKit headers - forwarded to downstream requests but never sent to browser. */
export const AUTHKIT_REQUEST_HEADERS = [
  'x-workos-middleware',
  'x-url',
  'x-redirect-uri',
  'x-sign-up-paths',
  'x-workos-session',
] as const;

export type AuthkitRequestHeader = (typeof AUTHKIT_REQUEST_HEADERS)[number];

const REQUEST_ONLY_HEADERS: ReadonlySet<string> = new Set(AUTHKIT_REQUEST_HEADERS);

const ALLOWED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  'set-cookie',
  'cache-control',
  'vary',
  'www-authenticate',
  'proxy-authenticate',
  'link',
  'x-middleware-cache',
]);

const MULTI_VALUE_HEADERS: ReadonlySet<string> = new Set([
  'set-cookie',
  'www-authenticate',
  'proxy-authenticate',
  'link',
]);

export function isAuthkitRequestHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return REQUEST_ONLY_HEADERS.has(lower) || lower.startsWith('x-workos-');
}

function setHeader(headers: Headers, name: string, value: string): void {
  const lower = name.toLowerCase();
  if (MULTI_VALUE_HEADERS.has(lower)) {
    headers.append(name, value);
  } else if (lower === 'vary') {
    const existing = headers.get(name);
    const merged = new Set([
      ...(existing ? existing.split(',').map((v) => v.trim()) : []),
      ...value.split(',').map((v) => v.trim()),
    ]);
    headers.set(name, [...merged].join(', '));
  } else {
    headers.set(name, value);
  }
}

export interface AuthkitHeadersResult {
  requestHeaders: Headers;
  responseHeaders: Headers;
}

/**
 * Partitions AuthKit headers into request headers (for withAuth) and response headers (for browser).
 */
export function partitionAuthkitHeaders(request: NextRequest, authkitHeaders: Headers): AuthkitHeadersResult {
  const headers = new Headers(authkitHeaders);
  const requestHeaders = new Headers(request.headers);

  // Strip any client-injected authkit headers, then apply trusted ones
  for (const name of [...requestHeaders.keys()]) {
    if (isAuthkitRequestHeader(name)) {
      requestHeaders.delete(name);
    }
  }
  for (const headerName of AUTHKIT_REQUEST_HEADERS) {
    const value = headers.get(headerName);
    if (value != null) {
      requestHeaders.set(headerName, value);
    }
  }

  // Build response headers from allowlist only
  const responseHeaders = new Headers();
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    if (!isAuthkitRequestHeader(lower) && ALLOWED_RESPONSE_HEADERS.has(lower)) {
      setHeader(responseHeaders, name, value);
    }
  }

  // Auto-add cache-control when setting cookies
  if (responseHeaders.has('set-cookie') && !responseHeaders.has('cache-control')) {
    responseHeaders.set('cache-control', 'no-store');
  }

  return { requestHeaders, responseHeaders };
}

export function applyResponseHeaders(response: NextResponse, responseHeaders: Headers): NextResponse {
  for (const [name, value] of responseHeaders) {
    setHeader(response.headers, name, value);
  }
  return response;
}

export type AuthkitRedirectStatus = 302 | 303 | 307 | 308;

export interface HandleAuthkitHeadersOptions {
  /** URL to redirect to (relative or absolute). */
  redirect?: string | URL;

  /** Redirect status code. @default 307 for GET/HEAD, 303 for POST/PUT/DELETE */
  redirectStatus?: AuthkitRedirectStatus;
}

/**
 * Creates a NextResponse with properly merged AuthKit headers.
 */
export function handleAuthkitHeaders(
  request: NextRequest,
  authkitHeaders: Headers,
  options: HandleAuthkitHeadersOptions = {},
): NextResponse {
  const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);
  const { redirect, redirectStatus } = options;

  if (redirect != null && redirect !== '') {
    let redirectUrl: URL;
    try {
      redirectUrl = redirect instanceof URL ? redirect : new URL(redirect, request.url);
    } catch {
      throw new Error(`Invalid redirect URL: "${redirect}". Must be a valid absolute or relative URL.`);
    }
    const method = request.method.toUpperCase();
    const status = redirectStatus ?? (method === 'GET' || method === 'HEAD' ? 307 : 303);
    return applyResponseHeaders(NextResponse.redirect(redirectUrl, status), responseHeaders);
  }

  return applyResponseHeaders(NextResponse.next({ request: { headers: requestHeaders } }), responseHeaders);
}
