import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from './authkit-provider.js';
import { tokenStore } from './tokenStore.js';

export interface UseAccessTokenReturn {
  /**
   * Current access token. May be stale when tab is inactive.
   * Use this for display purposes or where eventual consistency is acceptable.
   */
  accessToken: string | undefined;
  /**
   * Loading state for initial token fetch
   */
  loading: boolean;
  /**
   * Error from the last token operation
   */
  error: Error | null;
  /**
   * Manually trigger a token refresh
   */
  refresh: () => Promise<string | undefined>;
  /**
   * Get a guaranteed fresh access token. Automatically refreshes if needed.
   * Use this for API calls where token freshness is critical.
   * @returns Promise resolving to fresh token or undefined if not authenticated
   * @throws Error if refresh fails
   */
  getAccessToken: () => Promise<string | undefined>;
}

/**
 * A hook that manages access tokens with automatic refresh.
 */
export function useAccessToken(): UseAccessTokenReturn {
  const { user, sessionId } = useAuth();
  const userId = user?.id;
  const userRef = useRef(user);
  userRef.current = user;
  const prevSessionRef = useRef(sessionId);
  const prevUserIdRef = useRef(userId);

  const tokenState = useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot, tokenStore.getServerSnapshot);

  // Track if we're waiting for the initial token fetch for the current user
  // Initialize synchronously to prevent first-paint flash
  const [isInitialTokenLoading, setIsInitialTokenLoading] = useState(() => {
    // Only show loading if we have a user but no token yet
    return Boolean(user && !tokenState.token && !tokenState.error);
  });

  useEffect(() => {
    if (!user) {
      setIsInitialTokenLoading(false);
      // Clear token when user logs out
      if (prevUserIdRef.current !== undefined) {
        tokenStore.clearToken();
      }
      prevUserIdRef.current = undefined;
      prevSessionRef.current = undefined;
      return;
    }

    // Only clear token if user or session actually changed (not on initial mount)
    const sessionChanged = prevSessionRef.current !== undefined && prevSessionRef.current !== sessionId;
    const userChanged = prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId;

    if (sessionChanged || userChanged) {
      tokenStore.clearToken();
    }

    prevSessionRef.current = sessionId;
    prevUserIdRef.current = userId;

    // Check if getAccessTokenSilently will actually fetch (not just return cached)
    const currentToken = tokenStore.getSnapshot().token;
    const tokenData = currentToken ? tokenStore.parseToken(currentToken) : null;
    const willActuallyFetch = !currentToken || (tokenData && tokenData.isExpiring);

    // Only show loading if we're actually going to fetch
    if (willActuallyFetch) {
      setIsInitialTokenLoading(true);
    }

    /* istanbul ignore next */
    tokenStore
      .getAccessTokenSilently()
      .catch(() => {
        // Error is handled in the store
      })
      .finally(() => {
        // Only clear loading if we were actually loading
        if (willActuallyFetch) {
          setIsInitialTokenLoading(false);
        }
      });
  }, [userId, sessionId]);

  useEffect(() => {
    if (!user || typeof document === 'undefined') {
      return;
    }

    /* istanbul ignore next */
    const refreshIfNeeded = () => {
      tokenStore.getAccessTokenSilently().catch(() => {
        // Error is handled in the store
      });
    };

    /* istanbul ignore next */
    const handleWake = (event: Event) => {
      if (event.type !== 'visibilitychange' || document.visibilityState === 'visible') {
        refreshIfNeeded();
      }
    };

    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    window.addEventListener('online', handleWake);
    window.addEventListener('pageshow', handleWake);

    return () => {
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
      window.removeEventListener('online', handleWake);
      window.removeEventListener('pageshow', handleWake);
    };
  }, [userId, sessionId]);

  const getAccessToken = useCallback(async (): Promise<string | undefined> => {
    if (!userRef.current) {
      return undefined;
    }
    return tokenStore.getAccessToken();
  }, []);

  // Stable refresh function
  const refresh = useCallback(async (): Promise<string | undefined> => {
    if (!userRef.current) {
      return undefined;
    }
    return tokenStore.refreshToken();
  }, []);

  // Combine loading states: initial token fetch OR token store is loading
  const isLoading = isInitialTokenLoading || tokenState.loading;

  return {
    accessToken: tokenState.token,
    loading: isLoading,
    error: tokenState.error,
    refresh,
    getAccessToken,
  };
}
