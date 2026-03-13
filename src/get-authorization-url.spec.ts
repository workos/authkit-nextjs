import { getAuthorizationUrl } from './get-authorization-url.js';
import { headers } from 'next/headers';
import { getWorkOS } from './workos.js';
import { getStateFromPKCECookieValue } from './pkce.js';

// Mock dependencies
const { fakeWorkosInstance } = vi.hoisted(() => ({
  fakeWorkosInstance: {
    baseURL: 'https://api.workos.com',
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
    delete process.env.WORKOS_ENABLE_PKCE;
    fakeWorkosInstance.pkce.generate.mockResolvedValue({
      codeVerifier: 'test-code-verifier',
      codeChallenge: 'test-code-challenge',
      codeChallengeMethod: 'S256' as const,
    });
  });

  it('uses x-redirect-uri header when redirectUri option is not provided', async () => {
    const nextHeaders = await headers();
    nextHeaders.set('x-redirect-uri', 'http://test-redirect.com');

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

    await getAuthorizationUrl();

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

  describe('claim nonce', () => {
    afterEach(() => {
      delete process.env.WORKOS_CLAIM_TOKEN;
    });

    it('does not fetch nonce when WORKOS_CLAIM_TOKEN is not set', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      await getAuthorizationUrl({});

      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('claim-nonces'), expect.anything());
      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.not.objectContaining({ claimNonce: expect.any(String) }),
      );
      fetchSpy.mockRestore();
    });

    it('fetches nonce and passes claimNonce when WORKOS_CLAIM_TOKEN is set', async () => {
      process.env.WORKOS_CLAIM_TOKEN = 'test-claim-token';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ nonce: 'test-nonce' }), { status: 201 }));

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      await freshGetAuthorizationUrl({});

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.workos.com/x/one-shot-environments/claim-nonces',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: 'client_1234567890', claim_token: 'test-claim-token' }),
        }),
      );
      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({ claimNonce: 'test-nonce' }),
      );
      fetchSpy.mockRestore();
    });

    it('proceeds without nonce on network error', async () => {
      process.env.WORKOS_CLAIM_TOKEN = 'test-claim-token';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      await freshGetAuthorizationUrl({});

      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.not.objectContaining({ claimNonce: expect.any(String) }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[authkit-nextjs]: Failed to exchange WORKOS_CLAIM_TOKEN. Try removing WORKOS_CLAIM_TOKEN from your environment variables.',
        expect.any(Error),
      );
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('proceeds without nonce on non-OK response', async () => {
      process.env.WORKOS_CLAIM_TOKEN = 'test-claim-token';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      await freshGetAuthorizationUrl({});

      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.not.objectContaining({ claimNonce: expect.any(String) }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[authkit-nextjs]: Failed to exchange WORKOS_CLAIM_TOKEN (401). Try removing WORKOS_CLAIM_TOKEN from your environment variables.',
      );
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('works with PKCE disabled', async () => {
      process.env.WORKOS_CLAIM_TOKEN = 'test-claim-token';
      process.env.WORKOS_DISABLE_PKCE = 'true';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ nonce: 'test-nonce' }), { status: 201 }));

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await freshGetAuthorizationUrl({});

      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.objectContaining({ claimNonce: 'test-nonce' }),
      );
      expect(result.pkceCookieValue).toBeUndefined();
      fetchSpy.mockRestore();
    });
  });

  describe('PKCE', () => {
    it('skips PKCE by default but still sets sealed state', async () => {
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await getAuthorizationUrl({});

      expect(fakeWorkosInstance.pkce.generate).not.toHaveBeenCalled();
      expect(workos.userManagement.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.not.objectContaining({
          codeChallenge: expect.any(String),
        }),
      );

      const { nonce } = await getStateFromPKCECookieValue(result.sealedState);
      expect(nonce).toBeDefined();
    });

    it('generates PKCE pair when WORKOS_ENABLE_PKCE is set to true', async () => {
      process.env.WORKOS_ENABLE_PKCE = 'true';

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');

      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await freshGetAuthorizationUrl({});

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

    it('returns sealed cookie value for the verifier when PKCE is enabled', async () => {
      process.env.WORKOS_ENABLE_PKCE = 'true';

      vi.resetModules();
      const { getAuthorizationUrl: freshGetAuthorizationUrl } = await import('./get-authorization-url.js');

      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      const result = await freshGetAuthorizationUrl({});

      expect(typeof result.sealedState).toBe('string');
      expect(result.sealedState.length).toBeGreaterThan(0);
    });

    it('generates a CSRF nonce state by default when no state provided', async () => {
      vi.mocked(workos.userManagement.getAuthorizationUrl).mockReturnValue('mock-url');

      await getAuthorizationUrl({});

      const call = vi.mocked(workos.userManagement.getAuthorizationUrl).mock.calls[0][0];
      const { nonce } = await getStateFromPKCECookieValue(call.state);
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
    });
  });
});
