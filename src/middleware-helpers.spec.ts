import { NextRequest, NextResponse } from 'next/server';
import {
  handleAuthkitHeaders,
  collectAuthkitHeaders,
  applyResponseHeaders,
  isAuthkitRequestHeader,
  AUTHKIT_REQUEST_HEADERS,
} from './middleware-helpers.js';

describe('middleware-helpers', () => {
  function createMockRequest(url = 'https://example.com/test', method = 'GET'): NextRequest {
    const request = new NextRequest(url, { method });
    request.headers.set('x-custom-header', 'custom-value');
    request.headers.set('authorization', 'Bearer token');
    return request;
  }

  function createAuthkitHeaders(): Headers {
    const headers = new Headers();
    // Request-only headers (should NOT appear in response)
    headers.set('x-workos-middleware', 'true');
    headers.set('x-url', 'https://example.com/test');
    headers.set('x-redirect-uri', 'https://example.com/callback');
    headers.set('x-sign-up-paths', '/signup');
    headers.set('x-workos-session', 'encrypted-session-data');
    // Response headers (should appear in response)
    headers.set('set-cookie', 'wos-session=abc123; Path=/; HttpOnly');
    headers.set('vary', 'Cookie');
    headers.set('cache-control', 'private, no-cache');
    return headers;
  }

  describe('isAuthkitRequestHeader', () => {
    it('should return true for known request-only headers', () => {
      expect(isAuthkitRequestHeader('x-workos-middleware')).toBe(true);
      expect(isAuthkitRequestHeader('x-workos-session')).toBe(true);
      expect(isAuthkitRequestHeader('x-url')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isAuthkitRequestHeader('X-WorkOS-Session')).toBe(true);
      expect(isAuthkitRequestHeader('X-URL')).toBe(true);
    });

    it('should return false for non-authkit headers', () => {
      expect(isAuthkitRequestHeader('set-cookie')).toBe(false);
      expect(isAuthkitRequestHeader('content-type')).toBe(false);
    });

    it('should match x-workos-* pattern for future-proofing', () => {
      expect(isAuthkitRequestHeader('x-workos-new-header')).toBe(true);
      expect(isAuthkitRequestHeader('x-workos-anything')).toBe(true);
      expect(isAuthkitRequestHeader('X-WorkOS-Future')).toBe(true);
    });

    it('should not match similar but different prefixes', () => {
      expect(isAuthkitRequestHeader('x-work-os-header')).toBe(false);
      expect(isAuthkitRequestHeader('x-workosheader')).toBe(false);
    });
  });

  describe('collectAuthkitHeaders', () => {
    it('should split headers into request and response headers', () => {
      const request = createMockRequest();
      const authkitHeaders = createAuthkitHeaders();

      const { requestHeaders, responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

      expect(requestHeaders.get('x-workos-session')).toBe('encrypted-session-data');
      expect(requestHeaders.get('x-workos-middleware')).toBe('true');
      expect(responseHeaders.get('x-workos-session')).toBeNull();
      expect(responseHeaders.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
    });

    it('should preserve original request headers', () => {
      const request = createMockRequest();
      const authkitHeaders = createAuthkitHeaders();

      const { requestHeaders } = collectAuthkitHeaders(request, authkitHeaders);

      expect(requestHeaders.get('authorization')).toBe('Bearer token');
      expect(requestHeaders.get('x-custom-header')).toBe('custom-value');
    });

    it('should accept HeadersInit (plain object)', () => {
      const request = createMockRequest();
      const authkitHeaders = {
        'x-workos-session': 'session-data',
        'set-cookie': 'cookie=value',
      };

      const { requestHeaders, responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

      expect(requestHeaders.get('x-workos-session')).toBe('session-data');
      expect(responseHeaders.get('set-cookie')).toBe('cookie=value');
    });

    it('should handle multi-value headers correctly', () => {
      const request = createMockRequest();
      const authkitHeaders = new Headers();
      authkitHeaders.append('set-cookie', 'cookie1=value1');
      authkitHeaders.append('set-cookie', 'cookie2=value2');
      authkitHeaders.append('link', '</api>; rel="next"');
      authkitHeaders.append('link', '</home>; rel="prev"');

      const { responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

      expect(responseHeaders.getSetCookie()).toHaveLength(2);
      const linkValues = responseHeaders.get('link');
      expect(linkValues).toContain('</api>; rel="next"');
    });

    describe('response header allowlist', () => {
      it('should filter out non-allowlisted headers', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'session=abc');
        authkitHeaders.set('x-custom-dangerous', 'value');
        authkitHeaders.set('x-frame-options', 'DENY');
        authkitHeaders.set('content-security-policy', "default-src 'self'");

        const { responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        expect(responseHeaders.get('set-cookie')).toBe('session=abc');
        expect(responseHeaders.get('x-custom-dangerous')).toBeNull();
        expect(responseHeaders.get('x-frame-options')).toBeNull();
        expect(responseHeaders.get('content-security-policy')).toBeNull();
      });

      it('should allow safe response headers', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'session=abc');
        authkitHeaders.set('cache-control', 'private');
        authkitHeaders.set('vary', 'Cookie');
        authkitHeaders.set('www-authenticate', 'Bearer');
        authkitHeaders.set('link', '</next>; rel="next"');

        const { responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        expect(responseHeaders.get('set-cookie')).toBe('session=abc');
        expect(responseHeaders.get('cache-control')).toBe('private');
        expect(responseHeaders.get('vary')).toBe('Cookie');
        expect(responseHeaders.get('www-authenticate')).toBe('Bearer');
        expect(responseHeaders.get('link')).toBe('</next>; rel="next"');
      });
    });

    describe('auto cache-control', () => {
      it('should auto-add cache-control: no-store when set-cookie present and no cache-control', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'session=abc');

        const { responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        expect(responseHeaders.get('cache-control')).toBe('no-store');
      });

      it('should not override existing cache-control', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'session=abc');
        authkitHeaders.set('cache-control', 'private, max-age=3600');

        const { responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        expect(responseHeaders.get('cache-control')).toBe('private, max-age=3600');
      });

      it('should not add cache-control when no set-cookie', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('vary', 'Accept');

        const { responseHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        expect(responseHeaders.get('cache-control')).toBeNull();
      });
    });

    describe('dev-mode warning', () => {
      const originalEnv = process.env.NODE_ENV;
      let warnSpy: jest.SpyInstance;

      beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      });

      afterEach(() => {
        warnSpy.mockRestore();
        process.env.NODE_ENV = originalEnv;
      });

      it('should warn when passing set-cookie as plain object in development', () => {
        process.env.NODE_ENV = 'development';
        const request = createMockRequest();

        collectAuthkitHeaders(request, { 'set-cookie': 'value' });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[authkit] Warning'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('set-cookie'));
      });

      it('should not warn in production', () => {
        process.env.NODE_ENV = 'production';
        const request = createMockRequest();

        collectAuthkitHeaders(request, { 'set-cookie': 'value' });

        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('should not warn when using Headers instance', () => {
        process.env.NODE_ENV = 'development';
        const request = createMockRequest();
        const headers = new Headers();
        headers.set('set-cookie', 'value');

        collectAuthkitHeaders(request, headers);

        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    describe('header injection prevention', () => {
      it('should strip client-injected x-workos-* headers from request', () => {
        const request = new NextRequest('https://example.com/test');
        // Simulate attacker injecting malicious headers
        request.headers.set('x-workos-session', 'malicious-session-data');
        request.headers.set('x-workos-middleware', 'true');

        // authkit() returns NO session headers (unauthenticated user)
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'tracking=abc');

        const { requestHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        // Malicious headers should be stripped, not forwarded
        expect(requestHeaders.get('x-workos-session')).toBeNull();
        expect(requestHeaders.get('x-workos-middleware')).toBeNull();
      });

      it('should replace client-injected headers with trusted authkit headers', () => {
        const request = new NextRequest('https://example.com/test');
        // Attacker tries to inject fake session
        request.headers.set('x-workos-session', 'attacker-fake-session');

        // authkit() returns real session
        const authkitHeaders = new Headers();
        authkitHeaders.set('x-workos-session', 'real-encrypted-session');

        const { requestHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        // Should have real session, not attacker's
        expect(requestHeaders.get('x-workos-session')).toBe('real-encrypted-session');
      });

      it('should strip future x-workos-* headers injected by client', () => {
        const request = new NextRequest('https://example.com/test');
        // Attacker tries to inject unknown internal header
        request.headers.set('x-workos-admin-bypass', 'true');
        request.headers.set('x-workos-impersonate', 'admin@example.com');

        const authkitHeaders = new Headers();

        const { requestHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        // All x-workos-* from client should be stripped
        expect(requestHeaders.get('x-workos-admin-bypass')).toBeNull();
        expect(requestHeaders.get('x-workos-impersonate')).toBeNull();
      });

      it('should preserve legitimate non-authkit request headers', () => {
        const request = new NextRequest('https://example.com/test');
        request.headers.set('authorization', 'Bearer user-token');
        request.headers.set('x-custom-header', 'custom-value');
        request.headers.set('x-workos-session', 'malicious'); // Should be stripped

        const authkitHeaders = new Headers();

        const { requestHeaders } = collectAuthkitHeaders(request, authkitHeaders);

        // Legitimate headers preserved
        expect(requestHeaders.get('authorization')).toBe('Bearer user-token');
        expect(requestHeaders.get('x-custom-header')).toBe('custom-value');
        // Malicious header stripped
        expect(requestHeaders.get('x-workos-session')).toBeNull();
      });
    });
  });

  describe('applyResponseHeaders', () => {
    it('should apply headers to an existing response', () => {
      const responseHeaders = new Headers();
      responseHeaders.set('set-cookie', 'session=abc');
      responseHeaders.set('cache-control', 'private');

      const response = new NextResponse();
      applyResponseHeaders(response, responseHeaders);

      expect(response.headers.get('set-cookie')).toBe('session=abc');
      expect(response.headers.get('cache-control')).toBe('private');
    });

    it('should preserve multiple Set-Cookie headers', () => {
      const responseHeaders = new Headers();
      responseHeaders.append('set-cookie', 'cookie1=a');
      responseHeaders.append('set-cookie', 'cookie2=b');

      const response = new NextResponse();
      applyResponseHeaders(response, responseHeaders);

      expect(response.headers.getSetCookie()).toHaveLength(2);
    });

    it('should return the same response instance', () => {
      const responseHeaders = new Headers();
      const response = new NextResponse();

      const result = applyResponseHeaders(response, responseHeaders);

      expect(result).toBe(response);
    });
  });

  describe('handleAuthkitHeaders', () => {
    describe('basic usage (no redirect)', () => {
      it('should return a NextResponse', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(200);
      });

      it('should forward request-only headers for withAuth()', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response.headers.get('x-workos-session')).toBeNull();
        expect(response.headers.get('x-workos-middleware')).toBeNull();
      });

      it('should include response headers in response', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response.headers.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
        expect(response.headers.get('vary')).toBe('Cookie');
        expect(response.headers.get('cache-control')).toBe('private, no-cache');
      });

      it('should NOT leak any internal headers to browser', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders);

        for (const header of AUTHKIT_REQUEST_HEADERS) {
          expect(response.headers.get(header)).toBeNull();
        }
      });
    });

    describe('redirects', () => {
      it('should redirect with options object', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://example.com/login');
      });

      it('should normalize relative URLs to absolute', () => {
        const request = createMockRequest('https://example.com/current-page');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/new-path',
        });

        expect(response.headers.get('location')).toBe('https://example.com/new-path');
      });

      it('should accept URL object as redirect', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();
        const redirectUrl = new URL('https://example.com/login');

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: redirectUrl,
        });

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://example.com/login');
      });

      it('should include Set-Cookie in redirect response', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.headers.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
      });

      it('should NOT leak internal headers in redirect response', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        for (const header of AUTHKIT_REQUEST_HEADERS) {
          expect(response.headers.get(header)).toBeNull();
        }
      });

      it('should preserve multiple Set-Cookie headers in redirect', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.append('set-cookie', 'cookie1=value1; Path=/');
        authkitHeaders.append('set-cookie', 'cookie2=value2; Path=/');

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.headers.getSetCookie()).toHaveLength(2);
      });
    });

    describe('location header stripping', () => {
      it('should strip location header from authkitHeaders in redirect response', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'session=abc');
        authkitHeaders.set('location', 'https://evil.com/phishing');

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/safe-path',
        });

        expect(response.headers.get('location')).toBe('https://example.com/safe-path');
      });

      it('should strip location header from non-redirect responses', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('set-cookie', 'session=abc');
        authkitHeaders.set('location', 'https://somewhere.com');

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response.headers.get('location')).toBeNull();
      });
    });

    describe('redirect status codes', () => {
      it('should use 307 for GET requests by default', () => {
        const request = createMockRequest('https://example.com/test', 'GET');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.status).toBe(307);
      });

      it('should use 307 for HEAD requests by default', () => {
        const request = createMockRequest('https://example.com/test', 'HEAD');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.status).toBe(307);
      });

      it('should use 303 for POST requests by default (prevents resubmission)', () => {
        const request = createMockRequest('https://example.com/test', 'POST');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.status).toBe(303);
      });

      it('should use 303 for PUT requests by default', () => {
        const request = createMockRequest('https://example.com/test', 'PUT');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.status).toBe(303);
      });

      it('should allow overriding redirect status', () => {
        const request = createMockRequest('https://example.com/test', 'GET');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
          redirectStatus: 302,
        });

        expect(response.status).toBe(302);
      });

      it('should allow 308 for permanent redirects', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/new-permanent-path',
          redirectStatus: 308,
        });

        expect(response.status).toBe(308);
      });
    });

    describe('CORS preflight (OPTIONS) handling', () => {
      it('should never redirect OPTIONS requests', () => {
        const request = createMockRequest('https://example.com/api', 'OPTIONS');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      });

      it('should still apply response headers for OPTIONS', () => {
        const request = createMockRequest('https://example.com/api', 'OPTIONS');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/login',
        });

        expect(response.headers.get('set-cookie')).toBe('wos-session=abc123; Path=/; HttpOnly');
      });
    });

    describe('cross-origin redirect security', () => {
      it('should block cross-origin redirects by default', () => {
        const request = createMockRequest('https://example.com/test');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: 'https://evil.com/phishing',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      });

      it('should allow cross-origin when explicitly enabled with true', () => {
        const request = createMockRequest('https://example.com/test');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: 'https://workos.com/auth',
          allowCrossOriginRedirect: true,
        });

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://workos.com/auth');
      });

      it('should allow same-origin redirects', () => {
        const request = createMockRequest('https://example.com/test');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: 'https://example.com/login',
        });

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://example.com/login');
      });

      describe('origin whitelist', () => {
        it('should allow redirect to whitelisted origin', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();

          const response = handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://workos.com/auth',
            allowCrossOriginRedirect: ['https://workos.com'],
          });

          expect(response.status).toBe(307);
          expect(response.headers.get('location')).toBe('https://workos.com/auth');
        });

        it('should allow redirect to any whitelisted origin in array', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();

          const response = handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://auth.workos.com/login',
            allowCrossOriginRedirect: ['https://workos.com', 'https://auth.workos.com'],
          });

          expect(response.status).toBe(307);
          expect(response.headers.get('location')).toBe('https://auth.workos.com/login');
        });

        it('should block redirect to non-whitelisted origin', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();

          const response = handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://evil.com/phishing',
            allowCrossOriginRedirect: ['https://workos.com'],
          });

          expect(response.status).toBe(200);
          expect(response.headers.get('location')).toBeNull();
        });

        it('should handle invalid origins in whitelist gracefully', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();

          const response = handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://workos.com/auth',
            allowCrossOriginRedirect: ['not-a-valid-url', 'https://workos.com'],
          });

          expect(response.status).toBe(307);
        });
      });

      describe('custom predicate', () => {
        it('should allow redirect when predicate returns true', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();

          const response = handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://api.workos.com/auth',
            allowCrossOriginRedirect: (url) => url.hostname.endsWith('.workos.com'),
          });

          expect(response.status).toBe(307);
          expect(response.headers.get('location')).toBe('https://api.workos.com/auth');
        });

        it('should block redirect when predicate returns false', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();

          const response = handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://evil.com/phishing',
            allowCrossOriginRedirect: (url) => url.hostname.endsWith('.workos.com'),
          });

          expect(response.status).toBe(200);
          expect(response.headers.get('location')).toBeNull();
        });

        it('should pass request to predicate for context', () => {
          const request = createMockRequest('https://example.com/test');
          const authkitHeaders = createAuthkitHeaders();
          const predicate = jest.fn().mockReturnValue(true);

          handleAuthkitHeaders(request, authkitHeaders, {
            redirect: 'https://external.com/path',
            allowCrossOriginRedirect: predicate,
          });

          expect(predicate).toHaveBeenCalledWith(expect.any(URL), request);
        });
      });
    });

    describe('redirect loop prevention', () => {
      it('should prevent redirect to same URL', () => {
        const request = createMockRequest('https://example.com/test');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: 'https://example.com/test',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      });

      it('should prevent redirect to same URL (relative)', () => {
        const request = createMockRequest('https://example.com/test');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/test',
        });

        expect(response.status).toBe(200);
      });

      it('should normalize URLs for comparison (trailing slash)', () => {
        const request = createMockRequest('https://example.com/test/');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/test',
        });

        expect(response.status).toBe(200);
      });

      it('should ignore hash fragments when comparing URLs', () => {
        const request = createMockRequest('https://example.com/test');
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '/test#section',
        });

        expect(response.status).toBe(200);
      });
    });

    describe('invalid URL handling', () => {
      it('should handle invalid redirect URL gracefully', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: 'http://[invalid',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      });

      it('should handle empty redirect string gracefully', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();

        const response = handleAuthkitHeaders(request, authkitHeaders, {
          redirect: '',
        });

        expect(response.status).toBe(200);
      });
    });

    describe('edge cases', () => {
      it('should handle empty authkit headers', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.status).toBe(200);
      });

      it('should handle minimal authkit headers (middleware flag only)', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('x-workos-middleware', 'true');

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.headers.get('x-workos-middleware')).toBeNull();
      });

      it('should not mutate the original authkitHeaders', () => {
        const request = createMockRequest();
        const authkitHeaders = createAuthkitHeaders();
        const originalSessionValue = authkitHeaders.get('x-workos-session');

        handleAuthkitHeaders(request, authkitHeaders);

        expect(authkitHeaders.get('x-workos-session')).toBe(originalSessionValue);
      });

      it('should handle case-insensitive header matching', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('X-WorkOS-Session', 'session-data');
        authkitHeaders.set('SET-COOKIE', 'cookie=value');

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response.headers.get('x-workos-session')).toBeNull();
        expect(response.headers.get('set-cookie')).toBe('cookie=value');
      });

      it('should filter out future x-workos-* headers', () => {
        const request = createMockRequest();
        const authkitHeaders = new Headers();
        authkitHeaders.set('x-workos-future-internal', 'secret-data');
        authkitHeaders.set('set-cookie', 'session=abc');

        const response = handleAuthkitHeaders(request, authkitHeaders);

        expect(response.headers.get('x-workos-future-internal')).toBeNull();
        expect(response.headers.get('set-cookie')).toBe('session=abc');
      });
    });

    describe('AUTHKIT_REQUEST_HEADERS export', () => {
      it('should export the list of request-only headers', () => {
        expect(AUTHKIT_REQUEST_HEADERS).toContain('x-workos-middleware');
        expect(AUTHKIT_REQUEST_HEADERS).toContain('x-workos-session');
        expect(AUTHKIT_REQUEST_HEADERS).toContain('x-url');
        expect(AUTHKIT_REQUEST_HEADERS).toContain('x-redirect-uri');
        expect(AUTHKIT_REQUEST_HEADERS).toContain('x-sign-up-paths');
      });
    });
  });
});
