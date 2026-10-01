describe('cookie.ts', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Reset modules to ensure fresh imports
    vi.resetModules();
    // Re-mock env-variables with a fresh copy each time
    vi.doMock('./env-variables', async (importOriginal) => {
      return { ...(await importOriginal<typeof import('./env-variables')>()) };
    });
  });

  async function setEnv(values: Record<string, string | undefined>) {
    const envVars = await import('./env-variables');
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(envVars, key, { value });
    }
  }

  describe('getCookieOptions', () => {
    it('should return the default cookie options', async () => {
      const { getCookieOptions } = await import('./cookie');

      expect(getCookieOptions([])).toEqual({
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 400 * 24 * 60 * 60,
        domain: 'example.com',
      });
    });

    it('should return the cookie options with custom values', async () => {
      await setEnv({ WORKOS_COOKIE_MAX_AGE: '1000', WORKOS_COOKIE_DOMAIN: 'foobar.com' });

      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions(['http://example.com'])).toEqual(
        expect.objectContaining({ secure: false, maxAge: 1000, domain: 'foobar.com' }),
      );

      await setEnv({ WORKOS_COOKIE_DOMAIN: '' });
      expect(getCookieOptions(['http://example.com'])).toEqual(expect.objectContaining({ domain: '' }));
    });

    it('should return max-age 0 when expired', async () => {
      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions(['http://example.com'], { expired: true })).toEqual(
        expect.objectContaining({ maxAge: 0 }),
      );
    });

    it('allows the sameSite config to be set by the WORKOS_COOKIE_SAMESITE env variable', async () => {
      await setEnv({ WORKOS_COOKIE_SAMESITE: 'none' });

      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions(['http://example.com'])).toEqual(
        expect.objectContaining({ sameSite: 'none', secure: true }),
      );
    });

    it('throws an error if the sameSite value is invalid', async () => {
      await setEnv({ WORKOS_COOKIE_SAMESITE: 'invalid' });

      const { getCookieOptions } = await import('./cookie');
      expect(() => getCookieOptions(['http://example.com'])).toThrow('Invalid SameSite value: invalid');
    });

    it('handles invalid WORKOS_COOKIE_MAX_AGE gracefully', async () => {
      await setEnv({ WORKOS_COOKIE_MAX_AGE: 'invalid-number' });

      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions([])).toEqual(expect.objectContaining({ maxAge: 34560000 }));
    });
  });

  // One policy decides `Secure` for every AuthKit cookie. Behind a TLS-terminating
  // proxy the request URL is the internal http:// origin, so any HTTPS signal wins.
  describe('Secure policy', () => {
    const internalUrl = 'http://web:3000/callback';

    it('is Secure when NEXT_PUBLIC_WORKOS_REDIRECT_URI is https', async () => {
      await setEnv({ WORKOS_REDIRECT_URI: 'https://app.example.com/callback' });

      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions([internalUrl]).secure).toBe(true);
    });

    it('is Secure when any supplied origin URL is https', async () => {
      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions([internalUrl, 'https://app.example.com']).secure).toBe(true);
    });

    it('stays Secure for an https request even if the configured URL is http', async () => {
      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions(['https://app.example.com/callback', 'http://localhost:3000']).secure).toBe(true);
    });

    it('is not Secure only when every signal is http', async () => {
      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions([internalUrl, 'http://localhost:3000', undefined, null]).secure).toBe(false);
    });

    it('fails closed to Secure when no signal is available', async () => {
      await setEnv({ WORKOS_REDIRECT_URI: undefined });

      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions([]).secure).toBe(true);
    });

    it('fails closed to Secure when a signal is unparseable', async () => {
      const { getCookieOptions } = await import('./cookie');
      expect(getCookieOptions(['not-a-valid-url']).secure).toBe(true);
    });

    it('applies to PKCE and JWT cookies too', async () => {
      await setEnv({ WORKOS_REDIRECT_URI: 'https://app.example.com/callback' });

      const { getPKCECookieOptions, getJwtCookie } = await import('./cookie');
      expect(getPKCECookieOptions([internalUrl]).secure).toBe(true);
      expect(getJwtCookie('token', [internalUrl])).toContain('Secure');
    });
  });

  describe('originUrlsFromHeaders', () => {
    it('reads the request URL and redirect URI recorded by the middleware', async () => {
      const { originUrlsFromHeaders } = await import('./cookie');
      const headers = new Headers({ 'x-url': 'http://web:3000/page', 'x-redirect-uri': 'https://app.example.com/cb' });

      expect(originUrlsFromHeaders(headers)).toEqual(['http://web:3000/page', 'https://app.example.com/cb']);
      expect(originUrlsFromHeaders(new Headers())).toEqual([null, null]);
    });
  });

  describe('serializeCookie', () => {
    it('serializes options in Set-Cookie format', async () => {
      const { getCookieOptions, serializeCookie } = await import('./cookie');

      expect(serializeCookie('wos-session', 'abc', getCookieOptions(['http://example.com']))).toBe(
        'wos-session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000; Domain=example.com',
      );
      expect(serializeCookie('wos-session', 'abc', getCookieOptions(['https://example.com']))).toBe(
        'wos-session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000; Domain=example.com; Secure',
      );
    });

    it('adds an epoch Expires when deleting', async () => {
      const { getCookieOptions, serializeCookie } = await import('./cookie');

      expect(serializeCookie('wos-session', '', getCookieOptions(['https://example.com'], { expired: true }))).toBe(
        'wos-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=example.com; Secure',
      );
    });

    it('omits Domain when not set and capitalizes SameSite', async () => {
      await setEnv({ WORKOS_COOKIE_DOMAIN: '', WORKOS_COOKIE_SAMESITE: 'STRICT' });

      const { getCookieOptions, serializeCookie } = await import('./cookie');
      const cookie = serializeCookie('wos-session', 'abc', getCookieOptions(['https://example.com']));

      expect(cookie).not.toContain('Domain=');
      expect(cookie).toContain('SameSite=Strict');
    });
  });

  describe('getJwtCookie', () => {
    it('should create JWT cookie with Secure flag for HTTPS URLs', async () => {
      const { getJwtCookie } = await import('./cookie');

      expect(getJwtCookie('test-token', ['https://example.com'])).toBe(
        'workos-access-token=test-token; SameSite=Lax; Max-Age=30; Secure',
      );
    });

    it('should create JWT cookie without Secure flag when every signal is http', async () => {
      const { getJwtCookie } = await import('./cookie');

      expect(getJwtCookie('test-token', ['http://localhost:3000'])).toBe(
        'workos-access-token=test-token; SameSite=Lax; Max-Age=30',
      );
    });

    it('should create expired JWT cookie for deletion', async () => {
      const { getJwtCookie } = await import('./cookie');

      expect(getJwtCookie('token', ['https://example.com'], true)).toBe(
        'workos-access-token=; SameSite=Lax; Max-Age=0; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      );
    });

    it('should handle null token body', async () => {
      const { getJwtCookie } = await import('./cookie');

      expect(getJwtCookie(null, ['https://example.com'])).toBe(
        'workos-access-token=; SameSite=Lax; Max-Age=30; Secure',
      );
    });
  });

  describe('getPKCECookieOptions', () => {
    it('should use 10-minute max-age, not the session cookie max-age', async () => {
      const { getPKCECookieOptions } = await import('./cookie');

      expect(getPKCECookieOptions([])).toEqual(expect.objectContaining({ maxAge: 600 }));
    });

    it('should use max-age 0 when expired', async () => {
      const { getPKCECookieOptions } = await import('./cookie');

      expect(getPKCECookieOptions([], { expired: true })).toEqual(expect.objectContaining({ maxAge: 0 }));
    });

    it('should downgrade SameSite=Strict to Lax', async () => {
      await setEnv({ WORKOS_COOKIE_SAMESITE: 'strict' });

      const { getPKCECookieOptions, serializeCookie } = await import('./cookie');
      const options = getPKCECookieOptions(['http://localhost:3000']);

      expect(options).toEqual(expect.objectContaining({ sameSite: 'lax' }));
      expect(serializeCookie('v', 's', options)).toContain('SameSite=Lax');
    });

    it('should preserve SameSite=None', async () => {
      await setEnv({ WORKOS_COOKIE_SAMESITE: 'none' });

      const { getPKCECookieOptions } = await import('./cookie');
      expect(getPKCECookieOptions([])).toEqual(expect.objectContaining({ sameSite: 'none', secure: true }));
    });
  });
});
