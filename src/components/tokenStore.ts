import { getAccessTokenAction, refreshAccessTokenAction } from '../actions.js';
import { decodeJwt } from '../jwt.js';

interface TokenState {
  token: string | undefined;
  loading: boolean;
  error: Error | null;
}

const TOKEN_EXPIRY_BUFFER_SECONDS = 60;
const MIN_REFRESH_DELAY_SECONDS = 15;
const MAX_REFRESH_DELAY_SECONDS = 24 * 60 * 60;
const RETRY_DELAY_SECONDS = 300; // 5 minutes for retry on error
const jwtCookieName = 'workos-access-token';

export class TokenStore {
  private state: TokenState;
  private serverSnapshot: TokenState;

  constructor() {
    // Initialize state with token from cookie if available
    const initialToken = this.getInitialTokenFromCookie();
    this.state = {
      token: initialToken,
      loading: false,
      error: null,
    };

    // Server snapshot should match initial state for hydration
    this.serverSnapshot = {
      token: initialToken,
      loading: false,
      error: null,
    };

    /* istanbul ignore next */
    if (initialToken) {
      // Mark as consumed if we found a token
      this.fastCookieConsumed = true;
      // Schedule refresh based on token expiry
      const tokenData = this.parseToken(initialToken);
      if (tokenData) {
        this.scheduleRefresh(tokenData.timeUntilExpiry);
      }
    }
  }

