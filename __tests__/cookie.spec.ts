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

      expect(options3).toEqual(expect.stringContaining('Domain='));
    });

    it('should return the cookie options with expired set to true', async () => {
      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions('http://example.com', false, true);
      expect(options).toEqual(expect.objectContaining({ maxAge: 0 }));
    });

    it('should return the cookie options as a string', async () => {
      const { getCookieOptions } = await import('../src/cookie');
      const options = getCookieOptions('http://example.com', true, false);
      expect(options).toEqual(
        expect.stringContaining('Path=/; HttpOnly; Secure=false; SameSite=lax; Max-Age=34560000; Domain=example.com'),
      );

      const options2 = getCookieOptions('https://example.com', true, true);
      expect(options2).toEqual(
        expect.stringContaining('Path=/; HttpOnly; Secure=true; SameSite=lax; Max-Age=0; Domain=example.com'),
      );
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
  });
});
