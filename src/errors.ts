import type { Session } from './interfaces.js';
import { decodeJwt } from './jwt.js';

export class AuthKitError extends Error {
  data?: Record<string, unknown>;

  constructor(message: string, cause?: unknown, data?: Record<string, unknown>) {
    super(message);
    this.name = 'AuthKitError';
    this.cause = cause;
    this.data = data;
  }
}

export type CallbackErrorCode =
  | 'missing_auth_params'
  | 'missing_pkce_cookie'
  | 'oauth_state_mismatch'
  | 'missing_tokens';

export interface CallbackErrorContext {
  path?: string;
  userAgent?: string;
  hasCode?: boolean;
  hasState?: boolean;
}

// Carries the request that actually threw, so `onError` consumers can report
// accurate attribution without relying on ambient (per-request) APM scope,
// which can misattribute under concurrency.
export class CallbackError extends AuthKitError {
  readonly code: CallbackErrorCode;
  readonly path?: string;
  readonly userAgent?: string;
  readonly hasCode?: boolean;
  readonly hasState?: boolean;

  constructor(message: string, code: CallbackErrorCode, context?: CallbackErrorContext) {
    super(message);
    this.name = 'CallbackError';
    this.code = code;
    this.path = context?.path;
    this.userAgent = context?.userAgent;
    this.hasCode = context?.hasCode;
    this.hasState = context?.hasState;
  }
}

export interface TokenRefreshErrorContext {
  userId?: string;
  sessionId?: string;
  /**
   * Whether the refresh failed for a transient reason (network error, timeout,
   * 429, or 5xx) rather than a terminal one (the refresh token is dead). When
   * `true`, the existing session is still valid and the caller should keep it
   * and retry rather than signing the user out.
   */
  isTransient?: boolean;
}

export class TokenRefreshError extends AuthKitError {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly isTransient: boolean;

  constructor(message: string, cause?: unknown, context?: TokenRefreshErrorContext) {
    super(message, cause);
    this.name = 'TokenRefreshError';
    this.userId = context?.userId;
    this.sessionId = context?.sessionId;
    this.isTransient = context?.isTransient ?? false;
  }
}

export function getSessionErrorContext(session?: Session | null): TokenRefreshErrorContext {
  if (!session?.accessToken) {
    return {};
  }

  try {
    const { payload } = decodeJwt(session.accessToken);
    return {
      userId: payload.sub,
      sessionId: payload.sid,
    };
  } catch {
    return {};
  }
}