  private listeners = new Set<() => void>();
  private refreshPromise: Promise<string | undefined> | null = null;
  private refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  private fastCookieConsumed = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = undefined;
      }
    };
  };

  getSnapshot = () => this.state;

  getServerSnapshot = () => this.serverSnapshot;

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private setState(updates: Partial<TokenState>) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  private scheduleRefresh(timeUntilExpiry?: number) {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }

    const delay =
      typeof timeUntilExpiry === 'undefined' ? RETRY_DELAY_SECONDS * 1000 : this.getRefreshDelay(timeUntilExpiry);

    this.refreshTimeout = setTimeout(
      /* istanbul ignore next */ () => {
        void this.getAccessTokenSilently().catch(/* istanbul ignore next */ () => {});
      },
      delay,
    );
  }

  private getRefreshDelay(timeUntilExpiry: number) {
    if (timeUntilExpiry <= TOKEN_EXPIRY_BUFFER_SECONDS) {
      return 0; // Immediate refresh
    }

    const idealDelay = (timeUntilExpiry - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000;

    return Math.min(Math.max(idealDelay, MIN_REFRESH_DELAY_SECONDS * 1000), MAX_REFRESH_DELAY_SECONDS * 1000);
  }

  private deleteCookie() {
    const isSecure = window.location.protocol === 'https:';

    // Build deletion string to match EXACTLY what the server sets
    // Server sets: Path=/, SameSite=Lax, and Secure (if HTTPS)
    // NO Domain attribute is set by server, so we don't set it either
    const deletionString = isSecure
      ? `${jwtCookieName}=; SameSite=Lax; Max-Age=0; Secure`
      : `${jwtCookieName}=; SameSite=Lax; Max-Age=0`;

    document.cookie = deletionString;

    // The cookie might still appear in document.cookie even after deletion
    // due to browser caching, but it should be expired and not sent to server
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getInitialTokenFromCookie(): string | undefined {
    if (typeof document === 'undefined' || typeof document.cookie === 'undefined') {
      return;
    }

    const pattern = new RegExp(`${this.escapeRegExp(jwtCookieName)}=([^;]+)`);
    const match = document.cookie.match(pattern);

    if (!match) {
      return;
    }

    // Delete the cookie immediately after reading it
    this.deleteCookie();

    return match[1];
  }

  private consumeFastCookie(): string | undefined {
    // Only try to consume once per page load
    if (this.fastCookieConsumed) {
      return;
    }

    if (typeof document === 'undefined' || typeof document.cookie === 'undefined') {
      return;
    }

    const pattern = new RegExp(`${this.escapeRegExp(jwtCookieName)}=([^;]+)`);
    const match = document.cookie.match(pattern);
    if (!match) {
      // Mark as consumed even if not found, to avoid repeated checks
      this.fastCookieConsumed = true;
      return;
    }

    // Mark as consumed BEFORE deleting to prevent race conditions
    this.fastCookieConsumed = true;

    // Delete the cookie using protocol-aware deletion
    this.deleteCookie();

    const newToken = match[1];

    if (newToken !== this.state.token) {
      return newToken;
    }
  }

  parseToken(token: string | undefined) {
    if (!token) return null;

    try {
      const { payload } = decodeJwt(token);
      const now = Math.floor(Date.now() / 1000);

      if (typeof payload.exp !== 'number') {
        return null;
      }

      const timeUntilExpiry = payload.exp - now;

      // For short-lived tokens (< 5 minutes), use a 30-second buffer
      // This prevents constant refreshing when tokens only last 60 seconds
      let bufferSeconds = TOKEN_EXPIRY_BUFFER_SECONDS;
      const totalTokenLifetime = payload.exp - (payload.iat || now);

      if (totalTokenLifetime <= 300) {
        // Token lifetime is 5 minutes or less - use 30 second buffer
        bufferSeconds = 30;
      }

      const isExpiring = payload.exp < now + bufferSeconds;

      return {
        payload,
        expiresAt: payload.exp,
        isExpiring,
        timeUntilExpiry,
      };
    } catch {
      return null;
    }
  }

  isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }

  clearToken() {
    this.setState({ token: undefined, error: null, loading: false });
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }
  }

  async getAccessToken(): Promise<string | undefined> {
    const fastToken = this.consumeFastCookie();

    if (fastToken) {
      this.setState({ token: fastToken, loading: false, error: null });
      return fastToken;
    }

    const tokenData = this.parseToken(this.state.token);

    // If we have a valid JWT that's not expiring, return it
    if (tokenData && !tokenData.isExpiring) {
      return this.state.token;
    }

    // If we have an opaque token (can't parse as JWT), return it as-is
    if (this.state.token && !tokenData) {
      return this.state.token;
    }

    // Otherwise refresh (no token or expiring JWT)
    return this.refreshTokenSilently();
  }

  async getAccessTokenSilently(): Promise<string | undefined> {
    const fastToken = this.consumeFastCookie();

    if (fastToken) {
      this.setState({ token: fastToken, loading: false, error: null });

      // Schedule refresh based on token expiry
      const tokenData = this.parseToken(fastToken);
      if (tokenData) {
        this.scheduleRefresh(tokenData.timeUntilExpiry);
      }

      return fastToken;
    }

    const tokenData = this.parseToken(this.state.token);

    // If we have a valid JWT that's not expiring, return it
    if (tokenData && !tokenData.isExpiring) {
      // Valid non-expiring JWT - return cached token without server call
      return this.state.token;
    }

    // If we have an opaque token (can't parse as JWT), return it as-is
    if (this.state.token && !tokenData) {
      // Opaque token - return cached token without server call
      return this.state.token;
    }

    // Otherwise refresh (no token or expiring JWT)
    return this.refreshTokenSilently();
  }

  async refreshToken(): Promise<string | undefined> {
    return this._refreshToken(false);
  }

  private async refreshTokenSilently(): Promise<string | undefined> {
    return this._refreshToken(true);
  }

  private async _refreshToken(silent: boolean): Promise<string | undefined> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const previousToken = this.state.token;

    // Only set loading for user-initiated refreshes, not background refreshes
    if (!silent) {
      this.setState({ loading: true, error: null });
    } else {
      // Clear error for silent refreshes but don't set loading
      this.setState({ error: null });
    }

    this.refreshPromise = (async () => {
      try {
        // For manual refresh, always call refreshAccessTokenAction
        // For silent refresh, try to get existing first, then refresh if needed
        let token: string | undefined;

        if (!silent) {
          // Manual refresh - always force refresh
          token = await refreshAccessTokenAction();
        } else {
          // Silent refresh - only fetch from server if we don't have a local token
          if (!previousToken) {
            // No local token, need to check server
            token = await getAccessTokenAction();
            const tokenData = this.parseToken(token);

            // Set the token even if it's expiring, to preserve it in case refresh fails
            if (token && token !== previousToken) {
              this.setState({
                token,
                loading: false,
                error: null,
              });
            }

            // If the token from server is expiring, refresh it
            if (!token || (tokenData && tokenData.isExpiring)) {
              const refreshedToken = await refreshAccessTokenAction();
              if (refreshedToken) {
                token = refreshedToken;
              }
            }
          } else {
            // We have a local token that needs refreshing (already checked by getAccessTokenSilently)
            token = await refreshAccessTokenAction();
          }
        }

        // Only update state if token actually changed or if loading was true
        if (token !== previousToken || !silent) {
          this.setState({
            token,
            loading: false,
            error: null,
          });
        }

        const tokenData = this.parseToken(token);
        if (tokenData) {
          this.scheduleRefresh(tokenData.timeUntilExpiry);
        }
        // If token is opaque (not a JWT), we don't schedule automatic refreshes

        return token;
      } catch (error) {
        // Don't clear the token immediately - keep the stale one while retrying
        this.setState({
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // Schedule a retry after delay
        this.scheduleRefresh();

        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  reset() {
    this.state = { token: undefined, loading: false, error: null };
    this.refreshPromise = null;
    this.fastCookieConsumed = false;
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }
    this.listeners.clear();
  }
}

export const tokenStore = new TokenStore();
