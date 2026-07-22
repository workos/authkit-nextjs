import type { Mock, MockInstance } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { generateTestToken } from './test-helpers.js';
import {
  withAuth,
  updateSession,
  refreshSession,
  updateSessionMiddleware,
  getTokenClaims,
  checkRecentAuth,
} from './session.js';
import { getWorkOS } from './workos.js';
import * as envVariables from './env-variables.js';

import { SignJWT, jwtVerify } from 'jose';

// Helper to override env variable exports without triggering no-import-assign on the import binding
function setEnvVar(mod: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(mod, key, { value, configurable: true });
}
import { sealData } from 'iron-session';
import { User } from '@workos-inc/node';
import { getStateFromPKCECookieValue } from './pkce.js';
import { handleAuthkitHeaders } from './middleware-helpers.js';

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn(),
    SignJWT: actual.SignJWT,
    decodeJwt: actual.decodeJwt,
  };
});

// logging is disabled by default, flip this to true to still have logs in the console
const DEBUG = false;

const workos = getWorkOS();

describe('session.ts', () => {
  const mockSession = {
    accessToken: 'access-token',
    oauthTokens: undefined,
    sessionId: 'session_123',
    organizationId: 'org_123',
    role: 'member',
    roles: ['member'],
    permissions: ['posts:create', 'posts:delete'],
    entitlements: ['audit-logs'],
    featureFlags: ['device-authorization-grant'],
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

  let consoleLogSpy: MockInstance;

  beforeEach(async () => {
    // Clear all mocks between tests
    vi.clearAllMocks();

    // Reset the cookie store
    const nextCookies = await cookies();
    // @ts-expect-error - _reset is part of the mock
    nextCookies._reset();

    const nextHeaders = await headers();
    // @ts-expect-error - _reset is part of the mock
    nextHeaders._reset();
    nextHeaders.set('x-workos-middleware', 'true');

    (jwtVerify as Mock).mockReset();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      if (DEBUG) {
        console.info(...args);
      }
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.resetModules();
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

    it('rejects the session when the sealed user does not match the access token subject', async () => {
      // SEC-1219: an attacker with their own valid access token (sub) but a
      // forged sealed `user` must not be able to impersonate that user.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSession.accessToken = await generateTestToken({ sub: 'user_attacker' });

      const nextHeaders = await headers();
      nextHeaders.set(
        'x-workos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      const result = await withAuth();

      expect(result).toEqual({ user: null });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('redirects on a mismatched session when ensureSignedIn is true', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSession.accessToken = await generateTestToken({ sub: 'user_attacker' });

      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'https://example.com/protected');
      nextHeaders.set(
        'x-workos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      await withAuth({ ensureSignedIn: true });

      expect(redirect).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
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
        /You are calling 'withAuth' on https:\/\/example\.com\/ that isn't covered by the AuthKit middleware/,
      );
    });

    it('should throw an error if the route is not covered by the middleware and there is no URL in the headers', async () => {
      const nextHeaders = await headers();
      nextHeaders.delete('x-workos-middleware');

      await expect(async () => {
        await withAuth({ ensureSignedIn: true });
      }).rejects.toThrow(/You are calling 'withAuth' on a route that isn't covered by the AuthKit middleware/);
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

      // The state is now sealed, se we need to unseal it
      const redirectUrl = new URL((redirect as unknown as Mock).mock.calls[0][0]);
      const sealedState = redirectUrl.searchParams.get('state')!;
      const { returnPathname } = await getStateFromPKCECookieValue(sealedState);

      expect(returnPathname).toBe('/protected?test=123');
    });
  });

  describe('updateSessionMiddleware', () => {
    it('should throw an error if the redirect URI is not set', async () => {
      const originalWorkosRedirectUri = envVariables.WORKOS_REDIRECT_URI;

      setEnvVar(envVariables, 'WORKOS_REDIRECT_URI', '');

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

      setEnvVar(envVariables, 'WORKOS_REDIRECT_URI', originalWorkosRedirectUri);
    });

    it('should throw an error if the cookie password is not set', async () => {
      const originalWorkosCookiePassword = envVariables.WORKOS_COOKIE_PASSWORD;

      setEnvVar(envVariables, 'WORKOS_COOKIE_PASSWORD', '');

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

      setEnvVar(envVariables, 'WORKOS_COOKIE_PASSWORD', originalWorkosCookiePassword);
    });

    it('should throw an error if the cookie password is less than 32 characters', async () => {
      const originalWorkosCookiePassword = envVariables.WORKOS_COOKIE_PASSWORD;

      setEnvVar(envVariables, 'WORKOS_COOKIE_PASSWORD', 'short');

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

      setEnvVar(envVariables, 'WORKOS_COOKIE_PASSWORD', originalWorkosCookiePassword);
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
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const nextCookies = await cookies();
      nextCookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      (jwtVerify as Mock).mockImplementation(() => {
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

      (jwtVerify as Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
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
      vi.spyOn(console, 'log').mockImplementation(() => {});

      mockSession.accessToken = await generateTestToken({}, true);

      (jwtVerify as Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('Failed to refresh'));

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
        vi.spyOn(console, 'log').mockImplementation(() => {});

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

      it('should return a redirect response when middlewareAuth is enabled and user is not authenticated', async () => {
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

        expect(result).toBeInstanceOf(NextResponse);
        expect(result.status).toBe(307);
        expect(result.headers.get('Location')).toContain('workos.com');
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

      it('should not leak sign-up paths header to the browser', async () => {
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

        // x-sign-up-paths is an internal header that should not leak to the browser
        expect(result.headers.get('x-sign-up-paths')).toBeNull();
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
        vi.resetModules();

        // Import first, then spy
        const pathToRegexp = await import('path-to-regexp');
        const parseSpy = vi.spyOn(pathToRegexp, 'parse').mockImplementation(() => {
          throw 'invalid regex';
        });

        // Import session after setting up the spy
        const { updateSessionMiddleware } = await import('./session.js');

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

        // Restore the spy to prevent leaking to subsequent tests
        parseSpy.mockRestore();
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
        vi.spyOn(console, 'log').mockImplementation(() => {});

        mockSession.accessToken = await generateTestToken({}, true);

        (jwtVerify as Mock).mockImplementation(() => {
          throw new Error('Invalid token');
        });

        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(
          new Error('Failed to refresh'),
        );

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
      const request = new NextRequest(new URL('http://example.com/protected'), {
        headers: { accept: 'text/html' },
      });
      const result = await updateSession(request, {
        debug: true,
        screenHint: 'sign-up',
      });

      expect(result.authorizationUrl).toBeDefined();
      expect(result.authorizationUrl).toContain('screen_hint=sign-up');
      expect(result.session.user).toBeNull();
      expect(result.headers.getSetCookie().some((c) => c.includes('wos-auth-verifier'))).toBe(true);
      expect(
        handleAuthkitHeaders(request, result.headers)
          .headers.getSetCookie()
          .some((c) => c.includes('wos-auth-verifier')),
      ).toBe(false);
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
      (jwtVerify as Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Mock successful refresh
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
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
      (jwtVerify as Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Mock refresh failure
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('Refresh failed'));

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

    describe('PKCE cookie cleanup', () => {
      function documentRequest(url = 'http://example.com/protected'): NextRequest {
        return new NextRequest(new URL(url), {
          headers: { accept: 'text/html' },
        });
      }

      function getRedirectSetCookieHeaders(
        request: NextRequest,
        result: Awaited<ReturnType<typeof updateSession>>,
      ): string[] {
        return handleAuthkitHeaders(request, result.headers, {
          redirect: result.authorizationUrl,
        }).headers.getSetCookie();
      }

      function addStalePKCECookies(request: NextRequest, count: number): void {
        for (let i = 0; i < count; i++) {
          request.cookies.set(`wos-auth-verifier-${i.toString(16).padStart(8, '0')}`, `stale-state-${i}`);
        }
      }

      it('should not expire PKCE cookies when below the threshold (concurrent flows preserved)', async () => {
        const request = documentRequest();
        request.cookies.set('wos-auth-verifier-aaaaaaaa', 'stale-sealed-state-a');
        request.cookies.set('wos-auth-verifier-bbbbbbbb', 'stale-sealed-state-b');

        const result = await updateSession(request);

        expect(result.session.user).toBeNull();
        const setCookies = getRedirectSetCookieHeaders(request, result);
        expect(setCookies.some((c) => c.startsWith('wos-auth-verifier-aaaaaaaa=;'))).toBe(false);
        expect(setCookies.some((c) => c.startsWith('wos-auth-verifier-bbbbbbbb=;'))).toBe(false);
        // The new PKCE cookie should still be set
        expect(
          setCookies.some(
            (c) =>
              c.match(/^wos-auth-verifier-[0-9a-f]{8}=.+/) &&
              !c.startsWith('wos-auth-verifier-aaaaaaaa') &&
              !c.startsWith('wos-auth-verifier-bbbbbbbb'),
          ),
        ).toBe(true);
      });

      it('should expire all PKCE cookies when at or above the threshold', async () => {
        const request = documentRequest();
        addStalePKCECookies(request, 5);

        const result = await updateSession(request);

        expect(result.session.user).toBeNull();
        const setCookies = getRedirectSetCookieHeaders(request, result);
        for (let i = 0; i < 5; i++) {
          const name = `wos-auth-verifier-${i.toString(16).padStart(8, '0')}`;
          expect(setCookies.some((c) => c.startsWith(`${name}=;`))).toBe(true);
        }
        // The new PKCE cookie should also be present
        expect(setCookies.some((c) => c.match(/^wos-auth-verifier-[0-9a-f]{8}=.+/) && !c.includes('=;'))).toBe(true);
      });

      it('should expire stale PKCE cookies when refresh fails and threshold exceeded', async () => {
        mockSession.accessToken = await generateTestToken({}, true);

        (jwtVerify as Mock).mockImplementation(() => {
          throw new Error('Invalid token');
        });

        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('Refresh failed'));

        const request = documentRequest();
        request.cookies.set(
          'wos-session',
          await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );
        addStalePKCECookies(request, 5);

        const result = await updateSession(request);

        expect(result.session.user).toBeNull();
        const setCookies = getRedirectSetCookieHeaders(request, result);
        expect(setCookies.some((c) => c.startsWith('wos-auth-verifier-00000000=;'))).toBe(true);
      });

      it('should not expire PKCE cookies for non-document requests', async () => {
        const request = new NextRequest(new URL('http://example.com/protected'), {
          headers: { RSC: '1' },
        });
        addStalePKCECookies(request, 10);

        const result = await updateSession(request);

        const setCookies = getRedirectSetCookieHeaders(request, result);
        expect(setCookies.some((c) => c.includes('wos-auth-verifier'))).toBe(false);
      });

      it('should not expire non-PKCE cookies', async () => {
        const request = documentRequest();
        request.cookies.set('some-other-cookie', 'value');
        addStalePKCECookies(request, 5);

        const result = await updateSession(request);

        const setCookies = getRedirectSetCookieHeaders(request, result);
        expect(setCookies.some((c) => c.startsWith('some-other-cookie=;'))).toBe(false);
      });

      it('should not expire legacy wos-auth-verifier cookie when below threshold', async () => {
        const request = documentRequest();
        request.cookies.set('wos-auth-verifier', 'legacy-sealed-state');

        const result = await updateSession(request);

        const setCookies = getRedirectSetCookieHeaders(request, result);
        expect(setCookies.some((c) => c.startsWith('wos-auth-verifier=;'))).toBe(false);
      });

      it('should expire legacy wos-auth-verifier cookie when threshold exceeded', async () => {
        const request = documentRequest();
        request.cookies.set('wos-auth-verifier', 'legacy-sealed-state');
        addStalePKCECookies(request, 5);

        const result = await updateSession(request);

        const setCookies = getRedirectSetCookieHeaders(request, result);
        expect(setCookies.some((c) => c.startsWith('wos-auth-verifier=;'))).toBe(true);
      });
    });

    it('should call onSessionRefreshSuccess when refresh succeeds', async () => {
      // Setup invalid session
      mockSession.accessToken = await generateTestToken({}, true);

      // Mock token verification to fail
      (jwtVerify as Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const newAccessToken = await generateTestToken();
      const mockSuccessCallback = vi.fn();

      // Mock successful refresh
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: newAccessToken,
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      const request = new NextRequest(new URL('http://example.com/protected'));
      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      await updateSession(request, {
        debug: true,
        onSessionRefreshSuccess: mockSuccessCallback,
      });

      expect(mockSuccessCallback).toHaveBeenCalledTimes(1);
      expect(mockSuccessCallback).toHaveBeenCalledWith({
        accessToken: newAccessToken,
        user: mockSession.user,
        impersonator: undefined,
        organizationId: 'org_123',
      });
    });

    it('should call onSessionRefreshError when refresh fails', async () => {
      // Setup invalid session
      mockSession.accessToken = await generateTestToken({}, true);

      // Mock token verification to fail
      (jwtVerify as Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const mockError = new Error('Refresh failed');
      const mockErrorCallback = vi.fn();

      // Mock refresh failure
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(mockError);

      const request = new NextRequest(new URL('http://example.com/protected'));
      request.cookies.set(
        'wos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      await updateSession(request, {
        debug: true,
        onSessionRefreshError: mockErrorCallback,
      });

      expect(mockErrorCallback).toHaveBeenCalledTimes(1);
      expect(mockErrorCallback).toHaveBeenCalledWith({
        error: mockError,
        request,
      });
    });

    describe('proactive refresh', () => {
      // generateTestToken always signs with a 2h expiry, so build tokens with a
      // controlled exp/iat here to place them inside or outside the refresh buffer.
      async function generateTokenWithExpiry(secondsUntilExpiry: number, lifetimeSeconds = 3600) {
        const now = Math.floor(Date.now() / 1000);
        const secret = new TextEncoder().encode(process.env.WORKOS_COOKIE_PASSWORD as string);

        return await new SignJWT({ sid: 'session_123', org_id: 'org_123' })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt(now - (lifetimeSeconds - secondsUntilExpiry))
          .setExpirationTime(now + secondsUntilExpiry)
          .sign(secret);
      }

      async function requestWithSessionToken(accessToken: string) {
        const request = new NextRequest(new URL('http://example.com/protected'));
        request.cookies.set(
          'wos-session',
          await sealData({ ...mockSession, accessToken }, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        return request;
      }

      it('should refresh a valid session that is within the refresh buffer', async () => {
        const newAccessToken = await generateTestToken();
        const refreshSpy = vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
          accessToken: newAccessToken,
          refreshToken: 'new-refresh-token',
          user: mockSession.user,
        });

        const request = await requestWithSessionToken(await generateTokenWithExpiry(30));
        const response = await updateSession(request, { debug: true });

        expect(refreshSpy).toHaveBeenCalledTimes(1);
        expect(response.session.user).toBeDefined();
        expect(response.session.accessToken).toBe(newAccessToken);
        expect(response.headers.getSetCookie().some((c) => c.startsWith('wos-session=') && c.length > 20)).toBe(true);
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Session expiring soon. Proactively refreshing access token that ends in'),
        );
      });

      it('should not refresh a valid session outside the refresh buffer', async () => {
        const refreshSpy = vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken');

        const accessToken = await generateTokenWithExpiry(300);
        const request = await requestWithSessionToken(accessToken);
        const response = await updateSession(request);

        expect(refreshSpy).not.toHaveBeenCalled();
        expect(response.session.accessToken).toBe(accessToken);
      });

      it('should use a 30 second buffer for tokens with a lifetime of 5 minutes or less', async () => {
        const refreshSpy = vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
          accessToken: await generateTestToken(),
          refreshToken: 'new-refresh-token',
          user: mockSession.user,
        });

        // 45 seconds left on a 5 minute token: outside the 30 second buffer
        await updateSession(await requestWithSessionToken(await generateTokenWithExpiry(45, 300)));
        expect(refreshSpy).not.toHaveBeenCalled();

        // 20 seconds left on a 5 minute token: inside the 30 second buffer
        await updateSession(await requestWithSessionToken(await generateTokenWithExpiry(20, 300)));
        expect(refreshSpy).toHaveBeenCalledTimes(1);
      });

      it('should respect a custom refreshBufferSeconds', async () => {
        const refreshSpy = vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
          accessToken: await generateTestToken(),
          refreshToken: 'new-refresh-token',
          user: mockSession.user,
        });

        // 90 seconds left is outside the default 60 second buffer, but inside a 120 second one
        const request = await requestWithSessionToken(await generateTokenWithExpiry(90));
        await updateSession(request, { refreshBufferSeconds: 120 });

        expect(refreshSpy).toHaveBeenCalledTimes(1);
      });

      it('should disable proactive refresh when refreshBufferSeconds is 0', async () => {
        const refreshSpy = vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken');

        const accessToken = await generateTokenWithExpiry(5);
        const request = await requestWithSessionToken(accessToken);
        const response = await updateSession(request, { refreshBufferSeconds: 0 });

        expect(refreshSpy).not.toHaveBeenCalled();
        expect(response.session.accessToken).toBe(accessToken);
      });

      it('should serve the request with the still-valid token when a proactive refresh fails', async () => {
        const mockErrorCallback = vi.fn();
        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('Refresh failed'));

        const accessToken = await generateTokenWithExpiry(30);
        const request = await requestWithSessionToken(accessToken);
        const response = await updateSession(request, { debug: true, onSessionRefreshError: mockErrorCallback });

        expect(response.session.user).toBeDefined();
        expect(response.session.accessToken).toBe(accessToken);
        expect(response.authorizationUrl).toBeUndefined();
        // The session cookie must not be deleted while the access token is still valid
        expect(response.headers.getSetCookie().some((c) => c.startsWith('wos-session=;'))).toBe(false);
        expect(mockErrorCallback).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(
          'Proactive refresh failed. Serving request with the still-valid access token.',
          expect.any(Error),
        );
      });

      it('should delete the session when a proactive refresh fails and the token expired during the attempt', async () => {
        const mockErrorCallback = vi.fn();
        const accessToken = await generateTokenWithExpiry(30);
        const request = await requestWithSessionToken(accessToken);

        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockImplementation(async () => {
          // The token runs out while the refresh round trip is in flight
          vi.useFakeTimers();
          vi.setSystemTime(Date.now() + 31_000);
          throw new Error('Refresh failed');
        });

        try {
          const response = await updateSession(request, { debug: true, onSessionRefreshError: mockErrorCallback });

          expect(response.session.user).toBeNull();
          expect(response.authorizationUrl).toBeDefined();
          expect(response.headers.getSetCookie().some((c) => c.startsWith('wos-session=;'))).toBe(true);
          expect(mockErrorCallback).toHaveBeenCalledTimes(1);
          expect(console.log).toHaveBeenCalledWith('Failed to refresh. Deleting cookie.', expect.any(Error));
        } finally {
          vi.useRealTimers();
        }
      });

      it('should call onSessionRefreshSuccess when a proactive refresh succeeds', async () => {
        const mockSuccessCallback = vi.fn();
        const newAccessToken = await generateTestToken();
        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
          accessToken: newAccessToken,
          refreshToken: 'new-refresh-token',
          user: mockSession.user,
        });

        const request = await requestWithSessionToken(await generateTokenWithExpiry(30));
        await updateSession(request, { onSessionRefreshSuccess: mockSuccessCallback });

        expect(mockSuccessCallback).toHaveBeenCalledTimes(1);
        expect(mockSuccessCallback).toHaveBeenCalledWith(
          expect.objectContaining({ accessToken: newAccessToken, user: mockSession.user }),
        );
      });

      it('should thread refreshBufferSeconds through updateSessionMiddleware', async () => {
        const refreshSpy = vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
          accessToken: await generateTestToken(),
          refreshToken: 'new-refresh-token',
          user: mockSession.user,
        });

        // 90 seconds left is outside the default 60 second buffer, but inside a 120 second one
        const request = await requestWithSessionToken(await generateTokenWithExpiry(90));
        const result = await updateSessionMiddleware(
          request,
          false,
          {
            enabled: false,
            unauthenticatedPaths: [],
          },
          process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI as string,
          [],
          false,
          120,
        );

        expect(refreshSpy).toHaveBeenCalledTimes(1);
        expect(result.status).toBe(200);
      });
    });
  });

  describe('refreshSession', () => {
    it('should refresh session successfully', async () => {
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: await generateTestToken(),
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      vi.spyOn(workos.userManagement, 'getJwksUrl').mockReturnValue(
        'https://api.workos.com/sso/jwks/client_1234567890',
      );

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

      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
        accessToken: await generateTestToken({ org_id: 'org_456' }),
        refreshToken: 'new-refresh-token',
        user: mockSession.user,
      });

      vi.spyOn(workos.userManagement, 'getJwksUrl').mockReturnValue(
        'https://api.workos.com/sso/jwks/client_1234567890',
      );

      const result = await refreshSession({ organizationId: 'org_456' });

      expect(result).toHaveProperty('user');
      expect(result.organizationId).toBe('org_456');
    });

    it('throws if authenticateWithRefreshToken fails with string', async () => {
      const nextCookies = await cookies();
      // Create a mock session with a valid JWT that includes org_id
      const mockSessionWithValidJWT = {
        ...mockSession,
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdfaWQiOiJvcmdfMTIzIn0.fake',
      };
      nextCookies.set(
        'wos-session',
        await sealData(mockSessionWithValidJWT, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue('fail');
      await expect(refreshSession({ ensureSignedIn: false })).rejects.toThrow('Failed to refresh session: fail');
    });

    it('throws if authenticateWithRefreshToken fails with error', async () => {
      const nextCookies = await cookies();
      // Create a mock session with a valid JWT that includes org_id
      const mockSessionWithValidJWT = {
        ...mockSession,
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdfaWQiOiJvcmdfMTIzIn0.fake',
      };
      nextCookies.set(
        'wos-session',
        await sealData(mockSessionWithValidJWT, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );
      vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('error'));
      await expect(refreshSession()).rejects.toThrow('Failed to refresh session: error');
    });
  });

  describe('getTokenClaims', () => {
    beforeEach(async () => {
      const nextCookies = await cookies();
      // @ts-expect-error - _reset is part of the mock
      nextCookies._reset();
      vi.clearAllMocks();
    });

    it('should return all token claims when accessToken is provided', async () => {
      const tokenPayload = {
        sub: 'user_123',
        org_id: 'org_123',
        role: 'admin',
        roles: ['admin'],
        permissions: ['read', 'write'],
        entitlements: ['feature_a'],
        feature_flags: ['device-authorization-grant'],
        department: 'engineering',
        level: 5,
        metadata: { theme: 'dark' },
      };
      const token = await generateTestToken(tokenPayload);

      const result = await getTokenClaims(token);

      expect(result).toMatchObject(tokenPayload);
    });

    it('should return empty object when no accessToken is provided and no session exists', async () => {
      const result = await getTokenClaims();

      expect(result).toEqual({});
    });

    it('should return all standard claims when token has only standard claims', async () => {
      const tokenPayload = {
        sub: 'user_123',
        org_id: 'org_123',
        role: 'admin',
        roles: ['admin'],
        permissions: ['read', 'write'],
        entitlements: ['feature_a'],
        feature_flags: ['device-authorization-grant'],
      };
      const token = await generateTestToken(tokenPayload);

      const result = await getTokenClaims(token);

      expect(result).toMatchObject(tokenPayload);
    });

    it('should return all claims including standard JWT claims', async () => {
      const customClaims = {
        customField: 'value',
        anotherCustom: 42,
      };
      const standardClaims = {
        aud: 'audience',
        sub: 'user_123',
        sid: 'session_123',
        org_id: 'org_123',
        role: 'admin',
        roles: ['admin'],
        permissions: ['read', 'write'],
        entitlements: ['feature_a'],
        feature_flags: ['device-authorization-grant'],
        jti: 'jwt_123',
      };
      const token = await generateTestToken({ ...standardClaims, ...customClaims });

      const result = await getTokenClaims(token);

      expect(result).toMatchObject({ ...standardClaims, ...customClaims });
      expect(result).toHaveProperty('exp');
      expect(result).toHaveProperty('iat');
      expect(result).toHaveProperty('iss');
    });

    it('should handle complex nested claims', async () => {
      const tokenPayload = {
        sub: 'user_123',
        org_id: 'org_123',
        metadata: {
          preferences: { theme: 'dark', language: 'en' },
          settings: ['setting1', 'setting2'],
        },
        tags: ['tag1', 'tag2'],
        permissions_custom: { read: true, write: false },
      };
      const token = await generateTestToken(tokenPayload);

      const result = await getTokenClaims(token);

      expect(result).toMatchObject(tokenPayload);
    });
  });

  describe('checkRecentAuth', () => {
    async function authenticate(authTime?: number) {
      mockSession.accessToken = await generateTestToken(authTime === undefined ? {} : { auth_time: authTime });
      const nextHeaders = await headers();
      nextHeaders.set(
        'x-workos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );
    }

    it('reports recent auth as not stale', async () => {
      const now = Math.floor(Date.now() / 1000);
      await authenticate(now - 60);

      const result = await checkRecentAuth({ maxAge: 300 });

      expect(result.isStale).toBe(false);
      expect(result.authenticatedAt).toEqual(new Date((now - 60) * 1000));
    });

    it('reports stale auth past maxAge', async () => {
      const now = Math.floor(Date.now() / 1000);
      await authenticate(now - 600);

      expect((await checkRecentAuth({ maxAge: 300 })).isStale).toBe(true);
    });

    it('fails closed when auth_time claim is missing', async () => {
      await authenticate(undefined);

      expect(await checkRecentAuth({ maxAge: 300 })).toEqual({ authenticatedAt: null, isStale: true });
    });

    it('fails closed when there is no authenticated user', async () => {
      expect(await checkRecentAuth({ maxAge: 300 })).toEqual({ authenticatedAt: null, isStale: true });
    });
  });

  describe('eager auth functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('isInitialDocumentRequest', () => {
      // Since this is not exported, we'll test it indirectly through updateSession
      it('should set JWT cookie on initial page load with eagerAuth enabled', async () => {
        const validAccessToken = await generateTestToken();
        const sessionWithValidToken = { ...mockSession, accessToken: validAccessToken };

        const request = new NextRequest(new URL('http://example.com/page'));
        request.headers.set('accept', 'text/html,application/xhtml+xml');

        request.cookies.set(
          'wos-session',
          await sealData(sessionWithValidToken, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should have JWT cookie in response headers
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookie = setCookieHeaders.find((header) => header.includes('workos-access-token='));
        expect(jwtCookie).toBeDefined();
        expect(jwtCookie).toContain(`workos-access-token=${validAccessToken}`);
      });

      it('should not set JWT cookie for API requests even with eagerAuth', async () => {
        const validAccessToken = await generateTestToken();
        const sessionWithValidToken = { ...mockSession, accessToken: validAccessToken };

        const request = new NextRequest(new URL('http://example.com/api/data'));
        request.headers.set('accept', 'application/json');

        request.cookies.set(
          'wos-session',
          await sealData(sessionWithValidToken, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should NOT have JWT cookie in response headers
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookie = setCookieHeaders.find((header) => header.includes('workos-access-token='));
        expect(jwtCookie).toBeUndefined();
      });

      it('should not set JWT cookie for RSC requests', async () => {
        const validAccessToken = await generateTestToken();
        const sessionWithValidToken = { ...mockSession, accessToken: validAccessToken };

        const request = new NextRequest(new URL('http://example.com/page'));
        request.headers.set('accept', 'text/html');
        request.headers.set('RSC', '1');

        request.cookies.set(
          'wos-session',
          await sealData(sessionWithValidToken, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should NOT have JWT cookie for RSC requests
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookie = setCookieHeaders.find((header) => header.includes('workos-access-token='));
        expect(jwtCookie).toBeUndefined();
      });

      it('should not set JWT cookie for prefetch requests', async () => {
        const validAccessToken = await generateTestToken();
        const sessionWithValidToken = { ...mockSession, accessToken: validAccessToken };

        const request = new NextRequest(new URL('http://example.com/page'));
        request.headers.set('accept', 'text/html');
        request.headers.set('Purpose', 'prefetch');

        request.cookies.set(
          'wos-session',
          await sealData(sessionWithValidToken, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should NOT have JWT cookie for prefetch requests
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookie = setCookieHeaders.find((header) => header.includes('workos-access-token='));
        expect(jwtCookie).toBeUndefined();
      });
    });

    describe('JWT cookie management during session refresh', () => {
      it('should set JWT cookie after successful session refresh', async () => {
        // Setup invalid session that needs refresh
        mockSession.accessToken = await generateTestToken({}, true);

        (jwtVerify as Mock).mockImplementation(() => {
          throw new Error('Invalid token');
        });

        const newAccessToken = await generateTestToken();
        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockResolvedValue({
          accessToken: newAccessToken,
          refreshToken: 'new-refresh-token',
          user: mockSession.user,
        });

        const request = new NextRequest(new URL('http://example.com/page'));
        request.headers.set('accept', 'text/html');
        request.cookies.set(
          'wos-session',
          await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should set JWT cookie with new token after refresh
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookie = setCookieHeaders.find((header) => header.includes('workos-access-token='));
        expect(jwtCookie).toBeDefined();
        expect(jwtCookie).toContain(`workos-access-token=${newAccessToken}`);
      });

      it('should delete JWT cookie when session refresh fails', async () => {
        // Setup invalid session
        mockSession.accessToken = await generateTestToken({}, true);

        (jwtVerify as Mock).mockImplementation(() => {
          throw new Error('Invalid token');
        });

        vi.spyOn(workos.userManagement, 'authenticateWithRefreshToken').mockRejectedValue(new Error('Refresh failed'));

        const request = new NextRequest(new URL('http://example.com/page'));
        request.headers.set('accept', 'text/html');
        request.cookies.set(
          'wos-session',
          await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should delete JWT cookie on refresh failure
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtDeleteCookie = setCookieHeaders.find(
          (header) => header.includes('workos-access-token=') && header.includes('Max-Age=0'),
        );
        expect(jwtDeleteCookie).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should handle requests with no accept header', async () => {
        const validAccessToken = await generateTestToken();
        const sessionWithValidToken = { ...mockSession, accessToken: validAccessToken };

        const request = new NextRequest(new URL('http://example.com/page'));
        // Don't set accept header to test the || '' fallback (line 37)

        request.cookies.set(
          'wos-session',
          await sealData(sessionWithValidToken, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Without accept header, should not be treated as document request
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookie = setCookieHeaders.find((header) => header.includes('workos-access-token='));
        expect(jwtCookie).toBeUndefined();
      });

      it('should not set duplicate JWT cookie if one already exists with same value', async () => {
        const validAccessToken = await generateTestToken();
        const sessionWithValidToken = { ...mockSession, accessToken: validAccessToken };

        const request = new NextRequest(new URL('http://example.com/page'));
        request.headers.set('accept', 'text/html');

        // Set existing JWT cookie with same value
        request.cookies.set('workos-access-token', validAccessToken);

        request.cookies.set(
          'wos-session',
          await sealData(sessionWithValidToken, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        const result = await updateSession(request, { eagerAuth: true });

        // Should NOT set another JWT cookie since one exists with same value (line 192 condition)
        const setCookieHeaders = result.headers.getSetCookie();
        const jwtCookies = setCookieHeaders.filter((header) => header.includes('workos-access-token='));
        expect(jwtCookies).toHaveLength(0); // No new JWT cookie should be set
      });

      it('should handle saveSession with string URL parameter', async () => {
        const { saveSession } = await import('./session.js');

        const sessionData = {
          accessToken: await generateTestToken(),
          refreshToken: 'test-refresh-token',
          user: mockSession.user,
        };

        // Test with string URL (line 545: typeof request === 'string')
        await expect(saveSession(sessionData, 'https://example.com/callback')).resolves.not.toThrow();
      });
    });
  });
});
