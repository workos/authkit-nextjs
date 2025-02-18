import { createWorkOSInstance } from '../src/workos.js';
import { handleAuth } from '../src/authkit-callback-route.js';
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
  createWorkOSInstance: jest.fn(() => fakeWorkosInstance),
}));

describe('authkit-callback-route', () => {
  const workos = createWorkOSInstance();
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
        onError: ({ error }) => {
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
    });
  });
});
