import { useCallback, useEffect, useReducer, useRef } from 'react';
import { getAccessTokenAction, refreshAccessTokenAction } from '../actions.js';
import { useAuth } from './authkit-provider.js';

const TOKEN_EXPIRY_BUFFER_SECONDS = 60;
const MIN_REFRESH_DELAY = 15_000; // minimum delay before refreshing token
const RETRY_DELAY = 5 * 60 * 1000;

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
      return { ...state, loading: false, token: action.token };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'RESET':
      return { ...state, token: undefined, loading: false, error: null };
    // istanbul ignore next
    default:
      return state;
  }
}

function parseToken(token: string | undefined) {
  // istanbul ignore next
  if (!token) {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);

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

  const updateToken = useCallback(async () => {
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    dispatch({ type: 'FETCH_START' });
    try {
      let token = await getAccessTokenAction();
      if (token) {
        const tokenData = parseToken(token);
        if (!tokenData || tokenData.isExpiring) {
          token = await refreshAccessTokenAction();
        }
      }

      dispatch({ type: 'FETCH_SUCCESS', token });

      if (token) {
        const tokenData = parseToken(token);
        if (tokenData) {
          const delay = Math.max((tokenData.timeUntilExpiry - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000, MIN_REFRESH_DELAY);
          clearRefreshTimeout();
          refreshTimeoutRef.current = setTimeout(updateToken, delay);
        }
      }

      return token;
    } catch (error) {
      dispatch({ type: 'FETCH_ERROR', error: error instanceof Error ? error : new Error(String(error)) });
      refreshTimeoutRef.current = setTimeout(updateToken, RETRY_DELAY);
    } finally {
      fetchingRef.current = false;
    }
  }, [clearRefreshTimeout]);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    dispatch({ type: 'FETCH_START' });

    try {
      await refreshAuth();
      const token = await getAccessTokenAction();

      dispatch({ type: 'FETCH_SUCCESS', token });

      if (token) {
        const tokenData = parseToken(token);
        if (tokenData) {
          const delay = Math.max((tokenData.timeUntilExpiry - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000, MIN_REFRESH_DELAY);
          clearRefreshTimeout();
          refreshTimeoutRef.current = setTimeout(updateToken, delay);
        }
      }

      return token;
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      dispatch({ type: 'FETCH_ERROR', error: typedError });
      refreshTimeoutRef.current = setTimeout(updateToken, RETRY_DELAY);
    } finally {
      fetchingRef.current = false;
    }
  }, [refreshAuth, clearRefreshTimeout, updateToken]);

  useEffect(() => {
    if (!user) {
      dispatch({ type: 'RESET' });
      clearRefreshTimeout();
      return;
    }
    updateToken();

    return clearRefreshTimeout;
  }, [userId, sessionId, updateToken, clearRefreshTimeout]);

  return {
    accessToken: state.token,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
