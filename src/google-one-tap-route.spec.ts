import { NextRequest } from 'next/server';
import { getAuthorizationUrl } from './get-authorization-url.js';
import { handleGoogleOneTap } from './google-one-tap-route.js';
import { getPKCECookieNameForState } from './pkce.js';
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

type RequestOptions = {
  csrfCookie?: string | null;
  csrfBody?: string | null;
  credential?: string | null;
};

const request = ({
  csrfCookie = 'csrf-token',
  csrfBody = 'csrf-token',
  credential = 'google-id-token',
}: RequestOptions = {}) => {
  const headers: Record<string, string> = {
    accept: 'text/html',
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': 'Mozilla/5.0',
    'x-forwarded-for': '203.0.113.42, 10.0.0.1',
  };
  if (csrfCookie !== null) headers.cookie = `g_csrf_token=${csrfCookie}`;

  const body = new URLSearchParams();
  if (credential !== null) body.set('credential', credential);
  if (csrfBody !== null) body.set('g_csrf_token', csrfBody);

  return new NextRequest('https://example.com/auth/google-one-tap', {
    method: 'POST',
    headers,
    body,
  });
};

describe('handleGoogleOneTap', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
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
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.com/dashboard?from=one-tap');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('uses baseURL for the success redirect', async () => {
    fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken.mockResolvedValue(authenticationResponse);

    const response = await handleGoogleOneTap({ baseURL: 'https://public.example.com', returnPathname: '/dashboard' })(
      request(),
    );

    expect(response.headers.get('location')).toBe('https://public.example.com/dashboard');
  });

  it('rejects an invalid baseURL before handling requests', () => {
    expect(() => handleGoogleOneTap({ baseURL: 'invalid-url' })).toThrow('Invalid baseURL: invalid-url');
  });

  it('rejects a mismatched CSRF token before authentication', async () => {
    const response = await handleGoogleOneTap()(request({ csrfCookie: 'cookie', csrfBody: 'body' }));

    expect(response.status).toBe(400);
    expect(fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('rejects a missing CSRF cookie before authentication', async () => {
    const response = await handleGoogleOneTap()(request({ csrfCookie: null }));

    expect(response.status).toBe(400);
    expect(fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken).not.toHaveBeenCalled();
  });

  it('rejects a missing credential before authentication', async () => {
    const response = await handleGoogleOneTap()(request({ credential: null }));

    expect(response.status).toBe(400);
    expect(fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken).not.toHaveBeenCalled();
  });

  it('sets the PKCE cookie before falling back to Hosted AuthKit', async () => {
    fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken.mockRejectedValue(new Error('MFA required'));

    const response = await handleGoogleOneTap({ returnPathname: '/dashboard' })(request());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://auth.example.com/authorize');
    expect(response.headers.get('set-cookie')).toContain(`${getPKCECookieNameForState('sealed-state')}=sealed-state`);
    expect(getAuthorizationUrl).toHaveBeenCalledWith({ returnPathname: '/dashboard' });
    expect(saveSession).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[AuthKit Google One Tap error]', expect.any(Error));
  });

  it('uses onError instead of the Hosted AuthKit fallback when provided', async () => {
    const error = new Error('Authentication failed');
    fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken.mockRejectedValue(error);
    const onError = vi.fn(() => new Response('custom error', { status: 418 }));

    const response = await handleGoogleOneTap({ onError })(request());

    expect(response.status).toBe(418);
    expect(onError).toHaveBeenCalledWith({ error, request: expect.any(NextRequest) });
    expect(getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('surfaces an unsupported Node SDK instead of silently falling back', async () => {
    const authenticateWithGoogleIdToken = fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken;
    Object.assign(fakeWorkosInstance.userManagement, { authenticateWithGoogleIdToken: undefined });

    try {
      await expect(handleGoogleOneTap()(request())).rejects.toThrow(
        '@workos-inc/node 10.12 or newer is required for Google One Tap.',
      );
    } finally {
      Object.assign(fakeWorkosInstance.userManagement, { authenticateWithGoogleIdToken });
    }

    expect(getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('does not turn an onSuccess failure into a second authentication flow', async () => {
    fakeWorkosInstance.userManagement.authenticateWithGoogleIdToken.mockResolvedValue(authenticationResponse);
    const error = new Error('Side effect failed');

    await expect(handleGoogleOneTap({ onSuccess: () => Promise.reject(error) })(request())).rejects.toThrow(error);

    expect(saveSession).toHaveBeenCalled();
    expect(getAuthorizationUrl).not.toHaveBeenCalled();
  });
});
