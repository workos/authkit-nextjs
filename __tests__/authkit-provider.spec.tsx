import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthKitProvider, useAuth } from '../src/components/authkit-provider.js';
import {
  checkSessionAction,
  getAuthAction,
  refreshAuthAction,
  handleSignOutAction,
  switchToOrganizationAction,
} from '../src/actions.js';

jest.mock('../src/actions', () => ({
  checkSessionAction: jest.fn(),
  getAuthAction: jest.fn(),
  refreshAuthAction: jest.fn(),
  handleSignOutAction: jest.fn(),
  switchToOrganizationAction: jest.fn(),
}));

describe('AuthKitProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children', async () => {
    const { getByText } = await act(async () => {
      return render(
        <AuthKitProvider>
          <div>Test Child</div>
        </AuthKitProvider>,
      );
    });

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('should do nothing if onSessionExpired is false', async () => {
    jest.spyOn(window, 'addEventListener');

    await act(async () => {
      render(
        <AuthKitProvider onSessionExpired={false}>
          <div>Test Child</div>
        </AuthKitProvider>,
      );
    });

    // expect window to not have an event listener
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it('should call onSessionExpired when session is expired', async () => {
    (checkSessionAction as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    const onSessionExpired = jest.fn();

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    act(() => {
      // Simulate visibility change
      window.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalled();
    });
  });

  it('should only call onSessionExpired once if multiple visibility changes occur', async () => {
    (checkSessionAction as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    const onSessionExpired = jest.fn();

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    act(() => {
      // Simulate visibility change twice
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
  });

  it('should pass through if checkSessionAction does not throw "Failed to fetch"', async () => {
    (checkSessionAction as jest.Mock).mockResolvedValueOnce(false);

    const onSessionExpired = jest.fn();

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    act(() => {
      // Simulate visibility change
      window.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });

  it('should reload the page when session is expired and no onSessionExpired handler is provided', async () => {
    (checkSessionAction as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));

    const originalLocation = window.location;

    // @ts-expect-error - we're deleting the property to test the mock
    delete window.location;

    window.location = { ...window.location, reload: jest.fn() };

    render(
      <AuthKitProvider>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    act(() => {
      // Simulate visibility change
      window.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(window.location.reload).toHaveBeenCalled();
    });

    // Restore original reload function
    window.location = originalLocation;
  });

  it('should not call onSessionExpired or reload the page if session is valid', async () => {
    (checkSessionAction as jest.Mock).mockResolvedValueOnce(true);
    const onSessionExpired = jest.fn();

    const originalLocation = window.location;

    // @ts-expect-error - we're deleting the property to test the mock
    delete window.location;

    window.location = { ...window.location, reload: jest.fn() };

    render(
      <AuthKitProvider onSessionExpired={onSessionExpired}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    act(() => {
      // Simulate visibility change
      window.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(onSessionExpired).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    });

    window.location = originalLocation;
  });
});

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call getAuth when a user is not returned when ensureSignedIn is true', async () => {
    // First and second calls return no user, second call returns a user
    (getAuthAction as jest.Mock)
      .mockResolvedValueOnce({ user: null, loading: true })
      .mockResolvedValueOnce({ user: { email: 'test@example.com' }, loading: false });

    const TestComponent = () => {
      const auth = useAuth({ ensureSignedIn: true });
      return <div data-testid="email">{auth.user?.email}</div>;
    };

    const { getByTestId } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    await waitFor(() => {
      expect(getAuthAction).toHaveBeenCalledTimes(2);
      expect(getAuthAction).toHaveBeenLastCalledWith({ ensureSignedIn: true });
      expect(getByTestId('email')).toHaveTextContent('test@example.com');
    });
  });

  it('should throw error when used outside of AuthKitProvider', () => {
    const TestComponent = () => {
      const auth = useAuth();
      return <div>{auth.user?.email}</div>;
    };

    // Suppress console.error for this test since we expect an error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthKitProvider');

    consoleSpy.mockRestore();
  });

  it('should provide auth context values when used within AuthKitProvider', async () => {
    (getAuthAction as jest.Mock).mockResolvedValueOnce({
      user: { email: 'test@example.com' },
      sessionId: 'test-session',
      organizationId: 'test-org',
      role: 'admin',
      permissions: ['read', 'write'],
      entitlements: ['feature1'],
      impersonator: { email: 'admin@example.com' },
    });

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="loading">{auth.loading.toString()}</div>
          <div data-testid="email">{auth.user?.email}</div>
          <div data-testid="session">{auth.sessionId}</div>
          <div data-testid="org">{auth.organizationId}</div>
        </div>
      );
    };

    const { getByTestId } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    // Initially loading
    expect(getByTestId('loading')).toHaveTextContent('true');

    // Wait for auth to load
    await waitFor(() => {
      expect(getByTestId('loading')).toHaveTextContent('false');
      expect(getByTestId('email')).toHaveTextContent('test@example.com');
      expect(getByTestId('session')).toHaveTextContent('test-session');
      expect(getByTestId('org')).toHaveTextContent('test-org');
    });
  });

  it('should handle auth methods (getAuth and refreshAuth)', async () => {
    const mockAuth = {
      user: { email: 'test@example.com' },
      sessionId: 'test-session',
    };

    (getAuthAction as jest.Mock).mockResolvedValueOnce(mockAuth);
    (refreshAuthAction as jest.Mock).mockResolvedValueOnce({
      ...mockAuth,
      sessionId: 'new-session',
    });

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="session">{auth.sessionId}</div>
          <button onClick={() => auth.refreshAuth()}>Refresh</button>
        </div>
      );
    };

    const { getByTestId, getByRole } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('session')).toHaveTextContent('test-session');
    });

    // Test refresh
    act(() => {
      getByRole('button').click();
    });

    await waitFor(() => {
      expect(getByTestId('session')).toHaveTextContent('new-session');
    });
  });

  it('should handle switching organizations', async () => {
    const mockAuth = {
      user: { email: 'test@example.com' },
      sessionId: 'test-session',
      organizationId: 'new-org',
    };

    (getAuthAction as jest.Mock)
      .mockResolvedValue(mockAuth)
      .mockResolvedValueOnce({ ...mockAuth, organizationId: 'old-org' });
    (switchToOrganizationAction as jest.Mock).mockResolvedValueOnce(mockAuth);

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="org">{auth.organizationId}</div>
          <button onClick={async () => await auth.switchToOrganization('test-org')}>Switch Organization</button>
        </div>
      );
    };

    const { getByTestId, getByRole } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('org')).toHaveTextContent('old-org');
    });

    // Test refresh
    act(() => {
      getByRole('button').click();
    });

    await waitFor(() => {
      expect(getByTestId('org')).toHaveTextContent('new-org');
    });
  });

  it('should receive an error when refreshAuth fails with an error', async () => {
    (refreshAuthAction as jest.Mock).mockRejectedValueOnce(new Error('Refresh failed'));

    let error: string | undefined;

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="session">{auth.sessionId}</div>
          <button
            onClick={async () => {
              const result = await auth.refreshAuth();
              error = result?.error;
            }}
          >
            Refresh
          </button>
        </div>
      );
    };

    const { getByRole } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    act(() => {
      getByRole('button').click();
    });

    await waitFor(() => {
      expect(error).toBe('Refresh failed');
    });
  });

  it('should receive an error when refreshAuth fails with a string error', async () => {
    (refreshAuthAction as jest.Mock).mockRejectedValueOnce('Refresh failed');

    let error: string | undefined;

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="session">{auth.sessionId}</div>
          <button
            onClick={async () => {
              const result = await auth.refreshAuth();
              error = result?.error;
            }}
          >
            Refresh
          </button>
        </div>
      );
    };

    const { getByRole } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    act(() => {
      getByRole('button').click();
    });

    await waitFor(() => {
      expect(error).toBe('Refresh failed');
    });
  });

  it('should call handleSignOutAction when signOut is called', async () => {
    (handleSignOutAction as jest.Mock).mockResolvedValueOnce({});

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="session">{auth.sessionId}</div>
          <button onClick={() => auth.signOut()}>Sign out</button>
        </div>
      );
    };

    const { getByRole } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    await act(async () => {
      getByRole('button').click();
    });

    expect(handleSignOutAction).toHaveBeenCalled();
  });

  it('should pass returnTo parameter to handleSignOutAction', async () => {
    (handleSignOutAction as jest.Mock).mockResolvedValueOnce({});

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="session">{auth.sessionId}</div>
          <button onClick={() => auth.signOut({ returnTo: '/home' })}>Sign out</button>
        </div>
      );
    };

    const { getByRole } = render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    await act(async () => {
      getByRole('button').click();
    });

    expect(handleSignOutAction).toHaveBeenCalledWith({ returnTo: '/home' });
  });
});
