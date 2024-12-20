import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getSignInUrl, getSignUpUrl, signOut } from '../src/auth.js';

// These are mocked in jest.setup.ts
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

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
  });
});
