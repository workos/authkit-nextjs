'use client';

import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { checkSessionAction, getAuthAction, handleSignOutAction, refreshAuthAction } from '../actions.js';
import type { Impersonator, User } from '@workos-inc/node';

type AuthContextType = {
  user: User | null;
  sessionId: string | undefined;
  organizationId: string | undefined;
  role: string | undefined;
  permissions: string[] | undefined;
  entitlements: string[] | undefined;
  impersonator: Impersonator | undefined;
  accessToken: string | undefined;
  loading: boolean;
  getAuth: (options?: { ensureSignedIn?: boolean }) => Promise<void>;
  refreshAuth: (options?: { ensureSignedIn?: boolean; organizationId?: string }) => Promise<void | { error: string }>;
  signOut: (options?: { returnTo?: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthKitProviderProps {
  children: ReactNode;
  /**
   * Customize what happens when a session is expired. By default,the entire page will be reloaded.
   * You can also pass this as `false` to disable the expired session checks.
   */
  onSessionExpired?: false | (() => void);
}

export const AuthKitProvider = ({ children, onSessionExpired }: AuthKitProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined);
  const [entitlements, setEntitlements] = useState<string[] | undefined>(undefined);
  const [impersonator, setImpersonator] = useState<Impersonator | undefined>(undefined);
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const getAuth = async ({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) => {
    try {
      const auth = await getAuthAction({ ensureSignedIn });
      setUser(auth.user);
      setSessionId(auth.sessionId);
      setOrganizationId(auth.organizationId);
      setRole(auth.role);
      setPermissions(auth.permissions);
      setEntitlements(auth.entitlements);
      setImpersonator(auth.impersonator);
      setAccessToken(auth.accessToken);
    } catch (error) {
      setUser(null);
      setSessionId(undefined);
      setOrganizationId(undefined);
      setRole(undefined);
      setPermissions(undefined);
      setEntitlements(undefined);
      setImpersonator(undefined);
      setAccessToken(undefined);
    } finally {
      setLoading(false);
    }
  };

  const refreshAuth = async ({
    ensureSignedIn = false,
    organizationId,
  }: { ensureSignedIn?: boolean; organizationId?: string } = {}) => {
    try {
      setLoading(true);
      const auth = await refreshAuthAction({ ensureSignedIn, organizationId });

      setUser(auth.user);
      setSessionId(auth.sessionId);
      setOrganizationId(auth.organizationId);
      setRole(auth.role);
      setPermissions(auth.permissions);
      setEntitlements(auth.entitlements);
      setImpersonator(auth.impersonator);
      setAccessToken(auth.accessToken);
    } catch (error) {
      return error instanceof Error ? { error: error.message } : { error: String(error) };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async ({ returnTo }: { returnTo?: string } = {}) => {
    await handleSignOutAction({ returnTo });
  };

  useEffect(() => {
    getAuth();

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

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionId,
        organizationId,
        role,
        permissions,
        entitlements,
        impersonator,
        accessToken,
        loading,
        getAuth,
        refreshAuth,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

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
