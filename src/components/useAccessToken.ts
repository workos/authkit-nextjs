import { useCallback, useEffect, useReducer, useRef } from 'react';
import { getAccessTokenAction, refreshAccessTokenAction } from '../actions.js';
import { useAuth } from './authkit-provider.js';
import { decodeJwt } from '../jwt.js';

const TOKEN_EXPIRY_BUFFER_SECONDS = 60;
const MIN_REFRESH_DELAY_SECONDS = 15; // minimum delay before refreshing token
const MAX_REFRESH_DELAY_SECONDS = 24 * 60 * 60; // 24 hours
const RETRY_DELAY_SECONDS = 300; // 5 minutes

interface TokenState {
  token: string | undefined;
  loading: boolean;
  error: Error | null;
}

type TokenAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; token: string | undefined }
  | { type: 'FETCH_ERROR'; error: Error }
  | { type: 'RESET' };

function tokenReducer(state: TokenState, action: TokenAction): TokenState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, token: action.token, error: null };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'RESET':
      return { ...state, token: undefined, loading: false, error: null };
    // istanbul ignore next
    default:
      return state;
  }
}

function getRefreshDelay(timeUntilExpiry: number) {
  const idealDelay = (timeUntilExpiry - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000;
  return Math.min(Math.max(idealDelay, MIN_REFRESH_DELAY_SECONDS * 1000), MAX_REFRESH_DELAY_SECONDS * 1000);
}

function parseTokenPayload(token: string | undefined) {
  // istanbul ignore next
  if (!token) {
    return null;
  }

  try {
    const { payload } = decodeJwt(token);
    const now = Math.floor(Date.now() / 1000);

    // istanbul ignore next - if the token does not have an exp claim, we cannot determine expiry
    if (typeof payload.exp !== 'number') {
      return null;
    }

    return {
      payload,
      expiresAt: payload.exp,
      isExpiring: payload.exp < now + TOKEN_EXPIRY_BUFFER_SECONDS,
      timeUntilExpiry: payload.exp - now,
    };
  } catch {
    // istanbul ignore next
    return null;
  }
}

/**
 * A hook that manages access tokens with automatic refresh.
 */
export function useAccessToken() {
  const { user, sessionId, refreshAuth } = useAuth();
  const userId = user?.id;
  const [state, dispatch] = useReducer(tokenReducer, {
    token: undefined,
    loading: false,
    error: null,
  });

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fetchingRef = useRef(false);

  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = undefined;
    }
  }, []);

  // Store the current token in a ref to avoid stale closures
  const currentTokenRef = useRef<string | undefined>(state.token);
  currentTokenRef.current = state.token;

  // Store updateToken in a ref to break circular dependency
  const updateTokenRef = useRef<() => Promise<string | undefined>>();

  // Centralized timer scheduling function
  const scheduleNextRefresh = useCallback(
    (delay: number) => {
      clearRefreshTimeout();
      refreshTimeoutRef.current = setTimeout(() => {
        if (updateTokenRef.current) {
          updateTokenRef.current();
        }
      }, delay);
    },
    [clearRefreshTimeout],
  );

  const updateToken = useCallback(async () => {
    // istanbul ignore next - safety guard against concurrent fetches
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;

    try {
      let token = await getAccessTokenAction();
      if (token) {
        const tokenData = parseTokenPayload(token);
        if (!tokenData || tokenData.isExpiring) {
          token = await refreshAccessTokenAction();
        }
      }

      // Only update state if token has changed
      if (token !== currentTokenRef.current) {
        dispatch({ type: 'FETCH_SUCCESS', token });
      }

      if (token) {
        const tokenData = parseTokenPayload(token);
        if (tokenData) {
          const delay = getRefreshDelay(tokenData.timeUntilExpiry);
          scheduleNextRefresh(delay);
        }
      }

      return token;
    } catch (error) {
      dispatch({ type: 'FETCH_ERROR', error: error instanceof Error ? error : new Error(String(error)) });
      scheduleNextRefresh(RETRY_DELAY_SECONDS * 1000);
    } finally {
      fetchingRef.current = false;
    }
  }, [scheduleNextRefresh]);

  // Assign updateToken to ref for use in scheduleNextRefresh
  updateTokenRef.current = updateToken;

  const refresh = useCallback(async () => {
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    dispatch({ type: 'FETCH_START' });

    try {
      await refreshAuth();
      const token = await getAccessTokenAction();

      dispatch({ type: 'FETCH_SUCCESS', token });

      if (token) {
        const tokenData = parseTokenPayload(token);
        if (tokenData) {
          const delay = getRefreshDelay(tokenData.timeUntilExpiry);
          scheduleNextRefresh(delay);
        }
      }

      return token;
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      dispatch({ type: 'FETCH_ERROR', error: typedError });
      scheduleNextRefresh(RETRY_DELAY_SECONDS * 1000);
    } finally {
      fetchingRef.current = false;
    }
  }, [refreshAuth, scheduleNextRefresh, updateToken]);

  useEffect(() => {
    if (!user) {
      dispatch({ type: 'RESET' });
      clearRefreshTimeout();
      return;
    }
    updateToken();

    return clearRefreshTimeout;
  }, [userId, sessionId, clearRefreshTimeout]);

  return {
    accessToken: state.token,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
