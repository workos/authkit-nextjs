import { describe, expect, it } from 'vitest';
import { decideAuthBootstrap, sanitizeReturnTo } from './auth-context';
import type { UserInfo } from '@workos-inc/authkit-nextjs';
import type { MemberRecord } from './member-store';

const baseAuth: UserInfo = {
  user: {
    id: 'user_demo_admin',
    object: 'user',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    lastSignInAt: null,
    locale: null,
    externalId: null,
    metadata: {},
    emailVerified: true,
    profilePictureUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  sessionId: 'session_123',
  accessToken: 'token',
  organizationId: 'org_demo',
};

describe('sanitizeReturnTo', () => {
  it('accepts safe relative paths', () => {
    expect(sanitizeReturnTo('/account?tab=security')).toBe('/account?tab=security');
  });

  it('rejects absolute URLs', () => {
    expect(sanitizeReturnTo('https://evil.example')).toBe('/');
  });

  it('rejects scheme-relative URLs', () => {
    expect(sanitizeReturnTo('//evil.example/path')).toBe('/');
  });

  it('rejects auth callback and auth entrypoint loops', () => {
    expect(sanitizeReturnTo('/sign-in?returnTo=/account')).toBe('/');
    expect(sanitizeReturnTo('/auth/callback')).toBe('/');
  });
});

describe('decideAuthBootstrap', () => {
  it('redirects to sign-in when auth has no organization', async () => {
    const decision = await decideAuthBootstrap({
      auth: { ...baseAuth, organizationId: undefined },
      returnTo: '/account',
      resolveMember: async () => null,
    });

    expect(decision).toEqual({ kind: 'redirect', to: '/sign-in?returnTo=%2Faccount' });
  });

  it('redirects to access denied when member mapping is missing', async () => {
    const decision = await decideAuthBootstrap({
      auth: baseAuth,
      returnTo: '/account',
      resolveMember: async () => null,
    });

    expect(decision).toEqual({ kind: 'redirect', to: '/access-denied?reason=no_member' });
  });

  it('returns typed app auth context when member exists', async () => {
    const member: MemberRecord = {
      id: 'member_demo_admin',
      organizationId: 'org_demo',
      workosUserId: 'user_demo_admin',
      email: 'admin@example.com',
      role: 'admin',
    };

    const decision = await decideAuthBootstrap({
      auth: baseAuth,
      returnTo: '/account',
      resolveMember: async () => member,
    });

    expect(decision).toEqual({
      kind: 'ok',
      context: {
        memberId: 'member_demo_admin',
        organizationId: 'org_demo',
        role: 'admin',
        workosUserId: 'user_demo_admin',
      },
    });
  });

  it('propagates repository failures', async () => {
    await expect(
      decideAuthBootstrap({
        auth: baseAuth,
        returnTo: '/account',
        resolveMember: async () => {
          throw new Error('db unavailable');
        },
      }),
    ).rejects.toThrow('db unavailable');
  });
});
