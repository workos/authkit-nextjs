import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getSignInUrl, getSignUpUrl, signOut, switchToOrganization } from '../src/auth.js';
import * as session from '../src/session.js';
import * as cache from 'next/cache';

// These are mocked in jest.setup.ts
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

jest.mock('next/cache', () => {
  const actual = jest.requireActual<typeof cache>('next/cache');
  return {
    ...actual,
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
  };
});

const revalidatePath = jest.mocked(cache.revalidatePath);
const revalidateTag = jest.mocked(cache.revalidateTag);

jest.mock('../src/session', () => {
  const actual = jest.requireActual<typeof session>('../src/session');

  return {
    ...actual,
    refreshSession: jest.fn(actual.refreshSession),
    terminateSession: jest.fn(actual.terminateSession),
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
      it('passes the `returnTo` through to `terminateSession`', async () => {
        const nextHeaders = await headers();

        nextHeaders.set('x-workos-middleware', 'true');

        await signOut({ returnTo: 'https://example.com/signed-out' });

        expect(redirect).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith('https://example.com/signed-out');
        expect(session.terminateSession).toHaveBeenCalledWith({ returnTo: 'https://example.com/signed-out' });
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
