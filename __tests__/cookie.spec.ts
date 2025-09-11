import { describe, it, expect } from '@jest/globals';

// Mock at the top of the file
jest.mock('../src/env-variables');

describe('cookie.ts', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset modules
    jest.resetModules();
  });

  describe('getCookieOptions', () => {
    it('should return the default cookie options', async () => {
      const { getCookieOptions } = await import('../src/cookie');

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
      // Import the mocked module
      const envVars = await import('../src/env-variables');

      // Set the mock values
      Object.defineProperty(envVars, 'WORKOS_COOKIE_MAX_AGE', { value: '1000' });
      Object.defineProperty(envVars, 'WORKOS_COOKIE_DOMAIN', { value: 'foobar.com' });

      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions('http://example.com');

      expect(options).toEqual(
        expect.objectContaining({
          secure: false,
          maxAge: 1000,
          domain: 'foobar.com',
        }),
      );

      Object.defineProperty(envVars, 'WORKOS_COOKIE_DOMAIN', { value: '' });

      const options2 = getCookieOptions('http://example.com');
      expect(options2).toEqual(
        expect.objectContaining({
          secure: false,
          maxAge: 1000,
          domain: '',
        }),
      );

      const options3 = getCookieOptions('https://example.com', true);
      // Domain should not be included when WORKOS_COOKIE_DOMAIN is empty
      expect(options3).toEqual(expect.not.stringContaining('Domain='));
    });

    it('should return the cookie options with expired set to true', async () => {
      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions('http://example.com', false, true);
      expect(options).toEqual(expect.objectContaining({ maxAge: 0 }));
    });

    it('should return the cookie options as a string', async () => {
      const { getCookieOptions } = await import('../src/cookie');
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

    it('allows the sameSite config to be set by the WORKOS_COOKIE_SAMESITE env variable', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_COOKIE_SAMESITE', { value: 'none' });

      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions('http://example.com');
      expect(options).toEqual(expect.objectContaining({ sameSite: 'none' }));
    });

    it('throws an error if the sameSite value is invalid', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_COOKIE_SAMESITE', { value: 'invalid' });

      const { getCookieOptions } = await import('../src/cookie');
      expect(() => getCookieOptions('http://example.com')).toThrow('Invalid SameSite value: invalid');
    });

    it('defaults to secure=true when no URL is available', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: undefined });

      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions();
      expect(options).toEqual(expect.objectContaining({ secure: true }));
    });

    it('defaults to secure=true when no URL is available with lax sameSite', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: undefined });
      Object.defineProperty(envVars, 'WORKOS_COOKIE_SAMESITE', { value: 'lax' });

      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions();
      expect(options).toEqual(expect.objectContaining({ secure: true, sameSite: 'lax' }));
    });

    it('handles invalid URLs gracefully by defaulting to secure=true', async () => {
      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions('not-a-valid-url');
      expect(options).toEqual(expect.objectContaining({ secure: true }));
    });

    it('handles invalid WORKOS_COOKIE_MAX_AGE gracefully', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_COOKIE_MAX_AGE', { value: 'invalid-number' });

      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions();
      expect(options).toEqual(expect.objectContaining({ maxAge: 34560000 })); // Falls back to default
    });

    it('properly formats cookie string without Domain when not set', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_COOKIE_DOMAIN', { value: '' });

      const { getCookieOptions } = await import('../src/cookie');
      const cookieString = getCookieOptions('https://example.com', true);
      expect(cookieString).not.toContain('Domain=');
      expect(cookieString).toContain('Secure');
      expect(cookieString).toContain('SameSite=Lax'); // Capitalized
    });
  });

  describe('getJwtCookie', () => {
    beforeEach(() => {
      // Reset NODE_ENV for each test
      delete process.env.NODE_ENV;
    });

    it('should create JWT cookie with Secure flag for HTTPS URLs', async () => {
      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('test-token', 'https://example.com');

      expect(cookie).toBe('workos-access-token=test-token; SameSite=Lax; Max-Age=30; Secure');
    });

    it('should create JWT cookie without Secure flag for HTTP URLs', async () => {
      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('test-token', 'http://localhost:3000');

      expect(cookie).toBe('workos-access-token=test-token; SameSite=Lax; Max-Age=30');
    });

    it('should force Secure in production except for localhost', async () => {
      process.env.NODE_ENV = 'production';

      const { getJwtCookie } = await import('../src/cookie');

      // Production with regular domain should be secure
      const prodCookie = getJwtCookie('prod-token', 'http://example.com');
      expect(prodCookie).toContain('Secure');

      // Production with localhost should not be secure
      const localhostCookie = getJwtCookie('local-token', 'http://localhost:3000');
      expect(localhostCookie).not.toContain('Secure');
    });

    it('should handle invalid URLs with no fallback URL', async () => {
      process.env.NODE_ENV = 'production';

      // Mock no WORKOS_REDIRECT_URI
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: '' });

      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('token', 'invalid-url');

      expect(cookie).toContain('Secure'); // Should default to secure in production when no fallback
    });

    it('should fall back to WORKOS_REDIRECT_URI when invalid URL provided', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: 'https://app.workos.com/callback' });

      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('token', 'invalid-url');

      expect(cookie).toContain('Secure'); // Should use HTTPS from fallback URL
    });

    it('should set secure to false when WORKOS_REDIRECT_URI parsing fails', async () => {
      process.env.NODE_ENV = 'development'; // Not production

      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: 'also-invalid-url' });

      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('token', null); // This triggers the WORKOS_REDIRECT_URI path

      expect(cookie).not.toContain('Secure'); // Should be false when URL parsing fails (line 128)
    });

    it('should handle both main URL and fallback URL parsing failures', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: 'invalid-fallback-url' });

      const { getJwtCookie } = await import('../src/cookie');

      // Invalid main URL with invalid fallback URL - should hit line 118
      const cookie = getJwtCookie('token', 'invalid-main-url');

      expect(cookie).not.toContain('Secure'); // Line 118: secure = false when fallback parsing fails
    });

    it('should use WORKOS_REDIRECT_URI when no URL provided', async () => {
      const envVars = await import('../src/env-variables');
      Object.defineProperty(envVars, 'WORKOS_REDIRECT_URI', { value: 'https://secure.example.com' });

      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('token', null);

      expect(cookie).toContain('Secure'); // Should use HTTPS from WORKOS_REDIRECT_URI
    });

    it('should create expired JWT cookie for deletion', async () => {
      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie('token', 'https://example.com', true);

      expect(cookie).toBe(
        'workos-access-token=; SameSite=Lax; Max-Age=0; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      );
    });

    it('should handle null token body', async () => {
      const { getJwtCookie } = await import('../src/cookie');

      const cookie = getJwtCookie(null, 'https://example.com');

      expect(cookie).toBe('workos-access-token=; SameSite=Lax; Max-Age=30; Secure');
    });

    it('should handle localhost vs 127.0.0.1 in production', async () => {
      process.env.NODE_ENV = 'production';

      const { getJwtCookie } = await import('../src/cookie');

      const localhostCookie = getJwtCookie('token', 'http://localhost:3000');
      const ipCookie = getJwtCookie('token', 'http://127.0.0.1:3000');

      expect(localhostCookie).not.toContain('Secure');
      expect(ipCookie).not.toContain('Secure');
    });
  });
});
