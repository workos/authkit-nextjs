/**
 * Wire-level tests for public-client (keyless) mode.
 *
 * These drive the real callback and refresh paths against the real WorkOS SDK
 * with only `fetch` mocked, and assert on the request body the SDK sends to
 * `/user_management/authenticate`. Each module graph is re-imported after the
 * environment is set, because env variables are read at module load.
 */
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';

// Never fetch a JWKS: the key lookup fails, so the middleware treats the access
// token as invalid and refreshes it.
vi.mock('jose', async () => ({
  ...(await vi.importActual<typeof import('jose')>('jose')),
  createRemoteJWKSet: vi.fn(() => () => Promise.reject(new Error('no JWKS in tests'))),
}));

const API_KEY = 'sk_test_confidential';
const AUTHENTICATE_URL = 'https://api.workos.com/user_management/authenticate';
const KEYLESS_HINT =
  'requires a WorkOS API key; set WORKOS_API_KEY. Public-client (keyless) mode supports sign-in only.';

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Decoded, never verified, by the refresh paths.
const accessToken = `${base64url({ alg: 'none' })}.${base64url({
  sid: 'session_123',
  exp: Math.floor(Date.now() / 1000) + 300,
})}.sig`;

const user = {
  object: 'user',
  id: 'user_123',
  email: 'test@example.com',
  email_verified: true,
  first_name: 'Test',
  last_name: 'User',
  profile_picture_url: null,
  last_sign_in_at: null,
  locale: null,
  external_id: null,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function authenticateResponse(refreshToken: string) {
  return new Response(JSON.stringify({ user, access_token: accessToken, refresh_token: refreshToken }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let savedApiKey: string | undefined;
let fetchMock: Mock<typeof fetch>;

function setApiKey(apiKey: string | undefined) {
  if (apiKey === undefined) {
    delete process.env.WORKOS_API_KEY;
  } else {
    process.env.WORKOS_API_KEY = apiKey;
  }
}

beforeEach(() => {
  vi.resetModules();
  savedApiKey = process.env.WORKOS_API_KEY;
  // The SDK binds fetch when the client is constructed, so stub it before importing.
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiKey(savedApiKey);
});

describe.each([
  ['public client (no API key)', undefined],
  ['public client (empty WORKOS_API_KEY)', ''],
  ['confidential client (API key)', API_KEY],
] as const)('%s', (_label, apiKey) => {
  beforeEach(() => setApiKey(apiKey));

  function authenticateCall() {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(AUTHENTICATE_URL);
    return {
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      authorization: new Headers(init?.headers).get('Authorization'),
    };
  }

  function expectClientCredentials(call: ReturnType<typeof authenticateCall>) {
    if (apiKey) {
      expect(call.body.client_secret).toBe(apiKey);
      expect(call.authorization).toBe(`Bearer ${apiKey}`);
    } else {
      expect(call.body).not.toHaveProperty('client_secret');
      expect(call.authorization).toBeNull();
    }
  }

  async function sealedSession(refreshToken: string) {
    const { encryptSession } = await import('./session.js');
    return encryptSession({ accessToken, refreshToken, user: { id: 'user_123' } as never });
  }

  it('exchanges the code with the PKCE verifier', async () => {
    const { getAuthorizationUrl } = await import('./get-authorization-url.js');
    const { getPKCECookieNameForState } = await import('./pkce.js');
    const { handleAuth } = await import('./authkit-callback-route.js');

    const { url, sealedState } = await getAuthorizationUrl();
    const authorizationUrl = new URL(url);
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');

    fetchMock.mockResolvedValueOnce(authenticateResponse('refresh_1'));
    const callbackUrl = new URL('http://localhost:3000/callback');
    callbackUrl.searchParams.set('code', 'code_123');
    callbackUrl.searchParams.set('state', sealedState);
    const response = await handleAuth()(
      new NextRequest(callbackUrl, { headers: { cookie: `${getPKCECookieNameForState(sealedState)}=${sealedState}` } }),
    );
    expect(response.status).toBe(307);

    const exchange = authenticateCall();
    expect(exchange.body).toMatchObject({
      grant_type: 'authorization_code',
      client_id: process.env.WORKOS_CLIENT_ID,
      code: 'code_123',
      code_verifier: expect.any(String),
    });
    expectClientCredentials(exchange);
  });

  it('refreshes the session in the middleware (updateSession)', async () => {
    const { updateSession } = await import('./session.js');
    const request = new NextRequest('http://localhost:3000/account', {
      headers: { cookie: `wos-session=${await sealedSession('refresh_1')}` },
    });

    fetchMock.mockResolvedValueOnce(authenticateResponse('refresh_2'));
    const { session } = await updateSession(request);
    expect(session.user?.id).toBe('user_123');

    const refresh = authenticateCall();
    expect(refresh.body).toMatchObject({
      grant_type: 'refresh_token',
      client_id: process.env.WORKOS_CLIENT_ID,
      refresh_token: 'refresh_1',
    });
    expectClientCredentials(refresh);
  });

  it('refreshes the session on demand (refreshSession)', async () => {
    const { cookies } = await import('next/headers');
    const { refreshSession } = await import('./session.js');
    (await cookies()).set('wos-session', await sealedSession('refresh_1'));

    fetchMock.mockResolvedValueOnce(authenticateResponse('refresh_2'));
    const result = await refreshSession({ organizationId: 'org_456' });
    expect(result.user?.id).toBe('user_123');

    const refresh = authenticateCall();
    expect(refresh.body).toMatchObject({
      grant_type: 'refresh_token',
      client_id: process.env.WORKOS_CLIENT_ID,
      refresh_token: 'refresh_1',
      organization_id: 'org_456',
    });
    expectClientCredentials(refresh);
  });
});

describe('key-only features in public-client mode', () => {
  beforeEach(() => setApiKey(undefined));

  it('getOrganizationAction throws before any network call', async () => {
    const { getOrganizationAction } = await import('./actions.js');
    await expect(getOrganizationAction('org_123')).rejects.toThrow(`getOrganizationAction ${KEYLESS_HINT}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validateApiKey throws before any network call', async () => {
    const { headers } = await import('next/headers');
    (await headers()).set('authorization', 'Bearer sk_customer_key');
    const { validateApiKey } = await import('./validate-api-key.js');
    await expect(validateApiKey()).rejects.toThrow(`validateApiKey ${KEYLESS_HINT}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getFeatureFlagsRuntimeClient throws before creating a client', async () => {
    const { getWorkOS } = await import('./workos.js');
    const createRuntimeClient = vi.spyOn(getWorkOS().featureFlags, 'createRuntimeClient');
    const { getFeatureFlagsRuntimeClient } = await import('./feature-flags.js');
    expect(() => getFeatureFlagsRuntimeClient()).toThrow(`getFeatureFlagsRuntimeClient ${KEYLESS_HINT}`);
    expect(createRuntimeClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
