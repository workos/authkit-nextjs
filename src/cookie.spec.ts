describe('cookie.ts', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Reset modules and clear shared overrides singleton to ensure fresh config state
    vi.resetModules();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('workos.authkit.overrides')];
  });

  describe('getCookieOptions', () => {
    it('should return the default cookie options', async () => {
      const { getCookieOptions } = await import('./cookie');

      const options = getCookieOptions();
      expect(options).toEqual(
        expect.objectContaining({
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 400 * 24 * 60 * 60,
          domain: 'example.com',
        }),
      );
    });

    it('should return the cookie options with custom values', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ cookieMaxAge: 1000, cookieDomain: 'foobar.com' });

      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions('http://example.com');

      expect(options).toEqual(
        expect.objectContaining({
          secure: false,
          maxAge: 1000,
          domain: 'foobar.com',
        }),
      );

      initAuthKit({ cookieDomain: '' });

      const options2 = getCookieOptions('http://example.com');
      expect(options2).toEqual(
        expect.objectContaining({
          secure: false,
          maxAge: 1000,
          domain: '',
        }),
      );

      const options3 = getCookieOptions('https://example.com', true);
      // Domain should not be included when cookieDomain is empty
      expect(options3).toEqual(expect.not.stringContaining('Domain='));
    });

    it('should return the cookie options with expired set to true', async () => {
      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions('http://example.com', false, true);
      expect(options).toEqual(expect.objectContaining({ maxAge: 0 }));
    });

    it('should return the cookie options as a string', async () => {
      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions('http://example.com', true, false);
      expect(options).toEqual(expect.stringContaining('HttpOnly; SameSite=Lax; Max-Age=34560000; Domain=example.com'));
      expect(options).toEqual(expect.not.stringContaining('Secure'));

      const options2 = getCookieOptions('https://example.com', true, true);
      expect(options2).toEqual(expect.stringContaining('HttpOnly'));
      expect(options2).toEqual(expect.stringContaining('Secure'));
      expect(options2).toEqual(expect.stringContaining('SameSite=Lax'));
      expect(options2).toEqual(expect.stringContaining('Max-Age=0'));
      expect(options2).toEqual(expect.stringContaining('Domain=example.com'));
    });

    it('allows the sameSite config to be set by the cookieSameSite config option', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ cookieSameSite: 'none' });

      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions('http://example.com');
      expect(options).toEqual(expect.objectContaining({ sameSite: 'none' }));
    });

    it('throws an error if the sameSite value is invalid', async () => {
      process.env.WORKOS_COOKIE_SAMESITE = 'invalid';

      const { getCookieOptions } = await import('./cookie');
      expect(() => getCookieOptions('http://example.com')).toThrow('Invalid SameSite value: invalid');

      delete process.env.WORKOS_COOKIE_SAMESITE;
    });

    it('defaults to secure=true when no URL is available', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: '' });

      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions();
      expect(options).toEqual(expect.objectContaining({ secure: true }));
    });

    it('defaults to secure=true when no URL is available with lax sameSite', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: '', cookieSameSite: 'lax' });

      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions();
      expect(options).toEqual(expect.objectContaining({ secure: true, sameSite: 'lax' }));
    });

    it('handles invalid URLs gracefully by defaulting to secure=true', async () => {
      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions('not-a-valid-url');
      expect(options).toEqual(expect.objectContaining({ secure: true }));
    });

    it('handles invalid WORKOS_COOKIE_MAX_AGE gracefully', async () => {
      process.env.WORKOS_COOKIE_MAX_AGE = 'invalid-number';

      const { getCookieOptions } = await import('./cookie');
      const options = getCookieOptions();
      expect(options).toEqual(expect.objectContaining({ maxAge: 34560000 })); // Falls back to default

      delete process.env.WORKOS_COOKIE_MAX_AGE;
    });

    it('properly formats cookie string without Domain when not set', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ cookieDomain: '' });

      const { getCookieOptions } = await import('./cookie');
      const cookieString = getCookieOptions('https://example.com', true);
      expect(cookieString).not.toContain('Domain=');
      expect(cookieString).toContain('Secure');
      expect(cookieString).toContain('SameSite=Lax'); // Capitalized
    });
  });

  describe('getJwtCookie', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.NODE_ENV;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create JWT cookie with Secure flag for HTTPS URLs', async () => {
      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('test-token', 'https://example.com');

      expect(cookie).toBe('workos-access-token=test-token; SameSite=Lax; Max-Age=30; Secure');
    });

    it('should create JWT cookie without Secure flag for HTTP URLs', async () => {
      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('test-token', 'http://localhost:3000');

      expect(cookie).toBe('workos-access-token=test-token; SameSite=Lax; Max-Age=30');
    });

    it('should force Secure in production except for localhost', async () => {
      process.env.NODE_ENV = 'production';

      const { getJwtCookie } = await import('./cookie');

      // Production with regular domain should be secure
      const prodCookie = getJwtCookie('prod-token', 'http://example.com');
      expect(prodCookie).toContain('Secure');

      // Production with localhost should not be secure
      const localhostCookie = getJwtCookie('local-token', 'http://localhost:3000');
      expect(localhostCookie).not.toContain('Secure');
    });

    it('should handle invalid URLs with no fallback URL', async () => {
      process.env.NODE_ENV = 'production';

      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: '' });

      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('token', 'invalid-url');

      expect(cookie).toContain('Secure'); // Should default to secure in production when no fallback
    });

    it('should fall back to redirectUri config when invalid URL provided', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: 'https://app.workos.com/callback' });

      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('token', 'invalid-url');

      expect(cookie).toContain('Secure'); // Should use HTTPS from fallback URL
    });

    it('should set secure to false when redirectUri parsing fails', async () => {
      process.env.NODE_ENV = 'development'; // Not production

      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: 'also-invalid-url' });

      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('token', null); // This triggers the redirectUri fallback path

      expect(cookie).not.toContain('Secure'); // Should be false when URL parsing fails
    });

    it('should handle both main URL and fallback URL parsing failures', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: 'invalid-fallback-url' });

      const { getJwtCookie } = await import('./cookie');

      // Invalid main URL with invalid fallback URL
      const cookie = getJwtCookie('token', 'invalid-main-url');

      expect(cookie).not.toContain('Secure'); // secure = false when fallback parsing fails
    });

    it('should use redirectUri config when no URL provided', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ redirectUri: 'https://secure.example.com' });

      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('token', null);

      expect(cookie).toContain('Secure'); // Should use HTTPS from redirectUri
    });

    it('should create expired JWT cookie for deletion', async () => {
      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie('token', 'https://example.com', true);

      expect(cookie).toBe(
        'workos-access-token=; SameSite=Lax; Max-Age=0; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      );
    });

    it('should handle null token body', async () => {
      const { getJwtCookie } = await import('./cookie');

      const cookie = getJwtCookie(null, 'https://example.com');

      expect(cookie).toBe('workos-access-token=; SameSite=Lax; Max-Age=30; Secure');
    });

    it('should handle localhost vs 127.0.0.1 in production', async () => {
      process.env.NODE_ENV = 'production';

      const { getJwtCookie } = await import('./cookie');

      const localhostCookie = getJwtCookie('token', 'http://localhost:3000');
      const ipCookie = getJwtCookie('token', 'http://127.0.0.1:3000');

      expect(localhostCookie).not.toContain('Secure');
      expect(ipCookie).not.toContain('Secure');
    });
  });

  describe('getPKCECookieOptions', () => {
    it('should use 10-minute max-age, not the session cookie max-age', async () => {
      const { getPKCECookieOptions } = await import('./cookie');

      const options = getPKCECookieOptions();

      expect(options).toEqual(expect.objectContaining({ maxAge: 600 }));
    });

    it('should use 10-minute max-age in string format', async () => {
      const { getPKCECookieOptions } = await import('./cookie');

      const options = getPKCECookieOptions('http://localhost:3000', true);

      expect(options).toContain('Max-Age=600');
      expect(options).not.toContain('Max-Age=34560000');
    });

    it('should use max-age 0 when expired in object format', async () => {
      const { getPKCECookieOptions } = await import('./cookie');

      const options = getPKCECookieOptions(undefined, false, true);

      expect(options).toEqual(expect.objectContaining({ maxAge: 0 }));
    });

    it('should use max-age 0 when expired in string format', async () => {
      const { getPKCECookieOptions } = await import('./cookie');

      const options = getPKCECookieOptions('http://localhost:3000', true, true);

      expect(options).toContain('Max-Age=0');
    });

    it('should downgrade SameSite=Strict to Lax', async () => {
      const { initAuthKit } = await import('./config');
      initAuthKit({ cookieSameSite: 'strict' });

      const { getPKCECookieOptions } = await import('./cookie');

      const objectOptions = getPKCECookieOptions();
      expect(objectOptions).toEqual(expect.objectContaining({ sameSite: 'lax' }));

      const stringOptions = getPKCECookieOptions('http://localhost:3000', true);
      expect(stringOptions).toContain('SameSite=Lax');
      expect(stringOptions).not.toContain('SameSite=Strict');
    });
  });
});
