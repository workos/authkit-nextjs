'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useReducer } from 'react';
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
      data: Omit<UserInfo | NoUserInfo, 'accessToken'>;
    }
  | { status: 'unauthenticated'; data: Omit<NoUserInfo, 'accessToken'> }
  | { status: 'authenticated'; data: Omit<UserInfo, 'accessToken'> };

type AuthContextType = Omit<UserInfo | NoUserInfo, 'accessToken'> & {
  loading: boolean;
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

const unauthenticatedAuthStateData: Omit<NoUserInfo, 'accessToken'> = {
  user: null,
  sessionId: undefined,
  organizationId: undefined,
  role: undefined,
  roles: undefined,
  permissions: undefined,
  entitlements: undefined,
  featureFlags: undefined,
  impersonator: undefined,
};

function initAuthState(initialAuth: Omit<UserInfo | NoUserInfo, 'accessToken'> | undefined): AuthState {
  if (!initialAuth) {
    return { status: 'loading', data: unauthenticatedAuthStateData };
  }

  if (!initialAuth.user) {
    return { status: 'unauthenticated', data: initialAuth as Omit<NoUserInfo, 'accessToken'> };
  }

  return { status: 'authenticated', data: initialAuth as Omit<UserInfo, 'accessToken'> };
}

type AuthAction =
  | { type: 'START_LOADING' }
  | { type: 'SET_AUTH_STATE_AS_UNAUTHENTICATED'; data: Omit<NoUserInfo, 'accessToken'> }
  | { type: 'SET_AUTH_STATE_AS_AUTHENTICATED'; data: Omit<UserInfo, 'accessToken'> }
  | { type: 'STOP_LOADING' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'START_LOADING':
      return { status: 'loading', data: state.data };

    case 'SET_AUTH_STATE_AS_AUTHENTICATED':
      return { status: 'authenticated', data: action.data };

    case 'SET_AUTH_STATE_AS_UNAUTHENTICATED':
      return { status: 'unauthenticated', data: action.data };

    case 'STOP_LOADING':
      if (state.data.user) {
        return { status: 'authenticated', data: state.data as Omit<UserInfo, 'accessToken'> };
      }
      return { status: 'unauthenticated', data: state.data as Omit<NoUserInfo, 'accessToken'> };

    default:
      return state;
  }
}

export const AuthKitProvider = ({ children, onSessionExpired, initialAuth }: AuthKitProviderProps) => {
  const [authState, dispatch] = useReducer(authReducer, initialAuth, initAuthState);

  const getAuth = useCallback(async ({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) => {
    dispatch({ type: 'START_LOADING' });
    try {
      const auth = await getAuthAction({ ensureSignedIn });

      if (auth.user) {
        dispatch({ type: 'SET_AUTH_STATE_AS_AUTHENTICATED', data: auth as Omit<UserInfo, 'accessToken'> });
      } else {
        dispatch({ type: 'SET_AUTH_STATE_AS_UNAUTHENTICATED', data: auth as Omit<NoUserInfo, 'accessToken'> });
      }
    } catch (error) {
      dispatch({ type: 'SET_AUTH_STATE_AS_UNAUTHENTICATED', data: unauthenticatedAuthStateData });
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
      dispatch({ type: 'START_LOADING' });
      try {
        const auth = await refreshAuthAction({ ensureSignedIn, organizationId });

        if (auth.user) {
          dispatch({ type: 'SET_AUTH_STATE_AS_AUTHENTICATED', data: auth as Omit<UserInfo, 'accessToken'> });
        } else {
          dispatch({ type: 'SET_AUTH_STATE_AS_UNAUTHENTICATED', data: auth as Omit<NoUserInfo, 'accessToken'> });
        }
      } catch (error) {
        dispatch({ type: 'STOP_LOADING' });
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
  }, [onSessionExpired, initialAuth, getAuth]);

  const contextValue: AuthContextType = {
    ...authState.data,
    loading: authState.status === 'loading',
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
