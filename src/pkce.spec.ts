import { sealData } from 'iron-session';
import { getStateFromPKCECookieValue } from './pkce.js';

const PASSWORD = process.env.WORKOS_COOKIE_PASSWORD!;

describe('getStateFromPKCECookieValue', () => {
  it('should unseal and validate a valid state', async () => {
    const sealed = await sealData(
      { nonce: 'test-nonce', returnPathname: '/dashboard', customState: 'custom' },
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

  it('should throw when nonce is missing', async () => {
    const sealed = await sealData({ returnPathname: '/dashboard' }, { password: PASSWORD });

    await expect(getStateFromPKCECookieValue(sealed)).rejects.toThrow();
  });

  it('should throw when sealed data is corrupted', async () => {
    await expect(getStateFromPKCECookieValue('not-a-valid-sealed-value')).rejects.toThrow();
  });

  it('should throw when sealed with a different password', async () => {
    const sealed = await sealData({ nonce: 'test-nonce' }, { password: 'a-different-password-that-is-32-chars!' });

    await expect(getStateFromPKCECookieValue(sealed)).rejects.toThrow();
  });
});
