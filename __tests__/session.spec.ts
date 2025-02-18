import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { generateTestToken } from './test-helpers.js';
import { withAuth, updateSession, refreshSession, terminateSession, updateSessionMiddleware } from '../src/session.js';
import { getWorkOSInstance } from '../src/workos.js';
import * as envVariables from '../src/env-variables.js';

import { jwtVerify } from 'jose';
import { sealData } from 'iron-session';
import { User } from '@workos-inc/node';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(),
  SignJWT: jest.requireActual('jose').SignJWT,
  decodeJwt: jest.requireActual('jose').decodeJwt,
}));

// logging is disabled by default, flip this to true to still have logs in the console
const DEBUG = false;

const workos = getWorkOSInstance();

describe('session.ts', () => {
  const mockSession = {
    accessToken: 'access-token',
    oauthTokens: undefined,
    sessionId: 'session_123',
    organizationId: 'org_123',
    role: 'member',
    permissions: ['posts:create', 'posts:delete'],
    entitlements: ['audit-logs'],
    impersonator: undefined,
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

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      if (DEBUG) {
        console.info(...args);
      }
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.resetModules();
  });

  describe('withAuth', () => {
    it('should return user info when authenticated', async () => {
      mockSession.accessToken = await generateTestToken();

      const nextHeaders = await headers();

      nextHeaders.set(
        'x-workos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const result = await withAuth();
      expect(result).toHaveProperty('user');
      expect(result.user).toEqual(mockSession.user);
    });

    it('should return null when user is not authenticated', async () => {
      const result = await withAuth();

      expect(result).toEqual({ user: null });
    });

    it('should redirect when ensureSignedIn is true and user is not authenticated', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'https://example.com/protected');

      await withAuth({ ensureSignedIn: true });

      expect(redirect).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if the route is not covered by the middleware', async () => {
      const nextHeaders = await headers();
      nextHeaders.delete('x-workos-middleware');
      nextHeaders.set('x-url', 'https://example.com/');

      await expect(async () => {
        await withAuth();
      }).rejects.toThrow(
        "You are calling 'withAuth' on https://example.com/ that isn’t covered by the AuthKit middleware. Make sure it is running on all paths you are calling 'withAuth' from by updating your middleware config in 'middleware.(js|ts)'.",
      );
    });

    it('should throw an error if the route is not covered by the middleware and there is no URL in the headers', async () => {
      const nextHeaders = await headers();
      nextHeaders.delete('x-workos-middleware');

      await expect(async () => {
        await withAuth({ ensureSignedIn: true });
      }).rejects.toThrow(
        "You are calling 'withAuth' on a route that isn’t covered by the AuthKit middleware. Make sure it is running on all paths you are calling 'withAuth' from by updating your middleware config in 'middleware.(js|ts)'.",
      );
    });

    it('should throw an error if the URL is not found in the headers', async () => {
      const nextHeaders = await headers();
      nextHeaders.delete('x-url');

      await expect(async () => {
        await withAuth({ ensureSignedIn: true });
      }).rejects.toThrow('No URL found in the headers');
    });

    it('should include any search parameters in the redirect URL', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'https://example.com/protected?test=123');

      await withAuth({ ensureSignedIn: true });

      const pathname = encodeURIComponent(btoa(JSON.stringify({ returnPathname: '/protected?test=123' })));

      expect(redirect).toHaveBeenCalledWith(expect.stringContaining(pathname));
    });
  });

  describe('updateSessionMiddleware', () => {
    it('should throw an error if the redirect URI is not set', async () => {
      const originalWorkosRedirectUri = envVariables.WORKOS_REDIRECT_URI;

      jest.replaceProperty(envVariables, 'WORKOS_REDIRECT_URI', '');

      await expect(async () => {
        await updateSessionMiddleware(
          new NextRequest(new URL('http://example.com')),
          false,
          {
            enabled: false,
            unauthenticatedPaths: [],
          },
          '',
          [],
        );
      }).rejects.toThrow('You must provide a redirect URI in the AuthKit middleware or in the environment variables.');

      jest.replaceProperty(envVariables, 'WORKOS_REDIRECT_URI', originalWorkosRedirectUri);
    });

    it('should throw an error if the cookie password is not set', async () => {
      const originalWorkosCookiePassword = envVariables.WORKOS_COOKIE_PASSWORD;

      jest.replaceProperty(envVariables, 'WORKOS_COOKIE_PASSWORD', '');

      await expect(async () => {
        await updateSessionMiddleware(
          new NextRequest(new URL('http://example.com')),
          false,
          {
            enabled: false,
            unauthenticatedPaths: [],
          },
          '',
          [],
        );
      }).rejects.toThrow(
        'You must provide a valid cookie password that is at least 32 characters in the environment variables.',
      );

      jest.replaceProperty(envVariables, 'WORKOS_COOKIE_PASSWORD', originalWorkosCookiePassword);
    });

    it('should throw an error if the cookie password is less than 32 characters', async () => {
      const originalWorkosCookiePassword = envVariables.WORKOS_COOKIE_PASSWORD;

      jest.replaceProperty(envVariables, 'WORKOS_COOKIE_PASSWORD', 'short');

      await expect(async () => {
        await updateSessionMiddleware(
          new NextRequest(new URL('http://example.com')),
          false,
          {
            enabled: false,
            unauthenticatedPaths: [],
          },
          '',
          [],
        );
      }).rejects.toThrow(
        'You must provide a valid cookie password that is at least 32 characters in the environment variables.',
      );

      jest.replaceProperty(envVariables, 'WORKOS_COOKIE_PASSWORD', originalWorkosCookiePassword);
    });

    it('should return early if there is no session', async () => {
      const request = new NextRequest(new URL('http://example.com'));
      const result = await updateSessionMiddleware(
        request,
        false,
        {
          enabled: false,
          unauthenticatedPaths: [],
        },
        process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
        [],
      );

      expect(result).toBeInstanceOf(NextResponse);
      expect(result.status).toBe(200);
    });

    it('should return 200 if the session is valid', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const nextCookies = await cookies();
      nextCookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      (jwtVerify as jest.Mock).mockImplementation(() => {
        return true;
      });

      const request = new NextRequest(new URL('http://example.com'));
      const result = await updateSessionMiddleware(
        request,
        true,
        {
          enabled: false,
          unauthenticatedPaths: [],
        },
        process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
        [],
      );

      expect(result).toBeInstanceOf(NextResponse);
      expect(result.status).toBe(200);
    });

    it('should attempt to refresh the session when the access token is invalid', async () => {
      mockSession.accessToken = await generateTestToken({}, true);

      (jwtVerify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      jest.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: await generateTestToken(),
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      const request = new NextRequest(new URL('http://example.com'));

      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const result = await updateSessionMiddleware(
        request,
        true,
        {
          enabled: false,
          unauthenticatedPaths: [],
        },
        process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
        [],
      );

      expect(result.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(
        `Session invalid. Refreshing access token that ends in ${mockSession.accessToken.slice(-10)}`,
      );
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Session successfully refreshed'));
    });

    it('should delete the cookie when refreshing fails', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});

      mockSession.accessToken = await generateTestToken({}, true);

      (jwtVerify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      jest
        .spyOn(workos.userManagement, 'authenticateWithRefreshToken')
        .mockRejectedValue(new Error('Failed to refresh'));

      const request = new NextRequest(new URL('http://example.com'));

      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const response = await updateSessionMiddleware(
        request,
        true,
        {
          enabled: false,
          unauthenticatedPaths: [],
        },
        process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
        [],
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Set-Cookie')).toContain('wos-session=;');
      expect(console.log).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenNthCalledWith(
        1,
        `Session invalid. Refreshing access token that ends in ${mockSession.accessToken.slice(-10)}`,
      );
      expect(console.log).toHaveBeenNthCalledWith(
        2,
        'Failed to refresh. Deleting cookie.',
        new Error('Failed to refresh'),
      );
    });

    describe('middleware auth', () => {
      it('should redirect unauthenticated users on protected routes', async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const request = new NextRequest(new URL('http://example.com/protected'));
        const result = await updateSessionMiddleware(
          request,
          true,
          {
            enabled: true,
            unauthenticatedPaths: [],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          [],
        );

        expect(result.status).toBe(307);
        expect(console.log).toHaveBeenCalledWith(
          'Unauthenticated user on protected route http://example.com/protected, redirecting to AuthKit',
        );
      });

      it('should use Response if NextResponse.redirect is not available', async () => {
        const originalRedirect = NextResponse.redirect;
        (NextResponse as Partial<typeof NextResponse>).redirect = undefined;

        const request = new NextRequest(new URL('http://example.com/protected'));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: true,
            unauthenticatedPaths: [],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          [],
        );

        expect(result).toBeInstanceOf(Response);

        // Restore the original redirect method
        (NextResponse as Partial<typeof NextResponse>).redirect = originalRedirect;
      });

      it('should automatically add the redirect URI to unauthenticatedPaths when middleware is enabled', async () => {
        const request = new NextRequest(new URL('http://example.com/protected'));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: true,
            unauthenticatedPaths: [],
          },
          'http://example.com/protected',
          [],
        );

        expect(result.status).toBe(200);
      });

      it('should redirect unauthenticated users to sign up page on protected routes included in signUpPaths', async () => {
        const request = new NextRequest(new URL('http://example.com/protected-signup'));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: true,
            unauthenticatedPaths: [],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          ['/protected-signup'],
        );

        expect(result.status).toBe(307);
        expect(result.headers.get('Location')).toContain('screen_hint=sign-up');
      });

      it('should set the sign up paths in the headers', async () => {
        const request = new NextRequest(new URL('http://example.com/protected-signup'));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: false,
            unauthenticatedPaths: [],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          ['/protected-signup'],
        );

        expect(result.headers.get('x-sign-up-paths')).toBe('/protected-signup');
      });

      it('should allow logged out users on unauthenticated paths', async () => {
        const request = new NextRequest(new URL('http://example.com/unauthenticated'));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: true,
            unauthenticatedPaths: ['/unauthenticated'],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          [],
        );

        expect(result.status).toBe(200);
      });

      it('should throw an error if the provided regex is invalid', async () => {
        const request = new NextRequest(new URL('http://example.com/invalid-regex'));
        await expect(async () => {
          await updateSessionMiddleware(
            request,
            false,
            {
              enabled: true,
              unauthenticatedPaths: ['[*'],
            },
            process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
            [],
          );
        }).rejects.toThrow();
      });

      it('should throw an error if the provided regex is invalid and a non-Error object is thrown', async () => {
        // Reset modules to ensure clean import state
        jest.resetModules();

        // Import first, then spy
        const pathToRegexp = await import('path-to-regexp');
        const parseSpy = jest.spyOn(pathToRegexp, 'parse').mockImplementation(() => {
          throw 'invalid regex';
        });

        // Import session after setting up the spy
        const { updateSessionMiddleware } = await import('../src/session.js');

        const request = new NextRequest(new URL('http://example.com/invalid-regex'));

        await expect(async () => {
          await updateSessionMiddleware(
            request,
            false,
            {
              enabled: true,
              unauthenticatedPaths: ['[*'],
            },
            process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
            [],
          );
        }).rejects.toThrow('Error parsing routes for middleware auth. Reason: invalid regex');

        // Verify the mock was called
        expect(parseSpy).toHaveBeenCalled();
      });

      it('should default to the WORKOS_REDIRECT_URI environment variable if no redirect URI is provided', async () => {
        const request = new NextRequest(new URL('http://example.com/protected'));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: true,
            unauthenticatedPaths: [],
          },
          '',
          [],
        );

        expect(result.status).toBe(307);
      });

      it('should delete the cookie and redirect when refreshing fails', async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});

        mockSession.accessToken = await generateTestToken({}, true);

        (jwtVerify as jest.Mock).mockImplementation(() => {
          throw new Error('Invalid token');
        });

        jest
          .spyOn(workos.userManagement, 'authenticateWithRefreshToken')
          .mockRejectedValue(new Error('Failed to refresh'));

        const request = new NextRequest(new URL('http://example.com'));

        request.cookies.set(
          'wos-session',
          await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const response = await updateSessionMiddleware(
          request,
          true,
          {
            enabled: true,
            unauthenticatedPaths: [],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          [],
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('Set-Cookie')).toContain('wos-session=;');
        expect(console.log).toHaveBeenCalledTimes(3);
        expect(console.log).toHaveBeenNthCalledWith(
          1,
          `Session invalid. Refreshing access token that ends in ${mockSession.accessToken.slice(-10)}`,
        );
        expect(console.log).toHaveBeenNthCalledWith(
          2,
          'Failed to refresh. Deleting cookie.',
          new Error('Failed to refresh'),
        );

        expect(console.log).toHaveBeenNthCalledWith(
          3,
          'Unauthenticated user on protected route http://example.com/, redirecting to AuthKit',
        );
      });

      describe('sign up paths', () => {
        it('should redirect to sign up when unauthenticated user is on a sign up path', async () => {
          const request = new NextRequest(new URL('http://example.com/signup'));

          const result = await updateSessionMiddleware(
            request,
            false,
            {
              enabled: true,
              unauthenticatedPaths: [],
            },
            process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
            ['/signup'],
          );

          expect(result.status).toBe(307);
          expect(result.headers.get('Location')).toContain('screen_hint=sign-up');
        });

        it('should accept a sign up path as a string', async () => {
          const nextHeaders = await headers();
          nextHeaders.set('x-url', 'http://example.com/signup');
          nextHeaders.set('x-sign-up-paths', '/signup');

          await withAuth({ ensureSignedIn: true });
          expect(redirect).toHaveBeenCalledTimes(1);
          expect(redirect).toHaveBeenCalledWith(expect.stringContaining('screen_hint=sign-up'));
        });
      });
    });
  });

  describe('updateSession', () => {
    it('should return an authorization url if the session is invalid', async () => {
      const result = await updateSession(new NextRequest(new URL('http://example.com/protected')), {
        debug: true,
        screenHint: 'sign-up',
      });

      expect(result.authorizationUrl).toBeDefined();
      expect(result.authorizationUrl).toContain('screen_hint=sign-up');
      expect(result.session.user).toBeNull();
      expect(console.log).toHaveBeenCalledWith('No session found from cookie');
    });

    it('should return a session if the session is valid', async () => {
      const request = new NextRequest(new URL('http://example.com/protected'));
      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const result = await updateSession(request);

      expect(result.session).toBeDefined();
    });

    it('should attempt to refresh an invalid session', async () => {
      // Setup invalid session
      mockSession.accessToken = await generateTestToken({}, true);

      // Mock token verification to fail
      (jwtVerify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Mock successful refresh
      jest.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: await generateTestToken(),
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      const request = new NextRequest(new URL('http://example.com/protected'));
      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const response = await updateSession(request, {
        debug: true,
      });

      expect(response.session).toBeDefined();
      expect(response.session.user).toBeDefined();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Session invalid. Refreshing access token that ends in'),
      );
    });

    it('should handle refresh failure by returning auth URL', async () => {
      // Setup invalid session
      mockSession.accessToken = await generateTestToken({}, true);

      // Mock token verification to fail
      (jwtVerify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Mock refresh failure
      jest.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('Refresh failed'));

      const request = new NextRequest(new URL('http://example.com/protected'));
      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const response = await updateSession(request, {
        debug: true,
      });

      expect(response.session.user).toBeNull();
      expect(response.authorizationUrl).toBeDefined();
      expect(console.log).toHaveBeenCalledWith('Failed to refresh. Deleting cookie.', expect.any(Error));
    });
  });

  describe('refreshSession', () => {
    it('should refresh session successfully', async () => {
      jest.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: await generateTestToken(),
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      jest
        .spyOn(workos.userManagement, 'getJwksUrl')
        .mockReturnValue('https://api.workos.com/sso/jwks/client_1234567890');

      const nextCookies = await cookies();
      nextCookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const result = await refreshSession({ ensureSignedIn: false });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
    });

    it('should return null user when no session exists', async () => {
      const result = await refreshSession({ ensureSignedIn: false });
      expect(result).toEqual({ user: null });
    });

    it('should redirect to sign in when ensureSignedIn is true and no session exists', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'http://example.com/protected');

      const response = await refreshSession({ ensureSignedIn: true });

      expect(response).toEqual({ user: null });
      expect(redirect).toHaveBeenCalledTimes(1);
    });

    it('should use the organizationId provided in the options', async () => {
      const nextCookies = await cookies();
      nextCookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      jest.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: await generateTestToken({ org_id: 'org_456' }),
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      jest
        .spyOn(workos.userManagement, 'getJwksUrl')
        .mockReturnValue('https://api.workos.com/sso/jwks/client_1234567890');

      const result = await refreshSession({ organizationId: 'org_456' });

      expect(result).toHaveProperty('user');
      expect(result.organizationId).toBe('org_456');
    });
  });

  describe('terminateSession', () => {
    it('should redirect to logout url when there is a session', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'http://example.com/protected');

      mockSession.accessToken = await generateTestToken();

      nextHeaders.set(
        'x-workos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      await terminateSession();

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(
        'https://api.workos.com/user_management/sessions/logout?session_id=session_123',
      );
    });

    it('should redirect to home when there is no session', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'http://example.com/protected');

      await terminateSession();

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith('/');
    });

    describe('when given a `returnTo` URL', () => {
      it('includes a `return_to` query parameter in the logout URL', async () => {
        const nextHeaders = await headers();
        nextHeaders.set('x-url', 'http://example.com/protected');

        mockSession.accessToken = await generateTestToken();

        nextHeaders.set(
          'x-workos-session',
          await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        await terminateSession({ returnTo: 'http://example.com/signed-out' });

        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith(
          'https://api.workos.com/user_management/sessions/logout?session_id=session_123&return_to=http%3A%2F%2Fexample.com%2Fsigned-out',
        );
      });
    });
  });
});
