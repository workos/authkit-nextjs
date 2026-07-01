import { config, initAuthKit } from './config.js';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('workos.authkit.overrides')];
  });

  describe('env variable fallbacks', () => {
    it('reads apiKey from WORKOS_API_KEY', () => {
      expect(config.apiKey).toBe(process.env.WORKOS_API_KEY);
    });

    it('reads clientId from WORKOS_CLIENT_ID', () => {
      expect(config.clientId).toBe(process.env.WORKOS_CLIENT_ID);
    });

    it('reads cookiePassword from WORKOS_COOKIE_PASSWORD', () => {
      expect(config.cookiePassword).toBe(process.env.WORKOS_COOKIE_PASSWORD);
    });

    it('reads redirectUri from NEXT_PUBLIC_WORKOS_REDIRECT_URI', () => {
      expect(config.redirectUri).toBe(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
    });

    it('reads cookieDomain from WORKOS_COOKIE_DOMAIN', () => {
      expect(config.cookieDomain).toBe(process.env.WORKOS_COOKIE_DOMAIN);
    });

    it('returns undefined for unset optional values', () => {
      expect(config.cookieName).toBeUndefined();
      expect(config.cookieMaxAge).toBeUndefined();
      expect(config.cookieSameSite).toBeUndefined();
      expect(config.claimToken).toBeUndefined();
      expect(config.apiHostname).toBeUndefined();
      expect(config.apiPort).toBeUndefined();
    });

    it('defaults apiHttps to true when WORKOS_API_HTTPS is not set', () => {
      expect(config.apiHttps).toBe(true);
    });

    it('parses WORKOS_API_HTTPS from env', () => {
      process.env.WORKOS_API_HTTPS = 'false';
      expect(config.apiHttps).toBe(false);
      delete process.env.WORKOS_API_HTTPS;
    });

    it('parses WORKOS_COOKIE_MAX_AGE from env', () => {
      process.env.WORKOS_COOKIE_MAX_AGE = '3600';
      expect(config.cookieMaxAge).toBe(3600);
      delete process.env.WORKOS_COOKIE_MAX_AGE;
    });

    it('returns undefined for an invalid WORKOS_COOKIE_MAX_AGE', () => {
      process.env.WORKOS_COOKIE_MAX_AGE = 'not-a-number';
      expect(config.cookieMaxAge).toBeUndefined();
      delete process.env.WORKOS_COOKIE_MAX_AGE;
    });

    it('parses WORKOS_API_PORT from env', () => {
      process.env.WORKOS_API_PORT = '8080';
      expect(config.apiPort).toBe(8080);
      delete process.env.WORKOS_API_PORT;
    });
  });

  describe('initAuthKit overrides', () => {
    it('takes precedence over env variables', async () => {
      const { config: freshConfig, initAuthKit: freshInit } = await import('./config.js');
      freshInit({ apiKey: 'override-key', cookiePassword: 'override-password-with-enough-length' });

      expect(freshConfig.apiKey).toBe('override-key');
      expect(freshConfig.cookiePassword).toBe('override-password-with-enough-length');
    });

    it('falls back to env for keys not in the override', async () => {
      const { config: freshConfig, initAuthKit: freshInit } = await import('./config.js');
      freshInit({ apiKey: 'custom-key' });

      expect(freshConfig.clientId).toBe(process.env.WORKOS_CLIENT_ID);
    });

    it('merges successive calls', async () => {
      const { config: freshConfig, initAuthKit: freshInit } = await import('./config.js');
      freshInit({ apiKey: 'key1' });
      freshInit({ cookiePassword: 'password-long-enough-to-pass-32-chars' });

      expect(freshConfig.apiKey).toBe('key1');
      expect(freshConfig.cookiePassword).toBe('password-long-enough-to-pass-32-chars');
    });

    it('overrides cookieMaxAge as a number directly', async () => {
      const { config: freshConfig, initAuthKit: freshInit } = await import('./config.js');
      freshInit({ cookieMaxAge: 7200 });

      expect(freshConfig.cookieMaxAge).toBe(7200);
    });

    it('overrides apiHttps as a boolean directly', async () => {
      const { config: freshConfig, initAuthKit: freshInit } = await import('./config.js');
      freshInit({ apiHttps: false });

      expect(freshConfig.apiHttps).toBe(false);
    });

    it('restores env fallback when override is cleared with undefined', async () => {
      const { config: freshConfig, initAuthKit: freshInit } = await import('./config.js');
      freshInit({ apiKey: 'custom' });
      expect(freshConfig.apiKey).toBe('custom');

      freshInit({ apiKey: undefined });
      expect(freshConfig.apiKey).toBe(process.env.WORKOS_API_KEY);
    });
  });
});
