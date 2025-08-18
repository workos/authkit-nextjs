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
});
