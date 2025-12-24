import { NextRequest, NextResponse, NextFetchEvent } from 'next/server';
import { cookies, headers } from 'next/headers';
import { authkitMiddleware, type AuthkitMiddlewareAuth } from './middleware.js';
import { updateSession, getScreenHint, getMiddlewareAuthPathRegex } from './session.js';
import * as envVariables from './env-variables.js';

import { jwtVerify } from 'jose';
import { User } from '@workos-inc/node';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(),
  SignJWT: jest.requireActual('jose').SignJWT,
  decodeJwt: jest.requireActual('jose').decodeJwt,
}));

jest.mock('./session.js', () => ({
  ...jest.requireActual('./session.js'),
  updateSession: jest.fn(),
  getScreenHint: jest.fn(() => 'sign-in'),
  getMiddlewareAuthPathRegex: jest.fn((pathGlob) => {
    // Simple regex conversion for testing
    const pattern = pathGlob.replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`);
  }),
}));

// logging is disabled by default, flip this to true to still have logs in the console
const DEBUG = false;

describe('authkitMiddleware', () => {
  const mockSession = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: {
      object: 'user',
      id: 'user_123',
      email: 'test@example.com',
      emailVerified: true,
      profilePictureUrl: null,
      firstName: null,
      lastName: null,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    } as User,
  };

  const mockAuthResponse = {
    session: {
      user: mockSession.user,
      sessionId: 'session_123',
      organizationId: 'org_123',
      role: 'member',
      roles: ['member'],
      permissions: ['posts:create'],
      entitlements: [],
      featureFlags: [],
      accessToken: mockSession.accessToken,
    },
    headers: new Headers(),
    authorizationUrl: 'https://auth.workos.com/authorize',
  };

  let consoleLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Clear all mocks between tests
    jest.clearAllMocks();

    // Reset the cookie store
    const nextCookies = await cookies();
    // @ts-expect-error - _reset is part of the mock
    nextCookies._reset();

    const nextHeaders = await headers();
    // @ts-expect-error - _reset is part of the mock
    nextHeaders._reset();
    nextHeaders.set('x-workos-middleware', 'true');

    (jwtVerify as jest.Mock).mockReset();

    // Setup default mock for updateSession
    const defaultHeaders = new Headers();
    defaultHeaders.set('x-workos-middleware', 'true');
    defaultHeaders.set('x-url', 'http://example.com');

    (updateSession as jest.Mock).mockResolvedValue({
      session: { user: null },
      headers: defaultHeaders,
      authorizationUrl: 'https://auth.workos.com/authorize',
    });

    // Reset getScreenHint and getMiddlewareAuthPathRegex mocks
    (getScreenHint as jest.MockedFunction<typeof getScreenHint>).mockImplementation(() => 'sign-in');
    (getMiddlewareAuthPathRegex as jest.MockedFunction<typeof getMiddlewareAuthPathRegex>).mockImplementation(
      (pathGlob) => {
        // Simple regex conversion for testing
        const pattern = pathGlob.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`);
      },
    );

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      if (DEBUG) {
        console.info(...args);
      }
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('basic usage (backward compatibility)', () => {
    it('should work without handler (backward compatible)', async () => {
      const middleware = authkitMiddleware();
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(NextResponse);
      expect(response!.status).toBe(200);
      expect(updateSession).toHaveBeenCalled();
    });

    it('should work with options only', async () => {
      const middleware = authkitMiddleware({ debug: true });
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(NextResponse);
      expect(response!.status).toBe(200);
    });

    it('should handle middleware auth protection when enabled', async () => {
      (updateSession as jest.Mock).mockResolvedValue({
        session: { user: null },
        headers: new Headers(),
        authorizationUrl: 'https://auth.workos.com/authorize',
      });

      const middleware = authkitMiddleware({
        middlewareAuth: {
          enabled: true,
          unauthenticatedPaths: ['/public'],
        },
      });

      const request = new NextRequest(new URL('http://example.com/protected'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response!.status).toBe(307);
      expect(response!.headers.get('Location')).toBe('https://auth.workos.com/authorize');
    });

    it('should allow unauthenticated paths when middleware auth is enabled', async () => {
      const middleware = authkitMiddleware({
        middlewareAuth: {
          enabled: true,
          unauthenticatedPaths: ['/public'],
        },
      });

      const request = new NextRequest(new URL('http://example.com/public'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response!.status).toBe(200);
    });
  });

  describe('handler function support', () => {
    it('should call handler with auth function and modified request', async () => {
      const handler = jest.fn(async (auth, req) => {
        const session = await auth();
        expect(session).toBeDefined();
        expect(req).toBeInstanceOf(NextRequest);
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.any(Function), expect.any(NextRequest), event);
    });

    it('should return handler result when handler returns a response', async () => {
      const customResponse = NextResponse.json({ message: 'custom' }, { status: 201 });
      const handler = jest.fn(async () => customResponse);

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBe(customResponse);
      expect(response!.status).toBe(201);
    });

    it('should merge session headers into handler response', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('Set-Cookie', 'wos-session=encrypted');
      sessionHeaders.set('x-workos-middleware', 'true');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      const handler = jest.fn(async () => {
        return NextResponse.json({ message: 'test' });
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response!.headers.get('Set-Cookie')).toBe('wos-session=encrypted');
      expect(response!.headers.get('x-workos-middleware')).toBe('true');
    });

    it('should pass modified request with correct headers to handler', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      let receivedRequest: NextRequest | null = null;
      const handler = jest.fn(async (auth, req) => {
        receivedRequest = req;
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(receivedRequest).not.toBeNull();
      expect(receivedRequest!.headers.get('x-workos-middleware')).toBe('true');
      expect(receivedRequest!.headers.get('x-url')).toBe('http://example.com');
    });

    it('should allow handler to chain with other middleware', async () => {
      const mockI18nMiddleware = jest.fn((req: NextRequest) => {
        return NextResponse.next({
          request: {
            headers: new Headers(req.headers),
          },
        });
      });

      const handler = jest.fn(async (_auth, req) => {
        // Simulate checking auth and then chaining to i18n middleware
        return mockI18nMiddleware(req);
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(handler).toHaveBeenCalled();
      expect(mockI18nMiddleware).toHaveBeenCalled();
      expect(response).toBeInstanceOf(NextResponse);
    });

    it('should work with handler and options', async () => {
      const handler = jest.fn(async () => {
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler, { debug: true });
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(handler).toHaveBeenCalled();
      expect(response).toBeInstanceOf(NextResponse);
    });
  });

  describe('auth function', () => {
    it('should return session when auth() is called', async () => {
      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: new Headers(),
      });

      let authFunction: AuthkitMiddlewareAuth | null = null;
      const handler = jest.fn(async (auth) => {
        authFunction = auth;
        const session = await auth();
        expect(session.user).toEqual(mockSession.user);
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(authFunction).not.toBeNull();
      if (authFunction) {
        const session = await (authFunction as AuthkitMiddlewareAuth)();
        expect(session.user).toEqual(mockSession.user);
      }
    });

    it('should return null user when not authenticated', async () => {
      (updateSession as jest.Mock).mockResolvedValue({
        session: { user: null },
        headers: new Headers(),
      });

      let authFunction: AuthkitMiddlewareAuth | null = null;
      const handler = jest.fn(async (auth) => {
        authFunction = auth;
        const session = await auth();
        expect(session.user).toBeNull();
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(authFunction).not.toBeNull();
      if (authFunction) {
        const session = await (authFunction as AuthkitMiddlewareAuth)();
        expect(session.user).toBeNull();
      }
    });
  });

  describe('error handling', () => {
    it('should propagate handler errors', async () => {
      const handler = jest.fn(async () => {
        throw new Error('Handler error');
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await expect(middleware(request, event)).rejects.toThrow('Handler error');
    });

    it('should handle redirects from handler', async () => {
      const redirectResponse = NextResponse.redirect('http://example.com/redirect');
      const handler = jest.fn(async () => redirectResponse);

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response!.status).toBe(307);
      expect(response!.headers.get('Location')).toBe('http://example.com/redirect');
    });

    it('should fall through to default behavior when handler returns undefined', async () => {
      const handler = jest.fn(async () => undefined);

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(NextResponse);
      expect(response!.status).toBe(200);
    });
  });

  describe('options callback', () => {
    it('should support dynamic options via callback', async () => {
      const optionsCallback = jest.fn((req: NextRequest) => {
        return {
          debug: req.url.includes('debug'),
        };
      });

      const handler = jest.fn(async () => {
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler, optionsCallback);
      const request = new NextRequest(new URL('http://example.com/debug'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(optionsCallback).toHaveBeenCalledWith(request);
    });

    it('should support async options callback', async () => {
      const optionsCallback = jest.fn(async () => {
        return {
          debug: true,
        };
      });

      const handler = jest.fn(async () => {
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler, optionsCallback);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(optionsCallback).toHaveBeenCalled();
      expect(response).toBeInstanceOf(NextResponse);
    });
  });

  describe('request modification', () => {
    it('should include session header in modified request when session exists', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-session', 'encrypted-session');
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      let receivedRequest: NextRequest | null = null;
      const handler = jest.fn(async (auth, req) => {
        receivedRequest = req;
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(receivedRequest!.headers.get('x-workos-session')).toBe('encrypted-session');
    });

    it('should remove session header from response headers', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-session', 'encrypted-session');
      sessionHeaders.set('x-workos-middleware', 'true');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      const handler = jest.fn(async () => NextResponse.next());

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      // Session header should be in request but not in response
      expect(response).toBeDefined();
      expect(response!.headers.get('x-workos-session')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle handler returning null', async () => {
      const handler = jest.fn(async () => null as NextResponse | null);

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      // Should fall through to default behavior
      expect(response).toBeInstanceOf(NextResponse);
    });

    it('should handle empty handler response', async () => {
      const handler = jest.fn(async () => {
        return new Response();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(Response);
    });

    it('should work when called directly as middleware', async () => {
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const middleware = authkitMiddleware();
      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(NextResponse);
    });
  });

  describe('error cases', () => {
    it('should throw error if redirect URI is not provided', async () => {
      const originalWorkosRedirectUri = envVariables.WORKOS_REDIRECT_URI;
      jest.replaceProperty(envVariables, 'WORKOS_REDIRECT_URI', '');

      const middleware = authkitMiddleware({ redirectUri: '' });
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await expect(middleware(request, event)).rejects.toThrow(
        'You must provide a redirect URI in the AuthKit middleware or in the environment variables.',
      );

      jest.replaceProperty(envVariables, 'WORKOS_REDIRECT_URI', originalWorkosRedirectUri);
    });

    it('should throw error if cookie password is invalid', async () => {
      const originalWorkosCookiePassword = envVariables.WORKOS_COOKIE_PASSWORD;
      jest.replaceProperty(envVariables, 'WORKOS_COOKIE_PASSWORD', 'short');

      const middleware = authkitMiddleware();
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await expect(middleware(request, event)).rejects.toThrow(
        'You must provide a valid cookie password that is at least 32 characters in the environment variables.',
      );

      jest.replaceProperty(envVariables, 'WORKOS_COOKIE_PASSWORD', originalWorkosCookiePassword);
    });
  });

  describe('debug logging', () => {
    it('should log debug message when middleware auth protection redirects', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      (updateSession as jest.Mock).mockResolvedValue({
        session: { user: null },
        headers: new Headers(),
        authorizationUrl: 'https://auth.workos.com/authorize',
      });

      const middleware = authkitMiddleware({
        debug: true,
        middlewareAuth: {
          enabled: true,
          unauthenticatedPaths: [],
        },
      });

      const request = new NextRequest(new URL('http://example.com/protected'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unauthenticated user on protected route'));

      consoleSpy.mockRestore();
    });
  });

  describe('sign up paths', () => {
    it('should set sign up paths header when provided', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      let receivedRequest: NextRequest | null = null;
      const handler = jest.fn(async (_auth, req) => {
        receivedRequest = req;
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler, {
        signUpPaths: ['/signup', '/register'],
      });

      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(receivedRequest!.headers.get('x-sign-up-paths')).toBe('/signup,/register');
    });
  });

  describe('redirect URI handling', () => {
    it('should use WORKOS_REDIRECT_URI when redirectUri option is not provided', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');
      sessionHeaders.set('x-redirect-uri', process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string);

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      let receivedRequest: NextRequest | null = null;
      const handler = jest.fn(async (_auth, req) => {
        receivedRequest = req;
        return NextResponse.next();
      });

      const middleware = authkitMiddleware(handler);
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      await middleware(request, event);

      expect(receivedRequest!.headers.get('x-redirect-uri')).toBe(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
    });

    it('should auto-add redirect URI to unauthenticatedPaths to prevent login loop', async () => {
      const redirectUri = 'http://example.com/callback';
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');

      (updateSession as jest.Mock).mockResolvedValue({
        session: { user: null },
        headers: sessionHeaders,
        authorizationUrl: 'https://auth.workos.com/authorize',
      });

      const middleware = authkitMiddleware({
        redirectUri,
        middlewareAuth: {
          enabled: true,
          unauthenticatedPaths: [],
        },
      });

      const request = new NextRequest(new URL(redirectUri));
      const event = {} as NextFetchEvent;

      // Should not redirect (should allow the callback through)
      const response = await middleware(request, event);

      expect(response).toBeDefined();
      expect(response!.status).toBe(200);
    });
  });

  describe('direct middleware call', () => {
    it('should work when called directly with request and event', async () => {
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      // Call middleware directly (not as a function that returns middleware)
      const response = await authkitMiddleware(request, event);

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(NextResponse);
    });
  });

  describe('authkit function', () => {
    it('should export authkit function', async () => {
      const { authkit } = await import('./middleware.js');
      expect(authkit).toBeDefined();
      expect(typeof authkit).toBe('function');
    });

    it('should call updateSession when authkit is called', async () => {
      const { authkit } = await import('./middleware.js');
      const request = new NextRequest(new URL('http://example.com'));

      await authkit(request, { debug: true });

      expect(updateSession).toHaveBeenCalledWith(request, { debug: true });
    });
  });

  describe('redirect URI fallback', () => {
    it('should use WORKOS_REDIRECT_URI when redirectUri is not provided in options', async () => {
      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      // Don't provide redirectUri in options - should use WORKOS_REDIRECT_URI
      const middleware = authkitMiddleware();
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      expect(updateSession).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          redirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
        }),
      );
      expect(response).toBeDefined();
    });

    it('should use WORKOS_REDIRECT_URI fallback when redirectUri is empty string', async () => {
      const originalWorkosRedirectUri = envVariables.WORKOS_REDIRECT_URI;
      const testRedirectUri = 'http://example.com/callback';
      jest.replaceProperty(envVariables, 'WORKOS_REDIRECT_URI', testRedirectUri);

      const sessionHeaders = new Headers();
      sessionHeaders.set('x-workos-middleware', 'true');
      sessionHeaders.set('x-url', 'http://example.com');

      (updateSession as jest.Mock).mockResolvedValue({
        session: mockAuthResponse.session,
        headers: sessionHeaders,
      });

      // Provide empty string for redirectUri - should fall back to WORKOS_REDIRECT_URI internally
      const middleware = authkitMiddleware({ redirectUri: '' });
      const request = new NextRequest(new URL('http://example.com'));
      const event = {} as NextFetchEvent;

      const response = await middleware(request, event);

      // updateSession receives empty string, but updateSessionForMiddleware uses WORKOS_REDIRECT_URI fallback
      expect(updateSession).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          redirectUri: '', // Empty string is passed to updateSession
        }),
      );
      expect(response).toBeDefined();

      jest.replaceProperty(envVariables, 'WORKOS_REDIRECT_URI', originalWorkosRedirectUri);
    });
  });
});
