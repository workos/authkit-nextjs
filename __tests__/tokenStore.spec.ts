import { tokenStore, TokenStore } from '../src/components/tokenStore.js';
import { getAccessTokenAction, refreshAccessTokenAction } from '../src/actions.js';

jest.mock('../src/actions.js', () => ({
  getAccessTokenAction: jest.fn(),
  refreshAccessTokenAction: jest.fn(),
}));

const mockGetAccessTokenAction = getAccessTokenAction as jest.Mock;
const mockRefreshAccessTokenAction = refreshAccessTokenAction as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _global = global as any;

describe('tokenStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    tokenStore.reset();

    // Clean up DOM globals
    delete _global.document;
    delete _global.window;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    tokenStore.reset();
    jest.restoreAllMocks();

    // Clean up DOM globals
    delete _global.document;
    delete _global.window;
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

      mockRefreshAccessTokenAction.mockReturnValue(slowPromise);

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

      // Set token in store first
      mockGetAccessTokenAction.mockResolvedValue(mockToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      mockGetAccessTokenAction.mockClear();
      mockRefreshAccessTokenAction.mockClear();

      // Now call getAccessToken - should return cached token
      const token = await tokenStore.getAccessToken();

      expect(token).toBe(mockToken);
      expect(mockGetAccessTokenAction).not.toHaveBeenCalled();
      expect(mockRefreshAccessTokenAction).not.toHaveBeenCalled();
    });

    it('should return existing opaque token without refreshing', async () => {
      const opaqueToken = 'opaque-token-string';

      // Set opaque token in store first
      mockGetAccessTokenAction.mockResolvedValue(opaqueToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      mockGetAccessTokenAction.mockClear();
      mockRefreshAccessTokenAction.mockClear();

      // Now call getAccessToken - should return cached opaque token
      const token = await tokenStore.getAccessToken();

      expect(token).toBe(opaqueToken);
      expect(mockGetAccessTokenAction).not.toHaveBeenCalled();
      expect(mockRefreshAccessTokenAction).not.toHaveBeenCalled();
    });

    it('should refresh when JWT is expiring', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiringPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 25, // Within 60-second buffer
        iat: currentTimeInSeconds - 35,
      };
      const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiringPayload))}.mock-signature`;

      const refreshedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

      // Set expiring token first
      mockGetAccessTokenAction.mockResolvedValue(expiringToken);
      await tokenStore.getAccessTokenSilently();

      // Setup refresh mock
      mockRefreshAccessTokenAction.mockResolvedValue(refreshedToken);

      // Now call getAccessToken - should trigger refresh
      const token = await tokenStore.getAccessToken();

      expect(token).toBe(refreshedToken);
      expect(mockRefreshAccessTokenAction).toHaveBeenCalled();
    });

    it('should refresh when no token exists', async () => {
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      mockGetAccessTokenAction.mockResolvedValue(mockToken);

      const token = await tokenStore.getAccessToken();

      expect(token).toBe(mockToken);
      expect(mockGetAccessTokenAction).toHaveBeenCalled();
    });
  });

  describe('parseToken behavior', () => {
    it('should handle token with no exp field', () => {
      const tokenWithoutExp = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({ sub: '123' }))}.mock-signature`;

      const result = tokenStore.parseToken(tokenWithoutExp);

      // Token without exp field should return null (treated as opaque)
      expect(result).toBeNull();
    });

    it('should identify expired tokens', () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds - 10, // Already expired
        iat: currentTimeInSeconds - 70,
      };
      const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiredPayload))}.mock-signature`;

      const result = tokenStore.parseToken(expiredToken);

      expect(result).not.toBeNull();
      expect(result?.isExpiring).toBe(true);
      expect(result?.expiresAt).toBe(expiredPayload.exp);
    });

    it('should trigger refresh for expired tokens during silent fetch', async () => {
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

      mockGetAccessTokenAction.mockResolvedValue(expiredToken);
      mockRefreshAccessTokenAction.mockResolvedValue(refreshedToken);

      const token = await tokenStore.getAccessTokenSilently();

      // Should have triggered refresh due to expired token
      expect(mockRefreshAccessTokenAction).toHaveBeenCalled();
      expect(token).toBe(refreshedToken);
    });
  });

  describe('refresh scheduling', () => {
    it('should schedule background refresh for valid tokens', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const validPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 3600, // 1 hour from now
        iat: currentTimeInSeconds - 40,
      };
      const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(validPayload))}.mock-signature`;

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      mockGetAccessTokenAction.mockResolvedValue(validToken);

      await tokenStore.getAccessTokenSilently();

      // Should have scheduled background refresh
      expect(setTimeoutSpy).toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
    });
  });

  describe('subscriber management', () => {
    it('should notify subscribers when state changes', () => {
      const listener = jest.fn();
      const unsubscribe = tokenStore.subscribe(listener);

      // Trigger a state change
      tokenStore.clearToken();

      expect(listener).toHaveBeenCalled();

      // Test unsubscribe prevents future notifications
      unsubscribe();
      listener.mockClear();

      tokenStore.clearToken();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should clear refresh timeout when last subscriber unsubscribes', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const validPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 3600, // 1 hour from now
        iat: currentTimeInSeconds - 40,
      };
      const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(validPayload))}.mock-signature`;

      mockGetAccessTokenAction.mockResolvedValue(validToken);

      // Subscribe to create a listener
      const listener = jest.fn();
      const unsubscribe = tokenStore.subscribe(listener);

      // Get token to schedule a refresh
      await tokenStore.getAccessTokenSilently();

      // Spy on clearTimeout
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Unsubscribe the last (only) subscriber - should clear timeout
      unsubscribe();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('token refresh behavior', () => {
    it('should refresh expiring token during subsequent access', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const expiringPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 25, // Within 60-second buffer
        iat: currentTimeInSeconds - 35,
      };
      const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(expiringPayload))}.mock-signature`;

      const refreshedToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

      // First set an expiring token
      mockGetAccessTokenAction.mockResolvedValue(expiringToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks
      mockGetAccessTokenAction.mockClear();

      // Setup refresh to return new token
      mockRefreshAccessTokenAction.mockResolvedValue(refreshedToken);

      // Call getAccessToken again - should trigger refresh due to expiring token
      const token = await tokenStore.getAccessToken();

      // Should have called refresh since existing token was expiring
      expect(mockRefreshAccessTokenAction).toHaveBeenCalled();
      expect(token).toBe(refreshedToken);
    });
  });

  describe('getAccessTokenSilently caching behavior', () => {
    it('should return cached opaque token without making server call', async () => {
      const opaqueToken = 'opaque-token-value';

      // Set opaque token first
      mockGetAccessTokenAction.mockResolvedValue(opaqueToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks to verify no additional calls
      mockGetAccessTokenAction.mockClear();
      mockRefreshAccessTokenAction.mockClear();

      // Call again - should return cached opaque token
      const token = await tokenStore.getAccessTokenSilently();

      expect(token).toBe(opaqueToken);
      expect(mockGetAccessTokenAction).not.toHaveBeenCalled();
      expect(mockRefreshAccessTokenAction).not.toHaveBeenCalled();
    });

    it('should return cached valid JWT token without making server call', async () => {
      const validToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

      // Set valid token first
      mockGetAccessTokenAction.mockResolvedValue(validToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks to verify no additional calls
      mockGetAccessTokenAction.mockClear();
      mockRefreshAccessTokenAction.mockClear();

      // Call again - should return cached valid token
      const token = await tokenStore.getAccessTokenSilently();

      expect(token).toBe(validToken);
      expect(mockGetAccessTokenAction).not.toHaveBeenCalled();
      expect(mockRefreshAccessTokenAction).not.toHaveBeenCalled();
    });
  });

  describe('eager auth cookie handling', () => {
    beforeEach(() => {
      tokenStore.reset();
    });

    it('should consume eager auth cookie on first getAccessToken call', async () => {
      const eagerToken = 'eager-auth-token';
      const mockCookieSetter = jest.fn();

      // Mock document.cookie with both getter and setter
      let cookieValue = `workos-access-token=${eagerToken};`;

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

      const token = await tokenStore.getAccessToken();

      expect(token).toBe(eagerToken);
      // Verify cookie was deleted after consumption
      expect(mockCookieSetter).toHaveBeenCalledWith('workos-access-token=; SameSite=Lax; Max-Age=0; Secure');

      // Verify token is now in state
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(eagerToken);
    });

    it('should schedule refresh for fast cookie with expiry', async () => {
      const now = Math.floor(Date.now() / 1000);
      const fastPayload = {
        sub: 'user_456',
        sid: 'session_456',
        exp: now + 7200, // 2 hours from now
        iat: now - 40,
      };
      const fastToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(fastPayload))}.mock-signature`;
      const mockCookieSetter = jest.fn();

      let cookieValue = `workos-access-token=${fastToken};`;

      Object.defineProperty(_global, 'document', {
        value: _global.document || {},
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

      Object.defineProperty(_global, 'window', {
        value: {
          location: {
            protocol: 'https:',
          },
        },
        writable: true,
        configurable: true,
      });

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Call getAccessTokenSilently to trigger fast cookie consumption and refresh scheduling
      const token = await tokenStore.getAccessTokenSilently();

      expect(token).toBe(fastToken);
      expect(setTimeoutSpy).toHaveBeenCalled();

      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(fastToken);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();

      setTimeoutSpy.mockRestore();
    });

    it('should handle server-side environment without document', async () => {
      // Ensure document is undefined to simulate server environment
      delete _global.document;

      mockGetAccessTokenAction.mockResolvedValue('server-token');

      const token = await tokenStore.getAccessToken();

      expect(token).toBe('server-token');
      expect(mockGetAccessTokenAction).toHaveBeenCalled();
    });

    it('should handle environment without cookie when consuming fast cookie', async () => {
      Object.defineProperty(_global, 'document', {
        value: {
          cookie: '', // Empty cookie string
        },
        writable: true,
        configurable: true,
      });

      mockGetAccessTokenAction.mockResolvedValue('fallback-token');

      const token = await tokenStore.getAccessToken();

      expect(token).toBe('fallback-token');
      expect(mockGetAccessTokenAction).toHaveBeenCalled();
    });

    it('should handle HTTP protocol for cookie deletion', async () => {
      const eagerToken = 'http-token';
      const mockCookieSetter = jest.fn();

      let cookieValue = `workos-access-token=${eagerToken};`;

      Object.defineProperty(_global, 'document', {
        value: _global.document || {},
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

      Object.defineProperty(_global, 'window', {
        value: {
          location: {
            protocol: 'http:', // HTTP instead of HTTPS
          },
        },
        writable: true,
        configurable: true,
      });

      const token = await tokenStore.getAccessToken();

      expect(token).toBe(eagerToken);
      // Verify cookie was deleted without Secure flag for HTTP
      expect(mockCookieSetter).toHaveBeenCalledWith('workos-access-token=; SameSite=Lax; Max-Age=0');
    });
  });

  describe('error recovery', () => {
    it('should preserve existing token when refresh fails', async () => {
      const existingToken = 'existing-valid-token';

      // Set up existing token
      mockGetAccessTokenAction.mockResolvedValue(existingToken);
      await tokenStore.getAccessTokenSilently();

      // Now simulate network error during refresh
      mockRefreshAccessTokenAction.mockRejectedValue(new Error('Network error'));

      try {
        await tokenStore.refreshToken();
      } catch (e) {
        // Expected to throw
      }

      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(existingToken); // Token preserved for retry
      expect(state.error).toBeTruthy();
      expect(state.loading).toBe(false);
    });

    it('should convert non-Error objects to Error instances', async () => {
      const errorString = 'network timeout';

      mockRefreshAccessTokenAction.mockRejectedValue(errorString);

      try {
        await tokenStore.refreshToken();
      } catch (e) {
        // Expected to throw
      }

      const state = tokenStore.getSnapshot();
      expect(state.error).toBeInstanceOf(Error);
      expect(state.error?.message).toBe(errorString);
    });
  });

  describe('short-lived token handling', () => {
    it('should use appropriate buffer for short-lived tokens', () => {
      const now = Math.floor(Date.now() / 1000);
      const shortLivedPayload = {
        sub: 'user_123',
        sid: 'session_123',
        iat: now,
        exp: now + 60, // 60 seconds - typical WorkOS token
      };

      const tokenString = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
        JSON.stringify(shortLivedPayload),
      )}.mock-signature`;

      const result = tokenStore.parseToken(tokenString);

      expect(result).toBeTruthy();
      // With 30-second buffer for short tokens, 60-second token should not be expiring immediately
      expect(result?.isExpiring).toBe(false);

      // But should be expiring when only 25 seconds left
      const nearExpiryPayload = {
        ...shortLivedPayload,
        exp: now + 25,
      };
      const nearExpiryToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
        JSON.stringify(nearExpiryPayload),
      )}.mock-signature`;

      const nearExpiryResult = tokenStore.parseToken(nearExpiryToken);
      expect(nearExpiryResult?.isExpiring).toBe(true);
    });
  });

  describe('clearToken', () => {
    it('should clear token and reset state', () => {
      // First set a token
      mockGetAccessTokenAction.mockResolvedValue('test-token');

      // Call clearToken
      tokenStore.clearToken();

      const state = tokenStore.getSnapshot();
      expect(state.token).toBeUndefined();
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('should clear refresh timeout when token is cleared', async () => {
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      const validPayload = {
        sub: '1234567890',
        sid: 'session_123',
        exp: currentTimeInSeconds + 3600, // 1 hour from now
        iat: currentTimeInSeconds - 40,
      };
      const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(validPayload))}.mock-signature`;

      mockGetAccessTokenAction.mockResolvedValue(validToken);

      // Subscribe to prevent timeout from being cleared automatically
      const unsubscribe = tokenStore.subscribe(() => {});

      // Get token to schedule a refresh
      await tokenStore.getAccessTokenSilently();

      // Spy on clearTimeout
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Clear token should clear the refresh timeout
      tokenStore.clearToken();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      unsubscribe();
      clearTimeoutSpy.mockRestore();
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

      mockRefreshAccessTokenAction.mockImplementation(() => {
        callCount++;
        return slowPromise;
      });

      // Clear any existing refresh promise
      tokenStore.reset();

      // Start first refresh
      const promise1 = tokenStore.refreshToken();

      // Start second refresh immediately while first is still pending
      const promise2 = tokenStore.refreshToken();

      // Verify both calls eventually get the same result
      resolvePromise!(mockToken);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should get the token
      expect(result1).toBe(mockToken);
      expect(result2).toBe(mockToken);

      // The key test: only one actual refresh should have been called
      expect(callCount).toBe(1);
    });
  });

  describe('compatibility and state management', () => {
    it('should handle compatibility methods gracefully', () => {
      expect(() => tokenStore.initializeFromFastCookie()).not.toThrow();
    });

    it('should reset to clean state', () => {
      // Set some state first
      tokenStore.clearToken();

      // Reset completely
      tokenStore.reset();

      const state = tokenStore.getSnapshot();
      expect(state.token).toBeUndefined();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('refresh state management', () => {
    it('should preserve Error instances without conversion', async () => {
      const errorInstance = new Error('actual error instance');

      // Mock refresh to throw an Error instance
      mockRefreshAccessTokenAction.mockRejectedValue(errorInstance);

      try {
        await tokenStore.refreshToken();
      } catch (e) {
        // Expected to throw
      }

      // Verify the Error instance was preserved without conversion
      const state = tokenStore.getSnapshot();
      expect(state.error).toBe(errorInstance); // Same instance, not a new one
    });

    it('should update state for manual refresh', async () => {
      const oldToken = 'old-token';
      const newToken = 'new-token';

      // Set up old token
      mockGetAccessTokenAction.mockResolvedValue(oldToken);
      await tokenStore.getAccessTokenSilently();

      // Mock refresh to return new token
      mockRefreshAccessTokenAction.mockResolvedValue(newToken);

      // Call manual refresh which should update state
      const result = await tokenStore.refreshToken();

      expect(result).toBe(newToken);
      const state = tokenStore.getSnapshot();
      expect(state.token).toBe(newToken);
    });

    it('should skip state update for silent refresh when token unchanged', async () => {
      const existingToken = 'unchanged-token';

      // Set up existing token
      mockGetAccessTokenAction.mockResolvedValue(existingToken);
      await tokenStore.getAccessTokenSilently();

      // Clear mocks and set up spy on setState
      mockGetAccessTokenAction.mockClear();
      mockRefreshAccessTokenAction.mockResolvedValue(existingToken); // Same token

      const listener = jest.fn();
      tokenStore.subscribe(listener);

      // Force a silent refresh that returns the same token
      await tokenStore.refreshToken();

      // Verify state was updated despite same token (manual refresh always updates)
      expect(listener).toHaveBeenCalled();
      expect(tokenStore.getSnapshot().loading).toBe(false);
    });
  });

  describe('TokenStore constructor', () => {
    const setupMockEnv = (cookieValue = '', protocol = 'https:') => {
      const mockCookieSetter = jest.fn();

      Object.defineProperty(_global, 'document', {
        value: { cookie: cookieValue },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, 'cookie', {
        get: () => cookieValue,
        set: mockCookieSetter,
        configurable: true,
      });

      Object.defineProperty(_global, 'window', {
        value: { location: { protocol } },
        writable: true,
        configurable: true,
      });

      return mockCookieSetter;
    };

    it('should initialize with cookie when present', () => {
      const token = 'constructor-token';
      const mockSetter = setupMockEnv(`workos-access-token=${token};`);

      const store = new TokenStore();

      expect(mockSetter).toHaveBeenCalledWith('workos-access-token=; SameSite=Lax; Max-Age=0; Secure');
      expect(store.getSnapshot().token).toBe(token);
    });

    it('should initialize without cookie when document is undefined', () => {
      delete _global.document;

      const store = new TokenStore();

      expect(store.getSnapshot().token).toBeUndefined();
    });

    it('should initialize without cookie when no matching cookie found', () => {
      setupMockEnv('other-cookie=value; different-cookie=another-value');

      const store = new TokenStore();

      expect(store.getSnapshot().token).toBeUndefined();
    });

    it('should prevent duplicate cookie consumption', async () => {
      const token = 'already-consumed-token';
      setupMockEnv(`workos-access-token=${token};`);

      const store = new TokenStore();

      // Cookie consumed during construction, getAccessToken should return cached token
      const result = await store.getAccessToken();

      expect(result).toBe(token);
    });
  });
});
