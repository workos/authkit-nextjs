'use client';

import React, { createContext, ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/router.js';
import type { User, Impersonator } from '@workos-inc/node';
import type { Session } from '../types.js';
import { WORKOS_REDIRECT_URI } from '../../env-variables.js';
import { getAuthorizationUrl } from '../get-authorization-url.js';

type AuthContextType = {
  user: User | null;
  sessionId: string | undefined;
  organizationId: string | undefined;
  role: string | undefined;
  permissions: string[] | undefined;
  entitlements: string[] | undefined;
  impersonator: Impersonator | undefined;
  loading: boolean;
  getAuth: (options?: { ensureSignedIn?: boolean }) => Promise<void>;
  refreshAuth: (options?: { ensureSignedIn?: boolean; organizationId?: string }) => Promise<void | { error: string }>;
  signOut: (options?: { returnTo?: string }) => Promise<void>;
  switchToOrganization: (
    organizationId: string,
    options?: { returnTo?: string }
  ) => Promise<{ user: User } | { error: string }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthKitProviderProps {
  children: ReactNode;
  /**
   * Initial session data from server-side props
   */
  initialSession?: Session | null;
  /**
   * Customize what happens when a session is expired. By default, the entire page will be reloaded.
   * You can also pass this as `false` to disable the expired session checks.
   */
  onSessionExpired?: false | (() => void);
}

export const AuthKitProvider = ({ children, initialSession, onSessionExpired }: AuthKitProviderProps) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialSession?.user as User || null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined);
  const [entitlements, setEntitlements] = useState<string[] | undefined>(undefined);
  const [impersonator, setImpersonator] = useState<Impersonator | undefined>(initialSession?.impersonator);
  const [loading, setLoading] = useState(false);

  const getAuth = async ({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const session = await response.json();
        if (session && session.user) {
          setUser(session.user);
          setSessionId(session.sessionId);
          setOrganizationId(session.organizationId);
          setRole(session.role);
          setPermissions(session.permissions);
          setEntitlements(session.entitlements);
          setImpersonator(session.impersonator);
        } else if (ensureSignedIn) {
          // Redirect to sign in if ensureSignedIn is true
          const signInUrl = await getAuthorizationUrl({
            screenHint: 'sign-in',
            returnPathname: router.asPath,
            redirectUri: WORKOS_REDIRECT_URI,
          });
          router.push(signInUrl);
        } else {
          // Clear state if no session
          setUser(null);
          setSessionId(undefined);
          setOrganizationId(undefined);
          setRole(undefined);
          setPermissions(undefined);
          setEntitlements(undefined);
          setImpersonator(undefined);
        }
      } else if (ensureSignedIn) {
        const signInUrl = await getAuthorizationUrl({
          screenHint: 'sign-in',
          returnPathname: router.asPath,
          redirectUri: WORKOS_REDIRECT_URI,
        });
        router.push(signInUrl);
      }
    } catch (error) {
      setUser(null);
      setSessionId(undefined);
      setOrganizationId(undefined);
      setRole(undefined);
      setPermissions(undefined);
      setEntitlements(undefined);
      setImpersonator(undefined);
    } finally {
      setLoading(false);
    }
  };

  const switchToOrganization = async (organizationId: string, options: { returnTo?: string } = {}) => {
    try {
      const response = await fetch('/api/auth/switch-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, returnTo: options.returnTo }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.user) {
          await getAuth({ ensureSignedIn: true });
          return result;
        }
      }
      
      return { error: 'Failed to switch organization' };
    } catch (error) {
      return error instanceof Error ? { error: error.message } : { error: String(error) };
    }
  };

  const refreshAuth = async ({
    ensureSignedIn = false,
    organizationId,
  }: { ensureSignedIn?: boolean; organizationId?: string } = {}) => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (response.ok) {
        const session = await response.json();
        setUser(session.user);
        setSessionId(session.sessionId);
        setOrganizationId(session.organizationId);
        setRole(session.role);
        setPermissions(session.permissions);
        setEntitlements(session.entitlements);
        setImpersonator(session.impersonator);
      } else if (ensureSignedIn) {
        const signInUrl = await getAuthorizationUrl({
          screenHint: 'sign-in',
          returnPathname: router.asPath,
          redirectUri: WORKOS_REDIRECT_URI,
        });
        router.push(signInUrl);
      }
    } catch (error) {
      return error instanceof Error ? { error: error.message } : { error: String(error) };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async ({ returnTo }: { returnTo?: string } = {}) => {
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: returnTo || '/' }),
      });

      if (response.ok) {
        const { logoutUrl } = await response.json();
        if (logoutUrl) {
          router.push(logoutUrl);
        } else {
          router.push(returnTo || '/');
        }
      }
    } catch (error) {
      // Fallback to home page on error
      router.push(returnTo || '/');
    }
  };

  useEffect(() => {
    // Only fetch auth if no initial session provided
    if (!initialSession) {
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

      if (document.visibilityState === 'visible') {
        visibilityChangedCalled = true;

        try {
          const response = await fetch('/api/auth/check-session');
          if (!response.ok) {
            throw new Error('Session expired');
          }
        } catch (error) {
          if (onSessionExpired) {
            onSessionExpired();
          } else {
            window.location.reload();
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
  }, [onSessionExpired, initialSession]);

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
        loading,
        getAuth,
        refreshAuth,
        signOut,
        switchToOrganization,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };