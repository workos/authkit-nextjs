import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from '../src/auth.js';
import * as session from '../src/session.js';
import * as cache from 'next/cache.js';
import * as workosModule from '../src/workos.js';

// These are mocked in jest.setup.ts
import { cookies, headers } from 'next/headers.js';
import { redirect } from 'next/navigation.js';
import { generateSession, generateTestToken } from './test-helpers.js';
import { sealData } from 'iron-session';
import { getWorkOS } from '../src/workos.js';

const workos = getWorkOS();

jest.mock('next/cache.js', () => {
  const actual = jest.requireActual<typeof cache>('next/cache.js');
  return {
    ...actual,
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
  };
});

// Create a fake WorkOS instance that will be used only in the "on error" tests
const fakeWorkosInstance = {
  userManagement: {
    authenticateWithRefreshToken: jest.fn(),
    getAuthorizationUrl: jest.fn(),
    getJwksUrl: jest.fn(() => 'https://api.workos.com/sso/jwks/client_1234567890'),
    getLogoutUrl: jest.fn(),
  },
};

const revalidatePath = jest.mocked(cache.revalidatePath);
const revalidateTag = jest.mocked(cache.revalidateTag);
// We'll only use these in the "on error" tests
const authenticateWithRefreshToken = fakeWorkosInstance.userManagement.authenticateWithRefreshToken;
const getAuthorizationUrl = fakeWorkosInstance.userManagement.getAuthorizationUrl;

jest.mock('../src/session', () => {
  const actual = jest.requireActual<typeof session>('../src/session');

  return {
    ...actual,
    refreshSession: jest.fn(actual.refreshSession),
  };
});

describe('auth.ts', () => {
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

  describe('getSignUpUrl', () => {
    it('should return a valid URL', async () => {
      const url = await getSignUpUrl();
      expect(url).toBeDefined();
      expect(() => new URL(url)).not.toThrow();
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
          createHttpClient: jest.fn(),
          createWebhookClient: jest.fn(),
          createActionsClient: jest.fn(),
          createIronSessionProvider: jest.fn(),
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
        jest.spyOn(workosModule, 'getWorkOS').mockImplementation(() => mockWorkOS as any);
      });

      afterEach(() => {
        // Restore all mocks after each test
        jest.restoreAllMocks();
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
        jest
          .spyOn(workos.userManagement, 'getLogoutUrl')
          .mockReturnValue('https://user-management-logout.com/signed-out');
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
  });
});
