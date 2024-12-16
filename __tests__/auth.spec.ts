import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getSignInUrl, getSignUpUrl, signOut } from '../src/auth.js';
import { workos } from '../src/workos.js';

// These are mocked in jest.setup.ts
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sealData } from 'iron-session';
import { generateTestToken } from './test-helpers.js';
import { User } from '@workos-inc/node';

// jest.mock('../src/workos', () => ({
//   workos: {
//     userManagement: {
//       getLogoutUrl: jest.fn().mockReturnValue('https://example.com/logout'),
//       getJwksUrl: jest.fn().mockReturnValue('https://api.workos.com/sso/jwks/client_1234567890'),
//     },
//   },
// }));

describe('auth.ts', () => {
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

  describe('signOut', () => {
    it('should delete the cookie and redirect to the logout url if there is a session', async () => {
      const nextCookies = await cookies();
      const nextHeaders = await headers();

      mockSession.accessToken = await generateTestToken();

      nextHeaders.set('x-workos-middleware', 'true');
      nextHeaders.set(
        'x-workos-session',
        await sealData(mockSession, { password: process.env.WORKOS_COOKIE_PASSWORD as string }),
      );

      nextCookies.set('wos-session', 'foo');

      jest.spyOn(workos.userManagement, 'getLogoutUrl').mockReturnValue('https://example.com/logout');

      await signOut();

      const sessionCookie = nextCookies.get('wos-session');

      expect(sessionCookie).toBeUndefined();
      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith('https://example.com/logout');
    });

    it('should delete the cookie and redirect to the root path if there is no session', async () => {
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
  });
});
