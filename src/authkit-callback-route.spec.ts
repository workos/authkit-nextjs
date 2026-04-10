import type { Mock } from 'vitest';
import { getWorkOS } from './workos.js';
import { handleAuth } from './authkit-callback-route.js';
import { getPKCECookieNameForState } from './pkce.js';
import { getSessionFromCookie, saveSession } from './session.js';
import { NextRequest, NextResponse } from 'next/server';
import { sealData } from 'iron-session';

// Mocked in vitest.setup.ts
import { cookies, headers } from 'next/headers';
import { State } from './interfaces.js';

// Mock dependencies
const { fakeWorkosInstance } = vi.hoisted(() => ({
  fakeWorkosInstance: {
    userManagement: {
      authenticateWithCode: vi.fn(),
      getJwksUrl: vi.fn(() => 'https://api.workos.com/sso/jwks/client_1234567890'),
    },
    pkce: {
      generate: vi.fn(),
    },
  },
}));

vi.mock('../src/workos', () => ({
  getWorkOS: vi.fn(() => fakeWorkosInstance),
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

  async function setAuthCookie(req: NextRequest, state: State): Promise<string> {
    const sealedState = await sealData(state, { password: process.env.WORKOS_COOKIE_PASSWORD! });
    req.cookies.set(getPKCECookieNameForState(sealedState), sealedState);
    return sealedState;
  }

  describe('handleAuth', () => {
    let request: NextRequest;

    beforeAll(() => {
      // Silence console.error during tests
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    beforeEach(async () => {
      // Reset all mocks
      vi.clearAllMocks();

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
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code & state
      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(workos.userManagement.authenticateWithCode).toHaveBeenCalledWith({
        clientId: process.env.WORKOS_CLIENT_ID,
        code: 'test-code',
        codeVerifier: 'test-verifier',
      });
      expect(response).toBeInstanceOf(NextResponse);
    });

    it('should handle authentication failure', async () => {
      (workos.userManagement.authenticateWithCode as Mock).mockRejectedValue(new Error('Auth failed'));

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'invalid-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Something went wrong');
    });

    it('should handle authentication failure if a non-Error object is thrown', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockRejectedValue('Auth failed');

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'invalid-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Something went wrong');
    });

    it('should handle authentication failure with custom onError handler', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockRejectedValue('Auth failed');

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'invalid-code');
      request.nextUrl.searchParams.set('state', sealedState);

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
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth({ returnPathname: '/dashboard' });
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('/dashboard');
    });

    it('should handle state parameter with returnPathname', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, {
        nonce: 'foo',
        codeVerifier: 'test-verifier',
        returnPathname: '/custom-path',
      });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('/custom-path');
    });

    it('should extract custom search params from returnPathname', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, {
        nonce: 'foo',
        codeVerifier: 'test-verifier',
        returnPathname: '/custom-path?foo=bar&baz=qux',
      });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('/custom-path?foo=bar&baz=qux');
    });

    it('should handle full URL in returnPathname by extracting only the pathname', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, {
        nonce: 'foo',
        codeVerifier: 'test-verifier',
        returnPathname: 'https://example.com/invite/k0123456789',
      });

      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      const location = response.headers.get('Location');
      expect(location).toContain('/invite/k0123456789');
      expect(location).not.toContain('https://example.com/invite');
    });

    it('should use Response if NextResponse.redirect is not available', async () => {
      const originalRedirect = NextResponse.redirect;
      (NextResponse as Partial<typeof NextResponse>).redirect = undefined;

      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response).toBeInstanceOf(Response);

      // Restore the original redirect method
      (NextResponse as Partial<typeof NextResponse>).redirect = originalRedirect;
    });

    it('should use Response if NextResponse.json is not available', async () => {
      const originalJson = NextResponse.json;
      (NextResponse as Partial<typeof NextResponse>).json = undefined;

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

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
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code & state
      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth({ baseURL: 'https://base.com' });
      const response = await handler(request);

      expect(response.headers.get('Location')).toContain('https://base.com');
    });

    it('should throw an error if response is missing tokens', async () => {
      const incompleteAuthResponse = {
        user: { id: 'user_123' },
      };

      (workos.userManagement.authenticateWithCode as Mock).mockResolvedValue(incompleteAuthResponse);

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      expect(response.status).toBe(500);
    });

    it('should call onSuccess if provided', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Set up request with code & state
      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const onSuccess = vi.fn();
      const handler = handleAuth({ onSuccess: onSuccess });
      await handler(request);

      expect(onSuccess).toHaveBeenCalledWith(mockAuthResponse);
      const session = await getSessionFromCookie();
      expect(session?.accessToken).toBe(mockAuthResponse.accessToken);
    });

    it('should allow onSuccess to update session', async () => {
      const newAccessToken = 'new-access-token';
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

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
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      const sealedState = await setAuthCookie(request, {
        nonce: 'foo',
        codeVerifier: 'test-verifier',
        returnPathname: '/dashboard',
        customState: 'custom-user-state-string',
      });

      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const onSuccess = vi.fn();
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
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // State with only returnPathname
      const sealedState = await setAuthCookie(request, {
        nonce: 'foo',
        codeVerifier: 'test-verifier',
        returnPathname: '/profile',
      });

      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const onSuccess = vi.fn();
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

    it('should NOT handle backward compatibility with old state format', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Old format: just returnPathname
      // @ts-expect-error we're purposely testing backward compatibility with an old format that doesn't match the current State interface
      const sealedState = await setAuthCookie(request, { returnPathname: '/old-path' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', sealedState);

      const handler = handleAuth();
      const response = await handler(request);

      // Should error
      expect(response.status).toBe(500);
      expect(workos.userManagement.authenticateWithCode).not.toHaveBeenCalled();
    });

    it('should not leak nonce-only state as custom state in onSuccess', async () => {
      vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

      // Simulate a nonce-only state (no returnPathname, no custom state)
      const nonceState = await setAuthCookie(request, { nonce: 'test-nonce', codeVerifier: 'test-verifier' });
      request.nextUrl.searchParams.set('code', 'test-code');
      request.nextUrl.searchParams.set('state', nonceState);

      const onSuccess = vi.fn();
      const handler = handleAuth({ onSuccess });
      await handler(request);

      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ state: undefined }));
    });

    describe('state verification', () => {
      it('should reject callback when state does not match stored state', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        const state = 'attacker-state';
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', state);
        await setAuthCookie(request, { nonce: 'legitimate-state', codeVerifier: 'test-verifier' });

        const handler = handleAuth();
        const response = await handler(request);

        expect(response.status).toBe(500);
        expect(workos.userManagement.authenticateWithCode).not.toHaveBeenCalled();
      });

      it('should reject when state is present but no cookie exists', async () => {
        const sealedState = await sealData(
          { nonce: 'foo', codeVerifier: 'test-verifier' },
          { password: process.env.WORKOS_COOKIE_PASSWORD! },
        );
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        const response = await handler(request);

        expect(workos.userManagement.authenticateWithCode).not.toHaveBeenCalled();
        expect(response.status).toBe(500);
      });

      it('should pass when state matches stored state', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier' });
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        const response = await handler(request);

        expect(workos.userManagement.authenticateWithCode).toHaveBeenCalled();
        expect(response.status).not.toBe(500);
      });

      it('should return 500 when neither state nor cookie exist', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        request.nextUrl.searchParams.set('code', 'test-code');

        const handler = handleAuth();
        const response = await handler(request);

        expect(workos.userManagement.authenticateWithCode).not.toHaveBeenCalled();
        expect(response.status).toBe(500);
      });
    });

    describe('PKCE', () => {
      it('should pass codeVerifier and verify state when both are in the cookie', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        const sealedState = await setAuthCookie(request, {
          codeVerifier: 'test-verifier-456',
          returnPathname: '/dashboard',
          nonce: 'foo',
        });
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        const response = await handler(request);

        expect(workos.userManagement.authenticateWithCode).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'test-code',
            codeVerifier: 'test-verifier-456',
          }),
        );
        expect(response.headers.get('Location')).toContain('/dashboard');
      });

      it('should pass codeVerifier from cookie to authenticateWithCode', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);
        const sealedState = await setAuthCookie(request, {
          nonce: 'foo',
          codeVerifier: 'test-verifier-123',
        });

        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        await handler(request);

        expect(workos.userManagement.authenticateWithCode).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'test-code',
            codeVerifier: 'test-verifier-123',
          }),
        );
      });

      it('should reject when cookie is missing even if state contains valid sealed data', async () => {
        const sealedState = await sealData(
          { nonce: 'foo', codeVerifier: 'test-verifier-123' },
          { password: process.env.WORKOS_COOKIE_PASSWORD! },
        );
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        const response = await handler(request);

        expect(workos.userManagement.authenticateWithCode).not.toHaveBeenCalled();
        expect(response.status).toBe(500);
      });

      it('should return an error response when PKCE cookie is corrupted', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        // Set a corrupted cookie using the flow-specific name
        const corruptedState = 'not-a-valid-sealed-value';
        request.cookies.set(getPKCECookieNameForState(corruptedState), corruptedState);
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', corruptedState);

        const handler = handleAuth();
        const response = await handler(request);

        expect(response.status).toBe(500);
        expect(workos.userManagement.authenticateWithCode).not.toHaveBeenCalled();
      });

      it('should delete PKCE cookie after successful authentication', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier-123' });
        request.nextUrl.searchParams.set('code', 'test-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        const response = await handler(request);

        // The response should be a redirect (success) and have a Set-Cookie header to delete the flow-specific PKCE cookie
        expect(response.status).toBe(307);

        const flowCookieName = getPKCECookieNameForState(sealedState);
        const setCookieHeaders = response.headers.getSetCookie();
        const pkceDeletionCookie = setCookieHeaders.find((c: string) => c.startsWith(`${flowCookieName}=`));
        expect(pkceDeletionCookie).toBeDefined();
        expect(pkceDeletionCookie).toContain('Max-Age=0');
      });

      it('should delete PKCE cookie after failed authentication', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockRejectedValue(new Error('Auth failed'));

        const sealedState = await setAuthCookie(request, { nonce: 'foo', codeVerifier: 'test-verifier-123' });
        request.nextUrl.searchParams.set('code', 'bad-code');
        request.nextUrl.searchParams.set('state', sealedState);

        const handler = handleAuth();
        const response = await handler(request);

        expect(response.status).toBe(500);
        const flowCookieName = getPKCECookieNameForState(sealedState);
        const setCookieHeaders = response.headers.getSetCookie();
        const pkceDeletionCookie = setCookieHeaders.find((c: string) => c.startsWith(`${flowCookieName}=`));
        expect(pkceDeletionCookie).toBeDefined();
        expect(pkceDeletionCookie).toContain('Max-Age=0');
      });

      it('should isolate concurrent auth flows using per-flow cookie names', async () => {
        vi.mocked(workos.userManagement.authenticateWithCode).mockResolvedValue(mockAuthResponse);

        // Simulate two concurrent auth flows with different sealed states
        const sealedStateA = await sealData(
          { nonce: 'nonce-a', codeVerifier: 'verifier-a' },
          { password: process.env.WORKOS_COOKIE_PASSWORD! },
        );
        const sealedStateB = await sealData(
          { nonce: 'nonce-b', codeVerifier: 'verifier-b' },
          { password: process.env.WORKOS_COOKIE_PASSWORD! },
        );

        // Both cookies exist on the request (set by different middleware redirects)
        request.cookies.set(getPKCECookieNameForState(sealedStateA), sealedStateA);
        request.cookies.set(getPKCECookieNameForState(sealedStateB), sealedStateB);

        // Callback for flow A — should find its own cookie
        request.nextUrl.searchParams.set('code', 'code-a');
        request.nextUrl.searchParams.set('state', sealedStateA);

        const handler = handleAuth();
        const response = await handler(request);

        expect(response.status).toBe(307);
        expect(workos.userManagement.authenticateWithCode).toHaveBeenCalledWith(
          expect.objectContaining({ codeVerifier: 'verifier-a' }),
        );

        // Flow B's cookie should NOT have been deleted
        const setCookieHeaders = response.headers.getSetCookie();
        const flowBCookieName = getPKCECookieNameForState(sealedStateB);
        const flowBDeletion = setCookieHeaders.find((c: string) => c.startsWith(`${flowBCookieName}=`));
        expect(flowBDeletion).toBeUndefined();
      });
    });
  });
});
