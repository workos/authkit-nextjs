import '@testing-library/jest-dom';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { getAccessTokenAction, refreshAccessTokenAction } from '../actions.js';
import { useAuth } from './authkit-provider.js';
import { useAccessToken } from './useAccessToken.js';
import { tokenStore } from './tokenStore.js';

vi.mock('../actions.js', () => ({
  getAccessTokenAction: vi.fn(),
  refreshAccessTokenAction: vi.fn(),
}));

vi.mock('./authkit-provider.js', async () => {
  const originalModule = await vi.importActual<typeof import('./authkit-provider.js')>('./authkit-provider.js');
  return {
    ...originalModule,
    useAuth: vi.fn(),
  };
});

describe('useAccessToken', () => {
  beforeEach(() => {
    tokenStore.reset();
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    tokenStore.reset();
    vi.clearAllMocks();
  });

  const TestComponent = () => {
    const { accessToken, loading, error, refresh } = useAccessToken();
    return (
      <div>
        <div data-testid="token">{accessToken || 'no-token'}</div>
        <div data-testid="loading">{loading.toString()}</div>
        <div data-testid="error">{error?.message || 'no-error'}</div>
        <button data-testid="refresh" onClick={() => refresh().catch(() => {})}>
          Refresh
        </button>
      </div>
    );
  };

  it('should fetch an access token on mount and show loading state initially', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    (getAccessTokenAction as Mock).mockResolvedValueOnce(mockToken);

    const { getByTestId } = render(<TestComponent />);

    // Loading should be true during initial fetch
    expect(getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });
  });

  it('should handle token refresh when an expiring token is received', async () => {
    // Create a token that's about to expire (exp is very close to current time)
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    // Use 25 seconds to ensure it's within the 30-second buffer for short-lived tokens
    const payload = {
      sub: '1234567890',
      sid: 'session_123',
      exp: currentTimeInSeconds + 25,
      iat: currentTimeInSeconds - 35,
    };
    const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as Mock).mockResolvedValueOnce(expiringToken);
    (refreshAccessTokenAction as Mock).mockResolvedValueOnce(refreshedToken);

    const { getByTestId } = render(<TestComponent />);

    // Loading should be true initially during token fetch
    expect(getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should handle token refresh on manual refresh and show loading state', async () => {
    const initialToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    (getAccessTokenAction as Mock).mockResolvedValueOnce(initialToken);
    (refreshAccessTokenAction as Mock).mockResolvedValueOnce(refreshedToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
      expect(getByTestId('loading')).toHaveTextContent('false');
    });

    act(() => {
      getByTestId('refresh').click();
    });

    // Should show loading for user-initiated refresh
    expect(getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
      expect(getByTestId('loading')).toHaveTextContent('false');
    });
  });

  it('should handle the not loggged in state', async () => {
    (useAuth as Mock).mockImplementation(() => ({
      user: undefined,
      sessionId: undefined,
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should handle errors during token fetch', async () => {
    const error = new Error('Failed to fetch token');
    (getAccessTokenAction as Mock).mockRejectedValueOnce(error);

    const { getByTestId } = render(<TestComponent />);

    // Loading should be true initially
    expect(getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('error')).toHaveTextContent('Failed to fetch token');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should handle errors during manual refresh', async () => {
    const initialToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const error = new Error('Failed to refresh token');

    (getAccessTokenAction as Mock).mockResolvedValueOnce(initialToken);
    (refreshAccessTokenAction as Mock).mockRejectedValueOnce(error);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });

    await act(async () => {
      getByTestId('refresh').click();
    });

    await waitFor(() => {
      expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
      expect(getByTestId('error')).toHaveTextContent('Failed to refresh token');
      // Token should be preserved on error
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });
  });

  it('should reset token state when user is undefined', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    (getAccessTokenAction as Mock).mockResolvedValueOnce(mockToken);

    // First render with user
    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const { getByTestId, rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    (useAuth as Mock).mockImplementation(() => ({
      user: undefined,
      sessionId: undefined,
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    rerender(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should handle invalid tokens gracefully', async () => {
    const invalidToken = 'invalid-token';
    (getAccessTokenAction as Mock).mockResolvedValueOnce(invalidToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      // Invalid tokens (non-JWT) are stored as opaque tokens, not rejected
      expect(getByTestId('token')).toHaveTextContent(invalidToken);
    });
  });

  it('should retry fetching when an error occurs without showing loading', async () => {
    const error = new Error('Failed to fetch token');
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as Mock).mockRejectedValueOnce(error).mockResolvedValueOnce(mockToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('error')).toHaveTextContent('Failed to fetch token');
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000); // RETRY_DELAY
    });

    // Loading should remain false during retry
    expect(getByTestId('loading')).toHaveTextContent('false');

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
      expect(getByTestId('token')).toHaveTextContent(mockToken);
      expect(getByTestId('loading')).toHaveTextContent('false');
    });
  });

  it('should handle errors when refreshing an expiring token', async () => {
    // Create a token that's about to expire
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    // Use 25 seconds to ensure it's within the 30-second buffer for short-lived tokens
    const payload = {
      sub: '1234567890',
      sid: 'session_123',
      exp: currentTimeInSeconds + 25,
      iat: currentTimeInSeconds - 35,
    };
    const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;
    const error = new Error('Failed to refresh token');

    (getAccessTokenAction as Mock).mockResolvedValueOnce(expiringToken);
    (refreshAccessTokenAction as Mock).mockRejectedValueOnce(error);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('error')).toHaveTextContent('Failed to refresh token');
      // The expiring token should still be preserved despite the error
      expect(getByTestId('token')).toHaveTextContent(expiringToken);
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should handle token with an invalid payload format', async () => {
    const badPayloadToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.mock-signature';
    (getAccessTokenAction as Mock).mockResolvedValueOnce(badPayloadToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      // Invalid payload tokens are still stored as opaque tokens
      expect(getByTestId('token')).toHaveTextContent(badPayloadToken);
    });
  });

  it('should immediately try to update token when token is undefined', async () => {
    (getAccessTokenAction as Mock).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should react to sessionId changes', async () => {
    // Clear any previous mocks to ensure clean state
    vi.clearAllMocks();

    const token1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-1';
    const token2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    (getAccessTokenAction as Mock).mockResolvedValueOnce(token1).mockResolvedValueOnce(token2);

    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user1' },
      sessionId: 'session1',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const { rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user1' }, // Same user ID
      sessionId: 'session2',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    rerender(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
    });
  });

  it('should prevent concurrent token fetches via updateToken', async () => {
    vi.clearAllMocks();
    (getAccessTokenAction as Mock).mockReset();

    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    let fetchCalls = 0;

    const tokenPromise = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve(mockToken);
      }, 0);
    });

    (getAccessTokenAction as Mock).mockImplementation(() => {
      fetchCalls++;
      return tokenPromise;
    });

    const { getByTestId } = render(<TestComponent />);

    // Loading should be true initially during fetch
    expect(getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(fetchCalls).toBe(1);
    });

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    expect(fetchCalls).toBe(1);
  });

  it('should prevent concurrent manual refresh operations', async () => {
    vi.clearAllMocks();

    let refreshCalls = 0;

    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshPromise = new Promise<string>((resolve) => {
      // Slow promise
      setTimeout(() => resolve(refreshedToken), 10);
    });

    (refreshAccessTokenAction as Mock).mockImplementation(() => {
      refreshCalls++;
      return refreshPromise;
    });

    (getAccessTokenAction as Mock).mockImplementation(() => {
      return Promise.resolve(mockToken);
    });

    const { getByTestId } = render(<TestComponent />);

    // Wait for initial token
    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    // Call refresh twice in succession - should only result in one actual refresh call
    act(() => {
      getByTestId('refresh').click();
      getByTestId('refresh').click();
    });

    // Wait for refresh to complete
    await waitFor(() => {
      expect(refreshCalls).toBe(1);
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
    });

    // Verify that refreshAccessToken was only called once despite two clicks
    expect(refreshCalls).toBe(1);
  });

  it('should handle non-Error objects thrown during token fetch', async () => {
    // Simulate a string error being thrown
    (getAccessTokenAction as Mock).mockImplementation(() => {
      throw 'String error message';
    });

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('error')).toHaveTextContent('String error message');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should show loading state immediately on first render when user exists but no token', () => {
    // Mock user with no token initially
    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    (getAccessTokenAction as Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('token'), 100)),
    );

    const { getByTestId } = render(<TestComponent />);

    expect(getByTestId('loading')).toHaveTextContent('true');
    expect(getByTestId('token')).toHaveTextContent('no-token');
  });

  it('should not show loading when a valid token already exists', async () => {
    const existingToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleGlzdGluZyIsInNpZCI6InNlc3Npb24xMjMiLCJleHAiOjk5OTk5OTk5OTl9.existing';

    await act(async () => {
      (getAccessTokenAction as Mock).mockResolvedValueOnce(existingToken);
      await tokenStore.getAccessTokenSilently();
    });

    // Reset the mock to track new calls
    (getAccessTokenAction as Mock).mockClear();

    const { getByTestId } = render(<TestComponent />);

    expect(getByTestId('loading')).toHaveTextContent('false');
    expect(getByTestId('token')).toHaveTextContent(existingToken);

    expect(getAccessTokenAction).not.toHaveBeenCalled();
  });

  // Additional test cases to increase coverage
  it('should handle concurrent manual refresh attempts', async () => {
    const initialToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    // Setup a delayed promise for the refresh
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveRefreshPromise: (value: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefreshPromise = resolve;
    });

    (refreshAccessTokenAction as Mock).mockReturnValue(refreshPromise);
    (getAccessTokenAction as Mock).mockResolvedValue(initialToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });

    act(() => {
      getByTestId('refresh').click();
    });

    act(() => {
      getByTestId('refresh').click();
    });

    act(() => {
      resolveRefreshPromise!(refreshedToken);
    });

    await waitFor(() => {
      expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1); // Should only call once
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
    });
  });

  it('should clear refresh timeout on unmount', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    (getAccessTokenAction as Mock).mockResolvedValueOnce(mockToken);

    const { getByTestId, unmount } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    unmount();
  });

  it('should handle edge cases when token data is null', async () => {
    // Create a token that resembles a JWT but with a null payload
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bnVsbA==.mock-signature'; // "null" in base64
    (getAccessTokenAction as Mock).mockResolvedValueOnce(token);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
    });

    // Token with invalid/null payload is still stored as opaque token
    expect(getByTestId('token')).toHaveTextContent(token);
  });

  it('should handle errors with string messages instead of Error objects', async () => {
    const error = 'String error message';
    const errorObj = new Error(error);
    (getAccessTokenAction as Mock).mockRejectedValueOnce(errorObj);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('error')).toHaveTextContent(error);
    });
  });

  it('should handle string errors during manual refresh', async () => {
    const initialToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const stringError = 'String error directly'; // Not wrapped in Error object

    (getAccessTokenAction as Mock).mockResolvedValueOnce(initialToken);
    // Mock refreshAccessTokenAction to reject with a string, not an Error object
    (refreshAccessTokenAction as Mock).mockImplementation(() => {
      return Promise.reject(stringError); // Directly reject with string
    });

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });

    await act(async () => {
      getByTestId('refresh').click();
    });

    await waitFor(() => {
      expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
      expect(getByTestId('error')).toHaveTextContent(stringError);
      // Token should be preserved on error
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });
  });

  it('should bypass refresh when token is unchanged but user or sessionId changed', async () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as Mock).mockResolvedValue(token);

    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const { getByTestId, rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(token);
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user_456' }, // Different user
      sessionId: 'session_123', // Same session
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    rerender(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
    });
  });

  it('should handle getAccessToken when user is not authenticated', async () => {
    (useAuth as Mock).mockImplementation(() => ({
      user: null,
      sessionId: undefined,
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const TestComponentWithGetAccessToken = () => {
      const { getAccessToken } = useAccessToken();
      const [result, setResult] = React.useState<string | undefined | null>(null);

      React.useEffect(() => {
        getAccessToken().then((token) => setResult(token || 'no-token'));
      }, [getAccessToken]);

      return <div data-testid="result">{result === null ? 'loading' : result}</div>;
    };

    const { getByTestId } = render(<TestComponentWithGetAccessToken />);

    await waitFor(() => {
      expect(getByTestId('result')).toHaveTextContent('no-token');
    });
  });

  it('should handle getAccessToken when user is authenticated', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as Mock).mockResolvedValue(mockToken);
    (useAuth as Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const TestComponentWithGetAccessToken = () => {
      const { getAccessToken } = useAccessToken();
      const [result, setResult] = React.useState<string | undefined | null>(null);

      React.useEffect(() => {
        // Wait a bit for initial token load, then call getAccessToken
        const timer = setTimeout(() => {
          getAccessToken().then((token) => setResult(token || 'no-token'));
        }, 100);
        return () => clearTimeout(timer);
      }, [getAccessToken]);

      return <div data-testid="result">{result === null ? 'loading' : result}</div>;
    };

    const { getByTestId } = render(<TestComponentWithGetAccessToken />);

    // Advance timers to trigger getAccessToken call
    act(() => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(getByTestId('result')).toHaveTextContent(mockToken);
    });
  });

  it('should handle manual refresh when user is not authenticated', async () => {
    (useAuth as Mock).mockImplementation(() => ({
      user: null,
      sessionId: undefined,
      refreshAuth: vi.fn().mockResolvedValue({}),
    }));

    const TestComponentWithRefresh = () => {
      const { refresh } = useAccessToken();
      const [result, setResult] = React.useState<string | undefined | null>(null);

      React.useEffect(() => {
        refresh().then((token) => setResult(token || 'no-token'));
      }, [refresh]);

      return <div data-testid="result">{result === null ? 'loading' : result}</div>;
    };

    const { getByTestId } = render(<TestComponentWithRefresh />);

    await waitFor(() => {
      expect(getByTestId('result')).toHaveTextContent('no-token');
    });
  });
});
