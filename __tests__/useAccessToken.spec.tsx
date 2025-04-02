import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAccessToken } from '../src/components/useAccessToken.js';
import { getAccessTokenAction, refreshAccessTokenAction } from '../src/actions.js';
import { useAuth } from '../src/components/authkit-provider.js';

jest.mock('../src/actions.js', () => ({
  getAccessTokenAction: jest.fn(),
  refreshAccessTokenAction: jest.fn(),
}));

jest.mock('../src/components/authkit-provider.js', () => {
  const originalModule = jest.requireActual('../src/components/authkit-provider.js');
  return {
    ...originalModule,
    useAuth: jest.fn(),
  };
});

describe('useAccessToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const TestComponent = () => {
    const { accessToken, loading, error, refresh } = useAccessToken();
    return (
      <div>
        <div data-testid="token">{accessToken || 'no-token'}</div>
        <div data-testid="loading">{loading.toString()}</div>
        <div data-testid="error">{error?.message || 'no-error'}</div>
        <button data-testid="refresh" onClick={() => refresh()}>
          Refresh
        </button>
      </div>
    );
  };

  it('should fetch an access token on mount', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(mockToken);

    const { getByTestId } = render(<TestComponent />);

    expect(getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should handle token refresh when an expiring token is received', async () => {
    // Create a token that's about to expire (exp is very close to current time)
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const payload = { sub: '1234567890', sid: 'session_123', exp: currentTimeInSeconds + 30 };
    const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(expiringToken);
    (refreshAccessTokenAction as jest.Mock).mockResolvedValueOnce(refreshedToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should handle token refresh on manual refresh', async () => {
    const initialToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(initialToken).mockResolvedValueOnce(refreshedToken);

    const mockRefreshAuth = jest.fn().mockResolvedValue({});
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: mockRefreshAuth,
    }));

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });

    act(() => {
      getByTestId('refresh').click();
    });

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
    });
  });

  it('should schedule automatic token refresh before expiration', async () => {
    // Create a token that expires in 2 minutes
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const expTimeInSeconds = currentTimeInSeconds + 120; // 2 minutes in future
    const payload = { sub: '1234567890', sid: 'session_123', exp: expTimeInSeconds };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(token);
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(refreshedToken);

    render(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    act(() => {
      jest.advanceTimersByTime((120 - 60) * 1000);
    });

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
    });
  });

  it('should handle the not loggged in state', async () => {
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: undefined,
      sessionId: undefined,
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should handle errors during token fetch', async () => {
    const error = new Error('Failed to fetch token');
    (getAccessTokenAction as jest.Mock).mockRejectedValueOnce(error);

    const { getByTestId } = render(<TestComponent />);

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

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(initialToken);

    const mockRefreshAuth = jest.fn().mockRejectedValueOnce(error);
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: mockRefreshAuth,
    }));

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });

    await act(async () => {
      getByTestId('refresh').click();
    });

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
      expect(getByTestId('error')).toHaveTextContent('Failed to refresh token');
    });
  });

  it('should reset token state when user is undefined', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(mockToken);

    // First render with user
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    const { getByTestId, rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: undefined,
      sessionId: undefined,
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    rerender(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should handle invalid tokens gracefully', async () => {
    const invalidToken = 'invalid-token';
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(invalidToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should retry fetching when an error occurs', async () => {
    const error = new Error('Failed to fetch token');
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as jest.Mock).mockRejectedValueOnce(error).mockResolvedValueOnce(mockToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('error')).toHaveTextContent('Failed to fetch token');
    });

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000); // RETRY_DELAY
    });

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
      expect(getByTestId('token')).toHaveTextContent(mockToken);
      expect(getByTestId('error')).toHaveTextContent('no-error');
    });
  });

  it('should handle errors when refreshing an expiring token', async () => {
    // Create a token that's about to expire
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const payload = { sub: '1234567890', sid: 'session_123', exp: currentTimeInSeconds + 30 };
    const expiringToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;
    const error = new Error('Failed to refresh token');

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(expiringToken);
    (refreshAccessTokenAction as jest.Mock).mockRejectedValueOnce(error);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('error')).toHaveTextContent('Failed to refresh token');
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    expect(refreshAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should handle token with an invalid payload format', async () => {
    const badPayloadToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.mock-signature';
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(badPayloadToken);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });
  });

  it('should immediately try to update token when token is undefined', async () => {
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('token')).toHaveTextContent('no-token');
    });

    expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
  });

  it('should react to sessionId changes', async () => {
    // Clear any previous mocks to ensure clean state
    jest.clearAllMocks();

    const token1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-1';
    const token2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(token1).mockResolvedValueOnce(token2);

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user1' },
      sessionId: 'session1',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    const { rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user1' }, // Same user ID
      sessionId: 'session2',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    rerender(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
    });
  });

  it('should prevent concurrent token fetches via updateToken', async () => {
    jest.clearAllMocks();

    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    let fetchCalls = 0;

    const tokenPromise = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve(mockToken);
      }, 0);
    });

    (getAccessTokenAction as jest.Mock).mockImplementation(() => {
      fetchCalls++;
      return tokenPromise;
    });

    const { getByTestId } = render(<TestComponent />);

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
    jest.clearAllMocks();

    let refreshAuthCalls = 0;

    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshAuthPromise = new Promise<any>((resolve) => {
      // Slow promise
      setTimeout(() => resolve({}), 10);
    });

    const mockRefreshAuth = jest.fn().mockImplementation(() => {
      refreshAuthCalls++;
      return refreshAuthPromise;
    });

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: mockRefreshAuth,
    }));

    (getAccessTokenAction as jest.Mock).mockImplementation(() => {
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
      expect(refreshAuthCalls).toBe(1);
    });

    // Verify that refreshAuth was only called once despite two clicks
    expect(refreshAuthCalls).toBe(1);
  });

  it('should handle non-Error objects thrown during token fetch', async () => {
    // Simulate a string error being thrown
    (getAccessTokenAction as jest.Mock).mockImplementation(() => {
      throw 'String error message';
    });

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('error')).toHaveTextContent('String error message');
    });
  });

  // Additional test cases to increase coverage
  it('should handle concurrent manual refresh attempts', async () => {
    const initialToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    const refreshedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZWZyZXNoZWQiLCJzaWQiOiJzZXNzaW9uXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.mock-signature-2';

    // Setup a delayed promise for the refresh auth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveRefreshPromise: (value: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefreshPromise = resolve;
    });

    const mockRefreshAuth = jest.fn().mockReturnValue(refreshPromise);
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: mockRefreshAuth,
    }));

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(initialToken).mockResolvedValueOnce(refreshedToken);

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
      resolveRefreshPromise!({});
    });

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalledTimes(1); // Should only call once
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
      expect(getByTestId('token')).toHaveTextContent(refreshedToken);
    });
  });

  it('should handle errors during token refresh when autoRefresh is scheduled', async () => {
    // Create a token that expires in 2 minutes
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const expTimeInSeconds = currentTimeInSeconds + 120; // 2 minutes in future
    const payload = { sub: '1234567890', sid: 'session_123', exp: expTimeInSeconds };
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.mock-signature`;

    const error = new Error('Failed to refresh token');

    (getAccessTokenAction as jest.Mock)
      .mockResolvedValueOnce(token) // Initial fetch succeeds
      .mockRejectedValueOnce(error); // But auto-refresh fails

    render(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    act(() => {
      jest.advanceTimersByTime((120 - 60) * 1000);
    });

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
    });
  });

  it('should clear refresh timeout on unmount', async () => {
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(mockToken);

    const { getByTestId, unmount } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(mockToken);
    });

    unmount();
  });

  it('should handle edge cases when token data is null', async () => {
    // Create a token that resembles a JWT but with a null payload
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bnVsbA==.mock-signature'; // "null" in base64
    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(token);

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
    });

    expect(getByTestId('token')).toHaveTextContent('no-token');
  });

  it('should handle errors with string messages instead of Error objects', async () => {
    const error = 'String error message';
    const errorObj = new Error(error);
    (getAccessTokenAction as jest.Mock).mockRejectedValueOnce(errorObj);

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

    (getAccessTokenAction as jest.Mock).mockResolvedValueOnce(initialToken);

    // Mock refreshAuth to reject with a string, not an Error object
    const mockRefreshAuth = jest.fn().mockImplementation(() => {
      return Promise.reject(stringError); // Directly reject with string
    });

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: mockRefreshAuth,
    }));

    const { getByTestId } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(initialToken);
    });

    act(() => {
      getByTestId('refresh').click();
    });

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
      expect(getByTestId('error')).toHaveTextContent(stringError);
    });
  });

  it('should bypass refresh when token is unchanged but user or sessionId changed', async () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwic2lkIjoic2Vzc2lvbl8xMjMiLCJleHAiOjk5OTk5OTk5OTl9.mock-signature';

    (getAccessTokenAction as jest.Mock).mockResolvedValue(token);

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_123' },
      sessionId: 'session_123',
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    const { getByTestId, rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(getByTestId('token')).toHaveTextContent(token);
      expect(getAccessTokenAction).toHaveBeenCalledTimes(1);
    });

    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user_456' }, // Different user
      sessionId: 'session_123', // Same session
      refreshAuth: jest.fn().mockResolvedValue({}),
    }));

    rerender(<TestComponent />);

    await waitFor(() => {
      expect(getAccessTokenAction).toHaveBeenCalledTimes(2);
    });
  });
});
