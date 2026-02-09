import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from './auth.js';
import * as session from './session.js';
import * as cache from 'next/cache';
import * as workosModule from './workos.js';

// These are mocked in vitest.setup.ts
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { generateSession, generateTestToken } from './test-helpers.js';
import { sealData } from 'iron-session';
import { getWorkOS } from './workos.js';

const workos = getWorkOS();

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof cache>('next/cache');
  return {
    ...actual,
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

// Create a fake WorkOS instance that will be used only in the "on error" tests
const fakeWorkosInstance = {
  userManagement: {
    authenticateWithRefreshToken: vi.fn(),
    getAuthorizationUrl: vi.fn(),
    getJwksUrl: vi.fn(() => 'https://api.workos.com/sso/jwks/client_1234567890'),
    getLogoutUrl: vi.fn(),
  },
};

const revalidatePath = vi.mocked(cache.revalidatePath);
const revalidateTag = vi.mocked(cache.revalidateTag);
// We'll only use these in the "on error" tests
const authenticateWithRefreshToken = fakeWorkosInstance.userManagement.authenticateWithRefreshToken;
const getAuthorizationUrl = fakeWorkosInstance.userManagement.getAuthorizationUrl;

vi.mock('../src/session', async () => {
  const actual = await vi.importActual<typeof session>('../src/session');

  return {
    ...actual,
    refreshSession: vi.fn(actual.refreshSession),
  };
});

describe('auth.ts', () => {
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
  });

  describe('getSignInUrl', () => {
    it('should return a valid URL', async () => {
      const url = await getSignInUrl();
      expect(url).toBeDefined();
      expect(() => new URL(url)).not.toThrow();
    });

    it('should use the organizationId if provided', async () => {
      const url = await getSignInUrl({ organizationId: 'org_123' });
      expect(url).toContain('organization_id=org_123');
      expect(url).toBeDefined();
      expect(() => new URL(url)).not.toThrow();
    });
  });

  it('should not include prompt when not specified for getSignInUrl', async () => {
    const url = await getSignInUrl();
    expect(url).not.toContain('prompt=');
  });

  it('should include prompt=consent when explicitly specified for getSignInUrl', async () => {
    const url = await getSignInUrl({ prompt: 'consent' });
    expect(url).toContain('prompt=consent');
  });

  describe('getSignUpUrl', () => {
    it('should return a valid URL', async () => {
      const url = await getSignUpUrl();
      expect(url).toBeDefined();
      expect(() => new URL(url)).not.toThrow();
    });
    it('should not include prompt when not specified for getSignUpUrl', async () => {
      const url = await getSignUpUrl();
      expect(url).not.toContain('prompt=');
    });

    it('should include prompt=consent when explicitly specified for getSignUpUrl', async () => {
      const url = await getSignUpUrl({ prompt: 'consent' });
      expect(url).toContain('prompt=consent');
    });
  });

  describe('switchToOrganization', () => {
    it('should refresh the session with the new organizationId', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'http://localhost/test');
      await switchToOrganization('org_123');
      expect(revalidatePath).toHaveBeenCalledWith('http://localhost/test');
    });

    it('should revalidate the path and refresh the session with the new organizationId', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'http://localhost/test');
      await switchToOrganization('org_123', { returnTo: '/test' });
      expect(session.refreshSession).toHaveBeenCalledTimes(1);
      expect(session.refreshSession).toHaveBeenCalledWith({ organizationId: 'org_123', ensureSignedIn: true });
      expect(revalidatePath).toHaveBeenCalledWith('/test');
    });

    it('should revalidate the provided tags and refresh the session with the new organizationId', async () => {
      const nextHeaders = await headers();
      nextHeaders.set('x-url', 'http://localhost/test');
      await switchToOrganization('org_123', { revalidationStrategy: 'tag', revalidationTags: ['tag1', 'tag2'] });
      expect(revalidateTag).toHaveBeenCalledTimes(2);
    });

    describe('on error', () => {
      beforeEach(async () => {
        const nextHeaders = await headers();
        nextHeaders.set('x-url', 'http://localhost/test');
        await generateSession();

        // Create a WorkOS-like object that matches what our tests need
        const mockWorkOS = {
          userManagement: fakeWorkosInstance.userManagement,
          // Add minimal properties to satisfy TypeScript
          createHttpClient: vi.fn(),
          createWebhookClient: vi.fn(),
          createActionsClient: vi.fn(),
          createIronSessionProvider: vi.fn(),
          apiKey: 'test',
          clientId: 'test',
          host: 'test',
          port: 443,
          protocol: 'https',
          headers: {},
          version: '0.0.0',
        };

        // Apply the mock for these tests only
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.spyOn(workosModule, 'getWorkOS').mockImplementation(() => mockWorkOS as any);
      });

      afterEach(() => {
        // Restore all mocks after each test
        vi.restoreAllMocks();
      });

      it('should redirect to sign in when error is "sso_required"', async () => {
        authenticateWithRefreshToken.mockImplementation(() => {
          return Promise.reject({
            status: 500,
            requestID: 'sso_required',
            error: 'sso_required',
            errorDescription: 'User must authenticate using one of the matching connections.',
          });
        });

        await switchToOrganization('org_123');
        expect(getAuthorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_123' }));
        expect(redirect).toHaveBeenCalledTimes(1);
      });

      it('should redirect to sign in when error is "mfa_enrollment"', async () => {
        authenticateWithRefreshToken.mockImplementation(() => {
          return Promise.reject({
            status: 500,
            requestID: 'mfa_enrollment',
            error: 'mfa_enrollment',
            errorDescription: 'User must authenticate using one of the matching connections.',
          });
        });

        await switchToOrganization('org_123');
        expect(getAuthorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_123' }));
        expect(redirect).toHaveBeenCalledTimes(1);
      });

      it('should redirect to the authkit_redirect_url when provided', async () => {
        authenticateWithRefreshToken.mockImplementation(() => {
          return Promise.reject({
            rawData: {
              authkit_redirect_url: 'http://localhost/test',
            },
          });
        });
        await switchToOrganization('org_123');
        expect(redirect).toHaveBeenCalledWith('http://localhost/test');
      });

      it('throws other errors', async () => {
        authenticateWithRefreshToken.mockImplementation(() => {
          return Promise.reject(new Error('Fail'));
        });
        await expect(switchToOrganization('org_123')).rejects.toThrow('Fail');
      });
    });
  });

  describe('signOut', () => {
    it('should delete the cookie and redirect', async () => {
      const nextCookies = await cookies();
      const nextHeaders = await headers();

      nextHeaders.set('x-workos-middleware', 'true');
      nextCookies.set('wos-session', 'foo');

      await signOut();

      const sessionCookie = nextCookies.get('wos-session');

      expect(sessionCookie).toBeUndefined();
      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith('/');
    });

    it('should delete the cookie with a specific domain', async () => {
      const nextCookies = await cookies();
      const nextHeaders = await headers();

      nextHeaders.set('x-workos-middleware', 'true');
      nextCookies.set('wos-session', 'foo', { domain: 'example.com' });

      await signOut();

      const sessionCookie = nextCookies.get('wos-session');
      expect(sessionCookie).toBeUndefined();
    });

    describe('when given a `returnTo` parameter', () => {
      it('passes the `returnTo` through to the `getLogoutUrl` call', async () => {
        vi.spyOn(workos.userManagement, 'getLogoutUrl').mockReturnValue(
          'https://user-management-logout.com/signed-out',
        );
        const mockSession = {
          accessToken: await generateTestToken(),
          sessionId: 'session_123',
        } as const;

        const nextHeaders = await headers();
        nextHeaders.set(
          'x-workos-session',
          await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
        );

        nextHeaders.set('x-workos-middleware', 'true');

        await signOut({ returnTo: 'https://example.com/signed-out' });

        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith('https://user-management-logout.com/signed-out');
        expect(workos.userManagement.getLogoutUrl).toHaveBeenCalledWith(
          expect.objectContaining({
            returnTo: 'https://example.com/signed-out',
          }),
        );
      });

      describe('when there is no session', () => {
        it('returns to the `returnTo`', async () => {
          const nextHeaders = await headers();

          nextHeaders.set('x-workos-middleware', 'true');

          await signOut({ returnTo: 'https://example.com/signed-out' });

          expect(redirect).toHaveBeenCalledTimes(1);
          expect(redirect).toHaveBeenCalledWith('https://example.com/signed-out');
        });
      });
    });

    describe('when called outside of middleware', () => {
      it('should fall back to reading session from cookie and redirect to logout URL', async () => {
        const nextCookies = await cookies();

        // Don't set x-workos-middleware header to simulate being outside middleware
        // This will cause withAuth to throw

        // Set up a session cookie with a valid access token
        const mockSession = {
          accessToken: await generateTestToken(),
          refreshToken: 'refresh_token',
          user: { id: 'user_123' },
        };

        const encryptedSession = await sealData(mockSession, {
          password: process.env.WORKOS_COOKIE_PASSWORD as string,
        });

        nextCookies.set('wos-session', encryptedSession);

        vi.spyOn(workos.userManagement, 'getLogoutUrl').mockReturnValue(
          'https://api.workos.com/user_management/sessions/logout?session_id=session_123',
        );

        await signOut();

        // Cookie should be deleted
        const sessionCookie = nextCookies.get('wos-session');
        expect(sessionCookie).toBeUndefined();

        // Should redirect to WorkOS logout URL with session ID
        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith(
          'https://api.workos.com/user_management/sessions/logout?session_id=session_123',
        );
        expect(workos.userManagement.getLogoutUrl).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: expect.stringMatching(/^session_/),
          }),
        );
      });

      it('should throw the original error when no session cookie exists outside middleware', async () => {
        const nextCookies = await cookies();

        // Don't set x-workos-middleware header to simulate being outside middleware
        // Set a cookie to verify it gets deleted
        nextCookies.set('wos-session', 'dummy-value');

        // Should throw the error from withAuth since we can't recover
        await expect(signOut()).rejects.toThrow(/You are calling 'withAuth'/);

        // Cookie should still be deleted even though it throws
        const sessionCookie = nextCookies.get('wos-session');
        expect(sessionCookie).toBeUndefined();
      });
    });
  });
});
