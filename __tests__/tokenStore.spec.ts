import { tokenStore } from '../src/components/tokenStore.js';
import { getAccessTokenAction, refreshAccessTokenAction } from '../src/actions.js';

jest.mock('../src/actions.js', () => ({
  getAccessTokenAction: jest.fn(),
  refreshAccessTokenAction: jest.fn(),
}));

describe('tokenStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    tokenStore.reset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    tokenStore.reset();
    jest.restoreAllMocks();
  });

  describe('getServerSnapshot', () => {
    it('should return a static server snapshot', () => {
      const snapshot = tokenStore.getServerSnapshot();
      expect(snapshot).toEqual({
        token: undefined,
        loading: false,
        error: null,
      });
    });
  });

  describe('isRefreshing', () => {
    it('should return true when a refresh is in progress', async () => {
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      let resolvePromise: (value: string) => void;
      const slowPromise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });

      (refreshAccessTokenAction as jest.Mock).mockReturnValue(slowPromise);

      expect(tokenStore.isRefreshing()).toBe(false);

      // Start a refresh
      const refreshPromise = tokenStore.refreshToken();

      expect(tokenStore.isRefreshing()).toBe(true);

      // Complete the refresh
      resolvePromise!(mockToken);
      await refreshPromise;

      expect(tokenStore.isRefreshing()).toBe(false);
    });
  });

  describe('getAccessToken', () => {
    it('should return existing valid JWT token without refreshing', async () => {
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      // Manually set token in store first
      (getAccessTokenAction as jest.Mock).mockResolvedValue(mockToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      (getAccessTokenAction as jest.Mock).mockClear();
      (refreshAccessTokenAction as jest.Mock).mockClear();

      // Now call getAccessToken - should return cached token
      const token = await tokenStore.getAccessToken();

      expect(token).toBe(mockToken);
      expect(getAccessTokenAction).not.toHaveBeenCalled();
      expect(refreshAccessTokenAction).not.toHaveBeenCalled();
    });

    it('should return existing opaque token without refreshing', async () => {
      const opaqueToken = 'opaque-token-string';

      // Manually set opaque token in store first
      (getAccessTokenAction as jest.Mock).mockResolvedValue(opaqueToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      (getAccessTokenAction as jest.Mock).mockClear();
      (refreshAccessTokenAction as jest.Mock).mockClear();

      // Now call getAccessToken - should return cached opaque token
      const token = await tokenStore.getAccessToken();

      expect(token).toBe(opaqueToken);
      expect(getAccessTokenAction).not.toHaveBeenCalled();
      expect(refreshAccessTokenAction).not.toHaveBeenCalled();
    });

    it('should refresh when JWT is expiring', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiringPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 25, // Within 30-second buffer
        iat: currentTimeInSeconds - 35,
      };
      const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiringPayload))}.mock-signature`;

      const refreshedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

      // Set expiring token first
      (getAccessTokenAction as jest.Mock).mockResolvedValue(expiringToken);
      await tokenStore.getAccessTokenSilently();

      // Setup refresh mock
      (refreshAccessTokenAction as jest.Mock).mockResolvedValue(refreshedToken);

      // Now call getAccessToken - should trigger refresh
      const token = await tokenStore.getAccessToken();

      expect(token).toBe(refreshedToken);
      expect(refreshAccessTokenAction).toHaveBeenCalled();
    });

    it('should refresh when no token exists', async () => {
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      (getAccessTokenAction as jest.Mock).mockResolvedValue(mockToken);

      const token = await tokenStore.getAccessToken();

      expect(token).toBe(mockToken);
      expect(getAccessTokenAction).toHaveBeenCalled();
    });
  });

  describe('parseToken edge cases', () => {
    it('should handle token with no exp field', async () => {
      const tokenWithoutExp = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ sub: '123' }))}.mock-signature`;

      (getAccessTokenAction as jest.Mock).mockResolvedValue(tokenWithoutExp);
      await tokenStore.getAccessTokenSilently();

      // Should store as opaque token (can't parse expiry)
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(tokenWithoutExp);
    });

    it('should trigger immediate refresh when token is already expired', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds - 10, // Already expired
        iat: currentTimeInSeconds - 70,
      };
      const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiredPayload))}.mock-signature`;

      const refreshedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

      (getAccessTokenAction as jest.Mock).mockResolvedValue(expiredToken);
      (refreshAccessTokenAction as jest.Mock).mockResolvedValue(refreshedToken);

      await tokenStore.getAccessTokenSilently();

      // Should have triggered immediate refresh
      expect(refreshAccessTokenAction).toHaveBeenCalled();
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(refreshedToken);
    });
  });

  describe('refresh scheduling', () => {
    it('should schedule refresh with immediate delay when token is within buffer', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiringPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 20, // Less than 30 second buffer
        iat: currentTimeInSeconds - 40,
      };
      const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiringPayload))}.mock-signature`;

      const refreshedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

      (getAccessTokenAction as jest.Mock).mockResolvedValue(expiringToken);
      (refreshAccessTokenAction as jest.Mock).mockResolvedValue(refreshedToken);

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      await tokenStore.getAccessTokenSilently();

      // Should have scheduled refresh (may not be immediate due to MIN_REFRESH_DELAY)
      expect(setTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('subscriber cleanup', () => {
    it('should clear refresh timeout when all subscribers unsubscribe', async () => {
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      (getAccessTokenAction as jest.Mock).mockResolvedValue(mockToken);

      // Subscribe and get token to schedule refresh
      const unsubscribe = tokenStore.subscribe(() => {});

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      await tokenStore.getAccessTokenSilently();

      // Verify refresh was scheduled
      expect(setTimeoutSpy).toHaveBeenCalled();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Unsubscribe - should clear timeout since no more subscribers
      unsubscribe();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('edge case: silent refresh with existing token needing refresh', () => {
    it('should refresh existing expiring token during silent refresh', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiringPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 25, // Within 30-second buffer
        iat: currentTimeInSeconds - 35,
      };
      const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiringPayload))}.mock-signature`;

      const refreshedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWkiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

      // First set an expiring token
      (getAccessTokenAction as jest.Mock).mockResolvedValue(expiringToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      (getAccessTokenAction as jest.Mock).mockClear();

      // Setup refresh to return new token
      (refreshAccessTokenAction as jest.Mock).mockResolvedValue(refreshedToken);

      // Call private refresh method (simulating scheduled refresh)
      const token = await tokenStore['refreshTokenSilently']();

      // Should have called refresh since existing token was expiring
      expect(refreshAccessTokenAction).toHaveBeenCalled();
      expect(token).toBe(refreshedToken);
    });
  });

  describe('getAccessTokenSilently edge cases', () => {
    it('should return cached opaque token without making server call', async () => {
      const opaqueToken = 'opaque-token-value';

      // Set opaque token first
      (getAccessTokenAction as jest.Mock).mockResolvedValue(opaqueToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks to verify no additional calls
      (getAccessTokenAction as jest.Mock).mockClear();
      (refreshAccessTokenAction as jest.Mock).mockClear();

      // Call again - should return cached opaque token
      const token = await tokenStore.getAccessTokenSilently();

      expect(token).toBe(opaqueToken);
      expect(getAccessTokenAction).not.toHaveBeenCalled();
      expect(refreshAccessTokenAction).not.toHaveBeenCalled();
    });

    it('should return cached valid JWT token without making server call', async () => {
      const validToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      // Set valid token first
      (getAccessTokenAction as jest.Mock).mockResolvedValue(validToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks to verify no additional calls
      (getAccessTokenAction as jest.Mock).mockClear();
      (refreshAccessTokenAction as jest.Mock).mockClear();

      // Call again - should return cached valid token
      const token = await tokenStore.getAccessTokenSilently();

      expect(token).toBe(validToken);
      expect(getAccessTokenAction).not.toHaveBeenCalled();
      expect(refreshAccessTokenAction).not.toHaveBeenCalled();
    });
  });

  describe('cookie deletion', () => {
    it('should delete cookie with Secure flag on HTTPS', () => {
      const mockCookieSetter = jest.fn();

      Object.defineProperty(global, 'document', {
        value: {
          cookie: 'wos-session-token=test-token',
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, 'cookie', {
        set: mockCookieSetter,
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          location: {
            protocol: 'https:',
          },
        },
        writable: true,
        configurable: true,
      });

      // Access private method via any cast
      (tokenStore as any).deleteCookie();

      expect(mockCookieSetter).toHaveBeenCalledWith('wos-session-token=; Path=/; SameSite=Lax; Max-Age=0; Secure');

      delete (global as any).document;
      delete (global as any).window;
    });

    it('should delete cookie without Secure flag on HTTP localhost', () => {
      const mockCookieSetter = jest.fn();

      Object.defineProperty(global, 'document', {
        value: {
          cookie: 'wos-session-token=test-token',
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, 'cookie', {
        set: mockCookieSetter,
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          location: {
            protocol: 'http:',
          },
        },
        writable: true,
        configurable: true,
      });

      // Access private method via any cast
      (tokenStore as any).deleteCookie();

      expect(mockCookieSetter).toHaveBeenCalledWith('wos-session-token=; Path=/; SameSite=Lax; Max-Age=0');

      delete (global as any).document;
      delete (global as any).window;
    });
  });

  describe('eager auth cookie consumption', () => {
    beforeEach(() => {
      // Reset the store completely
      tokenStore.reset();
      // Reset the fastCookieConsumed flag
      (tokenStore as any).fastCookieConsumed = false;
    });

    it('should consume eager auth cookie on first access', () => {
      const eagerToken = 'eager-auth-token';
      const mockCookieSetter = jest.fn();

      // Ensure store has no token initially (or a different token)
      tokenStore.clearToken();

      // Mock document.cookie with both getter and setter
      let cookieValue = `wos-session-token=${eagerToken}; Path=/`;

      Object.defineProperty(global, 'document', {
        value: global.document || {},
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, 'cookie', {
        get: () => cookieValue,
        set: (value: string) => {
          mockCookieSetter(value);
          cookieValue = value;
        },
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          location: {
            protocol: 'https:',
          },
        },
        writable: true,
        configurable: true,
      });

      const result = (tokenStore as any).consumeFastCookie();

      expect(result).toBe(eagerToken);
      expect((tokenStore as any).fastCookieConsumed).toBe(true);
      // Verify cookie was deleted after consumption
      expect(mockCookieSetter).toHaveBeenCalledWith('wos-session-token=; Path=/; SameSite=Lax; Max-Age=0; Secure');

      delete (global as any).document;
      delete (global as any).window;
    });

    it('should only consume cookie once to prevent multiple reads', () => {
      (tokenStore as any).fastCookieConsumed = true;

      const result = (tokenStore as any).consumeFastCookie();

      expect(result).toBeUndefined();
      // Should not attempt to read cookie again
    });
  });

  describe('error recovery', () => {
    it('should preserve existing token when refresh fails', async () => {
      const existingToken = 'existing-valid-token';

      // Set up existing token
      (getAccessTokenAction as jest.Mock).mockResolvedValue(existingToken);
      await tokenStore.getAccessTokenSilently();

      // Now simulate network error during refresh
      (refreshAccessTokenAction as jest.Mock).mockRejectedValue(new Error('Network error'));

      try {
        await tokenStore.refreshToken();
      } catch (e) {
        // Expected to throw
      }

      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(existingToken); // Token preserved for retry
      expect(state.error).toBeTruthy();
      expect(state.loading).toBe(false);

      // Verify retry was scheduled
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('short-lived WorkOS tokens', () => {
    it('should handle 60-second tokens without constant refreshing', () => {
      const now = Math.floor(Date.now() / 1000);
      const shortLivedToken = {
        header: { alg: 'HS256', typ: 'JWT' },
        payload: {
          sub: 'user_123',
          sid: 'session_123',
          iat: now,
          exp: now + 60, // 60 seconds - typical WorkOS token
        },
      };

      const tokenString = `${btoa(JSON.stringify(shortLivedToken.header))}.${btoa(
        JSON.stringify(shortLivedToken.payload),
      )}.mock-signature`;

      const result = tokenStore.parseToken(tokenString);

      expect(result).toBeTruthy();
      // With 30-second buffer for short tokens, 60-second token should not be expiring immediately
      expect(result?.isExpiring).toBe(false);

      // But should be expiring when only 25 seconds left
      shortLivedToken.payload.exp = now + 25;
      const nearExpiryToken = `${btoa(JSON.stringify(shortLivedToken.header))}.${btoa(
        JSON.stringify(shortLivedToken.payload),
      )}.mock-signature`;

      const nearExpiryResult = tokenStore.parseToken(nearExpiryToken);
      expect(nearExpiryResult?.isExpiring).toBe(true);
    });
  });

  describe('getAccessToken with eager auth', () => {
    it('should immediately return token from eager auth cookie', async () => {
      const eagerToken = 'eager-token-from-cookie';

      // Reset consumed flag to simulate fresh page load
      (tokenStore as any).fastCookieConsumed = false;

      Object.defineProperty(global, 'document', {
        value: {
          cookie: `wos-session-token=${eagerToken}; Path=/`,
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          location: {
            protocol: 'https:',
          },
        },
        writable: true,
        configurable: true,
      });

      const token = await tokenStore.getAccessToken();

      expect(token).toBe(eagerToken);
      expect((tokenStore as any).fastCookieConsumed).toBe(true);

      // Verify token is now in state for subsequent calls
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(eagerToken);

      delete (global as any).document;
      delete (global as any).window;
    });
  });

  describe('clearToken', () => {
    it('should clear refresh timeout when token is cleared', () => {
      // Set up a refresh timeout
      (tokenStore as any).refreshTimeout = setTimeout(() => {}, 10000);
      expect((tokenStore as any).refreshTimeout).toBeDefined();

      // Call clearToken which should clear the timeout (lines 213-214)
      tokenStore.clearToken();

      expect((tokenStore as any).refreshTimeout).toBeUndefined();
      expect(tokenStore.getSnapshot().token).toBeUndefined();
    });
  });

  describe('consumeFastCookie edge cases', () => {
    it('should mark as consumed even when no cookie found', () => {
      // Reset state
      tokenStore.reset();
      (tokenStore as any).fastCookieConsumed = false;

      Object.defineProperty(global, 'document', {
        value: {
          cookie: '', // No cookie
        },
        writable: true,
        configurable: true,
      });

      const result = (tokenStore as any).consumeFastCookie();

      expect(result).toBeUndefined();
      // Should mark as consumed even when not found (lines 153-154)
      expect((tokenStore as any).fastCookieConsumed).toBe(true);

      delete (global as any).document;
    });
  });

  describe('concurrent refresh prevention', () => {
    it('should reuse existing refresh promise to prevent concurrent requests', async () => {
      const mockToken = 'refresh-token';
      let callCount = 0;

      // Mock the action to track calls and be slow
      let resolvePromise: (value: string) => void;
      const slowPromise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });

      (refreshAccessTokenAction as jest.Mock).mockImplementation(() => {
        callCount++;
        return slowPromise;
      });

      // Clear any existing refresh promise
      tokenStore.reset();

      // Start first refresh
      const promise1 = tokenStore.refreshToken();

      // Start second refresh immediately while first is still pending
      const promise2 = tokenStore.refreshToken();

      // Verify both calls eventually get the same result even though
      // they're not the exact same promise (due to async wrapper)
      resolvePromise!(mockToken);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should get the token
      expect(result1).toBe(mockToken);
      expect(result2).toBe(mockToken);

      // The key test: only one actual refresh should have been called
      expect(callCount).toBe(1);
    });
  });

  describe('getInitialTokenFromCookie', () => {
    it('should read token from cookie and delete it', () => {
      const initialToken = 'initial-token';
      let cookieValue = `wos-session-token=${initialToken}; Path=/`;
      const cookieSetter = jest.fn();

      Object.defineProperty(global, 'document', {
        value: global.document || {},
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, 'cookie', {
        get: () => cookieValue,
        set: (value: string) => {
          cookieSetter(value);
          cookieValue = value;
        },
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          location: {
            protocol: 'https:',
          },
        },
        writable: true,
        configurable: true,
      });

      // Call the private method to test lines 134-136
      const token = (tokenStore as any).getInitialTokenFromCookie();

      expect(token).toBe(initialToken);
      // Verify cookie deletion was called
      expect(cookieSetter).toHaveBeenCalledWith('wos-session-token=; Path=/; SameSite=Lax; Max-Age=0; Secure');

      delete (global as any).document;
      delete (global as any).window;
    });

    it('should return undefined when no cookie exists', () => {
      Object.defineProperty(global, 'document', {
        value: {
          cookie: '',
        },
        writable: true,
        configurable: true,
      });

      const token = (tokenStore as any).getInitialTokenFromCookie();

      expect(token).toBeUndefined();

      delete (global as any).document;
    });
  });

  describe('getAccessTokenSilently with fast cookie and refresh scheduling', () => {
    beforeEach(() => {
      tokenStore.reset();
      (tokenStore as any).fastCookieConsumed = false;
      jest.clearAllTimers();
    });

    it('should consume fast cookie, set state, and schedule refresh for valid JWT', async () => {
      const now = Math.floor(Date.now() / 1000);
      const fastToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
        JSON.stringify({
          sub: 'user_456',
          sid: 'session_456',
          exp: now + 7200, // 2 hours from now
        }),
      )}.mock-signature`;

      let cookieValue = `wos-session-token=${fastToken}; Path=/`;
      const cookieSetter = jest.fn();

      Object.defineProperty(global, 'document', {
        value: global.document || {},
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, 'cookie', {
        get: () => cookieValue,
        set: (value: string) => {
          cookieSetter(value);
          cookieValue = value;
        },
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          location: {
            protocol: 'https:',
          },
        },
        writable: true,
        configurable: true,
      });

      // Call getAccessTokenSilently which should trigger lines 246-254
      const token = await tokenStore.getAccessTokenSilently();

      expect(token).toBe(fastToken);

      // Verify state was updated (line 246)
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(fastToken);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();

      // Verify refresh was scheduled (lines 249-252)
      expect(jest.getTimerCount()).toBe(1);

      // Verify cookie was consumed
      expect((tokenStore as any).fastCookieConsumed).toBe(true);
      expect(cookieSetter).toHaveBeenCalledWith('wos-session-token=; Path=/; SameSite=Lax; Max-Age=0; Secure');

      delete (global as any).document;
      delete (global as any).window;
    });
  });

  describe('utility methods and subscriber management', () => {
    it('should calculate refresh delays correctly', () => {
      // Immediate refresh for expiring tokens
      const immediateDelay = (tokenStore as any).getRefreshDelay(30);
      expect(immediateDelay).toBe(0);

      // Normal delay with min/max bounds
      const normalDelay = (tokenStore as any).getRefreshDelay(3600);
      expect(normalDelay).toBeGreaterThan(0);
      expect(normalDelay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('should escape regex special characters', () => {
      const escaped = (tokenStore as any).escapeRegExp('test.token+with*special[chars]');
      expect(escaped).toBe('test\\.token\\+with\\*special\\[chars\\]');
    });

    it('should manage listener subscriptions and notifications', () => {
      const listener = jest.fn();
      const unsubscribe = tokenStore.subscribe(listener);

      // Trigger notification
      (tokenStore as any).setState({ token: 'new-token' });
      expect(listener).toHaveBeenCalled();

      // Test unsubscribe
      unsubscribe();
      expect((tokenStore as any).listeners.has(listener)).toBe(false);
    });

    it('should handle compatibility methods gracefully', () => {
      expect(() => tokenStore.initializeFromFastCookie()).not.toThrow();
    });
  });

  describe('refresh state update conditions', () => {
    it('should skip state update when silent refresh returns unchanged token', async () => {
      const existingToken = 'existing-token';

      // Set up existing token
      (getAccessTokenAction as jest.Mock).mockResolvedValue(existingToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      (refreshAccessTokenAction as jest.Mock).mockClear();

      // Mock refresh to return same token
      (refreshAccessTokenAction as jest.Mock).mockResolvedValue(existingToken);

      // Call silent refresh with unchanged token (should skip state update)
      const result = await (tokenStore as any).refreshTokenSilently();

      expect(result).toBe(existingToken);
    });

    it('should convert non-Error objects to Error instances in catch block', async () => {
      const errorString = 'network timeout';

      // Mock refresh to throw a string instead of Error object
      (refreshAccessTokenAction as jest.Mock).mockRejectedValue(errorString);

      try {
        await tokenStore.refreshToken();
      } catch (e) {
        // Expected to throw
      }

      // Verify the string was converted to Error object
      const state = tokenStore.getSnapshot();
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toBe(errorString);
    });

    it('should preserve Error instances without conversion in catch block', async () => {
      const errorInstance = new Error('actual error instance');

      // Mock refresh to throw an Error instance
      (refreshAccessTokenAction as jest.Mock).mockRejectedValue(errorInstance);

      try {
        await tokenStore.refreshToken();
      } catch (e) {
        // Expected to throw
      }

      // Verify the Error instance was preserved without conversion
      const state = tokenStore.getSnapshot();
      expect(state.error).toBe(errorInstance); // Same instance, not a new one
    });

    it('should always update state for manual refresh regardless of token change', async () => {
      const oldToken = 'old-token';
      const newToken = 'new-token';

      // Set up old token
      (getAccessTokenAction as jest.Mock).mockResolvedValue(oldToken);
      await tokenStore.getAccessTokenSilently();

      // Mock refresh to return new token
      (refreshAccessTokenAction as jest.Mock).mockResolvedValue(newToken);

      // Call manual refresh (not silent) which should always update state
      const result = await tokenStore.refreshToken();

      expect(result).toBe(newToken);
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(newToken);
    });
  });
});
