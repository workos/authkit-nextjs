import { NextRequest } from 'next/server';
import { handleGoogleOneTap } from './google-one-tap-route.js';
import { saveSession } from './session.js';

const { fakeWorkosInstance } = vi.hoisted(() => ({
  fakeWorkosInstance: {
    userManagement: {
      authenticateWithGoogleIdToken: vi.fn(),
    },
  },
}));

vi.mock('./workos', () => ({
  getWorkOS: vi.fn(() => fakeWorkosInstance),
}));

vi.mock('./session', () => ({
  saveSession: vi.fn(),
}));

vi.mock('./get-authorization-url', () => ({
  getAuthorizationUrl: vi.fn().mockResolvedValue({
    url: 'https://auth.example.com/authorize',
    sealedState: 'sealed-state',
  }),
}));

const authenticationResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    id: 'user_123',
    email: 'ada@example.com',
    emailVerified: true,
    profilePictureUrl: null,
    name: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    object: 'user' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastSignInAt: '2024-01-01T00:00:00Z',
    externalId: null,
    metadata: {},
    locale: null,
  },
};

const request = (csrfCookie = 'csrf-token', csrfBody = 'csrf-token') =>
  new NextRequest('https://example.com/auth/google-one-tap', {
    method: 'POST',
    headers: {
      cookie: `g_csrf_token=${csrfCookie}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '203.0.113.42, 10.0.0.1',
    },
    body: new URLSearchParams({
      credential: 'google-id-token',
      g_csrf_token: csrfBody,
    }),
  });

describe('handleGoogleOneTap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates CSRF, authenticates, saves the session, and redirects', async () => {
    fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken.mockResolvedValue(authenticationResponse);
    const onSuccess = vi.fn();

    const response = await handleGoogleOneTap({
      returnPathname: '/dashboard?from=one-tap',
      onSuccess,
    })(request());

    expect(fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken).toHaveBeenCalledWith({
      clientId: process.env.WORKOS_CLIENT_ID,
      token: 'google-id-token',
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0',
    });
    expect(saveSession).toHaveBeenCalledWith(authenticationResponse, expect.any(NextRequest));
    expect(onSuccess).toHaveBeenCalledWith(authenticationResponse);
    expect(response.headers.get('location')).toBe('https://example.com/dashboard?from=one-tap');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects a mismatched CSRF token before authentication', async () => {
    const response = await handleGoogleOneTap()(request('cookie', 'body'));

    expect(response.status).toBe(400);
    expect(fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('falls back to Hosted AuthKit when One Tap cannot complete', async () => {
    fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken.mockRejectedValue(new Error('MFA required'));

    const response = await handleGoogleOneTap({ returnPathname: '/dashboard' })(request());

    expect(response.headers.get('location')).toBe('https://auth.example.com/authorize');
    expect(saveSession).not.toHaveBeenCalled();
  });
});
