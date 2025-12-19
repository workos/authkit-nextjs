import { NextRequest, NextResponse } from 'next/server';
import {
  handleAuthkitHeaders,
  partitionAuthkitHeaders,
  applyResponseHeaders,
  isAuthkitRequestHeader,
  AUTHKIT_REQUEST_HEADERS,
} from './middleware-helpers.js';

describe('middleware-helpers', () => {
  function createMockRequest(url = 'https://example.com/test', method = 'GET'): NextRequest {
    return new NextRequest(url, { method });
  }

  function createAuthkitHeaders(): Headers {
    const headers = new Headers();
    headers.set('x-workos-middleware', 'true');
    headers.set('x-workos-session', 'encrypted-session-data');
    headers.set('x-url', 'https://example.com/test');
    headers.set('set-cookie', 'wos-session=abc123; Path=/; HttpOnly');
    headers.set('cache-control', 'private, no-cache');
    headers.set('vary', 'Cookie');
    return headers;
  }

  describe('isAuthkitRequestHeader', () => {
    it('should recognize known headers and x-workos-* pattern', () => {
      expect(isAuthkitRequestHeader('x-workos-middleware')).toBe(true);
      expect(isAuthkitRequestHeader('x-workos-session')).toBe(true);
      expect(isAuthkitRequestHeader('x-url')).toBe(true);
      expect(isAuthkitRequestHeader('x-workos-future-header')).toBe(true);
      // Case insensitive
      expect(isAuthkitRequestHeader('X-WorkOS-Session')).toBe(true);
    });

    it('should reject non-authkit headers', () => {
      expect(isAuthkitRequestHeader('set-cookie')).toBe(false);
      expect(isAuthkitRequestHeader('content-type')).toBe(false);
      expect(isAuthkitRequestHeader('x-custom-header')).toBe(false);
    });
  });

  describe('partitionAuthkitHeaders', () => {
    it('should split headers into request-only and response headers', () => {
      const request = createMockRequest();
      const authkitHeaders = createAuthkitHeaders();

      const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      // Request headers contain internal authkit headers
      expect(requestHeaders.get('x-workos-session')).toBe('encrypted-session-data');
      expect(requestHeaders.get('x-workos-middleware')).toBe('true');

      // Response headers contain browser-safe headers only
      expect(responseHeaders.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
      expect(responseHeaders.get('cache-control')).toBe('private, no-cache');
      expect(responseHeaders.get('vary')).toBe('Cookie');

      // Internal headers NOT in response
      expect(responseHeaders.get('x-workos-session')).toBeNull();
      expect(responseHeaders.get('x-workos-middleware')).toBeNull();
    });

    it('should preserve original request headers while adding authkit headers', () => {
      const request = createMockRequest();
      request.headers.set('authorization', 'Bearer token');
      request.headers.set('x-custom', 'value');

      const { requestHeaders } = partitionAuthkitHeaders(request, createAuthkitHeaders());

      expect(requestHeaders.get('authorization')).toBe('Bearer token');
      expect(requestHeaders.get('x-custom')).toBe('value');
      expect(requestHeaders.get('x-workos-session')).toBe('encrypted-session-data');
    });

    it('should filter response headers to allowlist only', () => {
      const request = createMockRequest();
      const authkitHeaders = new Headers();
      authkitHeaders.set('set-cookie', 'session=abc');
      authkitHeaders.set('x-dangerous-header', 'leaked');
      authkitHeaders.set('location', 'https://evil.com');

      const { responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      expect(responseHeaders.get('set-cookie')).toBe('session=abc');
      expect(responseHeaders.get('x-dangerous-header')).toBeNull();
      expect(responseHeaders.get('location')).toBeNull();
    });

    it('should handle multiple Set-Cookie headers correctly', () => {
      const request = createMockRequest();
      const authkitHeaders = new Headers();
      authkitHeaders.append('set-cookie', 'cookie1=value1');
      authkitHeaders.append('set-cookie', 'cookie2=value2');

      const { responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      expect(responseHeaders.getSetCookie()).toHaveLength(2);
    });

    it('should auto-add cache-control: no-store when cookies present without cache-control', () => {
      const request = createMockRequest();
      const authkitHeaders = new Headers();
      authkitHeaders.set('set-cookie', 'session=abc');

      const { responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      expect(responseHeaders.get('cache-control')).toBe('no-store');
    });

    it('should deduplicate and merge Vary header values', () => {
      const request = createMockRequest();
      const authkitHeaders = new Headers();
      authkitHeaders.append('vary', 'Cookie');
      authkitHeaders.append('vary', 'Cookie, Accept');

      const { responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      expect(responseHeaders.get('vary')).toBe('Cookie, Accept');
    });

    it('should forward x-middleware-cache header', () => {
      const request = createMockRequest();
      const authkitHeaders = new Headers();
      authkitHeaders.set('x-middleware-cache', 'no-cache');

      const { responseHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      expect(responseHeaders.get('x-middleware-cache')).toBe('no-cache');
    });

    it('should strip client-injected x-workos-* headers and use trusted values', () => {
      const request = createMockRequest();
      request.headers.set('x-workos-session', 'malicious-session');
      request.headers.set('x-workos-admin-bypass', 'true');

      const authkitHeaders = new Headers();
      authkitHeaders.set('x-workos-session', 'real-session');

      const { requestHeaders } = partitionAuthkitHeaders(request, authkitHeaders);

      expect(requestHeaders.get('x-workos-session')).toBe('real-session');
      expect(requestHeaders.get('x-workos-admin-bypass')).toBeNull();
    });
  });

  describe('handleAuthkitHeaders', () => {
    it('should return NextResponse with response headers applied', () => {
      const request = createMockRequest();
      const response = handleAuthkitHeaders(request, createAuthkitHeaders());

      expect(response).toBeInstanceOf(NextResponse);
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
      expect(response.headers.get('vary')).toBe('Cookie');

      // Internal headers NOT leaked
      for (const header of AUTHKIT_REQUEST_HEADERS) {
        expect(response.headers.get(header)).toBeNull();
      }
    });

    it('should redirect with normalized absolute URL', () => {
      const request = createMockRequest('https://example.com/page');
      const response = handleAuthkitHeaders(request, createAuthkitHeaders(), {
        redirect: '/login',
      });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://example.com/login');
      expect(response.headers.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
    });

    it('should use 307 for GET and 303 for POST redirects by default', () => {
      const getRequest = createMockRequest('https://example.com/test', 'GET');
      const postRequest = createMockRequest('https://example.com/test', 'POST');
      const headers = createAuthkitHeaders();

      const getResponse = handleAuthkitHeaders(getRequest, headers, { redirect: '/login' });
      const postResponse = handleAuthkitHeaders(postRequest, headers, { redirect: '/login' });

      expect(getResponse.status).toBe(307);
      expect(postResponse.status).toBe(303);
    });

    it('should allow overriding redirect status', () => {
      const request = createMockRequest();
      const response = handleAuthkitHeaders(request, createAuthkitHeaders(), {
        redirect: '/login',
        redirectStatus: 302,
      });

      expect(response.status).toBe(302);
    });

    it('should throw clear error on invalid redirect URL', () => {
      const request = createMockRequest();

      expect(() =>
        handleAuthkitHeaders(request, createAuthkitHeaders(), {
          redirect: 'http://[invalid',
        }),
      ).toThrow('Invalid redirect URL: "http://[invalid". Must be a valid absolute or relative URL.');
    });

    it('should treat empty/undefined redirect as no redirect', () => {
      const request = createMockRequest();
      const headers = createAuthkitHeaders();

      expect(handleAuthkitHeaders(request, headers, { redirect: '' }).status).toBe(200);
      expect(handleAuthkitHeaders(request, headers, { redirect: undefined }).status).toBe(200);
    });
  });

  describe('applyResponseHeaders', () => {
    it('should merge headers onto existing response', () => {
      const response = NextResponse.next();
      response.headers.set('vary', 'Accept');
      response.headers.set('set-cookie', 'existing=value');

      const headers = new Headers();
      headers.set('vary', 'Cookie');
      headers.set('set-cookie', 'new=value');

      applyResponseHeaders(response, headers);

      expect(response.headers.get('vary')).toBe('Accept, Cookie');
      expect(response.headers.getSetCookie()).toHaveLength(2);
    });
  });
});
