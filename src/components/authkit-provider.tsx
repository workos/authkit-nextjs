'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  checkSessionAction,
  getAuthAction,
  handleSignOutAction,
  refreshAuthAction,
  switchToOrganizationAction,
} from '../actions.js';
import type { User } from '@workos-inc/node';
import type { UserInfo, SwitchToOrganizationOptions, NoUserInfo } from '../interfaces.js';

type AuthState =
  | {
      status: 'loading';
    }
  | { status: 'unauthenticated'; data: Omit<NoUserInfo, 'accessToken'> }
  | { status: 'authenticated'; data: Omit<UserInfo, 'accessToken'> };

type AuthContextType = Omit<UserInfo | NoUserInfo, 'accessToken'> & { loading: boolean } & {
  getAuth: (options?: { ensureSignedIn?: boolean }) => Promise<void>;
  refreshAuth: (options?: { ensureSignedIn?: boolean; organizationId?: string }) => Promise<void | { error: string }>;
  signOut: (options?: { returnTo?: string }) => Promise<void>;
  switchToOrganization: (
    organizationId: string,
    options?: SwitchToOrganizationOptions,
  ) => Promise<Omit<UserInfo, 'accessToken'> | { error: string }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthKitProviderProps {
  children: ReactNode;
  /**
   * Customize what happens when a session is expired. By default,the entire page will be reloaded.
   * You can also pass this as `false` to disable the expired session checks.
   */
  onSessionExpired?: false | (() => void);
  /**
   * Initial auth data from the server. If provided, the provider will skip the initial client-side fetch.
   */
  initialAuth?: Omit<UserInfo | NoUserInfo, 'accessToken'>;
}

const unauthenticatedState: { status: 'unauthenticated'; data: Omit<NoUserInfo, 'accessToken'> } = {
  status: 'unauthenticated',
  data: {
    user: null,
    sessionId: undefined,
    organizationId: undefined,
    role: undefined,
    roles: undefined,
    permissions: undefined,
    entitlements: undefined,
    featureFlags: undefined,
    impersonator: undefined,
  },
};

function createAuthState(auth: Omit<UserInfo | NoUserInfo, 'accessToken'> | undefined): AuthState {
  if (!auth) {
    return { status: 'loading' };
  }

  if (!auth.user) {
    return unauthenticatedState;
  }

  return {
    status: 'authenticated',
    data: {
      user: auth.user,
      sessionId: auth.sessionId,
      organizationId: auth.organizationId,
      role: auth.role,
      roles: auth.roles,
      permissions: auth.permissions,
      entitlements: auth.entitlements,
      featureFlags: auth.featureFlags,
      impersonator: auth.impersonator,
    } as Omit<UserInfo, 'accessToken'>,
  };
}

function getAuthStateData(authState: AuthState): Omit<UserInfo | NoUserInfo, 'accessToken'> {
  if (authState.status === 'loading') {
    return unauthenticatedState.data;
  }
  return authState.data;
}

export const AuthKitProvider = ({ children, onSessionExpired, initialAuth }: AuthKitProviderProps) => {
  const [authState, setAuthState] = useState<AuthState>(() => createAuthState(initialAuth));

  const getAuth = useCallback(async ({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) => {
    setAuthState({ status: 'loading' });
    try {
      const auth = await getAuthAction({ ensureSignedIn });
      setAuthState(createAuthState(auth));
    } catch (error) {
      setAuthState(unauthenticatedState);
    }
  }, []);

  const switchToOrganization = useCallback(
    async (organizationId: string, options: SwitchToOrganizationOptions = {}) => {
      const opts = { revalidationStrategy: 'none', ...options };
      const result = await switchToOrganizationAction(organizationId, {
        revalidationStrategy: 'none',
        ...options,
      });

      if (opts.revalidationStrategy === 'none') {
        await getAuth({ ensureSignedIn: true });
      }

      return result;
    },
    [],
  );

  const refreshAuth = useCallback(
    async ({ ensureSignedIn = false, organizationId }: { ensureSignedIn?: boolean; organizationId?: string } = {}) => {
      setAuthState({ status: 'loading' });
      try {
        const auth = await refreshAuthAction({ ensureSignedIn, organizationId });
        setAuthState(createAuthState(auth));
      } catch (error) {
        return error instanceof Error ? { error: error.message } : { error: String(error) };
      }
    },
    [],
  );

  const signOut = useCallback(async ({ returnTo }: { returnTo?: string } = {}) => {
    await handleSignOutAction({ returnTo });
  }, []);

  useEffect(() => {
    if (!initialAuth) {
      getAuth();
    }

    // Return early if the session expired checks are disabled.
    if (onSessionExpired === false) {
      return;
    }

    let visibilityChangedCalled = false;

    const handleVisibilityChange = async () => {
      if (visibilityChangedCalled) {
        return;
      }

      // In the case where we're using middleware auth mode, a user that has signed out in a different tab
      // will run into an issue if they attempt to hit a server action in the original tab.
      // This will force a refresh of the page in that case, which will redirect them to the sign-in page.
      if (document.visibilityState === 'visible') {
        visibilityChangedCalled = true;

        try {
          const hasSession = await checkSessionAction();
          if (!hasSession) {
            throw new Error('Session expired');
          }
        } catch (error) {
          // 'Failed to fetch' is the error we are looking for if the action fails
          // If any other error happens, for other reasons, we should not reload the page
          if (error instanceof Error && error.message.includes('Failed to fetch')) {
            if (onSessionExpired) {
              onSessionExpired();
            } else {
              window.location.reload();
            }
          }
        } finally {
          visibilityChangedCalled = false;
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onSessionExpired]);

  const contextValue: AuthContextType = {
    loading: authState.status === 'loading',
    ...getAuthStateData(authState),
    getAuth,
    refreshAuth,
    signOut,
    switchToOrganization,
  };
  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export function useAuth(options: {
  ensureSignedIn: true;
}): AuthContextType & ({ loading: true; user: User | null } | { loading: false; user: User });
export function useAuth(options?: { ensureSignedIn?: false }): AuthContextType;

export function useAuth({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) {
  const context = useContext(AuthContext);

  useEffect(() => {
    if (context && ensureSignedIn && !context.user && !context.loading) {
      context.getAuth({ ensureSignedIn });
    }
  }, [ensureSignedIn, context?.user, context?.loading, context?.getAuth]);

  if (!context) {
    throw new Error('useAuth must be used within an AuthKitProvider');
  }

  return context;
}
