import { getAuthorizationUrl } from './get-authorization-url.js';
import { headers } from 'next/headers';
import { getWorkOS } from './workos.js';
import { getStateFromPKCECookieValue } from './pkce.js';

// Mock dependencies
const { fakeWorkosInstance } = vi.hoisted(() => ({
  fakeWorkosInstance: {
    userManagement: {
      getAuthorizationUrl: vi.fn(),
    },
    pkce: {
      generate: vi.fn().mockResolvedValue({
        codeVerifier: 'test-code-verifier',
        codeChallenge: 'test-code-challenge',
        codeChallengeMethod: 'S256' as const,
      }),
    },
  },
}));

vi.mock('./workos', () => ({
  getWorkOS: vi.fn(() => fakeWorkosInstance),
}));

describe('getAuthorizationUrl', () => {
  const workos = getWorkOS();
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WORKOS_DISABLE_PKCE;
    fakeWorkosInstance.pkce.generate.mockResolvedValue({
      codeVerifier: 'test-code-verifier',
      codeChallenge: 'test-code-challenge',
      codeChallengeMethod: 'S256' as const,
    });
  });

  it('uses x-redirect-uri header when redirectUri option is not provided', async () => {
    const nextHeaders = await headers();
    nextHeaders.set('x-redirect-uri', 'http://test-redirect.com');

    // Mock workos.userManagement.getAuthorizationUrl
    vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

    await getAuthorizationUrl({});

    expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'http://test-redirect.com',
      }),
    );
  });

  it('works when called with no arguments', async () => {
    vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

    await getAuthorizationUrl(); // Call with no arguments

    expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalled();
  });

  it('works when prompt is provided', async () => {
    vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

    await getAuthorizationUrl({ prompt: 'consent' });

    expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'consent',
      }),
    );
  });

  describe('PKCE', () => {
    it('generates PKCE pair and includes codeChallenge in authorization URL', async () => {
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await getAuthorizationUrl({});

      expect(fakeWorkosInstance.pkce.generate).toHaveBeenCalled();
      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          codeChallenge: 'test-code-challenge',
          codeChallengeMethod: 'S256',
        }),
      );
      expect(result.url).toBe('mock-url');
      expect(result.sealedState).toBeDefined();
      expect(result.sealedState).not.toBe('');
    });

    it('returns sealed cookie value for the verifier', async () => {
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await getAuthorizationUrl({});

      // sealedState should be a sealed (encrypted) string
      expect(typeof result.sealedState).toBe('string');
      expect(result.sealedState.length).toBeGreaterThan(0);
    });

    it('skips PKCE when WORKOS_DISABLE_PKCE is set to true', async () => {
      process.env.WORKOS_DISABLE_PKCE = 'true';

      // Re-import to pick up the new env var
      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');

      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await freshGetAuthorizationUrl({});

      expect(fakeWorkosInstance.pkce.generate).not.toHaveBeenCalled();
      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.not.objectContaining({
          codeChallenge: expect.any(String),
        }),
      );

      const { nonce } = await getStateFromPKCECookieValue(result.sealedState);

      // Sealed state should still be set with a nonce for CSRF protection
      expect(nonce).toBeDefined();
    });

    it('generates a CSRF nonce state when PKCE is disabled and no state provided', async () => {
      process.env.WORKOS_DISABLE_PKCE = 'true';

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');

      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      await freshGetAuthorizationUrl({});

      // The state sent to WorkOS is sealed, so we need to decode it to check the nonce
      const call = vi.mocked(workos.userManagement.getAuthorizationUrl).mock.calls[0][0];
      const { nonce } = await getStateFromPKCECookieValue(call.state);
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
    });
  });
});
