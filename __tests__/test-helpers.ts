import { sealData } from 'iron-session';
import { SignJWT } from 'jose';
import { WORKOS_COOKIE_NAME, WORKOS_COOKIE_PASSWORD } from '../src/env-variables.js';
import { cookies } from 'next/headers';
import { User } from '@workos-inc/node';

export async function generateTestToken(payload = {}, expired = false) {
  const defaultPayload = {
    sid: 'session_123',
    org_id: 'org_123',
    role: 'member',
    permissions: ['posts:create', 'posts:delete'],
    entitlements: ['audit-logs'],
  };

  const mergedPayload = { ...defaultPayload, ...payload };

  const secret = new TextEncoder().encode(process.env.WORKOS_COOKIE_PASSWORD as string);

  const token = await new SignJWT(mergedPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('urn:example:issuer')
    .setExpirationTime(expired ? '0s' : '2h')
    .sign(secret);

  return token;
}

export async function generateSession(overrides: Partial<User> = {}) {
  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    emailVerified: true,
    profilePictureUrl: null,
    firstName: 'Test',
    lastName: 'User',
    object: 'user',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } satisfies User;

  const accessToken = await generateTestToken({
    sid: 'session_123',
    org_id: 'org_123',
  });

  // Create and set a session cookie
  const encryptedSession = await sealData(
    {
      accessToken,
      refreshToken: 'refresh_token_123',
      user: mockUser,
    },
    {
      password: WORKOS_COOKIE_PASSWORD as string,
    },
  );

  const cookieName = WORKOS_COOKIE_NAME || 'wos-session';
  const nextCookies = await cookies();
  nextCookies.set(cookieName, encryptedSession);
}
