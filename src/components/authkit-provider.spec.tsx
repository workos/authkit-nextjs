import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthKitProvider, useAuth } from './authkit-provider.js';
import {
  checkSessionAction,
  getAuthAction,
  refreshAuthAction,
  handleSignOutAction,
  switchToOrganizationAction,
} from '../actions.js';

vi.mock('../actions', () => ({
  checkSessionAction: vi.fn(),
  getAuthAction: vi.fn(),
  refreshAuthAction: vi.fn(),
  handleSignOutAction: vi.fn(),
  switchToOrganizationAction: vi.fn(),
}));

describe('AuthKitProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should skip initial getAuthAction call when initialAuth is provided', async () => {
    const initialAuth = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
        profilePictureUrl: null,
        firstName: 'Test',
        lastName: 'User',
        object: 'user' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastSignInAt: '2024-01-01T00:00:00Z',
        externalId: null,
        locale: 'en-US',
        metadata: {},
      },
      sessionId: 'test-session',
      organizationId: 'test-org',
      role: 'admin',
      roles: ['admin'],
      permissions: ['read', 'write'],
      entitlements: ['feature1'],
      featureFlags: ['test-flag'],
      impersonator: undefined,
    };

    render(
      <AuthKitProvider initialAuth={initialAuth}>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    // Wait a bit to ensure no call is made
    await waitFor(
      () => {
        expect(getAuthAction).not.toHaveBeenCalled();
      },
      { timeout: 100 },
    );
  });

  it('should initialize state with initialAuth values', async () => {
    const initialAuth = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
        profilePictureUrl: null,
        firstName: 'Test',
        lastName: 'User',
        object: 'user' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastSignInAt: '2024-01-01T00:00:00Z',
        locale: 'en-US',
        externalId: null,
        metadata: {},
      },
      sessionId: 'test-session',
      organizationId: 'test-org',
      role: 'admin',
      roles: ['admin'],
      permissions: ['read', 'write'],
      entitlements: ['feature1'],
      featureFlags: ['test-flag'],
      impersonator: { email: 'admin@example.com', reason: 'Support request' },
    };

    const TestComponent = () => {
      const auth = useAuth();
      return (
        <div>
          <div data-testid="loading">{auth.loading.toString()}</div>
          <div data-testid="email">{auth.user?.email}</div>
          <div data-testid="session">{auth.sessionId}</div>
          <div data-testid="org">{auth.organizationId}</div>
          <div data-testid="role">{auth.role}</div>
          <div data-testid="impersonator">{auth.impersonator?.email}</div>
        </div>
      );
    };

    const { getByTestId } = render(
      <AuthKitProvider initialAuth={initialAuth}>
        <TestComponent />
      </AuthKitProvider>,
    );

    // Should not be loading when initialAuth is provided
    expect(getByTestId('loading')).toHaveTextContent('false');
    expect(getByTestId('email')).toHaveTextContent('test@example.com');
    expect(getByTestId('session')).toHaveTextContent('test-session');
    expect(getByTestId('org')).toHaveTextContent('test-org');
    expect(getByTestId('role')).toHaveTextContent('admin');
    expect(getByTestId('impersonator')).toHaveTextContent('admin@example.com');
  });

  it('should call getAuthAction when initialAuth is not provided', async () => {
    (getAuthAction as Mock).mockResolvedValueOnce({
      user: { email: 'test@example.com' },
      sessionId: 'test-session',
    });

    render(
      <AuthKitProvider>
        <div>Test Child</div>
      </AuthKitProvider>,
    );

    await waitFor(() => {
      expect(getAuthAction).toHaveBeenCalledTimes(1);
    });
  });

  it('should do nothing if onSessionExpired is false', async () => {
    vi.spyOn(window, 'addEventListener');

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
    (checkSessionAction as Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    const onSessionExpired = vi.fn();

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
    (checkSessionAction as Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    const onSessionExpired = vi.fn();

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
    (checkSessionAction as Mock).mockResolvedValueOnce(false);

    const onSessionExpired = vi.fn();

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

  describe('window.location.reload behavior', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      // @ts-expect-error - deleting window.location to mock it
      delete window.location;
      window.location = { reload: vi.fn() } as unknown as Location;
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('should reload the page when session is expired and no onSessionExpired handler is provided', async () => {
      (checkSessionAction as Mock).mockRejectedValueOnce(new Error('Failed to fetch'));

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
    });

    it('should not call onSessionExpired or reload the page if session is valid', async () => {
      (checkSessionAction as Mock).mockResolvedValueOnce(true);
      const onSessionExpired = vi.fn();

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
    });
  });
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call getAuth when a user is not returned when ensureSignedIn is true', async () => {
    // First and second calls return no user, second call returns a user
    (getAuthAction as Mock)
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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthKitProvider');

    consoleSpy.mockRestore();
  });

  it('should provide auth context values when used within AuthKitProvider', async () => {
    (getAuthAction as Mock).mockResolvedValueOnce({
      user: { email: 'test@example.com' },
      sessionId: 'test-session',
      organizationId: 'test-org',
      role: 'admin',
      roles: ['admin'],
      permissions: ['read', 'write'],
      entitlements: ['feature1'],
      featureFlags: ['test-flag'],
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

    (getAuthAction as Mock).mockResolvedValueOnce(mockAuth);
    (refreshAuthAction as Mock).mockResolvedValueOnce({
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

    (getAuthAction as Mock)
      .mockResolvedValue(mockAuth)
      .mockResolvedValueOnce({ ...mockAuth, organizationId: 'old-org' });
    (switchToOrganizationAction as Mock).mockResolvedValueOnce(mockAuth);

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
    (refreshAuthAction as Mock).mockRejectedValueOnce(new Error('Refresh failed'));

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
    (refreshAuthAction as Mock).mockRejectedValueOnce('Refresh failed');

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
    (handleSignOutAction as Mock).mockResolvedValueOnce({});

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
    (handleSignOutAction as Mock).mockResolvedValueOnce({});

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
