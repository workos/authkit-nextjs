import { describe, it, expect } from '@jest/globals';
import { getCookieOptions } from '../src/cookie.js';

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
    });
  });
});
