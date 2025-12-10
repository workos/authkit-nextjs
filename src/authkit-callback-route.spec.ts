import { getWorkOS } from './workos.js';
import { handleAuth } from './authkit-callback-route.js';
import { getSessionFromCookie, saveSession } from './session.js';
import { NextRequest, NextResponse } from 'next/server';

// Mocked in jest.setup.ts
import { cookies, headers } from 'next/headers';

// Mock dependencies
const fakeWorkosInstance = {
  userManagement: {
    authenticateWithCode: jest.fn(),
    getJwksUrl: jest.fn(() => 'https://api.workos.com/sso/jwks/client_1234567890'),
  },
};

jest.mock('../src/workos', () => ({
  getWorkOS: jest.fn(() => fakeWorkosInstance),
}));

describe('authkit-callback-route', () => {
  const workos = getWorkOS();
  const mockAuthResponse = {
    accessToken: 'access123',
    refreshToken: 'refresh123',
    user: {
      id: 'user_123',
      email: 'test@example.com',
      emailVerified: true,
      profilePictureUrl: 'https://example.com/photo.jpg',
      firstName: 'Test',
      lastName: 'User',
      object: 'user' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastSignInAt: '2024-01-01T00:00:00Z',
      externalId: null,
      metadata: {},
      locale: null,
    },
    oauthTokens: {
      accessToken: 'access123',
      refreshToken: 'refresh123',
      expiresAt: 1719811200,
      scopes: ['foo', 'bar'],
    },
  };

  describe('handleAuth', () => {
    let request: NextRequest;

    beforeAll(() => {
      // Silence console.error during tests
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    beforeEach(async () => {
      // Reset all mocks
      jest.clearAllMocks();

      // Create a new request with searchParams
      request = new NextRequest(new URL('http://example.com/callback'));

      // Reset the cookie store
      const nextCookies = await cookies();
      // @ts-expect-error - _reset is part of the mock
      nextCookies._reset();

      const nextHeaders = await headers();
      // @ts-expect-error - _reset is part of the mock
      nextHeaders._reset();
    });

    it('should handle successful authentication', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code
      request.nextUrl.searchParams.set('code', 'test-code');

      const handler = handleAuth();
      const response = await handler(request);

      expect(workos.userManagement.authenticateWithCode).toHaveBeenCalledWith({
        clientId: process.env.WORKOS_CLIENT_ID,
        code: 'test-code',
      });
      expect(response).toBeInstanceOf(NextResponse);
    });

    it('should handle authentication failure', async () => {
      // Mock authentication failure
      (workos.userManagement.authenticateWithCode as jest.Mock).mockRejectedValue(new Error('Auth failed'));

      request.nextUrl.searchParams.set('code', 'invalid-code');

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Something went wrong');
    });

    it('should handle authentication failure if a non-Error object is thrown', async () => {
      // Mock authentication failure
      jest.mocked(workos.userManagement.authenticateWithCode).mockRejectedValue('Auth failed');

      request.nextUrl.searchParams.set('code', 'invalid-code');

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Something went wrong');
    });

    it('should handle authentication failure with custom onError handler', async () => {
      // Mock authentication failure
      jest.mocked(workos.userManagement.authenticateWithCode).mockRejectedValue('Auth failed');
      request.nextUrl.searchParams.set('code', 'invalid-code');

      const handler = handleAuth({
        onError: () => {
          return new Response(JSON.stringify({ error: { message: 'Custom error' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      });
      const response = await handler(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Custom error');
    });

    it('should handle missing code parameter', async () => {
      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Something went wrong');
    });

    it('should respect custom returnPathname', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      request.nextUrl.searchParams.set('code', 'test-code');

      const handler = handleAuth({ returnPathname: '/dashboard' });
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('/dashboard');
    });

    it('should handle state parameter with returnPathname', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const state = btoa(JSON.stringify({ returnPathname: '/custom-path' }));
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', state);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('/custom-path');
    });

    it('should extract custom search params from returnPathname', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const state = btoa(JSON.stringify({ returnPathname: '/custom-path?foo=bar&baz=qux' }));
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', state);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('/custom-path?foo=bar&baz=qux');
    });

    it('should handle full URL in returnPathname by extracting only the pathname', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Simulate a case where returnPathname contains a full URL instead of just a pathname
      const state = btoa(JSON.stringify({ returnPathname: 'https://example.com/invite/k0123456789' }));
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', state);

      const handler = handleAuth();
      const response = await handler(request);

      const location = response.headers.get('Location');
      // Should redirect to the pathname only, not create a malformed URL
      expect(location).toContain('/invite/k0123456789');
      // Should NOT contain the full URL in the path
      expect(location).not.toContain('https://example.com/invite');
    });

    it('should use Response if NextResponse.redirect is not available', async () => {
      const originalRedirect = NextResponse.redirect;
      (NextResponse as Partial<typeof NextResponse>).redirect = undefined;

      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code
      request.nextUrl.searchParams.set('code', 'test-code');

      const handler = handleAuth();
      const response = await handler(request);

      expect(response).toBeInstanceOf(Response);

      // Restore the original redirect method
      (NextResponse as Partial<typeof NextResponse>).redirect = originalRedirect;
    });

    it('should use Response if NextResponse.json is not available', async () => {
      const originalJson = NextResponse.json;
      (NextResponse as Partial<typeof NextResponse>).json = undefined;

      const handler = handleAuth();
      const response = await handler(request);

      expect(response).toBeInstanceOf(Response);

      // Restore the original json method
      (NextResponse as Partial<typeof NextResponse>).json = originalJson;
    });

    it('should throw an error if baseURL is provided but invalid', async () => {
      expect(() => handleAuth({ baseURL: 'invalid-url' })).toThrow('Invalid baseURL: invalid-url');
    });

    it('should use baseURL if provided', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code
      request.nextUrl.searchParams.set('code', 'test-code');

      const handler = handleAuth({ baseURL: 'https://base.com' });
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('https://base.com');
    });

    it('should throw an error if response is missing tokens', async () => {
      const mockAuthResponse = {
        user: { id: 'user_123' },
      };

      (workos.userManagement.authenticateWithCode as jest.Mock).mockResolvedValue(mockAuthResponse);

      // Set up request with code
      request.nextUrl.searchParams.set('code', 'test-code');

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
    });

    it('should call onSuccess if provided', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code
      request.nextUrl.searchParams.set('code', 'test-code');

      const onSuccess = jest.fn();
      const handler = handleAuth({ onSuccess: onSuccess });
      await handler(request);

      expect(onSuccess).toHaveBeenCalledWith(mockAuthResponse);
      const session = await getSessionFromCookie();
      expect(session?.accessToken).toBe(mockAuthResponse.accessToken);
    });

    it('should allow onSuccess to update session', async () => {
      const newAccessToken = 'new-access-token';
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code
      request.nextUrl.searchParams.set('code', 'test-code');

      const handler = handleAuth({
        onSuccess: async (data) => {
          await saveSession({ ...data, accessToken: newAccessToken }, request);
        },
      });
      await handler(request);

      const session = await getSessionFromCookie();
      expect(session?.accessToken).toBe(newAccessToken);
    });

    it('should pass custom state data to onSuccess callback', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Create state with new format: internal.user
      const internalState = btoa(JSON.stringify({ returnPathname: '/dashboard' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const userState = 'custom-user-state-string';
      const state = `${internalState}.${userState}`;

      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', state);

      const onSuccess = jest.fn();
      const handler = handleAuth({ onSuccess });
      await handler(request);

      // Verify onSuccess was called with the custom state string
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockAuthResponse,
          state: 'custom-user-state-string',
        }),
      );

      // Verify the redirect went to the correct path
      const response = await handler(request);
      expect(response.headers.get('Location')).toContain('/dashboard');
    });

    it('should handle state without custom data', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // State with only returnPathname
      const state = btoa(JSON.stringify({ returnPathname: '/profile' }));

      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', state);

      const onSuccess = jest.fn();
      const handler = handleAuth({ onSuccess });
      await handler(request);

      // Verify onSuccess was called without state property when no custom data exists
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockAuthResponse,
          state: undefined,
        }),
      );
    });

    it('should handle backward compatibility with old state format', async () => {
      jest.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Old format: just returnPathname
      const state = btoa(JSON.stringify({ returnPathname: '/old-path' }));

      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', state);

      const handler = handleAuth();
      const response = await handler(request);

      // Should still redirect correctly
      expect(response.headers.get('Location')).toContain('/old-path');
    });
  });
});
