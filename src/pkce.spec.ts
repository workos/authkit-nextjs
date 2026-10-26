import { sealData } from 'iron-session';
import { getStateFromPKCECookieValue, getPKCECookieNameForState } from './pkce.js';

const PASSWORD = process.env.WORKOS_COOKIE_PASSWORD!;

describe('getPKCECookieNameForState', () => {
  it('should derive a cookie name prefixed with the base name', () => {
    const state = 'any-string-at-all';

    expect(getPKCECookieNameForState(state)).toMatch(/^wos-auth-verifier-[0-9a-f]{8}$/);
  });

  it('should produce different names for different states', () => {
    const stateA = 'first-sealed-state-value';
    const stateB = 'second-sealed-state-value';

    expect(getPKCECookieNameForState(stateA)).not.toBe(getPKCECookieNameForState(stateB));
  });

  it('should be deterministic for the same input', () => {
    const state = 'some-sealed-state';

    expect(getPKCECookieNameForState(state)).toBe(getPKCECookieNameForState(state));
  });
});

describe('setPKCECookie SameSite override', () => {
  const mockSet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ set: mockSet, get: vi.fn(), getAll: vi.fn(() => []), delete: vi.fn() }),
      headers: async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
    }));
    vi.doMock('./env-variables', async (importOriginal) => {
      return { ...(await importOriginal<typeof import('./env-variables')>()) };
    });
  });

  it('should downgrade strict to lax', async () => {
    const envVars = await import('./env-variables');
    Object.defineProperty(envVars, 'WORKOS_COOKIE_SAMESITE', { value: 'strict' });

    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', []);

    expect(mockSet).toHaveBeenCalledWith(
      getPKCECookieNameForState('sealed-state'),
      'sealed-state',
      expect.objectContaining({ sameSite: 'lax' }),
    );
  });

  it('should preserve none for iframe/cross-origin flows', async () => {
    const envVars = await import('./env-variables');
    Object.defineProperty(envVars, 'WORKOS_COOKIE_SAMESITE', { value: 'none' });

    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', []);

    expect(mockSet).toHaveBeenCalledWith(
      getPKCECookieNameForState('sealed-state'),
      'sealed-state',
      expect.objectContaining({ sameSite: 'none' }),
    );
  });

  it('should downgrade mixed-case Strict to lax', async () => {
    const envVars = await import('./env-variables');
    Object.defineProperty(envVars, 'WORKOS_COOKIE_SAMESITE', { value: 'Strict' });

    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', []);

    expect(mockSet).toHaveBeenCalledWith(
      getPKCECookieNameForState('sealed-state'),
      'sealed-state',
      expect.objectContaining({ sameSite: 'lax' }),
    );
  });

  it('should set Secure when an origin URL is https, even if the request URL is internal http', async () => {
    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', ['http://web:3000/login', 'https://app.example.com/callback']);

    expect(mockSet).toHaveBeenCalledWith(
      getPKCECookieNameForState('sealed-state'),
      'sealed-state',
      expect.objectContaining({ secure: true }),
    );
  });

  it('should default to lax when no SameSite configured', async () => {
    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', []);

    expect(mockSet).toHaveBeenCalledWith(
      getPKCECookieNameForState('sealed-state'),
      'sealed-state',
      expect.objectContaining({ sameSite: 'lax' }),
    );
  });
});

describe('setPKCECookie verifier cap', () => {
  const mockSet = vi.fn();
  let existing: { name: string; value: string }[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ set: mockSet, get: vi.fn(), getAll: () => existing, delete: vi.fn() }),
    }));
  });

  const verifiers = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ name: `wos-auth-verifier-${i}`, value: `state-${i}` }));

  it('keeps existing verifiers below the cap', async () => {
    existing = [...verifiers(4), { name: 'unrelated', value: 'x' }];
    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', []);

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(getPKCECookieNameForState('sealed-state'), 'sealed-state', expect.anything());
  });

  it('expires every other verifier once the cap is reached', async () => {
    existing = [...verifiers(5), { name: 'wos-auth-verifier', value: 'legacy' }, { name: 'unrelated', value: 'x' }];
    const { setPKCECookie } = await import('./pkce');
    await setPKCECookie('sealed-state', []);

    const expired = mockSet.mock.calls.filter(([, , options]) => options.maxAge === 0).map(([name]) => name);
    expect(expired).toEqual([...verifiers(5).map(({ name }) => name), 'wos-auth-verifier']);
    expect(mockSet).toHaveBeenLastCalledWith(
      getPKCECookieNameForState('sealed-state'),
      'sealed-state',
      expect.objectContaining({ maxAge: 600 }),
    );
  });
});

describe('getStateFromPKCECookieValue', () => {
  it('should unseal and validate a valid state', async () => {
    const sealed = await sealData(
      { nonce: 'test-nonce', codeVerifier: 'verifier-abc', returnPathname: '/dashboard', customState: 'custom' },
      { password: PASSWORD },
    );

    const state = await getStateFromPKCECookieValue(sealed);

    expect(state.nonce).toBe('test-nonce');
    expect(state.returnPathname).toBe('/dashboard');
    expect(state.customState).toBe('custom');
  });

  it('should unseal state with codeVerifier', async () => {
    const sealed = await sealData({ nonce: 'test-nonce', codeVerifier: 'verifier-123' }, { password: PASSWORD });

    const state = await getStateFromPKCECookieValue(sealed);

    expect(state.nonce).toBe('test-nonce');
    expect(state.codeVerifier).toBe('verifier-123');
  });

  it('should throw when codeVerifier is missing', async () => {
    const sealed = await sealData({ nonce: 'test-nonce', returnPathname: '/dashboard' }, { password: PASSWORD });

    await expect(getStateFromPKCECookieValue(sealed)).rejects.toThrow();
  });

  it('should throw when nonce is missing', async () => {
    const sealed = await sealData(
      { codeVerifier: 'verifier-abc', returnPathname: '/dashboard' },
      { password: PASSWORD },
    );

    await expect(getStateFromPKCECookieValue(sealed)).rejects.toThrow();
  });

  it('should throw when sealed data is corrupted', async () => {
    await expect(getStateFromPKCECookieValue('not-a-valid-sealed-value')).rejects.toThrow();
  });

  it('should throw when sealed with a different password', async () => {
    const sealed = await sealData(
      { nonce: 'test-nonce', codeVerifier: 'verifier-abc' },
      { password: 'a-different-password-that-is-32-chars!' },
    );

    await expect(getStateFromPKCECookieValue(sealed)).rejects.toThrow();
  });
});
